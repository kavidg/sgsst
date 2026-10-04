import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CopasstAuditPlanning,
  CopasstAuditPlanningDocument,
} from '../../copasst-audit-planning/schemas/copasst-audit-planning.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import {
  COPASST_AUDIT_PLANNING_COMPLIANCE_TARGET,
  COPASST_AUDIT_PLANNING_FORMULA,
  COPASST_AUDIT_PLANNING_MODULE,
  COPASST_AUDIT_PLANNING_SCORE_WEIGHTS,
  COPASST_AUDIT_PLANNING_STANDARD_CODE,
  computeCopasstAuditPlanningScore,
  type CopasstAuditPlanningLike,
  type CopasstAuditPlanningScoreBreakdown,
} from './copasst-audit-planning-scoring';

/**
 * Provider OFICIAL del estándar 6.1.4 — Planificación auditorías COPASST
 * (VERIFICAR).
 *
 * ÚNICO contribuyente oficial al score de 6.1.4. El provider legacy
 * `findings-review` (AccountabilityCommitment) NO contribuye al scoring de
 * este estándar desde E2 (WRONG_MAPPING retirado formalmente; ver
 * SCORING_INELIGIBLE_MODULES en utils/compliance-weights.ts); permanece en
 * moduleCompliance para hallazgos/diagnósticos de su evidencia propia.
 *
 * Provider DELGADO (patrón 6.1.1 / 6.1.2 / 6.1.3):
 *  - UNA consulta tenant-scoped de CopasstAuditPlanning (sin N+1; los items
 *    y la participación COPASST viven embebidos en el documento padre).
 *  - NO consulta AnnualAudit, CopasstPeriod, AccountabilityCommitment ni
 *    DocumentMaster para puntuar: las referencias declarativas fueron
 *    validadas tenant-safe al registrarse (E1) y el scoring solo evalúa su
 *    presencia (frontera anti-double-scoring 6.1.4 ↔ 6.1.2).
 *  - Todo el cálculo vive en copasst-audit-planning-scoring.ts (función PURA).
 *  - Devuelve metadata serializable `dimensions:v1` (semantic EXACT,
 *    standardCode 6.1.4) con dimensiones + counters para presentación/AI.
 *
 * NO_DATA (política del dominio):
 *  - Caso A: sin planificaciones → status NO_DATA, percentage 0,
 *    noDataReason 'no-plannings'.
 *  - Caso B: planificaciones pero ninguna evaluable (período válido + título
 *    + ≥1 auditoría planificada con sentido) → NO_DATA,
 *    'no-evaluable-plannings'. Una planificación DRAFT vacía NO genera
 *    cumplimiento artificial. NO_DATA no se transforma en incumplimiento.
 *  - Caso C: al menos una evaluable → score real (0% incluido es 0% real).
 */
@Injectable()
export class CopasstAuditPlanningProvider implements ComplianceProvider {
  private static readonly MODULE = COPASST_AUDIT_PLANNING_MODULE;
  private static readonly COMPLIANCE_TARGET = COPASST_AUDIT_PLANNING_COMPLIANCE_TARGET;

  constructor(
    @InjectModel(CopasstAuditPlanning.name)
    private readonly planningModel: Model<CopasstAuditPlanningDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    // 1. Snapshot tenant-scoped: UNA consulta; items/participación embebidos.
    const docs = await this.planningModel.find({ companyId: companyObjectId }).lean().exec();
    const plannings: CopasstAuditPlanningLike[] = docs.map((d) => ({
      ...d,
      _id: String(d._id),
    })) as unknown as CopasstAuditPlanningLike[];

    // 2. Scoring puro (sin Mongo; determinista).
    const breakdown = computeCopasstAuditPlanningScore({ plannings });

    const findings: ProviderComplianceResult['findings'] = breakdown.findings.map((f) => ({
      id: f.id,
      module: CopasstAuditPlanningProvider.MODULE,
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
        module: CopasstAuditPlanningProvider.MODULE,
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
      module: CopasstAuditPlanningProvider.MODULE,
      percentage,
      status:
        percentage >= CopasstAuditPlanningProvider.COMPLIANCE_TARGET
          ? 'TARGET_MET'
          : 'TARGET_NOT_MET',
      findings,
      // Semántica de brechas (patrón 6.1.3): pendientes = planificaciones en
      // gestión activa sin cerrar + items con fecha vencida; completadas =
      // items completados + planificaciones evaluables; overdue = items
      // planificados con fecha vencida (derivado, nunca persistido).
      pending: breakdown.counters.planningsDraft + breakdown.counters.planningsPlanned,
      completed: breakdown.counters.itemsCompleted + breakdown.counters.planningsEvaluable,
      overdue: breakdown.counters.overdueItems,
      phases: { check: percentage } as Partial<Record<CompliancePhaseKey, number>>,
      metadata: this.metadata(breakdown, {}),
    };
  }

  /** Metadata serializable (sin documentos Mongo completos ni funciones). */
  private metadata(
    breakdown: CopasstAuditPlanningScoreBreakdown,
    extra: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      semantic: 'EXACT',
      standardCode: COPASST_AUDIT_PLANNING_STANDARD_CODE,
      phase: 'check',
      formula: COPASST_AUDIT_PLANNING_FORMULA,
      evaluatedPeriod: breakdown.evaluatedPeriod,
      weights: { ...COPASST_AUDIT_PLANNING_SCORE_WEIGHTS },
      dimensions: { ...breakdown.dimensions },
      counters: { ...breakdown.counters },
      latestPlanning: breakdown.latestPlanning,
      findings: breakdown.findings,
      ...extra,
    };
  }
}
