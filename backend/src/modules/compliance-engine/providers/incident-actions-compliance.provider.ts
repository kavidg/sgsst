import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Incident, IncidentDocument } from '../../incidents/schemas/incident.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import {
  ComplianceProvider,
  ProviderComplianceResult,
} from './compliance-provider.interface';
import {
  INCIDENT_ACTIONS_COMPLIANCE_TARGET,
  INCIDENT_ACTIONS_FORMULA,
  INCIDENT_ACTIONS_MODULE,
  INCIDENT_ACTIONS_SCORE_WEIGHTS,
  INCIDENT_ACTIONS_STANDARD_CODE,
  INCIDENT_ACTIONS_STANDARD_TITLE,
  IncidentActionsScoreBreakdown,
  computeIncidentActionsScore,
} from './incident-actions-scoring';

/**
 * E2 (7.1.3) — Provider OFICIAL de las ACCIONES POR ACCIDENTES
 * (incident-actions — dominio incidents).
 *
 * - module: 'incident-actions' — ÚNICO contribuyente elegible al score de
 *   7.1.3. Reemplaza IN-PLACE la implementación proxy de FASE 20 (la existencial
 *   de existencia/investigación/acciones/rootCause): mismo module ID, misma
 *   posición en this.providers del ComplianceEngine; NO existe segundo provider
 *   para 7.1.3 (el proxy legacy de AccountabilityMeeting ya era este provider).
 * - Consulta ÚNICAMENTE Incident con una sola query tenant-scoped
 *   find({companyId}).lean() — sin N+1, sin queries cruzadas.
 * - NO consulta AccountabilityMeeting/Commitment, CorrectivePreventiveAction,
 *   ManagementReviewDirection, AnnualAudit, SgstProgram (7.1.4): fronteras
 *   7.1.1/7.1.2/7.1.4 intactas. El dominio Incident es la fuente de verdad.
 * - TODO el cálculo vive en incident-actions-scoring.ts (función PURA,
 *   dimensions:v1, now inyectable); el provider transporta y adapta al
 *   contrato. `now` se pasa explícitamente (Date.now()) para trazabilidad.
 * - El 100% del estándar va en phases.act (ACTUAR). NO calcula el peso 10%
 *   de la fase (eso es PHASE_WEIGHTS, intocable).
 * - Tenant: companyId SIEMPRE resuelto server-side por el ComplianceEngine
 *   (CompanyAccessGuard); jamás del payload.
 * - Evaluabilidad (contrato E1): SOLO ACCIDENT/INCIDENTE; DISEASE (3.2.2)
 *   queda EXCLUÍDO del scoring — el provider 3.2.1 (module 'incidents') NO se
 *   modifica y sigue midiendo accidentalidad/cierre sobre el mismo dominio.
 */
@Injectable()
export class IncidentActionsProvider implements ComplianceProvider {
  private static readonly MODULE = INCIDENT_ACTIONS_MODULE;
  private static readonly COMPLIANCE_TARGET = INCIDENT_ACTIONS_COMPLIANCE_TARGET;

  constructor(
    @InjectModel(Incident.name)
    private readonly incidentModel: Model<IncidentDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    // UNA sola query principal tenant-scoped (sin N+1; sin queries cruzadas).
    const docs = await this.incidentModel
      .find({ companyId: companyObjectId })
      .lean()
      .exec();

    // Contrato serializable para el scorer puro (ObjectIds → strings via Lean doc).
    const incidents = docs.map((d) => ({
      ...(d as unknown as IncidentCaseLikeSource),
      _id: String(d._id),
    }));

    const now = new Date();
    const breakdown: IncidentActionsScoreBreakdown = computeIncidentActionsScore({
      incidents,
      now,
    });

    const findings: ProviderComplianceResult['findings'] = breakdown.findings.map((f) => ({
      id: f.id,
      module: IncidentActionsProvider.MODULE,
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
      createdAt: now.toISOString(),
    }));

    if (breakdown.noData) {
      return {
        module: IncidentActionsProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings,
        pending: 0,
        completed: 0,
        phases: { act: 0 } as Partial<Record<CompliancePhaseKey, number>>,
        metadata: {
          semantic: 'EXACT',
          standardCode: INCIDENT_ACTIONS_STANDARD_CODE,
          standardTitle: INCIDENT_ACTIONS_STANDARD_TITLE,
          formula: INCIDENT_ACTIONS_FORMULA,
          target: IncidentActionsProvider.COMPLIANCE_TARGET,
          evaluatedPeriod: breakdown.evaluatedPeriod,
          noDataReason: breakdown.noDataReason,
          weights: { ...INCIDENT_ACTIONS_SCORE_WEIGHTS },
          counters: breakdown.counters,
          findings,
        },
      } as ProviderComplianceResult;
    }

    const percentage = breakdown.percentage;
    const status =
      percentage >= IncidentActionsProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET';

    return {
      module: IncidentActionsProvider.MODULE,
      percentage,
      status,
      findings,
      pending: breakdown.counters.overdueActions + breakdown.counters.pendingActions,
      completed: breakdown.counters.completedActions,
      phases: { act: percentage } as Partial<Record<CompliancePhaseKey, number>>,
      metadata: {
        semantic: 'EXACT',
        standardCode: INCIDENT_ACTIONS_STANDARD_CODE,
        standardTitle: INCIDENT_ACTIONS_STANDARD_TITLE,
        formula: INCIDENT_ACTIONS_FORMULA,
        target: IncidentActionsProvider.COMPLIANCE_TARGET,
        evaluatedPeriod: breakdown.evaluatedPeriod,
        noDataReason: breakdown.noDataReason,
        weights: { ...INCIDENT_ACTIONS_SCORE_WEIGHTS },
        dimensions: breakdown.dimensions,
        counters: breakdown.counters,
        latestIncident: breakdown.latestIncident,
        findings,
      },
    } as ProviderComplianceResult;
  }
}

/** Fuente mínima del documento lean (el resto de campos pasa tal cual). */
type IncidentCaseLikeSource = {
  investigationType?: string;
  [key: string]: unknown;
};
