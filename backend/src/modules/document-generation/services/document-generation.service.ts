import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DocumentInstance,
  DocumentInstanceDocument,
} from '../schemas/document-instance.schema';
import {
  DocumentGenerationRequest,
  DocumentGenerationResult,
  DocumentStatus,
} from '../types/document-generation.types';
import { DocumentSourceModule, RendererFormat } from '../types/renderer.types';
import { RendererService } from './renderer.service';
import { StorageService } from './storage.service';
import { TemplateSourceService } from './template-source.service';
import { VariableResolverService } from './variable-resolver.service';
import { DocumentPublicationService } from '../../document-management/services/document-publication.service';

/**
 * DocumentGenerationService: orquestador del motor de generación.
 *
 * Fase 1 — única ruta de generación interna. Flujo completo:
 *
 *   1. Validar request
 *   2. Obtener plantilla (TemplateSourceService → módulo templates)
 *   3. Resolver variables (VariableResolverService)
 *   4. Renderizar (RendererService, descarga la plantilla desde Storage)
 *   5. Guardar archivo generado (StorageService)
 *   6. Crear DocumentInstance (trazabilidad documental)
 *   7. Retornar resultado
 *
 * Los documentos generados quedan registrados con sourceModule TEMPLATES y
 * sourceEntity igual al documentType de la plantilla (OTHER para legadas).
 */
@Injectable()
export class DocumentGenerationService {
  constructor(
    @InjectModel(DocumentInstance.name)
    private readonly instanceModel: Model<DocumentInstanceDocument>,
    private readonly templateSourceService: TemplateSourceService,
    private readonly variableResolverService: VariableResolverService,
    private readonly rendererService: RendererService,
    private readonly storageService: StorageService,
    /**
     * Fase 8.2.A — publicación automática de documentos aprobados en
     * DocumentMaster (Gestión Documental). Opcional para compatibilidad con
     * los specs unitarios que construyen el servicio manualmente; en
     * producción el DI del DocumentGenerationModule lo inyecta siempre. Si
     * está ausente, la generación documental no se ve afectada.
     */
    @Optional()
    private readonly documentPublicationService?: DocumentPublicationService,
  ) {}

  /**
   * Genera una instancia documental a partir de una plantilla.
   *
   * Fase 2.1 — protección contra duplicados: si el request proviene de una
   * aprobación (approval.approvalEventId) y ya existe una DocumentInstance
   * con la misma combinación (companyId + sourceModule + sourceEntity +
   * sourceEntityId + approvalEventId), retorna el documento existente sin
   * regenerar (idempotencia ante reintentos de decideAndApply).
   *
   * @param request - companyId, templateId, origen (módulo/entidad) y contexto.
   */
  async generateDocument(request: DocumentGenerationRequest): Promise<DocumentGenerationResult> {
    this.validateRequest(request);

    // Fase 8.2.A — la instancia puede provenir de (a) dedup por approvalEventId
    // (reintento de decideAndApply) o (b) creación nueva. En ambos casos se
    // ejecuta la publicación automática → DocumentMaster (idempotente).
    const instance = await this.resolveOrCreateInstance(request);

    await this.publishToDocumentMaster(instance);

    return this.toResult(instance);
  }

