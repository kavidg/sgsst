import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ImprovementPlan,
  ImprovementPlanDocument,
} from '../../improvement-plans/schemas/improvement-plan.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import {
  ComplianceProvider,
  ProviderComplianceResult,
} from './compliance-provider.interface';
import {
  IpPlanLike,
  IP_PLAN_COMPLIANCE_TARGET,
  IP_PLAN_FORMULA,
  IP_PLAN_MODULE,
  IP_PLAN_SCORE_WEIGHTS,
  IP_PLAN_STANDARD_CODE,
  IP_PLAN_STANDARD_TITLE,
  IpScoreBreakdown,
  computeImprovementPlanScore,
} from './improvement-plan-scoring';

/**
 * E2 (7.1.4) — Provider OFICIAL del PLAN DE MEJORAMIENTO (improvement-plan).
 *
 * - module: 'improvement-plan' — identificador canónico conservado (el
 *   ComplianceEngine y el analyzer IA ya lo usan); la implementación proxy
 *   previa (scoring existencial sobre SgstProgram/ProgramActivity, dominio
 *   `programs`) se reemplazó IN-PLACE: no existe doble implementación ni
 *   doble scoring para 7.1.4.
 * - Consulta ÚNICAMENTE ImprovementPlan (dominio propio E1, colección
 *   `improvementplans`) con UNA query tenant-scoped find({companyId}).lean()
 *   — sin N+1; actividades/objetivos/monitoring están EMBEBIDOS; los
 *   snapshots de responsables ya están almacenados (no se consultan Users).
 * - NO consulta SgstProgram ni ProgramActivity (dominio `programs`,
 *   independiente — ProgramsProvider sigue siendo el del módulo `programs`);
 *   NO consulta AccountabilityMeeting/Commitment, Incident, AnnualAudit,
 *   ManagementReviewDirection, CorrectivePreventiveAction ni
 *   ManagementImprovementAction: origin/originReferenceId son DECLARATIVOS y
 *   nunca disparan queries cruzadas (frontera 7.1.4 ↔ 6.1.2/6.1.3/7.1.1/
 *   7.1.2/7.1.3 — sin doble scoring).
 * - TODO el cálculo vive en improvement-plan-scoring.ts (función PURA,
 *   dimensions:v1); el provider transporta y adapta al contrato.
 * - El 100% del estándar va en phases.act (ACTUAR). NO calcula el peso 10%
 *   de la fase (eso es PHASE_WEIGHTS, intocable).
 * - Tenant: companyId SIEMPRE resuelto server-side por el ComplianceEngine
 *   (CompanyAccessGuard); jamás del payload.
 */
@Injectable()
export class ImprovementPlanProvider implements ComplianceProvider {
  private static readonly MODULE = IP_PLAN_MODULE;
  private static readonly COMPLIANCE_TARGET = IP_PLAN_COMPLIANCE_TARGET;

  constructor(
    @InjectModel(ImprovementPlan.name)
    private readonly planModel: Model<ImprovementPlanDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    // UNA sola query principal tenant-scoped (sin N+1; sin queries cruzadas;
    // estructuras embebidas vienen dentro del documento).
    const docs = await this.planModel
      .find({ companyId: companyObjectId })
      .lean()
      .exec();

    // Contrato serializable para el scorer puro (ObjectIds → strings vía Lean doc).
    const plans: IpPlanLike[] = docs.map((d) => ({
      ...(d as unknown as IpPlanLike),
      _id: String(d._id),
    }));

    const breakdown: IpScoreBreakdown = computeImprovementPlanScore({ plans });

    const findings: ProviderComplianceResult['findings'] = breakdown.findings.map((f) => ({
      id: f.id,
      module: ImprovementPlanProvider.MODULE,
      title: f.title,
      description: f.description,
      priority:
        f.priority === 'HIGH'
          ? FindingPriority.HIGH
          : f.priority === 'MEDIUM'
            ? FindingPriority.MEDIUM
            : FindingPriority.LOW,
      status: 'OPEN',
      responsible: '',
      dueDate: '',
      createdAt: new Date().toISOString(),
    }));

    if (breakdown.noData) {
      return {
        module: ImprovementPlanProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings,
        pending: 0,
        completed: 0,
        phases: { act: 0 } as Partial<Record<CompliancePhaseKey, number>>,
        metadata: {
          semantic: 'EXACT',
          standardCode: IP_PLAN_STANDARD_CODE,
          standardTitle: IP_PLAN_STANDARD_TITLE,
          formula: IP_PLAN_FORMULA,
          target: ImprovementPlanProvider.COMPLIANCE_TARGET,
          evaluatedPeriod: breakdown.evaluatedPeriod,
          noDataReason: breakdown.noDataReason,
          weights: { ...IP_PLAN_SCORE_WEIGHTS },
          counters: breakdown.counters,
          findings,
        },
      } as ProviderComplianceResult;
    }

    const percentage = breakdown.percentage;
    const status =
      percentage >= ImprovementPlanProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET';

    return {
      module: ImprovementPlanProvider.MODULE,
      percentage,
      status,
      findings,
      pending: breakdown.counters.overdueActivities + breakdown.counters.pendingActivities,
      completed: breakdown.counters.completedActivities,
      overdue: breakdown.counters.overdueActivities + breakdown.counters.overduePlans,
      phases: { act: percentage } as Partial<Record<CompliancePhaseKey, number>>,
      metadata: {
        semantic: 'EXACT',
        standardCode: IP_PLAN_STANDARD_CODE,
        standardTitle: IP_PLAN_STANDARD_TITLE,
        formula: IP_PLAN_FORMULA,
        target: ImprovementPlanProvider.COMPLIANCE_TARGET,
        evaluatedPeriod: breakdown.evaluatedPeriod,
        noDataReason: breakdown.noDataReason,
        weights: { ...IP_PLAN_SCORE_WEIGHTS },
        dimensions: breakdown.dimensions,
        counters: breakdown.counters,
        latestPlan: breakdown.latestPlan,
        findings,
      },
    } as ProviderComplianceResult;
  }
}
