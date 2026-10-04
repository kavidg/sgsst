/**
 * E3 (7.1.4) — Tipos del dominio IMPROVEMENT-PLANS (Plan de mejoramiento).
 *
 * Espejo EXACTO del contrato backend:
 * - schema:   backend/src/modules/improvement-plans/schemas/improvement-plan.schema.ts
 * - lifecycle:backend/src/modules/improvement-plans/schemas/improvement-plan-lifecycle.schema.ts
 * - history:  backend/src/modules/improvement-plans/schemas/improvement-plan-history.schema.ts
 * - DTOs:     backend/src/modules/improvement-plans/dto/improvement-plan.dto.ts
 * - metadata: backend/src/modules/compliance-engine/providers/improvement-plan-scoring.ts
 *
 * El frontend es SOLO LECTOR del cumplimiento:
 * - NO recalcula el score (fuente oficial: moduleCompliance.compliance del
 *   ComplianceEngine → provider 'improvement-plan', dimensions:v1).
 * - NO recalcula dimensiones, pesos, reglas de NO_DATA ni findings.
 * - ratio 0–1 → % está permitido únicamente para presentación visual.
 * - OVERDUE (plan y actividad) es DERIVADO (endDate/dueDate < now && estado
 *   no terminal) — NUNCA se envía al backend ni se persiste.
 *
 * SEGURIDAD: NUNCA se envían companyId, actor (userId/email), ids generados
 * server-side (activityId/monitoringId/objectiveId) ni campos protegidos de
 * cierre (closureDate/closedBy*) — el backend es quien determina tenant y actor.
 *
 * FRONTERA con 7.1.1: la efectividad aquí es la PERCEPCIÓN declarativa del
 * seguimiento de la actividad (perceivedEffectiveness) — NUNCA se presenta
 * como "verificación de eficacia" (frontera funcional de corrective-
 * preventive-actions).
 */

// ─── Enums (espejo del schema backend) ──────────────────────────────────────

export type ImprovementPlanStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CLOSED'
  | 'CANCELLED';

export type ImprovementPlanActivityStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type ImprovementPlanOrigin =
  | 'SELF_ASSESSMENT'
  | 'AUDIT'
  | 'INSPECTION'
  | 'ACCIDENT'
  | 'MANAGEMENT_REVIEW'
  | 'INDICATOR'
  | 'LEGAL_REQUIREMENT'
  | 'OTHER';

export type ImprovementPlanPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ImprovementPlanResourceType = 'HUMAN' | 'TECHNICAL' | 'FINANCIAL' | 'PHYSICAL' | 'OTHER';

/** Estado de implementación declarado en el seguimiento de la actividad. */
export type ImprovementPlanImplementationStatus = 'NOT_STARTED' | 'ON_TRACK' | 'DELAYED' | 'IMPLEMENTED';

/**
 * Percepción de efectividad declarada en el seguimiento — NO verificación
 * formal de eficacia.
 */
export type ImprovementPlanPerceivedEffectiveness = 'EFECTIVA' | 'NO_EFECTIVA' | 'INDETERMINADA';

export const IP_PLAN_STATUS_LABELS: Record<ImprovementPlanStatus, string> = {
  DRAFT: 'Borrador',
  SUBMITTED: 'Enviado',
  IN_PROGRESS: 'En progreso',
  COMPLETED: 'Completado',
  CLOSED: 'Cerrado',
  CANCELLED: 'Cancelado',
};

export const IP_ACTIVITY_STATUS_LABELS: Record<ImprovementPlanActivityStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En progreso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

export const IP_ORIGIN_LABELS: Record<ImprovementPlanOrigin, string> = {
  SELF_ASSESSMENT: 'Autoevaluación',
  AUDIT: 'Auditoría',
  INSPECTION: 'Inspección',
  ACCIDENT: 'Accidente',
  MANAGEMENT_REVIEW: 'Revisión por la dirección',
  INDICATOR: 'Indicador',
  LEGAL_REQUIREMENT: 'Requisito legal',
  OTHER: 'Otro',
};

