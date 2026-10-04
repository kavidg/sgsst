/**
 * E3 (7.1.3) — Tipos del dominio INCIDENTS (Accidentalidad + Acciones por
 * accidentes).
 *
 * Espejo EXACTO de los contratos backend:
 * - schema:      backend/src/modules/incidents/schemas/incident.schema.ts
 * - lifecycle:   backend/src/modules/incidents/schemas/incident-lifecycle.schema.ts
 * - history:     backend/src/modules/incidents/schemas/incident-history.schema.ts
 * - DTOs:        backend/src/modules/incidents/dto/investigation-management.dto.ts
 * - metadata:    backend/src/modules/compliance-engine/providers/incident-actions-scoring.ts
 *
 * El frontend es SOLO LECTOR del cumplimiento:
 * - NO recalcula el score (fuente oficial: moduleCompliance.compliance del
 *   ComplianceEngine → provider oficial 'incident-actions', dimensions:v1).
 * - ratio 0–1 → % está permitido únicamente para presentación visual.
 * - OVERDUE es DERIVADO (dueDate < now && estado no terminal) — SOLO
 *   presentación; NUNCA se envía al backend.
 *
 * FRONTERAS:
 * - 3.2.1 (registro de accidentalidad) convive con 7.1.3 (cadena
 *   investigación → acciones → seguimiento → cierre) en el mismo dominio.
 * - DISEASE (3.2.2) queda fuera del scoring de 7.1.3.
 * - La efectividad aquí es la PERCEPCIÓN declarativa del seguimiento
 *   (perceivedEffectiveness) — NUNCA "eficacia verificada/formal" (7.1.1).
 */

// ─── Enums (espejo del schema/lifecycle backend) ────────────────────────────

/** Tipo de investigación: ACCIDENT (default legacy) / DISEASE (3.2.2). */
export type InvestigationType = 'ACCIDENT' | 'DISEASE';

/** Estados canónicos 7.1.3 (el string legacy `status` se preserva aparte). */
export type IncidentLifecycleStage =
  | 'OPEN'
  | 'INVESTIGATING'
  | 'ACTIONS_PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CLOSED'
  | 'CANCELLED';

export const INCIDENT_LIFECYCLE_STAGE_LABELS: Record<IncidentLifecycleStage, string> = {
  OPEN: 'Abierto',
  INVESTIGATING: 'En investigación',
  ACTIONS_PENDING: 'Acciones por definir',
  IN_PROGRESS: 'En ejecución',
  COMPLETED: 'Completado',
  CLOSED: 'Cerrado',
  CANCELLED: 'Cancelado',
};

export const INCIDENT_LIFECYCLE_STAGE_VARIANTS: Record<IncidentLifecycleStage, string> = {
  OPEN: 'badge--info',
  INVESTIGATING: 'badge--warning',
  ACTIONS_PENDING: 'badge--warning',
  IN_PROGRESS: 'badge--info',
  COMPLETED: 'badge--success',
  CLOSED: 'badge--success',
  CANCELLED: 'badge--danger',
};

/** Progresión de la investigación. */
export type InvestigationProgressStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'CAUSES_IDENTIFIED'
  | 'CONCLUDED';

export const INVESTIGATION_STATUS_LABELS: Record<InvestigationProgressStatus, string> = {
  NOT_STARTED: 'No iniciada',
  IN_PROGRESS: 'En curso',
  CAUSES_IDENTIFIED: 'Causas identificadas',
  CONCLUDED: 'Concluida',
};

/** Tipo de acción derivada de la investigación. */
export type InvestigationActionType = 'PREVENTIVE' | 'CORRECTIVE' | 'OTHER';

export const INVESTIGATION_ACTION_TYPE_LABELS: Record<InvestigationActionType, string> = {
  PREVENTIVE: 'Preventiva',
  CORRECTIVE: 'Correctiva',
  OTHER: 'Otra',
};

/** Estados de la acción (los 4 oficiales; OVERDUE es derivado, NUNCA estado). */
export type InvestigationActionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export const INVESTIGATION_ACTION_STATUS_LABELS: Record<InvestigationActionStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En ejecución',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

export const INVESTIGATION_ACTION_STATUS_VARIANTS: Record<InvestigationActionStatus, string> = {
  PENDING: 'badge--info',
  IN_PROGRESS: 'badge--warning',
  COMPLETED: 'badge--success',
  CANCELLED: 'badge--danger',
};

/** Transiciones válidas (espejo del service E1 — el backend es la autoridad). */
export const INVESTIGATION_ACTION_VALID_TRANSITIONS: Record<
  InvestigationActionStatus,
  readonly InvestigationActionStatus[]
