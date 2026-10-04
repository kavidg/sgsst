/**
 * E3 (6.1.2) — Tipos del dominio ANNUAL-AUDIT (Auditoría anual SG-SST).
 *
 * Espejo EXACTO del contrato backend:
 * - schemas:  backend/src/modules/annual-audit/schemas/annual-audit.schema.ts
 * - history:  backend/src/modules/annual-audit/schemas/annual-audit-history.schema.ts
 * - DTOs:     backend/src/modules/annual-audit/dto/annual-audit.dto.ts
 * - metadata: backend/src/modules/compliance-engine/providers/annual-audit-scoring.ts
 *
 * El frontend es SOLO LECTOR del cumplimiento:
 * - NO recalcula el score (fuente oficial: moduleCompliance.compliance).
 * - NO recalcula dimensiones ni pesos.
 * - ratio 0–1 → % está permitido únicamente para presentación visual.
 */

// ─── Enums (espejo de annual-audit.schema.ts) ──────────────────────────────

export type AnnualAuditStatus =
  | 'DRAFT'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type AuditFindingType =
  | 'NON_CONFORMITY'
  | 'OBSERVATION'
  | 'OPPORTUNITY_FOR_IMPROVEMENT';

export type AuditFindingSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export type AuditFindingStatus = 'OPEN' | 'IN_PROGRESS' | 'CLOSED';

export type AuditActionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export type AnnualAuditType = 'INTERNAL' | 'EXTERNAL';

export const ANNUAL_AUDIT_STATUS_LABELS: Record<AnnualAuditStatus, string> = {
  DRAFT: 'Borrador',
  PLANNED: 'Planificada',
  IN_PROGRESS: 'En ejecución',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

export const AUDIT_FINDING_TYPE_LABELS: Record<AuditFindingType, string> = {
  NON_CONFORMITY: 'No conformidad',
  OBSERVATION: 'Observación',
  OPPORTUNITY_FOR_IMPROVEMENT: 'Oportunidad de mejora',
};

export const AUDIT_FINDING_SEVERITY_LABELS: Record<AuditFindingSeverity, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
};

export const AUDIT_FINDING_STATUS_LABELS: Record<AuditFindingStatus, string> = {
  OPEN: 'Abierto',
  IN_PROGRESS: 'En progreso',
  CLOSED: 'Cerrado',
};

export const AUDIT_ACTION_STATUS_LABELS: Record<AuditActionStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En progreso',
  COMPLETED: 'Completada',
};

// ─── Modelos (espejo de las respuestas JSON del backend) ────────────────────

/** Acción de seguimiento embebida en el hallazgo (AuditFollowUpAction). */
export interface AnnualAuditActionModel {
  _id: string;
  description: string;
  responsible: string;
  responsibleUserId?: string;
  dueDate?: string;
  status: AuditActionStatus;
  completedDate?: string;
  evidenceUrl?: string;
  observations?: string;
}

/** Hallazgo embebido en la auditoría (AuditFinding). */
export interface AnnualAuditFindingModel {
  _id: string;
  type: AuditFindingType;
  description: string;
  criterion?: string;
  evidence?: string;
  severity?: AuditFindingSeverity;
  responsibleUserId?: string;
  responsibleNameSnapshot?: string;
  dueDate?: string;
  status: AuditFindingStatus;
  observations?: string;
  actions: AnnualAuditActionModel[];
}