export const IP_PRIORITY_LABELS: Record<ImprovementPlanPriority, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

export const IP_RESOURCE_TYPE_LABELS: Record<ImprovementPlanResourceType, string> = {
  HUMAN: 'Humano',
  TECHNICAL: 'Técnico',
  FINANCIAL: 'Financiero',
  PHYSICAL: 'Físico',
  OTHER: 'Otro',
};

export const IP_IMPLEMENTATION_STATUS_LABELS: Record<ImprovementPlanImplementationStatus, string> = {
  NOT_STARTED: 'No iniciado',
  ON_TRACK: 'En curso',
  DELAYED: 'Retrasado',
  IMPLEMENTED: 'Implementado',
};

/** Etiquetas de PERCEPCIÓN de efectividad (jamás "eficacia verificada"). */
export const IP_PERCEIVED_EFFECTIVENESS_LABELS: Record<ImprovementPlanPerceivedEffectiveness, string> = {
  EFECTIVA: 'Efectiva',
  NO_EFECTIVA: 'No efectiva',
  INDETERMINADA: 'Indeterminada',
};

export const IP_PLAN_STATUS_VARIANTS: Record<ImprovementPlanStatus, string> = {
  DRAFT: 'badge--info',
  SUBMITTED: 'badge--info',
  IN_PROGRESS: 'badge--warning',
  COMPLETED: 'badge--success',
  CLOSED: 'badge--success',
  CANCELLED: 'badge--danger',
};

export const IP_ACTIVITY_STATUS_VARIANTS: Record<ImprovementPlanActivityStatus, string> = {
  PENDING: 'badge--info',
  IN_PROGRESS: 'badge--warning',
  COMPLETED: 'badge--success',
  CANCELLED: 'badge--danger',
};

export const IP_PRIORITY_VARIANTS: Record<ImprovementPlanPriority, string> = {
  LOW: 'badge--info',
  MEDIUM: 'badge--info',
  HIGH: 'badge--warning',
  CRITICAL: 'badge--danger',
};

export const IP_IMPLEMENTATION_STATUS_VARIANTS: Record<ImprovementPlanImplementationStatus, string> = {
  NOT_STARTED: 'badge--info',
  ON_TRACK: 'badge--success',
  DELAYED: 'badge--warning',
  IMPLEMENTED: 'badge--success',
};

export const IP_PERCEIVED_EFFECTIVENESS_VARIANTS: Record<ImprovementPlanPerceivedEffectiveness, string> = {
  EFECTIVA: 'badge--success',
  NO_EFECTIVA: 'badge--danger',
  INDETERMINADA: 'badge--warning',
};

/**
 * Transiciones válidas del plan (espejo de IMPROVEMENT_PLAN_TRANSITIONS — el
 * backend es la autoridad; el frontend solo ofrece las opciones válidas).
 * DRAFT → SUBMITTED | CANCELLED; SUBMITTED → IN_PROGRESS | CANCELLED;
 * IN_PROGRESS → COMPLETED | CANCELLED; COMPLETED → CLOSED; terminales: ninguna.
 */
export const IP_PLAN_VALID_TRANSITIONS: Record<ImprovementPlanStatus, readonly ImprovementPlanStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export const IP_PLAN_TRANSITION_LABELS: Partial<Record<ImprovementPlanStatus, string>> = {
  SUBMITTED: 'Enviar',
  IN_PROGRESS: 'Iniciar',
  COMPLETED: 'Completar',
  CLOSED: 'Cerrar',
  CANCELLED: 'Cancelar',
};

/**
 * Transiciones válidas de actividad (patrón 7.1.1/7.1.2/7.1.3):
 * PENDING → IN_PROGRESS | CANCELLED; IN_PROGRESS → COMPLETED | CANCELLED;
 * COMPLETED/CANCELLED terminales. OVERDUE es derivado y JAMÁS aparece aquí.
 */
