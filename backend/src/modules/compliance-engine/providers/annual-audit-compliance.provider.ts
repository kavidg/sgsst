import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AnnualAudit, AnnualAuditDocument } from '../../annual-audit/schemas/annual-audit.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import {
  ANNUAL_AUDIT_COMPLIANCE_TARGET,
  ANNUAL_AUDIT_FORMULA,
  ANNUAL_AUDIT_MODULE,
  ANNUAL_AUDIT_SCORE_WEIGHTS,
  ANNUAL_AUDIT_STANDARD_CODE,
  computeAnnualAuditScore,
  type AnnualAuditLike,
  type AnnualAuditScoreBreakdown,
} from './annual-audit-scoring';

/**
 * Provider OFICIAL del estándar 6.1.2 — Auditoría anual SG-SST (VERIFICAR).
 *
 * ÚNICO contribuyente oficial al score de 6.1.2. El provider legacy
 * `management-review` (AccountabilityMeeting) NO contribuye al scoring
 * desde esta etapa (ver SCORING_INELIGIBLE_MODULES en utils/compliance-weights.ts);
 * permanece en moduleCompliance para hallazgos/diagnósticos.
 *
 * Provider DELGADO (patrón 6.1.1 / 5.1.1 / 5.1.2 / 4.2.5 / 4.2.6):
 *  - UNA consulta tenant-scoped de AnnualAudit (sin N+1, sin queries en
 *    loops; findings/actions viven embebidos en el documento padre).
 *  - DocumentMaster NO se consulta para puntuar: las referencias de evidencia
 *    ya fueron validadas tenant-safe al momento de adjuntarse (E1) y el
 *    scoring solo evalúa su presencia (frontera anti-double-scoring).
 *  - Todo el cálculo vive en annual-audit-scoring.ts (función PURA).
 *  - Devuelve metadata serializable `dimensions:v1` (semantic EXACT,
 *    standardCode 6.1.2) con dimensiones + counters para presentación/AI.
 *
 * NO_DATA (política del dominio):
 *  - Caso A: sin auditorías → status NO_DATA, percentage 0, noDataReason
 *    'no-audits'.
 *  - Caso B: auditorías pero ninguna evaluable (COMPLETED + fechas reales
 *    válidas + informe mínimo) → NO_DATA, 'no-evaluable-audits'. NO_DATA no
 *    se transforma en incumplimiento.
 *  - Caso C: al menos una evaluable → score real (0% incluido es 0% real).
 */
@Injectable()
export class AnnualAuditComplianceProvider implements ComplianceProvider {
  private static readonly MODULE = ANNUAL_AUDIT_MODULE;
  private static readonly COMPLIANCE_TARGET = ANNUAL_AUDIT_COMPLIANCE_TARGET;

  constructor(
    @InjectModel(AnnualAudit.name)
    private readonly auditModel: Model<AnnualAuditDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    // 1. Snapshot tenant-scoped: UNA consulta; findings/actions embebidos.
    const docs = await this.auditModel.find({ companyId: companyObjectId }).lean().exec();
    const audits: AnnualAuditLike[] = docs.map((d) => ({
      ...d,
      _id: String(d._id),
    })) as unknown as AnnualAuditLike[];

    // 2. Scoring puro (sin Mongo; determinista).
    const breakdown = computeAnnualAuditScore({ audits });

    const findings: ProviderComplianceResult['findings'] = breakdown.findings.map((f) => ({
      id: f.id,
      module: AnnualAuditComplianceProvider.MODULE,
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
        module: AnnualAuditComplianceProvider.MODULE,
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
      module: AnnualAuditComplianceProvider.MODULE,
      percentage,
      status: percentage >= AnnualAuditComplianceProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      // Semántica de brechas (patrón 6.1.1): pendientes = hallazgos
      // incompletos + acciones abiertas; completadas = acciones cerradas.
      pending: breakdown.counters.incompleteFindings + breakdown.counters.openActions,
      completed: breakdown.counters.completedActions,
      overdue: breakdown.counters.overdueActions,
      phases: { check: percentage } as Partial<Record<CompliancePhaseKey, number>>,
      metadata: this.metadata(breakdown, {}),
    };
  }

  /** Metadata serializable (sin documentos Mongo completos ni funciones). */
  private metadata(
    breakdown: AnnualAuditScoreBreakdown,
    extra: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      semantic: 'EXACT',
      standardCode: ANNUAL_AUDIT_STANDARD_CODE,
      phase: 'check',
      formula: ANNUAL_AUDIT_FORMULA,
      evaluatedPeriod: breakdown.evaluatedPeriod,
      weights: { ...ANNUAL_AUDIT_SCORE_WEIGHTS },
      dimensions: {
        program: { ...breakdown.dimensions.program },
        executionReport: { ...breakdown.dimensions.executionReport },
        findingsDocumentation: { ...breakdown.dimensions.findingsDocumentation },
        followUpClosure: { ...breakdown.dimensions.followUpClosure },
        evidenceAnalysis: { ...breakdown.dimensions.evidenceAnalysis },
        periodicityHistory: { ...breakdown.dimensions.periodicityHistory },
      },
      counters: { ...breakdown.counters },
      ...extra,
    };
  }
}
