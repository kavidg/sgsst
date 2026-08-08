import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Company, CompanyDocument } from '../../companies/schemas/company.schema';
import { DocumentCatalogQueryDto } from '../dto/document-catalog-query.dto';
import {
  DocumentInstance,
  DocumentInstanceDocument,
} from '../schemas/document-instance.schema';
import {
  DocumentTemplate,
  DocumentTemplateDocument,
} from '../schemas/document-template.schema';
import { DocumentTemplateType } from '../types/document-generation.types';
import {
  DOCUMENT_CATALOG_SORT_FIELDS,
  DocumentCatalogDetail,
  DocumentCatalogItem,
  DocumentCatalogPage,
  DocumentCatalogSortField,
} from '../types/document-catalog.types';

/**
 * DocumentCatalogService (Fase 6.5).
 *
 * Catálogo único de consulta de todos los documentos generados por el Document
 * Generation Engine. Consulta EXCLUSIVAMENTE DocumentInstance — la única
 * fuente de verdad documental — y entrega un ViewModel (DocumentCatalogItem)
 * enriquecido con:
 *
 * - title / documentType: resueltos desde la plantilla (DocumentTemplate) que
 *   referencia la instancia (fallback: sourceEntity / OTHER).
 * - companyName: resuelto desde la empresa propietaria (Company).
 * - downloadUrl: la fileUrl pública persistida en la instancia.
 *
 * NO crea schemas nuevos, NO duplica DocumentInstance y NO modifica el
 * DocumentGenerationService, el Renderer, el Storage ni las plantillas.
 *
 * Soporta filtros (companyId, documentType, status, sourceModule, search,
 * generatedFrom, generatedTo), paginación (page, limit) y ordenamiento (sort
 * whitelist con prefijo '-' para descendente).
 */
@Injectable()
export class DocumentCatalogService {
  constructor(
    @InjectModel(DocumentInstance.name)
    private readonly instanceModel: Model<DocumentInstanceDocument>,
    @InjectModel(DocumentTemplate.name)
    private readonly templateModel: Model<DocumentTemplateDocument>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
  ) {}

