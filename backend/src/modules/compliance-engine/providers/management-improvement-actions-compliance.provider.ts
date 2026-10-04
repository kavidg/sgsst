import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ManagementImprovementAction,
  ManagementImprovementActionDocument,
} from '../../management-improvement-actions/schemas/management-improvement-action.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import {
  ComplianceProvider,
  ProviderComplianceResult,
} from './compliance-provider.interface';
import {
  MiaActionLike,
  MIA_ACTIONS_COMPLIANCE_TARGET,
  MIA_ACTIONS_FORMULA,
  MIA_ACTIONS_MODULE,
  MIA_ACTIONS_SCORE_WEIGHTS,
  MIA_ACTIONS_STANDARD_CODE,
  MIA_ACTIONS_STANDARD_TITLE,
  MiaActionsScoreBreakdown,
  computeMiaActionsScore,
} from './management-improvement-actions-scoring';

/**
 * E2 (7.1.2) — Provider OFICIAL de las ACCIONES DE MEJORA DE LA ALTA
 * DIRECCIÓN (management-improvement-actions).
 *
 * - module: 'management-improvement-actions' — ÚNICO contribuyente elegible
 *   al score de 7.1.2. El provider legacy 'management-improvement'
 *   (AccountabilityMeeting) queda INELIGIBLE vía SCORING_INELIGIBLE_MODULES y
 *   se conserva en moduleCompliance solo como compatibilidad/hallazgos.
 * - Consulta ÚNICAMENTE ManagementImprovementAction (dominio propio E1) con
 *   una sola query tenant-scoped find({companyId}).lean() — sin N+1.
 * - NO consulta AccountabilityMeeting, AccountabilityCommitment,
 *   ManagementReviewDirection, CorrectivePreventiveAction, AnnualAudit,
 *   IncidentAction ni ImprovementPlan: origin/originReferenceId son
 *   declarativos y NUNCA disparan queries cruzadas (frontera 7.1.2 ↔ 6.1.3 /
 *   7.1.1 / 7.1.3 / 7.1.4).
 * - TODO el cálculo vive en management-improvement-actions-scoring.ts
 *   (función PURA, dimensions:v1); el provider transporta y adapta al
 *   contrato.
 * - El 100% del estándar va en phases.act (ACTUAR). NO calcula el peso 10%
 *   de la fase (eso es PHASE_WEIGHTS, intocable).
 * - Tenant: companyId SIEMPRE resuelto server-side por el ComplianceEngine
 *   (CompanyAccessGuard); jamás del payload.
 */
@Injectable()
export class ManagementImprovementActionsProvider implements ComplianceProvider {
  private static readonly MODULE = MIA_ACTIONS_MODULE;
  private static readonly COMPLIANCE_TARGET = MIA_ACTIONS_COMPLIANCE_TARGET;

  constructor(
    @InjectModel(ManagementImprovementAction.name)
    private readonly actionModel: Model<ManagementImprovementActionDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    // UNA sola query principal tenant-scoped (sin N+1; sin queries cruzadas).
    const docs = await this.actionModel
      .find({ companyId: companyObjectId })
      .lean()
      .exec();

    // Contrato serializable para el scorer puro (ObjectIds → strings via Lean doc).
    const actions: MiaActionLike[] = docs.map((d) => ({
      ...(d as unknown as MiaActionLike),
      _id: String(d._id),
    }));

    const breakdown: MiaActionsScoreBreakdown = computeMiaActionsScore({ actions });

    const findings: ProviderComplianceResult['findings'] = breakdown.findings.map((f) => ({
      id: f.id,
      module: ManagementImprovementActionsProvider.MODULE,
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
        module: ManagementImprovementActionsProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings,
        pending: 0,
        completed: 0,
        phases: { act: 0 } as Partial<Record<CompliancePhaseKey, number>>,
        metadata: {
          semantic: 'EXACT',
          standardCode: MIA_ACTIONS_STANDARD_CODE,
          standardTitle: MIA_ACTIONS_STANDARD_TITLE,
          formula: MIA_ACTIONS_FORMULA,
          target: ManagementImprovementActionsProvider.COMPLIANCE_TARGET,
          evaluatedPeriod: breakdown.evaluatedPeriod,
          noDataReason: breakdown.noDataReason,
          weights: { ...MIA_ACTIONS_SCORE_WEIGHTS },
          counters: breakdown.counters,
          findings,
        },
      } as ProviderComplianceResult;
    }

    const percentage = breakdown.percentage;
    const status =
      percentage >= ManagementImprovementActionsProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET';

    return {
      module: ManagementImprovementActionsProvider.MODULE,
      percentage,
      status,
      findings,
      pending: breakdown.counters.overdueActions + breakdown.counters.pendingActions,
      completed: breakdown.counters.completedActions,
      phases: { act: percentage } as Partial<Record<CompliancePhaseKey, number>>,
      metadata: {
        semantic: 'EXACT',
        standardCode: MIA_ACTIONS_STANDARD_CODE,
        standardTitle: MIA_ACTIONS_STANDARD_TITLE,
        formula: MIA_ACTIONS_FORMULA,
        target: ManagementImprovementActionsProvider.COMPLIANCE_TARGET,
        evaluatedPeriod: breakdown.evaluatedPeriod,
        noDataReason: breakdown.noDataReason,
        weights: { ...MIA_ACTIONS_SCORE_WEIGHTS },
        dimensions: breakdown.dimensions,
        counters: breakdown.counters,
        latestAction: breakdown.latestAction,
        findings,
      },
    } as ProviderComplianceResult;
  }
}