  /**
   * Dedup por approvalEventId ANTES de generar: evita trabajo de render y
   * subida a Storage cuando la instancia ya existe para la misma aprobación.
   * Si no existe, genera, sube y crea la instancia con tolerancia a la carrera
   * E11000 del índice único compuesto.
   */
  private async resolveOrCreateInstance(
    request: DocumentGenerationRequest,
  ): Promise<DocumentInstanceDocument> {
    if (request.approval?.approvalEventId) {
      const existing = await this.findExistingApprovalInstance(request);
      if (existing) {
        return existing;
      }
    }

    const template = await this.templateSourceService.getTemplate(request.templateId, request.companyId);

    const variables = this.variableResolverService.resolve(template.variables, request.context);
    // FASE 7 — PDF: el formato se toma de la plantilla (DOCX por defecto para retrocompatibilidad).
    const format = template.format ?? RendererFormat.DOCX;
    const rendered = await this.rendererService.renderDocument(format, template, variables);

    const upload = await this.storageService.upload(
      rendered,
      this.buildFileName(template.name, format),
      `document-generation/${request.companyId.toString()}`,
    );

    try {
      return await this.instanceModel.create({
        companyId: request.companyId,
        templateId: new Types.ObjectId(template.id),
        sourceModule: request.sourceModule ?? DocumentSourceModule.TEMPLATES,
        sourceEntity: request.sourceEntity ?? template.documentType,
        sourceEntityId: request.sourceEntityId,
        // F7B-7: código documental canónico del tipo de documento. Proviene
        // EXCLUSIVAMENTE del contexto construido por el servidor (los servicios
        // de dominio fijan context.document.code); nunca del request del
        // cliente. Ausente → undefined (sin inventar códigos).
        documentCode: this.resolveDocumentCode(request.context),
        status: DocumentStatus.GENERATED,
        format,
        fileUrl: upload.fileUrl,
        storagePath: upload.storagePath,
        version: template.version,
        generatedBy: request.generatedBy,
        generatedAt: new Date(),
        // Metadatos de aprobación (Fase 2): el documento formal del Responsable
        // del SG-SST se genera tras la aprobación en el Approval Workflow Core.
        approvalRequestId: request.approval?.approvalRequestId,
        approvalStatus: request.approval?.status,
        approvedBy: request.approval?.approvedBy,
        approvedAt: request.approval?.approvedAt,
        approvalEventId: request.approval?.approvalEventId,
      });
    } catch (error) {
      // Carrera (dos decideAndApply concurrentes): el índice único compuesto
      // rechaza el segundo insert con E11000; se retorna el documento existente.
      if (request.approval?.approvalEventId && this.isDuplicateKeyError(error)) {
        const existing = await this.findExistingApprovalInstance(request);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  /**
   * Fase 8.2.A — publicación automática de documentos aprobados en
   * DocumentMaster (Gestión Documental). Efecto posterior a la generación:
   * si la publicación falla se registra el error pero NO se rompe la
   * generación documental ni la aprobación ya aplicada.
   */
  private async publishToDocumentMaster(instance: DocumentInstanceDocument): Promise<void> {
    if (!this.documentPublicationService) {
      return;
    }
    try {
      await this.documentPublicationService.publishFromInstance(instance);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown publication error';
      console.warn(
        `[DocumentGeneration] DocumentMaster publication failed (instance=${instance._id}, sourceEntity=${instance.sourceEntity}): ${errorMessage}`,
      );
    }
  }

  /**
   * Busca una instancia existente para la misma aprobación.
   */
  private async findExistingApprovalInstance(
    request: DocumentGenerationRequest,
  ): Promise<DocumentInstanceDocument | null> {
    return this.instanceModel
      .findOne({
        companyId: request.companyId,
        sourceModule: request.sourceModule ?? DocumentSourceModule.TEMPLATES,
        sourceEntity: request.sourceEntity,
        sourceEntityId: request.sourceEntityId,
        approvalEventId: request.approval?.approvalEventId,
      })
      .exec();
  }

  /**
   * F7B-7: extrae el código documental canónico del contexto de render.
   *
   * El contexto es construido por los servicios de dominio
   * (context.document.code, p.ej. 'PHVA-1.1.8-ACTA'). Se tolera cualquier
   * shape de contexto (anidado nuevo o plano legado) y se devuelve undefined
   * si no hay código — NUNCA se inventa uno.
   */
  private resolveDocumentCode(
    context: DocumentGenerationRequest['context'],
  ): string | undefined {
    if (!context || typeof context !== 'object') return undefined;
    const document = (context as Record<string, unknown>).document;
    if (!document || typeof document !== 'object') return undefined;
    const code = (document as Record<string, unknown>).code;
    return typeof code === 'string' && code.trim() ? code.trim() : undefined;
  }

  private toResult(instance: DocumentInstanceDocument): DocumentGenerationResult {
    return {
      instanceId: instance._id as Types.ObjectId,
      fileUrl: instance.fileUrl,
      storagePath: instance.storagePath,
      version: instance.version,
    };
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: number }).code === 11000
    );
  }

  private validateRequest(request: DocumentGenerationRequest): void {
    if (!request.companyId) {
      throw new BadRequestException('companyId is required');
    }

    if (!request.templateId) {
      throw new BadRequestException('templateId is required');
    }
  }

  private buildFileName(templateName: string, format: RendererFormat): string {
    const sanitizedTemplateName = templateName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const extension = format === RendererFormat.PDF ? 'pdf' : 'docx';
    return `${sanitizedTemplateName}-${Date.now()}.${extension}`;
  }

  /**
   * Devuelve las instancias documentales generadas para una entidad PHVA.
   *
   * Fase 2 — consulta de trazabilidad: documento generado, versión, estado,
   * URL y fecha de generación para una entidad concreta (p.ej.
   * PHVA_ADVANCED / RESPONSIBLE_SG_SST / <id del registro 1.1.1>).
   *
   * @param companyId - Empresa propietaria (evita lectura cruzada).
   * @param sourceModule - Módulo de origen (p.ej. PHVA_ADVANCED).
   * @param sourceEntity - Entidad de origen (p.ej. RESPONSIBLE_SG_SST).
   * @param sourceEntityId - Id de la entidad de negocio (registro PHVA).
   */
  async getInstancesBySource(params: {
    companyId: Types.ObjectId;
    sourceModule: DocumentSourceModule;
    sourceEntity: string;
    sourceEntityId?: Types.ObjectId;
  }): Promise<DocumentInstanceDocument[]> {
    const filter: Record<string, unknown> = {
      companyId: params.companyId,
      sourceModule: params.sourceModule,
      sourceEntity: params.sourceEntity,
    };

    if (params.sourceEntityId) {
      filter.sourceEntityId = params.sourceEntityId;
    }

    return this.instanceModel
      .find(filter)
      .sort({ createdAt: -1 })
      .exec();
  }
}