  /**
   * Lista paginada del catálogo con filtros, búsqueda y ordenamiento.
   */
  async list(query: DocumentCatalogQueryDto): Promise<DocumentCatalogPage> {
    const filter = await this.buildFilter(query);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const sort = this.buildSort(query.sort);

    const [total, instances] = await Promise.all([
      this.instanceModel.countDocuments(filter).exec(),
      this.instanceModel
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
    ]);

    const items = await this.toItems(instances);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Lista el catálogo forzando el filtro por empresa (validación del
   * ObjectId y de la pertenencia del filtro a la empresa indicada).
   */
  async listByCompany(
    companyId: string,
    query: DocumentCatalogQueryDto,
  ): Promise<DocumentCatalogPage> {
    const companyObjectId = this.toObjectId(companyId, 'companyId');
    return this.list({ ...query, companyId: companyObjectId.toString() });
  }

  /**
   * Detalle de una instancia documental: instancia + metadatos de aprobación
   * + historial de versiones de la misma entidad de origen (sin duplicar
   * información: cada versión es una DocumentInstance real).
   */
  async getById(id: string): Promise<DocumentCatalogDetail> {
    const instanceId = this.toObjectId(id, 'id');
    const instance = await this.instanceModel.findById(instanceId).exec();
    if (!instance) {
      throw new NotFoundException('Document instance not found');
    }

    const [template, company, versions] = await Promise.all([
      this.templateModel.findById(instance.templateId).exec(),
      this.companyModel.findById(instance.companyId).exec(),
      this.instanceModel
        .find({
          companyId: instance.companyId,
          sourceModule: instance.sourceModule,
          sourceEntity: instance.sourceEntity,
          sourceEntityId: instance.sourceEntityId,
          _id: { $ne: instance._id },
        })
        .sort({ version: -1, createdAt: -1 })
        .limit(50)
        .exec(),
    ]);

    const templateById = new Map<string, DocumentTemplateDocument>(
      template ? [[template._id.toString(), template]] : [],
    );
    const companyById = new Map<string, CompanyDocument>(
      company ? [[company._id.toString(), company]] : [],
    );

    const item = this.toItem(instance, templateById, companyById);

    return {
      ...item,
      storagePath: instance.storagePath,
      sourceEntityId: instance.sourceEntityId?.toString() ?? null,
      templateId: instance.templateId.toString(),
      template: template
        ? {
            id: template._id.toString(),
            name: template.name,
            documentType: template.documentType,
            version: template.version,
          }
        : null,
      approval: {
        status: instance.approvalStatus ?? null,
        approvedBy: instance.approvedBy?.toString() ?? null,
        approvedAt: instance.approvedAt ?? null,
        approvalEventId: instance.approvalEventId?.toString() ?? null,
        approvalRequestId: instance.approvalRequestId?.toString() ?? null,
      },
      versions: await this.toItems(versions),
    };
  }

  /** Construye el filtro Mongo a partir del DTO de consulta. */
  private async buildFilter(
    query: DocumentCatalogQueryDto,
  ): Promise<FilterQuery<DocumentInstanceDocument>> {
    const filter: FilterQuery<DocumentInstanceDocument> = {};

    if (query.companyId) {
      filter.companyId = this.toObjectId(query.companyId, 'companyId');
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.sourceModule) {
      filter.sourceModule = query.sourceModule;
    }

    // documentType no vive en la instancia: se resuelve a templateIds y se
    // filtra por templateId (la consulta principal sigue siendo DocumentInstance).
    if (query.documentType) {
      const templates = await this.templateModel
        .find({ documentType: query.documentType })
        .select('_id')
        .exec();
      const templateIds = templates.map((template) => template._id);
      // Sin plantillas de ese tipo → ningún documento (filtro imposible).
      filter.templateId = templateIds.length
        ? { $in: templateIds }
        : { $in: [] };
    }

    if (query.generatedFrom || query.generatedTo) {
      filter.generatedAt = {};
      if (query.generatedFrom) {
        filter.generatedAt.$gte = new Date(query.generatedFrom);
      }
      if (query.generatedTo) {
        filter.generatedAt.$lte = new Date(query.generatedTo);
      }
    }

    if (query.search?.trim()) {
      const regex = new RegExp(this.escapeRegex(query.search.trim()), 'i');
      const matchingTemplates = await this.templateModel
        .find({ name: regex })
        .select('_id')
        .exec();
      const templateIds = matchingTemplates.map((template) => template._id);

      const or: FilterQuery<DocumentInstanceDocument>[] = [
        { sourceEntity: regex },
        { sourceModule: regex },
      ];
      if (templateIds.length) {
        or.push({ templateId: { $in: templateIds } });
      }
      filter.$or = or;
    }

    return filter;
  }

  /** Traduce el sort whitelist a un objeto Mongo (default: más reciente). */
  private buildSort(sort?: string): Record<string, 1 | -1> {
    if (!sort) {
      return { createdAt: -1 };
    }
    const descending = sort.startsWith('-');
    const field = descending ? sort.slice(1) : sort;
    if (!DOCUMENT_CATALOG_SORT_FIELDS.includes(field as DocumentCatalogSortField)) {
      return { createdAt: -1 };
    }
    return { [field]: descending ? -1 : 1 } as Record<string, 1 | -1>;
  }

  /** Enriquecimiento batch: plantillas y empresas de un conjunto de instancias. */
  private async toItems(
    instances: DocumentInstanceDocument[],
  ): Promise<DocumentCatalogItem[]> {
    if (!instances.length) {
      return [];
    }

    const templateIds = [
      ...new Set(instances.map((instance) => instance.templateId.toString())),
    ];
    const companyIds = [
      ...new Set(instances.map((instance) => instance.companyId.toString())),
    ];

    const [templates, companies] = await Promise.all([
      this.templateModel
        .find({ _id: { $in: templateIds.map((id) => new Types.ObjectId(id)) } })
        .exec(),
      this.companyModel
        .find({ _id: { $in: companyIds.map((id) => new Types.ObjectId(id)) } })
        .exec(),
    ]);

    const templateById = new Map<string, DocumentTemplateDocument>(
      templates.map((template) => [template._id.toString(), template]),
    );
    const companyById = new Map<string, CompanyDocument>(
      companies.map((company) => [company._id.toString(), company]),
    );

    return instances.map((instance) =>
      this.toItem(instance, templateById, companyById),
    );
  }

  /** Construye el ViewModel de un item a partir de la instancia y sus maps. */
  private toItem(
    instance: DocumentInstanceDocument,
    templateById: Map<string, DocumentTemplateDocument>,
    companyById: Map<string, CompanyDocument>,
  ): DocumentCatalogItem {
    const template = templateById.get(instance.templateId.toString());
    const company = companyById.get(instance.companyId.toString());

    return {
      id: instance._id.toString(),
      title: template?.name ?? this.fallbackTitle(instance),
      documentType: template?.documentType ?? DocumentTemplateType.OTHER,
      status: instance.status,
      companyId: instance.companyId.toString(),
      companyName: company?.name ?? null,
      version: instance.version,
      format: instance.format,
      generatedAt: instance.generatedAt,
      approvedAt: instance.approvedAt ?? null,
      approvedBy: instance.approvedBy?.toString() ?? null,
      sourceModule: instance.sourceModule,
      sourceEntity: instance.sourceEntity,
      downloadUrl: instance.fileUrl,
    };
  }

  /** Título legible cuando la plantilla no existe (instancia huérfana). */
  private fallbackTitle(instance: DocumentInstanceDocument): string {
    return `${instance.sourceModule} / ${instance.sourceEntity}`;
  }

  private toObjectId(value: string, field: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid ${field}: ${value}`);
    }
    return new Types.ObjectId(value);
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
