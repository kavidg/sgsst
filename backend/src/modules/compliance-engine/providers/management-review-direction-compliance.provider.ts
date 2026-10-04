import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ManagementReviewDirection,
  ManagementReviewDirectionDocument,
} from '../../management-review-direction/schemas/management-review-direction.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import {
  MANAGEMENT_REVIEW_DIRECTION_COMPLIANCE_TARGET,
  MANAGEMENT_REVIEW_DIRECTION_FORMULA,
  MANAGEMENT_REVIEW_DIRECTION_MODULE,
  MANAGEMENT_REVIEW_DIRECTION_SCORE_WEIGHTS,
  MANAGEMENT_REVIEW_DIRECTION_STANDARD_CODE,
  computeManagementReviewDirectionScore,
  type ManagementReviewDirectionLike,
  type ManagementReviewDirectionScoreBreakdown,
} from './management-review-direction-scoring';

/**
 * Provider OFICIAL del estándar 6.1.3 — Revisión por la dirección (VERIFICAR).
 *
 * ÚNICO contribuyente oficial al score de 6.1.3. Los providers legacy
 * `internal-audit` (DocumentMaster AUDIT) y `management-review`
 * (AccountabilityMeeting) NO contribuyen al scoring de este estándar (ver
 * SCORING_INELIGIBLE_MODULES en utils/compliance-weights.ts); permanecen en
 * moduleCompliance para hallazgos/diagnósticos.
 *
 * Provider DELGADO (patrón 6.1.1 / 6.1.2 / 5.1.x / 4.2.x):
 *  - UNA consulta tenant-scoped de ManagementReviewDirection (sin N+1; los
 *    participants/inputs/decisions viven embebidos en el documento padre).
 *  - NO consulta AnnualAudit, Indicators, AccountabilityMeeting,
 *    AccountabilityCommitment ni DocumentMaster para puntuar: las referencias
 *    de evidencia ya fueron validadas tenant-safe al momento de registrarse
 *    (E1) y el scoring solo evalúa su presencia (frontera anti-double-scoring).
 *  - Todo el cálculo vive en management-review-direction-scoring.ts (función
 *    PURA).
 *  - Devuelve metadata serializable `dimensions:v1` (semantic EXACT,
 *    standardCode 6.1.3) con dimensiones + counters para presentación/AI.
 *
 * NO_DATA (política del dominio):
 *  - Caso A: sin revisiones → status NO_DATA, percentage 0, noDataReason
 *    'no-reviews'.
 *  - Caso B: revisiones pero ninguna evaluable (COMPLETED + fechas reales
 *    válidas + acta/evidencia + contenido mínimo) → NO_DATA,
 *    'no-evaluable-reviews'. NO_DATA no se transforma en incumplimiento.
 *  - Caso C: al menos una evaluable → score real (0% incluido es 0% real).
 */
@Injectable()
export class ManagementReviewDirectionProvider implements ComplianceProvider {
  private static readonly MODULE = MANAGEMENT_REVIEW_DIRECTION_MODULE;
  private static readonly COMPLIANCE_TARGET = MANAGEMENT_REVIEW_DIRECTION_COMPLIANCE_TARGET;

  constructor(
    @InjectModel(ManagementReviewDirection.name)
    private readonly reviewModel: Model<ManagementReviewDirectionDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    // 1. Snapshot tenant-scoped: UNA consulta; sub-recursos embebidos.
    const docs = await this.reviewModel.find({ companyId: companyObjectId }).lean().exec();
    const reviews: ManagementReviewDirectionLike[] = docs.map((d) => ({
      ...d,
      _id: String(d._id),
    })) as unknown as ManagementReviewDirectionLike[];

    // 2. Scoring puro (sin Mongo; determinista).
    const breakdown = computeManagementReviewDirectionScore({ reviews });

    const findings: ProviderComplianceResult['findings'] = breakdown.findings.map((f) => ({
      id: f.id,
      module: ManagementReviewDirectionProvider.MODULE,
      title: f.title,
      description: f.description,
      priority:
        f.priority === 'HIGH'
          ? FindingPriority.HIGH
          : f.priority === 'MEDIUM'
            ? FindingPriority.MEDIUM
            : FindingPriority.LOW,
      status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
    }));

    const percentage = breakdown.percentage;

    if (breakdown.noData) {
      return {
        module: ManagementReviewDirectionProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings,
        pending: 0,
        completed: 0,
        phases: { check: 0 } as Partial<Record<CompliancePhaseKey, number>>,
        metadata: this.metadata(breakdown, { noDataReason: breakdown.noDataReason }),
      };
    }

    return {
      module: ManagementReviewDirectionProvider.MODULE,
      percentage,
      status:
        percentage >= ManagementReviewDirectionProvider.COMPLIANCE_TARGET
          ? 'TARGET_MET'
          : 'TARGET_NOT_MET',
      findings,
      // Semántica de brechas (patrón 6.1.1/6.1.2): pendientes = revisiones sin
      // completar (requieren acción) + decisiones abiertas (pending/in
      // progress); completadas = decisiones cerradas + revisiones evaluables.
      pending:
        breakdown.counters.reviewsDraft +
        breakdown.counters.reviewsPlanned +
        breakdown.counters.reviewsInProgress +
        breakdown.counters.decisionsPending +
        breakdown.counters.decisionsInProgress,
      completed: breakdown.counters.decisionsCompleted + breakdown.counters.reviewsEvaluable,
      overdue: breakdown.counters.decisionsOverdue,
      phases: { check: percentage } as Partial<Record<CompliancePhaseKey, number>>,
      metadata: this.metadata(breakdown, {}),
    };
  }

  /** Metadata serializable (sin documentos Mongo completos ni funciones). */
  private metadata(
    breakdown: ManagementReviewDirectionScoreBreakdown,
    extra: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      semantic: 'EXACT',
      standardCode: MANAGEMENT_REVIEW_DIRECTION_STANDARD_CODE,
      phase: 'check',
      formula: MANAGEMENT_REVIEW_DIRECTION_FORMULA,
      evaluatedPeriod: breakdown.evaluatedPeriod,
      weights: { ...MANAGEMENT_REVIEW_DIRECTION_SCORE_WEIGHTS },
      dimensions: {
        planning: { ...breakdown.dimensions.planning },
        inputs: { ...breakdown.dimensions.inputs },
        analysis: { ...breakdown.dimensions.analysis },
        decisions: { ...breakdown.dimensions.decisions },
        evidence: { ...breakdown.dimensions.evidence },
        closureHistory: { ...breakdown.dimensions.closureHistory },
      },
      counters: { ...breakdown.counters },
      latestReview: breakdown.latestReview,
      findings: breakdown.findings,
      ...extra,
    };
  }
}
