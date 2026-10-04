/**
 * E3 (7.1.2) — Tipos del dominio MANAGEMENT-IMPROVEMENT-ACTIONS
 * (Acciones de mejora de la alta dirección).
 *
 * Espejo EXACTO del contrato backend:
 * - schema:  backend/src/modules/management-improvement-actions/schemas/management-improvement-action.schema.ts
 * - history: backend/src/modules/management-improvement-actions/schemas/management-improvement-action-history.schema.ts
 * - DTOs:    backend/src/modules/management-improvement-actions/dto/management-improvement-action.dto.ts
 * - metadata: backend/src/modules/compliance-engine/providers/management-improvement-actions-scoring.ts
 *
 * El frontend es SOLO LECTOR del cumplimiento:
 * - NO recalcula el score (fuente oficial: moduleCompliance.compliance del
 *   ComplianceEngine → provider 'management-improvement-actions').
 * - NO recalcula dimensiones ni pesos ni reglas de NO_DATA ni findings.
 * - ratio 0–1 → % está permitido únicamente para presentación visual.
 * - OVERDUE es DERIVADO en presentación con la regla oficial
 *   (dueDate < now && status no terminal) — NUNCA se envía al backend.
 *
 * FRONTERA con 7.1.1: la efectividad aquí es la PERCEPCIÓN declarativa del
 * seguimiento (perceivedEffectiveness) — NUNCA se presenta como "verificación
 * de eficacia" (eso es frontera funcional de corrective-preventive-actions).
 */

// ─── Enums (espejo del schema backend) ──────────────────────────────────────

export type ImprovementActionOrigin = 'MEETING' | 'MANAGEMENT_REVIEW_6_1_3' | 'OTHER';

export type ImprovementActionPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Solo 4 estados: OVERDUE es derivado (nunca persistido ni aceptado). */
export type ImprovementActionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

/** Estado de implementación declarado en el seguimiento. */
export type ImplementationStatus = 'NOT_STARTED' | 'ON_TRACK' | 'DELAYED' | 'IMPLEMENTED';

/**
 * Percepción/resultado de efectividad registrada durante el seguimiento
 * (declarativa — NO es una verificación formal de eficacia).
 */
export type PerceivedEffectiveness = 'EFECTIVA' | 'NO_EFECTIVA' | 'INDETERMINADA';

export const MIA_ORIGIN_LABELS: Record<ImprovementActionOrigin, string> = {
  MEETING: 'Reunión de rendición de cuentas',
  MANAGEMENT_REVIEW_6_1_3: 'Revisión por la dirección (6.1.3)',
  OTHER: 'Otro',
};

export const MIA_PRIORITY_LABELS: Record<ImprovementActionPriority, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

export const MIA_STATUS_LABELS: Record<ImprovementActionStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En ejecución',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

export const MIA_IMPLEMENTATION_STATUS_LABELS: Record<ImplementationStatus, string> = {
  NOT_STARTED: 'No iniciada',
  ON_TRACK: 'En curso (según plan)',
  DELAYED: 'Retrasada',
  IMPLEMENTED: 'Implementada',
};

/** Etiquetas de PERCEPCIÓN de efectividad (jamás "eficacia verificada"). */
export const MIA_PERCEIVED_EFFECTIVENESS_LABELS: Record<PerceivedEffectiveness, string> = {
  EFECTIVA: 'Efectiva (percibida)',
  NO_EFECTIVA: 'No efectiva (percibida)',
  INDETERMINADA: 'Sin concluir',
};

export const MIA_STATUS_VARIANTS: Record<ImprovementActionStatus, string> = {
  PENDING: 'badge--info',
  IN_PROGRESS: 'badge--warning',
  COMPLETED: 'badge--success',
  CANCELLED: 'badge--danger',
};

export const MIA_PRIORITY_VARIANTS: Record<ImprovementActionPriority, string> = {
  LOW: 'badge--info',
  MEDIUM: 'badge--info',
  HIGH: 'badge--warning',
  CRITICAL: 'badge--danger',
};

export const MIA_IMPLEMENTATION_STATUS_VARIANTS: Record<ImplementationStatus, string> = {
  NOT_STARTED: 'badge--info',
  ON_TRACK: 'badge--success',
  DELAYED: 'badge--warning',
  IMPLEMENTED: 'badge--success',
};

export const MIA_PERCEIVED_EFFECTIVENESS_VARIANTS: Record<PerceivedEffectiveness, string> = {
  EFECTIVA: 'badge--success',
  NO_EFECTIVA: 'badge--danger',
  INDETERMINADA: 'badge--warning',
};

/**
 * Transiciones válidas por estado (espejo de MIA_VALID_TRANSITIONS — el
 * backend es la autoridad; el frontend solo ofrece las opciones válidas).
 * PENDING → COMPLETED NO está permitida (paso obligatorio por IN_PROGRESS).
 */
