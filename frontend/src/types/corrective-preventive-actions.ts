/**
 * E3 (7.1.1) — Tipos del dominio CORRECTIVE-PREVENTIVE-ACTIONS
 * (Acciones preventivas y correctivas).
 *
 * Espejo EXACTO del contrato backend:
 * - schema:  backend/src/modules/corrective-preventive-actions/schemas/corrective-preventive-action.schema.ts
 * - history: backend/src/modules/corrective-preventive-actions/schemas/corrective-preventive-action-history.schema.ts
 * - DTOs:    backend/src/modules/corrective-preventive-actions/dto/corrective-preventive-action.dto.ts
 * - metadata: backend/src/modules/compliance-engine/providers/corrective-preventive-actions-scoring.ts
 *
 * El frontend es SOLO LECTOR del cumplimiento:
 * - NO recalcula el score (fuente oficial: moduleCompliance.compliance del
 *   ComplianceEngine → provider 'corrective-preventive-actions').
 * - NO recalcula dimensiones ni pesos ni reglas de NO_DATA ni findings.
 * - ratio 0–1 → % está permitido únicamente para presentación visual.
 * - OVERDUE es DERIVADO en presentación con la regla oficial
 *   (dueDate < now && status no terminal) — NUNCA se envía al backend.
 */

// ─── Enums (espejo del schema backend) ──────────────────────────────────────

export type ActionItemType = 'PREVENTIVE' | 'CORRECTIVE' | 'IMPROVEMENT';

export type ActionOrigin =
  | 'AUDIT_6_1_2'
  | 'MANAGEMENT_REVIEW_6_1_3'
  | 'INCIDENT_7_1_3'
  | 'INSPECTION'
  | 'INDICATOR'
  | 'LEGAL_MATRIX'
  | 'OTHER';

export type ActionPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Solo 4 estados: OVERDUE es derivado (nunca persistido ni aceptado). */
export type ActionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type EffectivenessResult = 'EFECTIVA' | 'NO_EFECTIVA' | 'REQUIERE_NUEVA_ACCION';

export const CPA_TYPE_LABELS: Record<ActionItemType, string> = {
  PREVENTIVE: 'Preventiva',
  CORRECTIVE: 'Correctiva',
  IMPROVEMENT: 'Mejora',
};

export const CPA_ORIGIN_LABELS: Record<ActionOrigin, string> = {
  AUDIT_6_1_2: 'Auditoría anual (6.1.2)',
  MANAGEMENT_REVIEW_6_1_3: 'Revisión por la dirección (6.1.3)',
  INCIDENT_7_1_3: 'Incidente/accidente (7.1.3)',
  INSPECTION: 'Inspección',
  INDICATOR: 'Indicador',
  LEGAL_MATRIX: 'Matriz legal',
  OTHER: 'Otro',
};

export const CPA_PRIORITY_LABELS: Record<ActionPriority, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

export const CPA_STATUS_LABELS: Record<ActionStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En ejecución',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

export const CPA_EFFECTIVENESS_LABELS: Record<EffectivenessResult, string> = {
  EFECTIVA: 'Efectiva',
  NO_EFECTIVA: 'No efectiva',
  REQUIERE_NUEVA_ACCION: 'Requiere nueva acción',
};

export const CPA_STATUS_VARIANTS: Record<ActionStatus, string> = {
  PENDING: 'badge--info',
  IN_PROGRESS: 'badge--warning',
  COMPLETED: 'badge--success',
  CANCELLED: 'badge--danger',
};

export const CPA_PRIORITY_VARIANTS: Record<ActionPriority, string> = {
  LOW: 'badge--info',
  MEDIUM: 'badge--info',
  HIGH: 'badge--warning',
  CRITICAL: 'badge--danger',
};

export const CPA_EFFECTIVENESS_VARIANTS: Record<EffectivenessResult, string> = {
  EFECTIVA: 'badge--success',
  NO_EFECTIVA: 'badge--danger',
  REQUIERE_NUEVA_ACCION: 'badge--warning',
};

/**
 * Transiciones válidas por estado (espejo de CPA_VALID_TRANSITIONS — el
 * backend es la autoridad; el frontend solo ofrece las opciones válidas).
 */
