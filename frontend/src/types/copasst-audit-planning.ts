/**
 * E3 (6.1.4) — Tipos del dominio COPASST-AUDIT-PLANNING
 * (Planificación de auditorías COPASST).
 *
 * Espejo EXACTO del contrato backend:
 * - schemas:  backend/src/modules/copasst-audit-planning/schemas/copasst-audit-planning.schema.ts
 * - history:  backend/src/modules/copasst-audit-planning/schemas/copasst-audit-planning-history.schema.ts
 * - DTOs:     backend/src/modules/copasst-audit-planning/dto/copasst-audit-planning.dto.ts
 * - metadata: backend/src/modules/compliance-engine/providers/copasst-audit-planning-scoring.ts
 *
 * El frontend es SOLO LECTOR del cumplimiento:
 * - NO recalcula el score (fuente oficial: moduleCompliance.compliance del
 *   ComplianceEngine → provider 'copasst-audit-planning').
 * - NO recalcula dimensiones ni pesos.
 * - ratio 0–1 → % está permitido únicamente para presentación visual.
 */

// ─── Enums (espejo de copasst-audit-planning.schema.ts) ─────────────────────

/** Ciclo de vida de la planificación (transiciones validadas en backend). */
export type CopasstAuditPlanningStatus =
  | 'DRAFT'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

