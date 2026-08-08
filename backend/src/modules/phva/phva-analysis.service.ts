import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { ActivityStatus } from '../annual-work-plan/schemas/plan-activity.schema';
import { AnnualWorkPlanService } from '../annual-work-plan/services/annual-work-plan.service';
import { ComplianceEngineService } from '../compliance-engine/compliance-engine.service';
import { FindingPriority } from '../compliance-engine/enums/finding-priority.enum';
import { DocumentStatus } from '../document-management/schemas/document-master.schema';
import { DocumentMasterService } from '../document-management/services/document-master.service';
import {
  PhvaAnalysisResult,
  PhvaPhaseData,
} from './interfaces/phva-analysis.interface';

/**
 * Límite de elementos pendientes por fase para mantener respuestas legibles.
 */
const MAX_PENDING_PER_PHASE = 5;

/**
 * Servicio de análisis PHVA.
 *
 * Prepara la estructura planear/hacer/verificar/actuar consultando información
 * REAL del sistema:
 * - ComplianceEngineService.getOverview() → porcentajes por fase (cálculo existente).
 * - AnnualWorkPlanService → plan anual vigente y sus actividades (por estado).
 * - DocumentMasterService → documentos registrados (por estado).
 *
 * No inventa datos: si un módulo no tiene información, la fase queda con
 * porcentaje 0 y lista pendiente vacía (el engine decide si es insuficiente).
 */
@Injectable()
export class PhvaAnalysisService {
  private readonly logger = new Logger(PhvaAnalysisService.name);

  constructor(
    private readonly complianceEngineService: ComplianceEngineService,
    private readonly annualWorkPlanService: AnnualWorkPlanService,
    private readonly documentMasterService: DocumentMasterService,
  ) {}

  /**
   * Analiza el ciclo PHVA de una empresa con datos reales.
   *
   * @param companyId - Identificador de la empresa.
   */
  async analyzeCompanyPHVA(companyId: string): Promise<PhvaAnalysisResult> {
    const companyObjectId = this.toObjectId(companyId);

    const [overview, activities, documents] = await Promise.all([
      this.safeGetOverview(companyId),
      this.safeGetActivities(companyObjectId),
      this.safeGetDocuments(companyObjectId),
    ]);

    const phases = overview?.phaseCompliance ?? { plan: 0, do: 0, check: 0, act: 0 };
    const findings = overview?.findings ?? [];

    return {
      // Reutiliza el cálculo global existente del Compliance Engine (fuente única de verdad).
      overall: overview?.overallCompliance ?? 0,
      planear: this.buildPhase({
        percentage: phases.plan,
        pending: [
          ...this.pendingDocumentNames(documents, [
            DocumentStatus.DRAFT,
            DocumentStatus.UNDER_REVIEW,
          ]),
          ...this.pendingActivityTitles(activities, [ActivityStatus.PENDING]),
        ],
      }),
      hacer: this.buildPhase({
        percentage: phases.do,
        pending: this.pendingActivityTitles(activities, [
          ActivityStatus.IN_PROGRESS,
          ActivityStatus.DELAYED,
        ]),
      }),
      verificar: this.buildPhase({
        percentage: phases.check,
        pending: [
          ...this.pendingDocumentNames(documents, [DocumentStatus.PENDING_APPROVAL]),
          ...this.pendingFindingTitles(findings, [FindingPriority.MEDIUM]),
        ],
      }),
      actuar: this.buildPhase({
        percentage: phases.act,
        pending: this.pendingFindingTitles(findings, [
          FindingPriority.HIGH,
          FindingPriority.CRITICAL,
        ]),
      }),
    };
  }

  // -------------------------------------------------------------------------
  // Helpers privados (lectura tolerante: un módulo sin datos no rompe el análisis)
  // -------------------------------------------------------------------------

  private toObjectId(companyId: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(companyId)) {
      throw new BadRequestException(`Invalid companyId: ${companyId}`);
    }
    return new Types.ObjectId(companyId);
  }

  private async safeGetOverview(companyId: string) {
    try {
      return await this.complianceEngineService.getOverview(companyId);
    } catch (error) {
      this.logger.warn(`getOverview falló para ${companyId}: ${this.errorMessage(error)}`);
      return null;
    }
  }

  private async safeGetActivities(companyObjectId: Types.ObjectId) {
    try {
      const plan = await this.annualWorkPlanService.findCurrent(companyObjectId);
      return await this.annualWorkPlanService.getActivities(plan._id);
    } catch (error) {
      // Empresa sin plan anual vigente: escenario esperado, no un error del sistema.
      this.logger.debug(`Plan anual no disponible: ${this.errorMessage(error)}`);
      return [];
    }
  }

  private async safeGetDocuments(companyObjectId: Types.ObjectId) {
    try {
      return await this.documentMasterService.findAll(companyObjectId);
    } catch (error) {
      this.logger.warn(`Documentos no disponibles: ${this.errorMessage(error)}`);
      return [];
    }
  }

  private buildPhase(data: { percentage: number; pending: string[] }): PhvaPhaseData {
    return {
      percentage: data.percentage,
      pending: data.pending.slice(0, MAX_PENDING_PER_PHASE),
    };
  }

  private pendingActivityTitles(
    activities: { title: string; status: ActivityStatus }[],
    statuses: ActivityStatus[],
  ): string[] {
    return activities
      .filter((activity) => statuses.includes(activity.status))
      .map((activity) => activity.title);
  }

  private pendingDocumentNames(
    documents: { name: string; status: DocumentStatus }[],
    statuses: DocumentStatus[],
  ): string[] {
    return documents
      .filter((document) => statuses.includes(document.status))
      .map((document) => document.name);
  }

  private pendingFindingTitles(
    findings: { title: string; priority: FindingPriority }[],
    priorities: FindingPriority[],
  ): string[] {
    return findings
      .filter((finding) => priorities.includes(finding.priority))
      .map((finding) => finding.title);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'error desconocido';
  }
}
