import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ActivityStatus } from '../../annual-work-plan/schemas/plan-activity.schema';
import { AnnualWorkPlanService } from '../../annual-work-plan/services/annual-work-plan.service';
import { Company, CompanyDocument } from '../../companies/schemas/company.schema';
import { ComplianceEngineService } from '../../compliance-engine/compliance-engine.service';
import { DocumentStatus } from '../../document-management/schemas/document-master.schema';
import { DocumentMasterService } from '../../document-management/services/document-master.service';
import { PhvaAnalysisResult } from '../../phva/interfaces/phva-analysis.interface';
import { PhvaAnalysisService } from '../../phva/phva-analysis.service';
import {
  CompanyAIContext,
  CompanyAIContextActivities,
  CompanyAIContextDocuments,
} from './interfaces/company-ai-context.interface';

/** Límite de elementos por lista para mantener el contexto compacto y legible. */
const MAX_ITEMS_PER_LIST = 10;

/**
 * Capa central de contexto IA.
 *
 * Construye el contexto operativo completo de una empresa (CompanyAIContext)
 * consultando datos REALES del sistema en paralelo:
 * - Empresa → Company (nombre, standardsType 7/21/60).
 * - Compliance → ComplianceEngineService.getOverview (overall, hallazgos, recomendaciones).
 * - PHVA → PhvaAnalysisService.analyzeCompanyPHVA (cumplimiento por fase).
 * - Documentos → DocumentMasterService.findAll (pendientes, vencidos, estado general).
 * - Actividades → AnnualWorkPlanService.findCurrent + getActivities (pendientes, atrasadas, completadas).
 *
 * Reutiliza servicios existentes, no inventa datos y tolera errores por módulo
 * sin romper el contexto (un módulo caído se representa con valores por defecto).
 * Arquitectura preparada para que todos los Engines IA y el futuro Copiloto
 * consuman un único contexto ya agregado.
 */
@Injectable()
export class AiContextService {
  private readonly logger = new Logger(AiContextService.name);

  constructor(
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    private readonly complianceEngineService: ComplianceEngineService,
    private readonly phvaAnalysisService: PhvaAnalysisService,
    private readonly documentMasterService: DocumentMasterService,
    private readonly annualWorkPlanService: AnnualWorkPlanService,
  ) {}

  /**
   * Construye el contexto operativo de una empresa con datos reales.
   *
   * @param companyId - Identificador de la empresa.
   */
  async buildCompanyContext(companyId: string): Promise<CompanyAIContext> {
    const companyObjectId = this.toObjectId(companyId);

    // Nota de diseño: se consulta ComplianceEngineService.getOverview directamente
    // (sección compliance) y PhvaAnalysisService.analyzeCompanyPHVA (sección phva),
    // que internamente vuelve a invocar getOverview. Este tradeoff es intencional:
    // reutilizar el servicio PHVA existente garantiza la misma lógica de mapeo de
    // pendientes por fase (sin duplicar código) y no modifica contratos existentes.
    // Si el rendimiento lo exige, PhvaAnalysisService podría aceptar el overview ya
    // agregado como parámetro opcional en una fase futura.
    const [company, overview, phva, documents, activities] = await Promise.all([
      this.safeFindCompany(companyId),
      this.safeGetOverview(companyId),
      this.safeGetPhva(companyId),
      this.safeGetDocuments(companyObjectId),
      this.safeGetActivities(companyObjectId),
    ]);

    return {
      company: {
        id: companyId,
        name: company?.name ?? '',
        standardsType: company?.standardsType ?? null,
      },
      compliance: {
        overallCompliance: overview?.overallCompliance ?? 0,
        gaps: this.unique((overview?.findings ?? []).map((finding) => finding.title)),
        recommendations: this.unique(
          (overview?.recommendations ?? []).map((recommendation) => recommendation.title),
        ),
      },
      phva: phva ?? this.emptyPhva(),
      documents: this.buildDocumentsContext(documents),
      activities: this.buildActivitiesContext(activities),
    };
  }

  // -------------------------------------------------------------------------
  // Helpers privados (lecturas tolerantes: un módulo sin datos no rompe el contexto)
  // -------------------------------------------------------------------------