/** Auditoría anual (AnnualAudit — collection `annualaudits`). */
export interface AnnualAuditModel {
  _id: string;
  companyId: string;
  auditCode?: string;
  title: string;
  auditType?: AnnualAuditType;
  plannedStartDate?: string;
  plannedEndDate?: string;
  scope?: string;
  objectives?: string;
  criteria?: string;
  methodology?: string;
  auditorUserId?: string;
  auditorNameSnapshot?: string;
  auditorCompetence?: string;
  auditorCompetenceEvidenceId?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  status: AnnualAuditStatus;
  reportTitle?: string;
  reportDate?: string;
  reportSummary?: string;
  reportDocumentId?: string;
  reportEvidenceUrl?: string;
  findingsSummary?: string;
  findings: AnnualAuditFindingModel[];
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Historial append-only (AnnualAuditHistory — collection
 * `annualaudithistories`). Solo lectura; lo genera el backend.
 */
export type AnnualAuditHistoryAction =
  | 'CREATE'
  | 'UPDATE'
  | 'STATUS_CHANGE'
  | 'FINDING_CREATED'
  | 'FINDING_UPDATED'
  | 'ACTION_CREATED'
  | 'ACTION_UPDATED'
  | 'EVIDENCE_ATTACHED';

export const ANNUAL_AUDIT_HISTORY_ACTION_LABELS: Record<AnnualAuditHistoryAction, string> = {
  CREATE: 'Creación',
  UPDATE: 'Actualización',
  STATUS_CHANGE: 'Cambio de estado',
  FINDING_CREATED: 'Hallazgo creado',
  FINDING_UPDATED: 'Hallazgo actualizado',
  ACTION_CREATED: 'Acción creada',
  ACTION_UPDATED: 'Acción actualizada',
  EVIDENCE_ATTACHED: 'Evidencia adjuntada',
};

export interface AnnualAuditHistoryModel {
  _id: string;
  companyId: string;
  auditId: string;
  userId?: string;
  userEmail: string;
  action: AnnualAuditHistoryAction;
  comment?: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  createdAt: string;
}

// ─── Payloads (espejo estricto de los DTOs — forbidNonWhitelisted) ──────────

/** CreateAnnualAuditDto. NUNCA enviar companyId/createdBy/history. */
export interface CreateAnnualAuditPayload {
  auditCode?: string;
  title: string;
  auditType?: AnnualAuditType;
  plannedStartDate?: string;
  plannedEndDate?: string;
  scope?: string;
  objectives?: string;
  criteria?: string;
  methodology?: string;
  auditorUserId?: string;
  auditorNameSnapshot?: string;
  auditorCompetence?: string;
  auditorCompetenceEvidenceId?: string;
}

/** UpdateAnnualAuditDto (todo opcional; el estado va por endpoint dedicado). */
export interface UpdateAnnualAuditPayload extends Partial<CreateAnnualAuditPayload> {
  actualStartDate?: string;
  actualEndDate?: string;
  reportTitle?: string;
  reportDate?: string;
  reportSummary?: string;
  reportDocumentId?: string;
  reportEvidenceUrl?: string;
  findingsSummary?: string;
}

/** UpdateAnnualAuditStatusDto. */
export interface UpdateAnnualAuditStatusPayload {
  status: AnnualAuditStatus;
  comment?: string;
}

/** CreateAuditFindingDto. */
export interface CreateAuditFindingPayload {
  type: AuditFindingType;
  description: string;
  criterion?: string;
  evidence?: string;
  severity?: AuditFindingSeverity;
  responsibleUserId?: string;
  responsibleNameSnapshot?: string;
  dueDate?: string;
  status?: AuditFindingStatus;
  observations?: string;
}

/** UpdateAuditFindingDto. */
export interface UpdateAuditFindingPayload extends Partial<CreateAuditFindingPayload> {}

/** CreateAuditActionDto. */
export interface CreateAuditActionPayload {
  description: string;
  responsible: string;
  responsibleUserId?: string;
  dueDate?: string;
  status?: AuditActionStatus;
  completedDate?: string;
  evidenceUrl?: string;
  observations?: string;
}

/** UpdateAuditActionDto. */
export interface UpdateAuditActionPayload extends Partial<CreateAuditActionPayload> {}

/** AttachAuditEvidenceDto (referencia tenant-safe a DocumentMaster). */
export interface AttachAuditEvidencePayload {
  documentId: string;
  comment?: string;
}

// ─── Compliance oficial 6.1.2 (metadata dimensions:v1 del provider) ─────────

/** Dimensión oficial tal como la emite annual-audit-scoring.ts. */
export interface AnnualAuditComplianceDimensionDetail {
  /** 0–1; null = NO evaluable (redistribuida en backend; nunca convertir null en 0). */
  ratio: number | null;
  numerator: number | null;
  denominator: number | null;
  weight: number;
  [key: string]: unknown;
}

/** Counters oficiales (22) emitidos por annual-audit-scoring.ts. */
export interface AnnualAuditComplianceCounters {
  totalAudits: number;
  evaluableAudits: number;
  completedAudits: number;
  cancelledAudits: number;
  draftAudits: number;
  plannedAudits: number;
  inProgressAudits: number;
  auditsWithReport: number;
  auditsWithEvidence: number;
  auditsWithCompetenceEvidence: number;
  auditsWithFindings: number;
  totalFindings: number;
  completeFindings: number;
  incompleteFindings: number;
  totalActions: number;
  completedActions: number;
  openActions: number;
  overdueActions: number;
  actionsWithEvidence: number;
  futureDateAudits: number;
  auditsWithIntegrityIssues: number;
  duplicateAuditCodes: number;
}

/** Las 6 dimensiones oficiales de 6.1.2 (denominaciones exactas del backend). */
export interface AnnualAuditComplianceDimensions {
  program: AnnualAuditComplianceDimensionDetail;
  executionReport: AnnualAuditComplianceDimensionDetail;
  findingsDocumentation: AnnualAuditComplianceDimensionDetail;
  followUpClosure: AnnualAuditComplianceDimensionDetail;
  evidenceAnalysis: AnnualAuditComplianceDimensionDetail;
  periodicityHistory: AnnualAuditComplianceDimensionDetail;
}

/**
 * Metadata oficial `dimensions:v1` de 6.1.2.
 * `semantic`, `standardCode` y `phase` se declaran según el contrato del
 * provider; el type guard exige `formula` y la estructura dimensional,
 * sin asumir campos que puedan faltar en versiones futuras.
 */
export interface AnnualAuditComplianceMetadataV1 {
  semantic?: 'EXACT';
  standardCode?: '6.1.2';
  phase?: 'check';
  formula: 'dimensions:v1';
  evaluatedPeriod?: string | null;
  noDataReason?: 'no-audits' | 'no-evaluable-audits' | null;
  weights?: Record<string, number>;
  dimensions: AnnualAuditComplianceDimensions;
  counters: AnnualAuditComplianceCounters;
}

/** Claves dimensionales oficiales (orden de presentación). */
export const ANNUAL_AUDIT_DIMENSION_KEYS = [
  'program',
  'executionReport',
  'findingsDocumentation',
  'followUpClosure',
  'evidenceAnalysis',
  'periodicityHistory',
] as const;

export type AnnualAuditDimensionKey = (typeof ANNUAL_AUDIT_DIMENSION_KEYS)[number];

export const ANNUAL_AUDIT_DIMENSION_LABELS: Record<AnnualAuditDimensionKey, string> = {
  program: 'Programa',
  executionReport: 'Ejecución e informe',
  findingsDocumentation: 'Documentación de hallazgos',
  followUpClosure: 'Seguimiento y cierre',
  evidenceAnalysis: 'Evidencia y análisis',
  periodicityHistory: 'Periodicidad e historial',
};

/** Pesos informativos de respaldo (fuente oficial: metadata.weights). */
export const ANNUAL_AUDIT_DIMENSION_WEIGHT_FALLBACK: Record<AnnualAuditDimensionKey, number> = {
  program: 15,
  executionReport: 25,
  findingsDocumentation: 20,
  followUpClosure: 20,
  evidenceAnalysis: 10,
  periodicityHistory: 10,
};

/**
 * Type guard — valida `formula === 'dimensions:v1'` y las propiedades
 * estructurales necesarias (6 dimensiones con `ratio` y counters objeto).
 * NO valida números: los valores recibidos son oficiales del backend.
 */
export function isAnnualAuditComplianceMetadataV1(
  value: unknown,
): value is AnnualAuditComplianceMetadataV1 {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;

  if (m.formula !== 'dimensions:v1') return false;
  if (!m.dimensions || typeof m.dimensions !== 'object') return false;
  if (!m.counters || typeof m.counters !== 'object') return false;

  const dims = m.dimensions as Record<string, unknown>;
  return ANNUAL_AUDIT_DIMENSION_KEYS.every((key) => {
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
export function annualAuditRatioToPercent(ratio: number | null | undefined): number | null {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return null;
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}
