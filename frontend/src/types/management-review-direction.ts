/**
 * E3 (6.1.3) — Tipos del dominio MANAGEMENT-REVIEW-DIRECTION (Revisión por la
 * dirección SG-SST).
 *
 * Espejo EXACTO del contrato backend:
 * - schemas:  backend/src/modules/management-review-direction/schemas/management-review-direction.schema.ts
 * - history:  backend/src/modules/management-review-direction/schemas/management-review-direction-history.schema.ts
 * - DTOs:     backend/src/modules/management-review-direction/dto/management-review-direction.dto.ts
 * - metadata: backend/src/modules/compliance-engine/providers/management-review-direction-scoring.ts
 *
 * El frontend es SOLO LECTOR del cumplimiento:
 * - NO recalcula el score (fuente oficial: moduleCompliance.compliance del
 *   provider `management-review-direction` en GET /compliance-engine/overview).
 * - NO recalcula dimensiones ni pesos.
 * - ratio 0–1 → % está permitido únicamente para presentación visual.
 * - OVERDUE de decisiones NO es estado persistido: se deriva SOLO para
 *   presentación con la misma regla del backend (no terminal + dueDate < now).
 */

// ─── Enums (unions — espejo de management-review-direction.schema.ts) ───────

export type ManagementReviewDirectionStatus =
  | 'DRAFT'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type ManagementReviewType = 'ORDINARY' | 'EXTRAORDINARY';

export type ManagementReviewInputType =
  | 'AUDIT_RESULTS'
  | 'INDICATOR_RESULTS'
  | 'PHVA_COMPLIANCE'
  | 'OBJECTIVES'
  | 'IMPROVEMENT_ACTIONS'
  | 'RELEVANT_CHANGES'
  | 'RESOURCE_NEEDS'
  | 'OTHER';

export type ManagementReviewInputStatus = 'PENDING' | 'REVIEWED';

export type ManagementReviewDecisionCategory =
  | 'IMPROVEMENT'
  | 'RESOURCE'
  | 'OBJECTIVE'
  | 'COMPLIANCE'
  | 'RISK'
  | 'OTHER';

export type ManagementReviewDecisionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type ManagementReviewAttendance = 'ATTENDED' | 'ABSENT';

export type ManagementReviewDirectionHistoryAction =
  | 'CREATE'
  | 'UPDATE'
  | 'STATUS_CHANGE'
  | 'INPUT_CREATED'
  | 'INPUT_UPDATED'
  | 'DECISION_CREATED'
  | 'DECISION_UPDATED'
  | 'EVIDENCE_ATTACHED';

// ─── Labels ES (presentación) ───────────────────────────────────────────────