export const IP_ACTIVITY_VALID_TRANSITIONS: Record<ImprovementPlanActivityStatus, readonly ImprovementPlanActivityStatus[]> = {
  PENDING: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const IP_ACTIVITY_TRANSITION_LABELS: Partial<Record<ImprovementPlanActivityStatus, string>> = {
  IN_PROGRESS: 'Iniciar',
  COMPLETED: 'Completar',
  CANCELLED: 'Cancelar',
};

// ─── Overdue derivado (NUNCA persistido; SOLO presentación) ─────────────────

/**
 * Regla OFICIAL derivada de vencimiento de actividad (misma del scorer E2):
 * dueDate < now && status NOT IN [COMPLETED, CANCELLED].
 */
export function isIpActivityOverdue(
  activity: { dueDate?: string | null; status: ImprovementPlanActivityStatus },
  now?: Date,
): boolean {
  if (activity.status === 'COMPLETED' || activity.status === 'CANCELLED') return false;
  if (!activity.dueDate) return false;
  const due = new Date(activity.dueDate).getTime();
  return !Number.isNaN(due) && due < (now ?? new Date()).getTime();
}

/**
 * Regla OFICIAL derivada de vencimiento del plan: endDate < now && estado no
 * terminal (DRAFT/SUBMITTED/IN_PROGRESS). Un plan COMPLETED/CLOSED/CANCELLED
 * nunca aparece como vencido.
 */
export function isIpPlanOverdue(
  plan: { endDate?: string | null; status: ImprovementPlanStatus },
  now?: Date,
): boolean {
  if (plan.status === 'COMPLETED' || plan.status === 'CLOSED' || plan.status === 'CANCELLED') return false;
  if (!plan.endDate) return false;
  const end = new Date(plan.endDate).getTime();
  return !Number.isNaN(end) && end < (now ?? new Date()).getTime();
}

/** El plan admite edición de contenido (DRAFT/SUBMITTED/IN_PROGRESS). */
export function isIpPlanEditable(status: ImprovementPlanStatus): boolean {
  return status === 'DRAFT' || status === 'SUBMITTED' || status === 'IN_PROGRESS';
}

/** La actividad admite edición (no terminal). */
export function isIpActivityEditable(status: ImprovementPlanActivityStatus): boolean {
  return status === 'PENDING' || status === 'IN_PROGRESS';
}

// ─── Modelos (espejo de las respuestas JSON del backend) ────────────────────

export interface IpEvidenceModel {
  documentId?: string;
  documentSnapshot?: string;
  evidenceUrl?: string;
  comment?: string;
}

export interface IpFollowUpModel {
  followUpDate?: string;
  observations?: string;
  implementationStatus?: ImprovementPlanImplementationStatus;
  perceivedEffectiveness?: ImprovementPlanPerceivedEffectiveness;
  requiresContinuedFollowUp?: boolean;
}

export interface IpActivityModel {
  /** Identificador estable generado server-side (ACT-001…). NUNCA se envía. */
  activityId: string;
  description: string;
  responsibleUserId?: string;
  responsibleUserSnapshot?: string;
  plannedDate?: string;
  dueDate?: string;
  executionDate?: string;
  status: ImprovementPlanActivityStatus;
  /** Avance 0–100; COMPLETED implica 100 (server-side). */
  progress?: number;
  evidence?: IpEvidenceModel;
  observations?: string;
  followUp?: IpFollowUpModel;
}

export interface IpObjectiveModel {
  /** Identificador estable generado server-side (OBJ-001…). NUNCA se envía. */
  objectiveId?: string;
  description: string;
  target?: string;
  indicator?: string;
  observations?: string;
}

export interface IpMonitoringModel {
  /** Identificador estable generado server-side (MON-001…). NUNCA se envía. */
  monitoringId: string;
  date?: string;
  /** Avance global del plan en el momento del seguimiento (0–100). */
  progress?: number;
  deviations?: string;
  adjustmentActions?: string;
  observations?: string;
}

export interface IpResourceModel {
  type: ImprovementPlanResourceType;
  description: string;
  observations?: string;
}

/** Plan de mejoramiento (ImprovementPlan — collection `improvementplans`). */
export interface ImprovementPlanModel {
  _id: string;
  /** Solo lectura si viene en la respuesta; NUNCA se envía al backend. */
  companyId?: string;
  code: string;
  title: string;
  description?: string;
  period?: string;
  year?: number;
  responsibleUserId?: string;
  responsibleUserSnapshot?: string;
  origin: ImprovementPlanOrigin;
  originReferenceId?: string;
  originDescription?: string;
  priority: ImprovementPlanPriority;
  prioritizationCriteria?: string;
  objectives: IpObjectiveModel[];
  activities: IpActivityModel[];
  resources: IpResourceModel[];
  monitoring: IpMonitoringModel[];
  startDate: string;
  endDate: string;
  status: ImprovementPlanStatus;
  closureDate?: string;
  closedByUserId?: string;
  closedByUserSnapshot?: string;
  closureObservations?: string;
  createdBy?: string;
  createdBySnapshot?: string;
  updatedBy?: string;
  updatedBySnapshot?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Historial append-only (solo lectura; lo genera el backend) ─────────────

export type ImprovementPlanHistoryAction =
  | 'CREATE'
  | 'UPDATE'
  | 'STATUS_CHANGE'
  | 'ACTIVITY_CREATED'
  | 'ACTIVITY_UPDATED'
  | 'ACTIVITY_STATUS_CHANGED'
  | 'EVIDENCE_ADDED'
  | 'FOLLOW_UP'
  | 'MONITORING_ADDED'
  | 'COMPLETED'
  | 'CLOSED'
  | 'CANCELLED';

export const IP_HISTORY_ACTION_LABELS: Record<ImprovementPlanHistoryAction, string> = {
  CREATE: 'Creación',
  UPDATE: 'Actualización',
  STATUS_CHANGE: 'Cambio de estado',
  ACTIVITY_CREATED: 'Actividad creada',
  ACTIVITY_UPDATED: 'Actividad actualizada',
  ACTIVITY_STATUS_CHANGED: 'Estado de actividad',
  EVIDENCE_ADDED: 'Evidencia registrada',
  FOLLOW_UP: 'Seguimiento de actividad',
  MONITORING_ADDED: 'Seguimiento del plan',
  COMPLETED: 'Plan completado',
  CLOSED: 'Plan cerrado',
  CANCELLED: 'Plan cancelado',
};

export interface IpHistoryModel {
  _id: string;
  companyId: string;
  planId: string;
  activityId?: string;
  monitoringId?: string;
  planCode?: string;
  action: ImprovementPlanHistoryAction;
  actorUserId?: string;
  actorSnapshot: string;
  details?: Record<string, unknown>;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: string;
}

// ─── Payloads (espejo estricto de los DTOs — forbidNonWhitelisted) ──────────

/** Sub-estructura de escritura de objetivo (objectiveId es server-side). */
export interface IpObjectiveInput {
  description: string;
  target?: string;
  indicator?: string;
  observations?: string;
}

/** Sub-estructura de escritura de recurso. */
export interface IpResourceInput {
  type: ImprovementPlanResourceType;
  description: string;
  observations?: string;
}

/**
 * CreateImprovementPlanDto. NUNCA enviar companyId/responsibleUserId inválidos/
 * status/activities/monitoring/closure*: todo se resuelve server-side.
 */
export interface CreateImprovementPlanPayload {
  code: string;
  title: string;
  description?: string;
  period?: string;
  year?: number;
  responsibleUserId?: string;
  origin: ImprovementPlanOrigin;
  originReferenceId?: string;
  originDescription?: string;
  priority?: ImprovementPlanPriority;
  prioritizationCriteria?: string;
  objectives?: IpObjectiveInput[];
  resources?: IpResourceInput[];
  startDate: string;
  endDate: string;
}

/**
 * UpdateImprovementPlanDto (todo opcional; el estado va por /status). El code
 * NO es actualizable. objectives/resources reemplazan las listas completas.
 */
export interface UpdateImprovementPlanPayload {
  title?: string;
  description?: string;
  period?: string;
  year?: number;
  responsibleUserId?: string;
  origin?: ImprovementPlanOrigin;
  originReferenceId?: string;
  originDescription?: string;
  priority?: ImprovementPlanPriority;
  prioritizationCriteria?: string;
  objectives?: IpObjectiveInput[];
  resources?: IpResourceInput[];
  startDate?: string;
  endDate?: string;
}

/** UpdateImprovementPlanStatusDto (única vía de cambio de estado). */
export interface UpdateImprovementPlanStatusPayload {
  status: ImprovementPlanStatus;
  closureObservations?: string;
}

/** CreatePlanActivityDto (activityId/status/progress son server-side). */
export interface CreatePlanActivityPayload {
  description: string;
  responsibleUserId?: string;
  plannedDate?: string;
  dueDate?: string;
}

/** UpdatePlanActivityDto (estado va por /status; terminal = solo lectura). */
export interface UpdatePlanActivityPayload {
  description?: string;
  responsibleUserId?: string;
  plannedDate?: string;
  dueDate?: string;
  /** Progreso 0–100 (no cambia el estado automáticamente). */
  progress?: number;
  observations?: string;
}

/** UpdatePlanActivityStatusDto (COMPLETED exige executionDate en backend). */
export interface UpdatePlanActivityStatusPayload {
  status: ImprovementPlanActivityStatus;
  /** Fecha de ejecución: OBLIGATORIA para COMPLETED (no futura). */
  executionDate?: string;
  comment?: string;
}

/** AddPlanActivityEvidenceDto (documentId tenant-safe y/o evidenceUrl). */
export interface AddPlanActivityEvidencePayload {
  documentId?: string;
  evidenceUrl?: string;
  comment?: string;
}

/** RegisterPlanActivityFollowUpDto (percepción de efectividad). */
export interface RegisterPlanActivityFollowUpPayload {
  followUpDate?: string;
  observations?: string;
  implementationStatus?: ImprovementPlanImplementationStatus;
  perceivedEffectiveness?: ImprovementPlanPerceivedEffectiveness;
  requiresContinuedFollowUp?: boolean;
}

/** AddPlanMonitoringDto (fecha no futura; progreso 0–100). */
export interface AddPlanMonitoringPayload {
  date: string;
  progress?: number;
  deviations?: string;
  adjustmentActions?: string;
  observations?: string;
}

// ─── Compliance oficial 7.1.4 (metadata dimensions:v1 del provider E2) ──────

export interface IpComplianceDimensionDetail {
  /** 0–1; null = NO evaluable (redistribuida en backend; nunca convertir null en 0). */
  ratio: number | null;
  numerator: number | null;
  denominator: number | null;
  weight: number;
  subchecks?: { satisfied: number; total: number };
  [key: string]: unknown;
}

export interface IpComplianceCounters {
  totalPlans: number;
  evaluablePlans: number;
  draftPlans: number;
  submittedPlans: number;
  inProgressPlans: number;
  completedPlans: number;
  closedPlans: number;
  cancelledPlans: number;
  overduePlans: number;
  totalActivities: number;
  completedActivities: number;
  pendingActivities: number;
  inProgressActivities: number;
  cancelledActivities: number;
  overdueActivities: number;
  activitiesWithEvidence: number;
  activitiesWithoutEvidence: number;
  plansWithObjectives: number;
  plansWithoutObjectives: number;
  plansWithIndicators: number;
  plansWithoutIndicators: number;
  plansWithMonitoring: number;
  plansWithoutMonitoring: number;
  plansWithResources: number;
  plansWithoutResources: number;
  plansWithFollowUp: number;
  plansWithoutFollowUp: number;
  plansClosed: number;
  plansNotClosed: number;
  lastPlanDate: string | null;
}

/** Las 6 dimensiones oficiales de 7.1.4 (denominaciones exactas del backend). */
export interface IpComplianceDimensions {
  structure: IpComplianceDimensionDetail;
  planning: IpComplianceDimensionDetail;
  execution: IpComplianceDimensionDetail;
  monitoring: IpComplianceDimensionDetail;
  evidenceAndClosure: IpComplianceDimensionDetail;
  continuity: IpComplianceDimensionDetail;
}

/**
 * Metadata V1 del provider 'improvement-plan'. En NO_DATA el backend omite
 * `dimensions` — por eso es opcional. El frontend NO recalcula nada.
 */
export interface IpComplianceMetadataV1 {
  semantic?: 'EXACT';
  standardCode?: '7.1.4';
  standardTitle?: string;
  formula: 'dimensions:v1';
  target?: number;
  evaluatedPeriod?: string | null;
  noDataReason?: 'no-evaluable-plans' | null;
  weights?: Record<string, number>;
  dimensions?: IpComplianceDimensions;
  counters: IpComplianceCounters;
  latestPlan?: {
    id: string;
    code: string | null;
    title: string | null;
    period: string | null;
    year: number | null;
    status: string | null;
    endDate: string | null;
  } | null;
  findings?: Array<{
    id: string;
    title: string;
    description: string;
    priority: string;
  }>;
}

export const IP_MODULE = 'improvement-plan';

export const IP_DIMENSION_KEYS = [
  'structure',
  'planning',
  'execution',
  'monitoring',
  'evidenceAndClosure',
  'continuity',
] as const;

export type IpDimensionKey = (typeof IP_DIMENSION_KEYS)[number];

export const IP_DIMENSION_LABELS: Record<IpDimensionKey, string> = {
  structure: 'Estructura e identificación',
  planning: 'Planeación',
  execution: 'Ejecución',
  monitoring: 'Seguimiento',
  evidenceAndClosure: 'Evidencia y cierre',
  continuity: 'Continuidad',
};

/** Pesos informativos de respaldo (fuente oficial: metadata.weights). */
export const IP_DIMENSION_WEIGHT_FALLBACK: Record<IpDimensionKey, number> = {
  structure: 15,
  planning: 25,
  execution: 20,
  monitoring: 15,
  evidenceAndClosure: 15,
  continuity: 10,
};

/** Acción mínima por finding oficial (ids de improvement-plan-scoring.ts). */
export const IP_FINDING_ACTIONS: Record<string, { tab: string; label: string }> = {
  'improvement-plan-no-data': { tab: 'planes', label: 'Crear primer plan' },
  'improvement-plan-incomplete-structure': { tab: 'planes', label: 'Completar identificación' },
  'improvement-plan-no-objectives': { tab: 'planes', label: 'Ver planes sin objetivos' },
  'improvement-plan-no-indicators': { tab: 'planes', label: 'Ver planes' },
  'improvement-plan-no-responsibles': { tab: 'planes', label: 'Asignar responsables' },
  'improvement-plan-no-schedule': { tab: 'planes', label: 'Completar cronograma' },
  'improvement-plan-overdue': { tab: 'planes', label: 'Ver vencidos' },
  'improvement-plan-insufficient-execution': { tab: 'planes', label: 'Revisar ejecución' },
  'improvement-plan-no-monitoring': { tab: 'planes', label: 'Registrar seguimiento' },
  'improvement-plan-no-evidence': { tab: 'planes', label: 'Registrar evidencia' },
  'improvement-plan-no-closure': { tab: 'planes', label: 'Revisar cierre' },
  'improvement-plan-insufficient-continuity': { tab: 'planes', label: 'Ver continuidad' },
};

/**
 * Type guard — valida `formula === 'dimensions:v1'` y la presencia de
 * `counters` (objeto). `dimensions` es OPCIONAL: en NO_DATA el backend la
 * omite. NO valida números: los valores recibidos son oficiales del backend.
 */
export function isIpComplianceMetadataV1(value: unknown): value is IpComplianceMetadataV1 {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  if (m.formula !== 'dimensions:v1') return false;
  if (!m.counters || typeof m.counters !== 'object') return false;
  return true;
}

/** Conversión SOLO de presentación: ratio 0–1 → 0–100. null → null (no evaluable). */
export function ipRatioToPercent(ratio: number | null | undefined): number | null {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return null;
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}