> = {
  PENDING: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** Estado de implementación declarado en el seguimiento. */
export type InvestigationActionImplementationStatus =
  | 'NOT_STARTED'
  | 'ON_TRACK'
  | 'DELAYED'
  | 'IMPLEMENTED';

export const IMPLEMENTATION_STATUS_LABELS: Record<InvestigationActionImplementationStatus, string> = {
  NOT_STARTED: 'No iniciada',
  ON_TRACK: 'En curso (según plan)',
  DELAYED: 'Retrasada',
  IMPLEMENTED: 'Implementada',
};

export const IMPLEMENTATION_STATUS_VARIANTS: Record<InvestigationActionImplementationStatus, string> = {
  NOT_STARTED: 'badge--info',
  ON_TRACK: 'badge--success',
  DELAYED: 'badge--warning',
  IMPLEMENTED: 'badge--success',
};

/** PERCEPCIÓN de efectividad (declarativa — NO eficacia formal de 7.1.1). */
export type InvestigationPerceivedEffectiveness = 'EFECTIVA' | 'NO_EFECTIVA' | 'INDETERMINADA';

export const PERCEIVED_EFFECTIVENESS_LABELS: Record<InvestigationPerceivedEffectiveness, string> = {
  EFECTIVA: 'Efectiva (percibida)',
  NO_EFECTIVA: 'No efectiva (percibida)',
  INDETERMINADA: 'Sin concluir',
};

export const PERCEIVED_EFFECTIVENESS_VARIANTS: Record<InvestigationPerceivedEffectiveness, string> = {
  EFECTIVA: 'badge--success',
  NO_EFECTIVA: 'badge--danger',
  INDETERMINADA: 'badge--warning',
};

/** Eventos del historial append-only (server-side). */
export type IncidentHistoryAction =
  | 'CREATE'
  | 'UPDATE'
  | 'INVESTIGATION_STARTED'
  | 'INVESTIGATION_UPDATED'
  | 'ACTION_CREATED'
  | 'ACTION_UPDATED'
  | 'ACTION_STATUS_CHANGED'
  | 'EVIDENCE_ADDED'
  | 'FOLLOW_UP'
  | 'COMPLETED'
  | 'CLOSED'
  | 'CANCELLED';

export const INCIDENT_HISTORY_ACTION_LABELS: Record<IncidentHistoryAction, string> = {
  CREATE: 'Creación',
  UPDATE: 'Actualización',
  INVESTIGATION_STARTED: 'Investigación iniciada',
  INVESTIGATION_UPDATED: 'Investigación actualizada',
  ACTION_CREATED: 'Acción creada',
  ACTION_UPDATED: 'Acción actualizada',
  ACTION_STATUS_CHANGED: 'Cambio de estado de acción',
  EVIDENCE_ADDED: 'Evidencia registrada',
  FOLLOW_UP: 'Seguimiento registrado',
  COMPLETED: 'Caso completado',
  CLOSED: 'Caso cerrado',
  CANCELLED: 'Caso cancelado',
};

// ─── Modelos (espejo de las respuestas JSON del backend) ────────────────────

export interface IncidentEvidenceRefModel {
  documentId?: string;
  documentSnapshot?: string;
  evidenceUrl?: string;
  comment?: string;
}

export interface IncidentActionFollowUpModel {
  followUpDate?: string;
  observations?: string;
  implementationStatus?: InvestigationActionImplementationStatus;
  perceivedEffectiveness?: InvestigationPerceivedEffectiveness;
}

export interface InvestigationActionModel {
  actionId?: string;
  action: string;
  actionType?: InvestigationActionType;
  /** Responsable string legacy (compatibilidad; puede convivir con userId). */
  responsible: string;
  responsibleUserId?: string;
  responsibleSnapshot?: string;
  status: InvestigationActionStatus;
  plannedDate?: string;
  dueDate?: string;
  completedDate?: string;
  evidence?: IncidentEvidenceRefModel;
  followUp?: IncidentActionFollowUpModel;
}

export interface InvestigationTeamMemberModel {
  userId: string;
  participantSnapshot?: string;
  participationRole?: string;
}

/**
 * Caso accidental (Incident). Los campos de investigación/acciones 7.1.3 son
 * opcionales: los registros legacy (3.2.1) pueden no tenerlos.
 */
export interface IncidentModel {
  _id: string;
  companyId: string;
  employeeId: string;
  type: string;
  date: string;
  description: string;
  severity: string;
  /** Estado LEGACY (string libre: 'Abierto', 'Cerrado', …). NUNCA se migra desde frontend. */
  status: string;
  daysLost?: number;
  accidentType?: string;
  investigationType?: InvestigationType;
  investigationDate?: string;
  investigationResponsibleUserId?: string;
  investigationResponsibleSnapshot?: string;
  /** Legacy string. */
  responsible?: string;
  methodology?: string;
  investigationTeam?: InvestigationTeamMemberModel[];
  immediateCauses?: string[];
  basicCauses?: string[];
  /** Causas básicas legacy (misma semántica histórica). */
  rootCauses?: string[];
  relatedFactors?: string[];
  conclusions?: string;
  recommendations?: string;
  investigationStatus?: InvestigationProgressStatus;
  lifecycleStage?: IncidentLifecycleStage;
  closureDate?: string;
  closedByUserId?: string;
  closedBySnapshot?: string;
  /** Evidencia legacy (string[]). */
  evidence?: string[];
  /** Evidencia estructurada de investigación (E1). */
  investigationEvidence?: IncidentEvidenceRefModel[];
  correctiveActions?: InvestigationActionModel[];
  preventiveActions?: InvestigationActionModel[];
  createdAt?: string;
  updatedAt?: string;
}

// ─── Historial append-only (solo lectura; lo genera el backend) ─────────────

export interface IncidentHistoryModel {
  _id: string;
  companyId: string;
  incidentId: string;
  actionId?: string;
  incidentTypeSnapshot?: string;
  action: IncidentHistoryAction;
  actorUserId?: string;
  actorSnapshot: string;
  details?: { message?: string } & Record<string, unknown>;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: string;
}

// ─── Payloads (espejo estricto de los DTOs E1 — forbidNonWhitelisted) ───────

export interface InvestigationTeamMemberPayload {
  userId: string;
  participationRole?: string;
}

/** PATCH /incidents/:id/investigation */
export interface UpdateInvestigationPayload {
  investigationResponsibleUserId?: string;
  methodology?: string;
  investigationTeam?: InvestigationTeamMemberPayload[];
  immediateCauses?: string[];
  basicCauses?: string[];
  rootCauses?: string[];
  relatedFactors?: string[];
  conclusions?: string;
  recommendations?: string;
  investigationStatus?: InvestigationProgressStatus;
  investigationDate?: string;
  responsible?: string;
}

/** POST /incidents/:id/investigation/evidence */
export interface AddInvestigationEvidencePayload {
  documentId?: string;
  evidenceUrl?: string;
  comment?: string;
}

/** POST /incidents/:id/actions */
export interface CreateInvestigationActionPayload {
  action: string;
  actionType?: InvestigationActionType;
  responsibleUserId?: string;
  responsibleSnapshot?: string;
  plannedDate?: string;
  dueDate?: string;
  status?: InvestigationActionStatus;
}

/** PATCH /incidents/:id/actions/:actionId */
export interface UpdateInvestigationActionPayload {
  action?: string;
  actionType?: InvestigationActionType;
  responsibleUserId?: string;
  responsibleSnapshot?: string;
  plannedDate?: string;
  dueDate?: string;
}

/** PATCH /incidents/:id/actions/:actionId/status */
export interface UpdateInvestigationActionStatusPayload {
  status: InvestigationActionStatus;
  comment?: string;
}

/** POST /incidents/:id/actions/:actionId/evidence */
export interface AddActionEvidencePayload {
  documentId?: string;
  evidenceUrl?: string;
  comment?: string;
}

/** POST /incidents/:id/actions/:actionId/follow-up */
export interface RegisterActionFollowUpPayload {
  followUpDate?: string;
  observations?: string;
  implementationStatus?: InvestigationActionImplementationStatus;
  perceivedEffectiveness?: InvestigationPerceivedEffectiveness;
}

/** PATCH /incidents/:id/lifecycle */
export interface UpdateIncidentLifecyclePayload {
  stage: IncidentLifecycleStage;
  comment?: string;
}

// ─── Compliance oficial 7.1.3 (metadata dimensions:v1 del provider E2) ──────

export interface IncidentComplianceDimensionDetail {
  /** 0–1; null = NO evaluable (redistribuida en backend; nunca convertir null en 0). */
  ratio: number | null;
  numerator: number | null;
  denominator: number | null;
  weight: number;
  subchecks?: { satisfied: number; total: number };
  [key: string]: unknown;
}

export interface IncidentComplianceCounters {
  totalIncidents: number;
  evaluableIncidents: number;
  accidents: number;
  incidents: number;
  diseasesExcluded: number;
  investigatedCases: number;
  casesWithoutInvestigation: number;
  casesWithCausalAnalysis: number;
  casesWithoutCausalAnalysis: number;
  casesWithActions: number;
  casesWithoutActions: number;
  totalActions: number;
  completedActions: number;
  pendingActions: number;
  overdueActions: number;
  actionsWithEvidence: number;
  actionsWithoutEvidence: number;
  actionsWithFollowUp: number;
  casesClosed: number;
  casesNotClosed: number;
  lastIncidentDate: string | null;
}

/** Las 5 dimensiones oficiales de 7.1.3 (denominaciones exactas del backend). */
export interface IncidentComplianceDimensions {
  investigation: IncidentComplianceDimensionDetail;
  causalAnalysis: IncidentComplianceDimensionDetail;
  actions: IncidentComplianceDimensionDetail;
  execution: IncidentComplianceDimensionDetail;
  evidence: IncidentComplianceDimensionDetail;
}

export interface IncidentComplianceMetadataV1 {
  semantic?: 'EXACT';
  standardCode?: '7.1.3';
  standardTitle?: string;
  formula: 'dimensions:v1';
  target?: number;
  evaluatedPeriod?: string | null;
  noDataReason?: 'no-evaluable-cases' | null;
  weights?: Record<string, number>;
  dimensions: IncidentComplianceDimensions;
  counters: IncidentComplianceCounters;
  latestIncident?: {
    id: string;
    type: string | null;
    date: string | null;
    description: string | null;
    lifecycleStage: string | null;
    status: string | null;
  } | null;
}

export const INCIDENT_DIMENSION_KEYS = [
  'investigation',
  'causalAnalysis',
  'actions',
  'execution',
  'evidence',
] as const;

export type IncidentDimensionKey = (typeof INCIDENT_DIMENSION_KEYS)[number];

export const INCIDENT_DIMENSION_LABELS: Record<IncidentDimensionKey, string> = {
  investigation: 'Investigación',
  causalAnalysis: 'Análisis causal',
  actions: 'Acciones derivadas',
  execution: 'Ejecución y oportunidad',
  evidence: 'Evidencia y trazabilidad',
};

/** Pesos informativos de respaldo (fuente oficial: metadata.weights). */
export const INCIDENT_DIMENSION_WEIGHT_FALLBACK: Record<IncidentDimensionKey, number> = {
  investigation: 25,
  causalAnalysis: 20,
  actions: 20,
  execution: 20,
  evidence: 15,
};

/** Acción mínima por finding oficial (ids de incident-actions-scoring.ts). */
export const INCIDENT_FINDING_LABELS: Record<string, string> = {
  'incident-actions-no-data': 'Registrar casos e iniciar su investigación',
  'incident-actions-no-investigation': 'Iniciar la investigación formal de cada caso',
  'incident-actions-incomplete-investigation': 'Completar el perfil de investigación',
  'incident-actions-incomplete-causal-analysis': 'Documentar el análisis causal',
  'incident-actions-no-actions': 'Derivar acciones de las investigaciones',
  'incident-actions-actions-without-responsible': 'Asignar responsable a cada acción',
  'incident-actions-overdue': 'Ejecutar o cerrar las acciones vencidas',
  'incident-actions-actions-incomplete': 'Llevar las acciones hasta su cierre',
  'incident-actions-no-evidence': 'Registrar evidencia de investigación y acciones',
  'incident-actions-insufficient-follow-up': 'Registrar seguimiento de las acciones',
  'incident-actions-closure-not-documented': 'Documentar el cierre de los casos completos',
};

// ─── Helpers de presentación (SOLO presentación — sin scoring) ──────────────

/**
 * Type guard — valida `formula === 'dimensions:v1'` y la estructura mínima
 * (5 dimensiones con `ratio` y counters objeto). NO valida números: los
 * valores recibidos son oficiales del backend.
 */
export function isIncidentComplianceMetadataV1(value: unknown): value is IncidentComplianceMetadataV1 {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;

  if (m.formula !== 'dimensions:v1') return false;
  if (!m.dimensions || typeof m.dimensions !== 'object') return false;
  if (!m.counters || typeof m.counters !== 'object') return false;

  const dims = m.dimensions as Record<string, unknown>;
  return INCIDENT_DIMENSION_KEYS.every((key) => {
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
export function incidentRatioToPercent(ratio: number | null | undefined): number | null {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return null;
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}

/**
 * OVERDUE DERIVADO — SOLO presentación (misma regla del scorer E2):
 * dueDate < now && estado no terminal. NUNCA se envía al backend.
 */
export function isActionOverdue(
  action: { dueDate?: string; completedDate?: string; status: InvestigationActionStatus },
  now?: Date,
): boolean {
  if (action.status === 'COMPLETED' || action.status === 'CANCELLED') return false;
  if (action.completedDate) return false;
  if (!action.dueDate) return false;
  const due = new Date(action.dueDate).getTime();
  return !Number.isNaN(due) && due < (now ?? new Date()).getTime();
}