export const CPA_VALID_TRANSITIONS: Record<ActionStatus, readonly ActionStatus[]> = {
  PENDING: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const CPA_TRANSITION_LABELS: Partial<Record<ActionStatus, string>> = {
  IN_PROGRESS: 'Iniciar ejecución',
  COMPLETED: 'Completar',
  CANCELLED: 'Cancelar',
};

/**
 * Regla OFICIAL derivada de vencimiento (misma del scorer E2):
 * dueDate < now && status NOT IN [COMPLETED, CANCELLED].
 * Solo presentación; nunca se envía al backend.
 */
export function isCpaActionOverdue(action: { dueDate?: string; status: ActionStatus }, now?: Date): boolean {
  if (action.status === 'COMPLETED' || action.status === 'CANCELLED') return false;
  if (!action.dueDate) return false;
  const due = new Date(action.dueDate).getTime();
  return !Number.isNaN(due) && due < (now ?? new Date()).getTime();
}

// ─── Modelos (espejo de las respuestas JSON del backend) ────────────────────

export interface CpaEvidenceModel {
  documentId?: string;
  documentSnapshot?: string;
  evidenceUrl?: string;
  comment?: string;
}

export interface CpaEffectivenessVerificationModel {
  verified: boolean;
  result?: EffectivenessResult;
  verifiedByUserId?: string;
  verifiedBySnapshot?: string;
  verificationDate?: string;
  observations?: string;
}

/** Acción preventiva/correctiva (CorrectivePreventiveAction). */
export interface CorrectivePreventiveActionModel {
  _id: string;
  companyId: string;
  actionCode?: string;
  type: ActionItemType;
  title: string;
  description: string;
  origin: ActionOrigin;
  originReferenceId?: string;
  finding?: string;
  rootCause?: string;
  actionPlan?: string;
  priority: ActionPriority;
  responsibleUserId: string;
  responsibleSnapshot?: string;
  plannedDate?: string;
  dueDate: string;
  executionDate?: string;
  status: ActionStatus;
  evidence?: CpaEvidenceModel;
  effectivenessVerification?: CpaEffectivenessVerificationModel;
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

export type CpaHistoryAction =
  | 'CREATE'
  | 'UPDATE'
  | 'STATUS_CHANGE'
  | 'EVIDENCE'
  | 'EFFECTIVENESS'
  | 'CLOSURE';

export const CPA_HISTORY_ACTION_LABELS: Record<CpaHistoryAction, string> = {
  CREATE: 'Creación',
  UPDATE: 'Actualización',
  STATUS_CHANGE: 'Cambio de estado',
  EVIDENCE: 'Evidencia registrada',
  EFFECTIVENESS: 'Verificación de eficacia',
  CLOSURE: 'Cierre',
};

export interface CpaHistoryModel {
  _id: string;
  companyId: string;
  actionId: string;
  actionCode?: string;
  action: CpaHistoryAction;
  actorUserId?: string;
  actorSnapshot: string;
  details?: Record<string, unknown>;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: string;
}

// ─── Payloads (espejo estricto de los DTOs — forbidNonWhitelisted) ──────────

/**
 * CreateCorrectivePreventiveActionDto. NUNCA enviar companyId/createdBy/
 * status/evidence/effectivenessVerification: todo se resuelve server-side.
 */
export interface CreateCpaActionPayload {
  actionCode?: string;
  type: ActionItemType;
  title: string;
  description: string;
  origin: ActionOrigin;
  originReferenceId?: string;
  finding?: string;
  rootCause?: string;
  actionPlan?: string;
  priority?: ActionPriority;
  responsibleUserId: string;
  responsibleSnapshot?: string;
  plannedDate?: string;
  dueDate: string;
}

/** UpdateCorrectivePreventiveActionDto (todo opcional; el estado va por /status). */
export interface UpdateCpaActionPayload extends Partial<CreateCpaActionPayload> {
  executionDate?: string;
}

/** UpdateActionStatusDto. */
export interface UpdateCpaActionStatusPayload {
  status: ActionStatus;
  comment?: string;
}

/** AddActionEvidenceDto. */
export interface AddCpaEvidencePayload {
  documentId?: string;
  evidenceUrl?: string;
  comment?: string;
  replace?: boolean;
}

/** VerifyEffectivenessDto. */
export interface VerifyCpaEffectivenessPayload {
  result: EffectivenessResult;
  observations?: string;
  verificationDate?: string;
}

// ─── Compliance oficial 7.1.1 (metadata dimensions:v1 del provider E2) ──────

export interface CpaComplianceDimensionDetail {
  /** 0–1; null = NO evaluable (redistribuida en backend; nunca convertir null en 0). */
  ratio: number | null;
  numerator: number | null;
  denominator: number | null;
  weight: number;
  subchecks?: { satisfied: number; total: number };
  [key: string]: unknown;
}

export interface CpaComplianceCounters {
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
  actionsWithEffectiveness: number;
  actionsWithoutEffectiveness: number;
  effectiveActions: number;
  ineffectiveActions: number;
  actionsRequiringNewAction: number;
  lastActionDate: string | null;
}

/** Las 5 dimensiones oficiales de 7.1.1 (denominaciones exactas del backend). */
export interface CpaComplianceDimensions {
  programming: CpaComplianceDimensionDetail;
  execution: CpaComplianceDimensionDetail;
  evidence: CpaComplianceDimensionDetail;
  effectiveness: CpaComplianceDimensionDetail;
  continuity: CpaComplianceDimensionDetail;
}

export interface CpaComplianceMetadataV1 {
  semantic?: 'EXACT';
  standardCode?: '7.1.1';
  standardTitle?: string;
  formula: 'dimensions:v1';
  target?: number;
  evaluatedPeriod?: string | null;
  noDataReason?: 'no-actions' | null;
  weights?: Record<string, number>;
  dimensions: CpaComplianceDimensions;
  counters: CpaComplianceCounters;
  latestAction?: {
    id: string;
    actionCode: string | null;
    title: string | null;
    type: string | null;
    status: string | null;
    dueDate: string | null;
  } | null;
}

export const CPA_DIMENSION_KEYS = [
  'programming',
  'execution',
  'evidence',
  'effectiveness',
  'continuity',
] as const;

export type CpaDimensionKey = (typeof CPA_DIMENSION_KEYS)[number];

export const CPA_DIMENSION_LABELS: Record<CpaDimensionKey, string> = {
  programming: 'Programación y asignación',
  execution: 'Ejecución y oportunidad',
  evidence: 'Evidencia y trazabilidad',
  effectiveness: 'Verificación de eficacia',
  continuity: 'Continuidad',
};

/** Pesos informativos de respaldo (fuente oficial: metadata.weights). */
export const CPA_DIMENSION_WEIGHT_FALLBACK: Record<CpaDimensionKey, number> = {
  programming: 20,
  execution: 25,
  evidence: 20,
  effectiveness: 25,
  continuity: 10,
};

/** Acción mínima por finding oficial (ids de corrective-preventive-actions-scoring.ts). */
export const CPA_FINDING_ACTIONS: Record<string, { tab: string; label: string }> = {
  'corrective-preventive-actions-no-data': { tab: 'acciones', label: 'Registrar primera acción' },
  'corrective-preventive-actions-incomplete-assignment': { tab: 'acciones', label: 'Completar asignación' },
  'corrective-preventive-actions-overdue': { tab: 'acciones', label: 'Ver vencidas' },
  'corrective-preventive-actions-no-evidence': { tab: 'acciones', label: 'Registrar evidencia' },
  'corrective-preventive-actions-effectiveness-unverified': { tab: 'acciones', label: 'Verificar eficacia' },
  'corrective-preventive-actions-traceability-incomplete': { tab: 'acciones', label: 'Documentar análisis' },
  'corrective-preventive-actions-ineffective': { tab: 'acciones', label: 'Revisar no efectivas' },
};

/**
 * Type guard — valida `formula === 'dimensions:v1'` y las propiedades
 * estructurales necesarias (5 dimensiones con `ratio` y counters objeto).
 * NO valida números: los valores recibidos son oficiales del backend.
 */
export function isCpaComplianceMetadataV1(value: unknown): value is CpaComplianceMetadataV1 {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;

  if (m.formula !== 'dimensions:v1') return false;
  if (!m.dimensions || typeof m.dimensions !== 'object') return false;
  if (!m.counters || typeof m.counters !== 'object') return false;

  const dims = m.dimensions as Record<string, unknown>;
  return CPA_DIMENSION_KEYS.every((key) => {
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
export function cpaRatioToPercent(ratio: number | null | undefined): number | null {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return null;
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}
