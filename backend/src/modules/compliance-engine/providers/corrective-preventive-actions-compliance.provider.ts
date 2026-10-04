import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CorrectivePreventiveAction,
  CorrectivePreventiveActionDocument,
} from '../../corrective-preventive-actions/schemas/corrective-preventive-action.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import {
  ComplianceProvider,
  ProviderComplianceResult,
} from './compliance-provider.interface';
import {
  CpaActionLike,
  CPA_ACTIONS_COMPLIANCE_TARGET,
  CPA_ACTIONS_FORMULA,
  CPA_ACTIONS_MODULE,
  CPA_ACTIONS_SCORE_WEIGHTS,
  CPA_ACTIONS_STANDARD_CODE,
  CPA_ACTIONS_STANDARD_TITLE,
  CpaActionsScoreBreakdown,
  computeCpaActionsScore,
} from './corrective-preventive-actions-scoring';

/**
 * E2 (7.1.1) — Provider OFICIAL de las ACCIONES PREVENTIVAS Y CORRECTIVAS.
 *
 * - module: 'corrective-preventive-actions' — ÚNICO contribuyente elegible
 *   al score de 7.1.1. El provider legacy 'corrective-preventive'
 *   (AccountabilityCommitment) queda INELIGIBLE vía SCORING_INELIGIBLE_MODULES
 *   y se conserva en moduleCompliance solo como compatibilidad/hallazgos.
 * - Consulta ÚNICAMENTE CorrectivePreventiveAction (dominio propio E1) con
 *   una sola query tenant-scoped find({companyId}).lean() — sin N+1.
 * - NO consulta AccountabilityCommitment, AccountabilityMeeting, AnnualAudit,
 *   Incident, CopasstPeriod ni ManagementReviewDirection: origin/
 *   originReferenceId son declarativos y NUNCA disparan queries cruzadas
 *   (frontera 7.1.1 ↔ 2.6.1 / 6.1.2 / 6.1.3 / 7.1.3 / 7.1.4).
 * - TODO el cálculo vive en corrective-preventive-actions-scoring.ts (función
 *   PURA, dimensions:v1); el provider transporta y adapta al contrato.
 * - El 100% del estándar va en phases.act (ACTUAR). NO calcula el peso 10%
 *   de la fase (eso es PHASE_WEIGHTS, intocable).
 * - Tenant: companyId SIEMPRE resuelto server-side por el ComplianceEngine
 *   (CompanyAccessGuard); jamás del payload.
 */
@Injectable()
export class CorrectivePreventiveActionsProvider implements ComplianceProvider {
  private static readonly MODULE = CPA_ACTIONS_MODULE;
  private static readonly COMPLIANCE_TARGET = CPA_ACTIONS_COMPLIANCE_TARGET;

  constructor(
    @InjectModel(CorrectivePreventiveAction.name)
    private readonly actionModel: Model<CorrectivePreventiveActionDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    // UNA sola query principal tenant-scoped (sin N+1; sin queries cruzadas).
    const docs = await this.actionModel
      .find({ companyId: companyObjectId })
      .lean()
      .exec();

    // Contrato serializable para el scorer puro (ObjectIds → strings via Lean doc).
    const actions: CpaActionLike[] = docs.map((d) => ({
      ...(d as unknown as CpaActionLike),
      _id: String(d._id),
    }));

    const breakdown: CpaActionsScoreBreakdown = computeCpaActionsScore({ actions });

    const findings: ProviderComplianceResult['findings'] = breakdown.findings.map((f) => ({
      id: f.id,
      module: CorrectivePreventiveActionsProvider.MODULE,
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
        module: CorrectivePreventiveActionsProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings,
        pending: 0,
        completed: 0,
        phases: { act: 0 } as Partial<Record<CompliancePhaseKey, number>>,
        metadata: {
          semantic: 'EXACT',
          standardCode: CPA_ACTIONS_STANDARD_CODE,
          standardTitle: CPA_ACTIONS_STANDARD_TITLE,
          formula: CPA_ACTIONS_FORMULA,
          target: CorrectivePreventiveActionsProvider.COMPLIANCE_TARGET,
          evaluatedPeriod: breakdown.evaluatedPeriod,
          noDataReason: breakdown.noDataReason,
          weights: { ...CPA_ACTIONS_SCORE_WEIGHTS },
          counters: breakdown.counters,
          findings,
        },
      } as ProviderComplianceResult;
    }

    const percentage = breakdown.percentage;
    const status =
      percentage >= CorrectivePreventiveActionsProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET';

    return {
      module: CorrectivePreventiveActionsProvider.MODULE,
      percentage,
      status,
      findings,
      pending: breakdown.counters.overdueActions + breakdown.counters.pendingActions,
      completed: breakdown.counters.completedActions,
      phases: { act: percentage } as Partial<Record<CompliancePhaseKey, number>>,
      metadata: {
        semantic: 'EXACT',
        standardCode: CPA_ACTIONS_STANDARD_CODE,
        standardTitle: CPA_ACTIONS_STANDARD_TITLE,
        formula: CPA_ACTIONS_FORMULA,
        target: CorrectivePreventiveActionsProvider.COMPLIANCE_TARGET,
        evaluatedPeriod: breakdown.evaluatedPeriod,
        noDataReason: breakdown.noDataReason,
        weights: { ...CPA_ACTIONS_SCORE_WEIGHTS },
        dimensions: breakdown.dimensions,
        counters: breakdown.counters,
        latestAction: breakdown.latestAction,
        findings,
      },
    } as ProviderComplianceResult;
  }
}
