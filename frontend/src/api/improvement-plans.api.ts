/**
 * E3 (7.1.4) — API tipada del dominio IMPROVEMENT-PLANS (Plan de mejoramiento).
 *
 * Delegada en `api.ts` (convención del repo: api.ts como punto único de
 * acceso a tipos/API). Este módulo existe para que el import en la página
 * refleje el patrón pedido por E3; NUNCA envía companyId/actor (el backend
 * resuelve tenant y actor server-side).
 */
export {
  fetchImprovementPlans,
  fetchImprovementPlan,
  createImprovementPlan,
  updateImprovementPlan,
  updateImprovementPlanStatus,
  deleteImprovementPlan,
  createImprovementPlanActivity,
  updateImprovementPlanActivity,
  updateImprovementPlanActivityStatus,
  addImprovementPlanActivityEvidence,
  registerImprovementPlanActivityFollowUp,
  addPlanMonitoring,
  fetchImprovementPlanHistory,
} from '../api';

export type {
  ImprovementPlanModel,
  ImprovementPlanStatus,
  ImprovementPlanActivityStatus,
  ImprovementPlanOrigin,
  ImprovementPlanPriority,
  ImprovementPlanResourceType,
  ImprovementPlanImplementationStatus,
  ImprovementPlanPerceivedEffectiveness,
  ImprovementPlanHistoryAction,
  IpActivityModel,
  IpObjectiveModel,
  IpMonitoringModel,
  IpResourceModel,
  IpEvidenceModel,
  IpFollowUpModel,
  IpHistoryModel,
  CreateImprovementPlanPayload,
  UpdateImprovementPlanPayload,
  UpdateImprovementPlanStatusPayload,
  CreatePlanActivityPayload,
  UpdatePlanActivityPayload,
  UpdatePlanActivityStatusPayload,
  AddPlanActivityEvidencePayload,
  RegisterPlanActivityFollowUpPayload,
  AddPlanMonitoringPayload,
} from '../api';