  private toObjectId(companyId: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(companyId)) {
      throw new BadRequestException(`Invalid companyId: ${companyId}`);
    }
    return new Types.ObjectId(companyId);
  }

  private async safeFindCompany(companyId: string): Promise<CompanyDocument | null> {
    try {
      return await this.companyModel.findById(companyId).exec();
    } catch (error) {
      this.logger.debug(`Empresa no disponible: ${this.errorMessage(error)}`);
      return null;
    }
  }

  private async safeGetOverview(companyId: string) {
    try {
      return await this.complianceEngineService.getOverview(companyId);
    } catch (error) {
      this.logger.debug(`Overview no disponible: ${this.errorMessage(error)}`);
      return null;
    }
  }

  private async safeGetPhva(companyId: string): Promise<PhvaAnalysisResult | null> {
    try {
      return await this.phvaAnalysisService.analyzeCompanyPHVA(companyId);
    } catch (error) {
      this.logger.debug(`Análisis PHVA no disponible: ${this.errorMessage(error)}`);
      return null;
    }
  }

  private async safeGetDocuments(companyObjectId: Types.ObjectId) {
    try {
      return await this.documentMasterService.findAll(companyObjectId);
    } catch (error) {
      this.logger.debug(`Documentos no disponibles: ${this.errorMessage(error)}`);
      return [];
    }
  }

  private async safeGetActivities(companyObjectId: Types.ObjectId) {
    try {
      const plan = await this.annualWorkPlanService.findCurrent(companyObjectId);
      return await this.annualWorkPlanService.getActivities(plan._id);
    } catch (error) {
      // Empresa sin plan anual vigente: escenario esperado, no un error del sistema.
      this.logger.debug(`Actividades no disponibles: ${this.errorMessage(error)}`);
      return [];
    }
  }

  private buildDocumentsContext(
    documents: { name: string; status: DocumentStatus; expirationDate?: Date }[],
  ): CompanyAIContextDocuments {
    const now = new Date();
    const pending = documents
      .filter((document) =>
        [DocumentStatus.DRAFT, DocumentStatus.UNDER_REVIEW, DocumentStatus.PENDING_APPROVAL].includes(
          document.status,
        ),
      )
      .map((document) => document.name);
    const expired = documents
      .filter(
        (document) =>
          document.expirationDate !== undefined &&
          document.expirationDate.getTime() < now.getTime() &&
          document.status !== DocumentStatus.OBSOLETE &&
          document.status !== DocumentStatus.ARCHIVED,
      )
      .map((document) => document.name);

    const generalStatus =
      documents.length === 0
        ? 'SIN_DOCUMENTOS'
        : expired.length > 0
          ? 'CON_VENCIDOS'
          : pending.length > 0
            ? 'CON_PENDIENTES'
            : 'AL_DIA';

    return {
      total: documents.length,
      pending: pending.slice(0, MAX_ITEMS_PER_LIST),
      expired: expired.slice(0, MAX_ITEMS_PER_LIST),
      generalStatus,
    };
  }

  private buildActivitiesContext(
    activities: { title: string; status: ActivityStatus }[],
  ): CompanyAIContextActivities {
    const titlesByStatus = (status: ActivityStatus): string[] =>
      activities
        .filter((activity) => activity.status === status)
        .map((activity) => activity.title);

    const pending = titlesByStatus(ActivityStatus.PENDING);
    const delayed = titlesByStatus(ActivityStatus.DELAYED);
    const completed = titlesByStatus(ActivityStatus.COMPLETED);

    return {
      total: activities.length,
      pending: pending.slice(0, MAX_ITEMS_PER_LIST),
      delayed: delayed.slice(0, MAX_ITEMS_PER_LIST),
      completed: completed.slice(0, MAX_ITEMS_PER_LIST),
    };
  }

  /** Estructura PHVA vacía (sin datos) para no romper el contrato del contexto. */
  private emptyPhva(): PhvaAnalysisResult {
    return {
      overall: 0,
      planear: { percentage: 0, pending: [] },
      hacer: { percentage: 0, pending: [] },
      verificar: { percentage: 0, pending: [] },
      actuar: { percentage: 0, pending: [] },
    };
  }

  private unique(items: string[]): string[] {
    return Array.from(new Set(items.filter((item) => item.trim().length > 0)));
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'error desconocido';
  }
}