/** Estado de una auditoría/verificación PLANIFICADA (item). */
export type AuditPlanningItemStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export const COPASST_PLANNING_STATUS_LABELS: Record<CopasstAuditPlanningStatus, string> = {
  DRAFT: 'Borrador',
  PLANNED: 'Planificada',
  IN_PROGRESS: 'En ejecución',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

export const PLANNING_ITEM_STATUS_LABELS: Record<AuditPlanningItemStatus, string> = {
  PLANNED: 'Planificada',
  IN_PROGRESS: 'En ejecución',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

/**
 * Transiciones válidas por estado (espejo de
 * COPASST_AUDIT_PLANNING_VALID_TRANSITIONS — el backend es la autoridad; el
 * frontend solo ofrece las opciones válidas).
 */
export const COPASST_PLANNING_VALID_TRANSITIONS: Record<
  CopasstAuditPlanningStatus,
  readonly CopasstAuditPlanningStatus[]
> = {
  DRAFT: ['PLANNED', 'CANCELLED'],
  PLANNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** Espejo de PLANNED_AUDIT_ITEM_VALID_TRANSITIONS. */
export const PLANNING_ITEM_VALID_TRANSITIONS: Record<
  AuditPlanningItemStatus,
  readonly AuditPlanningItemStatus[]
> = {
  PLANNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const COPASST_PLANNING_TRANSITION_LABELS: Partial<Record<CopasstAuditPlanningStatus, string>> = {
  PLANNED: 'Planificar',
  IN_PROGRESS: 'Iniciar ejecución',
  COMPLETED: 'Completar',
  CANCELLED: 'Cancelar',
};

// ─── Participación COPASST (embebida) ───────────────────────────────────────

export interface CopasstParticipationParticipantModel {
  userId?: string;
  nameSnapshot: string;
  role?: string;
}

export interface CopasstParticipationModel {
  required: boolean;
  participated: boolean;
  participationDate?: string;
  participants: CopasstParticipationParticipantModel[];
  observations?: string;
}

// ─── Items planificados (embebidos) ─────────────────────────────────────────

export interface CopasstPlannedAuditItemModel {
  _id: string;
  title: string;
  plannedDate?: string;
  auditorUserId?: string;
  auditorUserSnapshot?: string;
  responsibleUserId?: string;
  responsibleUserSnapshot?: string;
  objective: string;
  scope?: string;
  criteria?: string;
  methodology?: string;
  copasstParticipation: CopasstParticipationModel;
  status: AuditPlanningItemStatus;
  /** Referencia DECLARATIVA a AnnualAudit (6.1.2) — trazabilidad, no dependencia. */
  annualAuditId?: string;
}

// ─── Planificación (CopasstAuditPlanning — collection `copasstauditplannings`) ──

export interface CopasstAuditPlanningModel {
  _id: string;
  companyId: string;
  planningCode?: string;
  title: string;
  startDate: string;
  endDate: string;
  scope?: string;
  objectives?: string;
  criteria?: string;
  methodology?: string;
  responsibleUserId?: string;
  responsibleUserSnapshot?: string;
  copasstPeriodId?: string;
  copasstPeriodSnapshot?: string;
  status: CopasstAuditPlanningStatus;
  items: CopasstPlannedAuditItemModel[];
  createdBy?: string;
  createdBySnapshot?: string;
  updatedBy?: string;
  updatedBySnapshot?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Historial append-only (solo lectura; lo genera el backend) ─────────────

export type CopasstAuditPlanningHistoryAction =
  | 'CREATE'
  | 'UPDATE'
  | 'STATUS_CHANGE'
  | 'ITEM_CREATED'
  | 'ITEM_UPDATED'
  | 'ITEM_STATUS_CHANGE';

export const COPASST_PLANNING_HISTORY_ACTION_LABELS: Record<CopasstAuditPlanningHistoryAction, string> = {
  CREATE: 'Creación',
  UPDATE: 'Actualización',
  STATUS_CHANGE: 'Cambio de estado',
  ITEM_CREATED: 'Auditoría planificada creada',
  ITEM_UPDATED: 'Auditoría planificada actualizada',
  ITEM_STATUS_CHANGE: 'Cambio de estado de auditoría planificada',
};

export interface CopasstAuditPlanningHistoryModel {
  _id: string;
  companyId: string;
  planningId: string;
  userId?: string;
  userEmail: string;
  action: CopasstAuditPlanningHistoryAction;
  /** Item afectado (eventos ITEM_*); ausente en eventos de la planificación. */
  itemId?: string;
  comment?: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  createdAt: string;
}

// ─── Payloads (espejo estricto de los DTOs — forbidNonWhitelisted) ──────────

/**
 * CreateCopasstAuditPlanningDto. NUNCA enviar companyId/createdBy/history/
 * status: el tenant, la autoría y el estado se resuelven server-side.
 */
export interface CreateCopasstAuditPlanningPayload {
  planningCode?: string;
  title: string;
  /** Fecha ISO-8601 (input date emite YYYY-MM-DD, aceptado por IsDateString). */
  startDate: string;
  endDate: string;
  scope?: string;
  objectives?: string;
  criteria?: string;
  methodology?: string;
  responsibleUserId?: string;
  responsibleUserSnapshot?: string;
  copasstPeriodId?: string;
  items?: CreatePlannedAuditPayload[];
}

/** UpdateCopasstAuditPlanningDto (todo opcional; el estado va por /status). */
export interface UpdateCopasstAuditPlanningPayload
  extends Partial<Omit<CreateCopasstAuditPlanningPayload, 'items'>> {}

/** UpdateCopasstAuditPlanningStatusDto. */
export interface UpdateCopasstAuditPlanningStatusPayload {
  status: CopasstAuditPlanningStatus;
  comment?: string;
}

/** CreatePlannedAuditDto. */
export interface CreatePlannedAuditPayload {
  title: string;
  plannedDate?: string;
  auditorUserId?: string;
  auditorUserSnapshot?: string;
  responsibleUserId?: string;
  responsibleUserSnapshot?: string;
  objective: string;
  scope?: string;
  criteria?: string;
  methodology?: string;
  copasstParticipation?: CopasstParticipationPayload;
  /** Referencia declarativa opcional a AnnualAudit (6.1.2) — NUNCA obligatoria. */
  annualAuditId?: string;
}

/** UpdatePlannedAuditDto. */
export interface UpdatePlannedAuditPayload extends Partial<CreatePlannedAuditPayload> {}

/** UpdatePlannedAuditStatusDto. */
export interface UpdatePlannedAuditStatusPayload {
  status: AuditPlanningItemStatus;
  comment?: string;
}

/** CopasstParticipationDto (participación embebida del item). */
export interface CopasstParticipationPayload {
  required?: boolean;
  participated?: boolean;
  participationDate?: string;
  participants?: CopasstParticipationParticipantModel[];
  observations?: string;
}

// ─── Compliance oficial 6.1.4 (metadata dimensions:v1 del provider E2) ──────

/** Dimensión oficial tal como la emite copasst-audit-planning-scoring.ts. */
export interface CopasstAuditPlanningComplianceDimensionDetail {
  /** 0–1; null = NO evaluable (redistribuida en backend; nunca convertir null en 0). */
  ratio: number | null;
  numerator: number | null;
  denominator: number | null;
  weight: number;
  subchecks?: { satisfied: number; total: number };
  [key: string]: unknown;
}

/** Counters oficiales emitidos por copasst-audit-planning-scoring.ts. */
export interface CopasstAuditPlanningComplianceCounters {
  planningsTotal: number;
  planningsEvaluable: number;
  planningsDraft: number;
  planningsPlanned: number;
  planningsInProgress: number;
  planningsCompleted: number;
  planningsCancelled: number;
  itemsTotal: number;
  itemsCompleted: number;
  itemsWithDate: number;
  itemsWithoutDate: number;
  itemsWithAuditor: number;
  itemsWithResponsible: number;
  itemsWithParticipation: number;
  planningsWithCopasstPeriodRef: number;
  overdueItems: number;
  lastPlanningDate: string | null;
}

/** Las 5 dimensiones oficiales de 6.1.4 (denominaciones exactas del backend). */
export interface CopasstAuditPlanningComplianceDimensions {
  completeness: CopasstAuditPlanningComplianceDimensionDetail;
  schedule: CopasstAuditPlanningComplianceDimensionDetail;
  copasstParticipation: CopasstAuditPlanningComplianceDimensionDetail;
  traceability: CopasstAuditPlanningComplianceDimensionDetail;
  recommendations: CopasstAuditPlanningComplianceDimensionDetail;
}

/** Metadata oficial `dimensions:v1` de 6.1.4 (provider 'copasst-audit-planning'). */
export interface CopasstAuditPlanningComplianceMetadataV1 {
  semantic?: 'EXACT';
  standardCode?: '6.1.4';
  phase?: 'check';
  formula: 'dimensions:v1';
  evaluatedPeriod?: string | null;
  noDataReason?: 'no-plannings' | 'no-evaluable-plannings' | null;
  weights?: Record<string, number>;
  dimensions: CopasstAuditPlanningComplianceDimensions;
  counters: CopasstAuditPlanningComplianceCounters;
  latestPlanning?: {
    id: string;
    planningCode: string | null;
    title: string | null;
    status: string | null;
    startDate: string | null;
    endDate: string | null;
  } | null;
}

/** Claves dimensionales oficiales (orden de presentación). */
export const COPASST_PLANNING_DIMENSION_KEYS = [
  'completeness',
  'schedule',
  'copasstParticipation',
  'traceability',
  'recommendations',
] as const;

export type CopasstPlanningDimensionKey = (typeof COPASST_PLANNING_DIMENSION_KEYS)[number];

export const COPASST_PLANNING_DIMENSION_LABELS: Record<CopasstPlanningDimensionKey, string> = {
  completeness: 'Completitud de la planificación',
  schedule: 'Programación y cobertura',
  copasstParticipation: 'Participación del COPASST',
  traceability: 'Trazabilidad documental y de resultados',
  recommendations: 'Seguimiento de recomendaciones derivadas',
};

/** Pesos informativos de respaldo (fuente oficial: metadata.weights). */
export const COPASST_PLANNING_DIMENSION_WEIGHT_FALLBACK: Record<CopasstPlanningDimensionKey, number> = {
  completeness: 25,
  schedule: 20,
  copasstParticipation: 25,
  traceability: 15,
  recommendations: 15,
};

/**
 * Type guard — valida `formula === 'dimensions:v1'` y las propiedades
 * estructurales necesarias (5 dimensiones con `ratio` y counters objeto).
 * NO valida números: los valores recibidos son oficiales del backend.
 */
export function isCopasstAuditPlanningComplianceMetadataV1(
  value: unknown,
): value is CopasstAuditPlanningComplianceMetadataV1 {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;

  if (m.formula !== 'dimensions:v1') return false;
  if (!m.dimensions || typeof m.dimensions !== 'object') return false;
  if (!m.counters || typeof m.counters !== 'object') return false;

  const dims = m.dimensions as Record<string, unknown>;
  return COPASST_PLANNING_DIMENSION_KEYS.every((key) => {
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
export function copasstPlanningRatioToPercent(ratio: number | null | undefined): number | null {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return null;
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}