export const MIA_VALID_TRANSITIONS: Record<ImprovementActionStatus, readonly ImprovementActionStatus[]> = {
  PENDING: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const MIA_TRANSITION_LABELS: Partial<Record<ImprovementActionStatus, string>> = {
  IN_PROGRESS: 'Iniciar ejecución',
  COMPLETED: 'Completar',
  CANCELLED: 'Cancelar',
};

/**
 * Regla OFICIAL derivada de vencimiento (misma del scorer E2):
 * dueDate < now && status NOT IN [COMPLETED, CANCELLED].
 * Solo presentación; nunca se envía al backend.
 */
export function isMiaActionOverdue(
  action: { dueDate?: string; status: ImprovementActionStatus },
  now?: Date,
): boolean {
  if (action.status === 'COMPLETED' || action.status === 'CANCELLED') return false;
  if (!action.dueDate) return false;
  const due = new Date(action.dueDate).getTime();
  return !Number.isNaN(due) && due < (now ?? new Date()).getTime();
}

// ─── Modelos (espejo de las respuestas JSON del backend) ────────────────────

export interface MiaEvidenceModel {
  documentId?: string;
  documentSnapshot?: string;
  evidenceUrl?: string;
  comment?: string;
}

export interface MiaFollowUpModel {
  lastFollowUpDate?: string;
  observations?: string;
  implementationStatus?: ImplementationStatus;
  perceivedEffectiveness?: PerceivedEffectiveness;
  requiresContinuedFollowUp?: boolean;
}

/** Acción de mejora de la alta dirección (ManagementImprovementAction). */
export interface ManagementImprovementActionModel {
  _id: string;
  companyId: string;
  actionCode?: string;
  title: string;
  description: string;
  origin: ImprovementActionOrigin;
  originReferenceId?: string;
  decisionReference?: string;
  priority: ImprovementActionPriority;
  responsibleUserId: string;
  responsibleSnapshot?: string;
  plannedDate?: string;
  dueDate: string;
  executionDate?: string;
  status: ImprovementActionStatus;
  evidence?: MiaEvidenceModel;
  followUp?: MiaFollowUpModel;
  closureDate?: string;
  closedByUserId?: string;
  closedBySnapshot?: string;
  createdBy?: string;
  createdBySnapshot?: string;
  updatedBy?: string;
  updatedBySnapshot?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Historial append-only (solo lectura; lo genera el backend) ─────────────

export type MiaHistoryAction =
  | 'CREATE'
  | 'UPDATE'
  | 'STATUS_CHANGE'
  | 'EVIDENCE'
  | 'FOLLOW_UP'
  | 'CLOSURE';

export const MIA_HISTORY_ACTION_LABELS: Record<MiaHistoryAction, string> = {
  CREATE: 'Creación',
  UPDATE: 'Actualización',
  STATUS_CHANGE: 'Cambio de estado',
  EVIDENCE: 'Evidencia registrada',
  FOLLOW_UP: 'Seguimiento registrado',
  CLOSURE: 'Cierre',
};

export interface MiaHistoryModel {
  _id: string;
  companyId: string;
  actionId: string;
  actionCode?: string;
  action: MiaHistoryAction;
  actorUserId?: string;
  actorSnapshot: string;
  details?: Record<string, unknown>;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: string;
}

// ─── Payloads (espejo estricto de los DTOs — forbidNonWhitelisted) ──────────

/**
 * CreateImprovementActionDto. NUNCA enviar companyId/createdBy/status/
 * evidence/followUp: todo se resuelve server-side.
 */
export interface CreateMiaActionPayload {
  actionCode?: string;
  title: string;
  description: string;
  origin: ImprovementActionOrigin;
  originReferenceId?: string;
  decisionReference?: string;
  priority?: ImprovementActionPriority;
  responsibleUserId: string;
  responsibleSnapshot?: string;
  plannedDate?: string;
  dueDate: string;
}

/** UpdateImprovementActionDto (todo opcional; el estado va por /status). */
export interface UpdateMiaActionPayload extends Partial<CreateMiaActionPayload> {
  executionDate?: string;
}

/** UpdateImprovementActionStatusDto. */
export interface UpdateMiaActionStatusPayload {
  status: ImprovementActionStatus;
  comment?: string;
}

/** AddImprovementActionEvidenceDto. */
export interface AddMiaEvidencePayload {
  documentId?: string;
  evidenceUrl?: string;
  comment?: string;
  replace?: boolean;
}

/** RegisterImprovementActionFollowUpDto. */
export interface RegisterMiaFollowUpPayload {
  lastFollowUpDate?: string;
  observations?: string;
  implementationStatus?: ImplementationStatus;
  perceivedEffectiveness?: PerceivedEffectiveness;
  requiresContinuedFollowUp?: boolean;
}

// ─── Compliance oficial 7.1.2 (metadata dimensions:v1 del provider E2) ──────

export interface MiaComplianceDimensionDetail {
  /** 0–1; null = NO evaluable (redistribuida en backend; nunca convertir null en 0). */
  ratio: number | null;
  numerator: number | null;
  denominator: number | null;
  weight: number;
  subchecks?: { satisfied: number; total: number };
  [key: string]: unknown;
}

export interface MiaComplianceCounters {
  totalActions: number;
  evaluableActions: number;
  pendingActions: number;
  inProgressActions: number;
  completedActions: number;
  cancelledActions: number;
  overdueActions: number;
  actionsWithExecutionDate: number;
  actionsWithEvidence: number;
  actionsWithoutEvidence: number;
  actionsWithFollowUp: number;
  actionsWithoutFollowUp: number;
  effectiveActions: number;
  ineffectiveActions: number;
  indeterminateEffectivenessActions: number;
  actionsRequiringContinuedFollowUp: number;
  lastActionDate: string | null;
}

/** Las 5 dimensiones oficiales de 7.1.2 (denominaciones exactas del backend). */
export interface MiaComplianceDimensions {
  programming: MiaComplianceDimensionDetail;
  execution: MiaComplianceDimensionDetail;
  followUp: MiaComplianceDimensionDetail;
  evidence: MiaComplianceDimensionDetail;
  continuity: MiaComplianceDimensionDetail;
}

export interface MiaComplianceMetadataV1 {
  semantic?: 'EXACT';
  standardCode?: '7.1.2';
  standardTitle?: string;
  formula: 'dimensions:v1';
  target?: number;
  evaluatedPeriod?: string | null;
  noDataReason?: 'no-actions' | null;
  weights?: Record<string, number>;
  dimensions: MiaComplianceDimensions;
  counters: MiaComplianceCounters;
  latestAction?: {
    id: string;
    actionCode: string | null;
    title: string | null;
    origin: string | null;
    status: string | null;
    dueDate: string | null;
  } | null;
}

export const MIA_DIMENSION_KEYS = [
  'programming',
  'execution',
  'followUp',
  'evidence',
  'continuity',
] as const;

export type MiaDimensionKey = (typeof MIA_DIMENSION_KEYS)[number];

export const MIA_DIMENSION_LABELS: Record<MiaDimensionKey, string> = {
  programming: 'Programación y asignación',
  execution: 'Ejecución y oportunidad',
  followUp: 'Seguimiento',
  evidence: 'Evidencia y trazabilidad',
  continuity: 'Continuidad',
};

/** Pesos informativos de respaldo (fuente oficial: metadata.weights). */
export const MIA_DIMENSION_WEIGHT_FALLBACK: Record<MiaDimensionKey, number> = {
  programming: 20,
  execution: 25,
  followUp: 20,
  evidence: 25,
  continuity: 10,
};

/** Acción mínima por finding oficial (ids de management-improvement-actions-scoring.ts). */
export const MIA_FINDING_ACTIONS: Record<string, { tab: string; label: string }> = {
  'management-improvement-actions-no-data': { tab: 'acciones', label: 'Registrar primera acción' },
  'management-improvement-actions-incomplete-assignment': { tab: 'acciones', label: 'Completar asignación' },
  'management-improvement-actions-overdue': { tab: 'acciones', label: 'Ver vencidas' },
  'management-improvement-actions-no-follow-up': { tab: 'acciones', label: 'Registrar seguimiento' },
  'management-improvement-actions-no-evidence': { tab: 'acciones', label: 'Registrar evidencia' },
  'management-improvement-actions-traceability-incomplete': { tab: 'acciones', label: 'Documentar decisión' },
  'management-improvement-actions-effectiveness-uncertain': { tab: 'acciones', label: 'Concluir efectividad' },
  'management-improvement-actions-ineffective': { tab: 'acciones', label: 'Revisar no efectivas' },
  'management-improvement-actions-continued-follow-up': { tab: 'acciones', label: 'Ver en seguimiento' },
};

/**
 * Type guard — valida `formula === 'dimensions:v1'` y las propiedades
 * estructurales necesarias (5 dimensiones con `ratio` y counters objeto).
 * NO valida números: los valores recibidos son oficiales del backend.
 */
export function isMiaComplianceMetadataV1(value: unknown): value is MiaComplianceMetadataV1 {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;

  if (m.formula !== 'dimensions:v1') return false;
  if (!m.dimensions || typeof m.dimensions !== 'object') return false;
  if (!m.counters || typeof m.counters !== 'object') return false;

  const dims = m.dimensions as Record<string, unknown>;
  return MIA_DIMENSION_KEYS.every((key) => {
    const dim = dims[key];
    return (
      !!dim &&
      typeof dim === 'object' &&
      'ratio' in (dim as Record<string, unknown>) &&
      'weight' in (dim as Record<string, unknown>)
    );
  });
}

/** Conversión SOLO de presentación: ratio 0–1 → 0–100. null → null (no evaluable). */
export function miaRatioToPercent(ratio: number | null | undefined): number | null {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return null;
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}