export const MANAGEMENT_REVIEW_DIRECTION_STATUS_LABELS: Record<ManagementReviewDirectionStatus, string> = {
  DRAFT: 'Borrador',
  PLANNED: 'Planificada',
  IN_PROGRESS: 'En ejecución',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

export const MANAGEMENT_REVIEW_TYPE_LABELS: Record<ManagementReviewType, string> = {
  ORDINARY: 'Ordinaria',
  EXTRAORDINARY: 'Extraordinaria',
};

export const MANAGEMENT_REVIEW_INPUT_TYPE_LABELS: Record<ManagementReviewInputType, string> = {
  AUDIT_RESULTS: 'Resultados de auditoría',
  INDICATOR_RESULTS: 'Resultados de indicadores',
  PHVA_COMPLIANCE: 'Cumplimiento PHVA',
  OBJECTIVES: 'Objetivos SG-SST',
  IMPROVEMENT_ACTIONS: 'Acciones de mejora',
  RELEVANT_CHANGES: 'Cambios relevantes',
  RESOURCE_NEEDS: 'Necesidades de recursos',
  OTHER: 'Otros',
};

export const MANAGEMENT_REVIEW_INPUT_STATUS_LABELS: Record<ManagementReviewInputStatus, string> = {
  PENDING: 'Pendiente',
  REVIEWED: 'Revisada',
};

export const MANAGEMENT_REVIEW_DECISION_CATEGORY_LABELS: Record<ManagementReviewDecisionCategory, string> = {
  IMPROVEMENT: 'Mejora',
  RESOURCE: 'Recursos',
  OBJECTIVE: 'Objetivo',
  COMPLIANCE: 'Cumplimiento',
  RISK: 'Riesgo',
  OTHER: 'Otro',
};

export const MANAGEMENT_REVIEW_DECISION_STATUS_LABELS: Record<ManagementReviewDecisionStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En progreso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

export const MANAGEMENT_REVIEW_ATTENDANCE_LABELS: Record<ManagementReviewAttendance, string> = {
  ATTENDED: 'Asistió',
  ABSENT: 'Ausente',
};

export const MANAGEMENT_REVIEW_HISTORY_ACTION_LABELS: Record<ManagementReviewDirectionHistoryAction, string> = {
  CREATE: 'Creación',
  UPDATE: 'Actualización',
  STATUS_CHANGE: 'Cambio de estado',
  INPUT_CREATED: 'Entrada creada',
  INPUT_UPDATED: 'Entrada actualizada',
  DECISION_CREATED: 'Decisión creada',
  DECISION_UPDATED: 'Decisión actualizada',
  EVIDENCE_ATTACHED: 'Evidencia adjuntada',
};

/**
 * Transiciones válidas por estado (espejo de
 * MANAGEMENT_REVIEW_DIRECTION_VALID_TRANSITIONS del backend). El backend es la
 * autoridad; el frontend solo OFRECE las transiciones permitidas.
 */
export const MANAGEMENT_REVIEW_DIRECTION_VALID_TRANSITIONS: Readonly<
  Record<ManagementReviewDirectionStatus, readonly ManagementReviewDirectionStatus[]>
> = {
  DRAFT: ['PLANNED', 'CANCELLED'],
  PLANNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

// ─── Modelos (espejo de las respuestas JSON del backend) ────────────────────

export interface ManagementReviewDirectionParticipantModel {
  _id: string;
  userId?: string;
  nameSnapshot: string;
  role?: string;
  attendance: ManagementReviewAttendance;
}

export interface ManagementReviewDirectionInputModel {
  _id: string;
  type: ManagementReviewInputType;
  title: string;
  description?: string;
  /** Referencia declarativa a otro dominio — el frontend NUNCA la resuelve. */
  sourceModule?: string;
  sourceEntityId?: string;
  referencePeriod?: string;
  status: ManagementReviewInputStatus;
  evidenceDocumentId?: string;
  evidenceUrl?: string;
  observations?: string;
}

export interface ManagementReviewDirectionAnalysisModel {
  summary?: string;
  strengths: string[];
  gaps: string[];
  priorities: string[];
  managementObservations?: string;
}

export interface ManagementReviewDirectionDecisionModel {
  _id: string;
  description: string;
  category: ManagementReviewDecisionCategory;
  status: ManagementReviewDecisionStatus;
  responsibleUserId?: string;
  responsibleNameSnapshot?: string;
  dueDate?: string;
  resourcesRequired?: string;
  evidenceUrl?: string;
  observations?: string;
}

/** Revisión por la dirección (collection `managementreviewdirections`). */
export interface ManagementReviewDirectionModel {
  _id: string;
  companyId: string;
  reviewCode?: string;
  title: string;
  reviewType: ManagementReviewType;
  plannedDate?: string;
  location?: string;
  scope?: string;
  objectives?: string;
  responsibleUserId?: string;
  responsibleNameSnapshot?: string;
  participants: ManagementReviewDirectionParticipantModel[];
  actualStartDate?: string;
  actualEndDate?: string;
  status: ManagementReviewDirectionStatus;
  inputs: ManagementReviewDirectionInputModel[];
  analysis: ManagementReviewDirectionAnalysisModel;
  decisions: ManagementReviewDirectionDecisionModel[];
  minutesDocumentId?: string;
  minutesEvidenceUrl?: string;
  reportTitle?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Historial append-only (server-side; solo lectura — nunca se edita). */
export interface ManagementReviewDirectionHistoryModel {
  _id: string;
  companyId: string;
  reviewId: string;
  userId?: string;
  userEmail: string;
  action: ManagementReviewDirectionHistoryAction;
  comment?: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  createdAt: string;
}

// ─── Payloads (espejo estricto de los DTOs — forbidNonWhitelisted) ──────────

/** NUNCA enviar: companyId, createdBy, history, status (va por endpoint dedicado). */
export interface CreateManagementReviewPayload {
  reviewCode?: string;
  title: string;
  reviewType?: ManagementReviewType;
  plannedDate?: string;
  location?: string;
  scope?: string;
  objectives?: string;
  responsibleUserId?: string;
  responsibleNameSnapshot?: string;
  participants?: Array<{
    userId?: string;
    nameSnapshot: string;
    role?: string;
    attendance?: ManagementReviewAttendance;
  }>;
}

/** UpdateManagementReviewDirectionDto (todo opcional; el estado va por /status). */
export interface UpdateManagementReviewPayload extends Partial<Omit<CreateManagementReviewPayload, 'title'>> {
  title?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  analysis?: Partial<{
    summary?: string;
    strengths?: string[];
    gaps?: string[];
    priorities?: string[];
    managementObservations?: string;
  }>;
  minutesDocumentId?: string;
  minutesEvidenceUrl?: string;
  reportTitle?: string;
}

export interface UpdateManagementReviewStatusPayload {
  status: ManagementReviewDirectionStatus;
  comment?: string;
}

export interface CreateManagementReviewInputPayload {
  type: ManagementReviewInputType;
  title: string;
  description?: string;
  sourceModule?: string;
  sourceEntityId?: string;
  referencePeriod?: string;
  status?: ManagementReviewInputStatus;
  evidenceDocumentId?: string;
  evidenceUrl?: string;
  observations?: string;
}

export interface UpdateManagementReviewInputPayload extends Partial<CreateManagementReviewInputPayload> {}

export interface CreateManagementReviewDecisionPayload {
  description: string;
  category: ManagementReviewDecisionCategory;
  status?: ManagementReviewDecisionStatus;
  responsibleUserId?: string;
  responsibleNameSnapshot?: string;
  dueDate?: string;
  resourcesRequired?: string;
  evidenceUrl?: string;
  observations?: string;
}

export interface UpdateManagementReviewDecisionPayload extends Partial<CreateManagementReviewDecisionPayload> {}

/** AttachMinutesEvidenceDto (referencia tenant-safe a DocumentMaster). */
export interface AttachManagementReviewMinutesPayload {
  documentId: string;
  comment?: string;
}

// ─── Compliance oficial 6.1.3 (metadata dimensions:v1 del provider) ─────────

export interface ManagementReviewDirectionDimensionDetail {
  /** 0–1; null = NO evaluable (redistribuida en backend; nunca convertir null en 0). */
  ratio: number | null;
  numerator: number | null;
  denominator: number | null;
  weight: number;
  [key: string]: unknown;
}

/** Counters oficiales emitidos por management-review-direction-scoring.ts. */
export interface ManagementReviewDirectionComplianceCounters {
  reviewsTotal: number;
  reviewsEvaluable: number;
  reviewsCompleted: number;
  reviewsDraft: number;
  reviewsPlanned: number;
  reviewsInProgress: number;
  reviewsCancelled: number;
  inputsTotal: number;
  inputsReviewed: number;
  inputsValidReviewed: number;
  inputTypesPresent: number;
  inputTypesReviewed: number;
  decisionsTotal: number;
  decisionsActionable: number;
  decisionsCompleted: number;
  decisionsPending: number;
  decisionsInProgress: number;
  decisionsCancelled: number;
  decisionsOverdue: number;
  participantsTotal: number;
  participantsPresent: number;
  reviewsWithEvidence: number;
  reviewsWithAnalysis: number;
  reviewsWithDecisions: number;
  reviewsWithHistory: number;
  lastReviewDate: string | null;
  lastReviewStatus: string | null;
  futureDateReviews: number;
}

/** Las 6 dimensiones oficiales de 6.1.3 (denominaciones exactas del backend). */
export interface ManagementReviewDirectionComplianceDimensions {
  planning: ManagementReviewDirectionDimensionDetail;
  inputs: ManagementReviewDirectionDimensionDetail;
  analysis: ManagementReviewDirectionDimensionDetail;
  decisions: ManagementReviewDirectionDimensionDetail;
  evidence: ManagementReviewDirectionDimensionDetail;
  closureHistory: ManagementReviewDirectionDimensionDetail;
}

/**
 * Metadata oficial `dimensions:v1` de 6.1.3 (provider
 * `management-review-direction`). Consumida con type guard; sin `any`.
 */
export interface ManagementReviewDirectionComplianceMetadataV1 {
  semantic?: 'EXACT';
  standardCode?: '6.1.3';
  phase?: 'check';
  formula: 'dimensions:v1';
  evaluatedPeriod?: string | null;
  noDataReason?: 'no-reviews' | 'no-evaluable-reviews' | null;
  weights?: Record<string, number>;
  dimensions: ManagementReviewDirectionComplianceDimensions;
  counters: ManagementReviewDirectionComplianceCounters;
  latestReview?: {
    id: string;
    reviewCode: string | null;
    title: string | null;
    status: string | null;
    actualEndDate: string | null;
  } | null;
  findings?: Array<{
    id: string;
    title: string;
    description: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;
}

/** Claves dimensionales oficiales (orden de presentación). */
export const MANAGEMENT_REVIEW_DIMENSION_KEYS = [
  'planning',
  'inputs',
  'analysis',
  'decisions',
  'evidence',
  'closureHistory',
] as const;

export type ManagementReviewDimensionKey = (typeof MANAGEMENT_REVIEW_DIMENSION_KEYS)[number];

export const MANAGEMENT_REVIEW_DIMENSION_LABELS: Record<ManagementReviewDimensionKey, string> = {
  planning: 'Planificación',
  inputs: 'Entradas de información',
  analysis: 'Análisis de la dirección',
  decisions: 'Decisiones y acciones',
  evidence: 'Evidencia y trazabilidad',
  closureHistory: 'Cierre e historial',
};

/** Pesos informativos de respaldo (fuente oficial: metadata.weights). */
export const MANAGEMENT_REVIEW_DIMENSION_WEIGHT_FALLBACK: Record<ManagementReviewDimensionKey, number> = {
  planning: 15,
  inputs: 20,
  analysis: 20,
  decisions: 20,
  evidence: 15,
  closureHistory: 10,
};

/**
 * Type guard — valida `formula === 'dimensions:v1'` y las propiedades
 * estructurales necesarias (6 dimensiones con `ratio`/`weight` y counters
 * objeto). NO valida números: los valores recibidos son oficiales del backend.
 */
export function isManagementReviewDirectionMetadata(
  value: unknown,
): value is ManagementReviewDirectionComplianceMetadataV1 {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;

  if (m.formula !== 'dimensions:v1') return false;
  if (!m.dimensions || typeof m.dimensions !== 'object') return false;
  if (!m.counters || typeof m.counters !== 'object') return false;

  const dims = m.dimensions as Record<string, unknown>;
  return MANAGEMENT_REVIEW_DIMENSION_KEYS.every((key) => {
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
export function managementReviewRatioToPercent(ratio: number | null | undefined): number | null {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return null;
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}

/**
 * Vencimiento DERIVADO para presentación (misma regla del backend —
 * isDecisionOverdue de management-review-direction.schema.ts). NUNCA se envía
 * un estado OVERDUE al backend.
 */
export function isManagementReviewDecisionOverdue(
  decision: Pick<ManagementReviewDirectionDecisionModel, 'status' | 'dueDate'>,
  now: Date = new Date(),
): boolean {
  if (!decision.dueDate) return false;
  if (decision.status === 'COMPLETED' || decision.status === 'CANCELLED') return false;
  const due = new Date(decision.dueDate).getTime();
  return !Number.isNaN(due) && due < now.getTime();
}
