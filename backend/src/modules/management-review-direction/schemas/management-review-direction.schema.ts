import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ManagementReviewDirectionDocument = HydratedDocument<ManagementReviewDirection>;

// ─── Enums ──────────────────────────────────────────────────────────────────

/** Ciclo de vida de la revisión por la dirección (transiciones validadas en service). */
export enum ManagementReviewDirectionStatus {
  DRAFT = 'DRAFT',
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * Transiciones válidas (ver ManagementReviewDirectionService.assertValidTransition):
 *   DRAFT → PLANNED | CANCELLED
 *   PLANNED → IN_PROGRESS | CANCELLED
 *   IN_PROGRESS → COMPLETED
 * No se permite reabrir COMPLETED ni "revivir" CANCELLED.
 */
export const MANAGEMENT_REVIEW_DIRECTION_VALID_TRANSITIONS: Readonly<
  Record<ManagementReviewDirectionStatus, readonly ManagementReviewDirectionStatus[]>
> = {
  [ManagementReviewDirectionStatus.DRAFT]: [
    ManagementReviewDirectionStatus.PLANNED,
    ManagementReviewDirectionStatus.CANCELLED,
  ],
  [ManagementReviewDirectionStatus.PLANNED]: [
    ManagementReviewDirectionStatus.IN_PROGRESS,
    ManagementReviewDirectionStatus.CANCELLED,
  ],
  [ManagementReviewDirectionStatus.IN_PROGRESS]: [ManagementReviewDirectionStatus.COMPLETED],
  [ManagementReviewDirectionStatus.COMPLETED]: [],
  [ManagementReviewDirectionStatus.CANCELLED]: [],
};

/** Tipo de revisión: solo lo demostradamente necesario. */
export enum ManagementReviewType {
  ORDINARY = 'ORDINARY',
  EXTRAORDINARY = 'EXTRAORDINARY',
}

/**
 * Tipos de ENTRADA de información que la dirección revisa. Las referencias a
 * otras entidades (sourceModule/sourceEntityId) son entradas/evidencias
 * declarativas: el dominio NUNCA ejecuta queries para recalcular sus
 * resultados (eso corresponde a cada dominio fuente).
 */
export enum ManagementReviewInputType {
  AUDIT_RESULTS = 'AUDIT_RESULTS',
  INDICATOR_RESULTS = 'INDICATOR_RESULTS',
  PHVA_COMPLIANCE = 'PHVA_COMPLIANCE',
  OBJECTIVES = 'OBJECTIVES',
  IMPROVEMENT_ACTIONS = 'IMPROVEMENT_ACTIONS',
  RELEVANT_CHANGES = 'RELEVANT_CHANGES',
  RESOURCE_NEEDS = 'RESOURCE_NEEDS',
  OTHER = 'OTHER',
}

/** Estado de una entrada de información. */
export enum ManagementReviewInputStatus {
  PENDING = 'PENDING',
  REVIEWED = 'REVIEWED',
}

/** Categoría de una decisión de dirección. */
export enum ManagementReviewDecisionCategory {
  IMPROVEMENT = 'IMPROVEMENT',
  RESOURCE = 'RESOURCE',
  OBJECTIVE = 'OBJECTIVE',
  COMPLIANCE = 'COMPLIANCE',
  RISK = 'RISK',
  OTHER = 'OTHER',
}

/**
 * Estado de una decisión de dirección. NO existe OVERDUE persistente: el
 * vencimiento se DERIVA dinámicamente (status no terminal && dueDate < today).
 */
export enum ManagementReviewDecisionStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/** Asistencia de un participante de la revisión. */
export enum ManagementReviewAttendance {
  ATTENDED = 'ATTENDED',
  ABSENT = 'ABSENT',
}

// ─── Participantes (embebidos) ──────────────────────────────────────────────

@Schema({ _id: true })
export class ManagementReviewParticipant {
  _id!: Types.ObjectId;

  /** Usuario del tenant (validado tenant-safe en el service). */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  /** Snapshot del nombre (sobrevive cambios del usuario). */
  @Prop({ required: true, trim: true })
  nameSnapshot!: string;

  /** Rol en la revisión (p. ej. 'Gerente', 'Líder SG-SST', 'COPASST'). */
  @Prop({ trim: true })
  role?: string;

  @Prop({
    required: true,
    enum: Object.values(ManagementReviewAttendance),
    default: ManagementReviewAttendance.ATTENDED,
  })
  attendance!: ManagementReviewAttendance;
}

const ManagementReviewParticipantSchema = SchemaFactory.createForClass(ManagementReviewParticipant);

// ─── Entradas de la revisión (embebidas) ────────────────────────────────────

@Schema({ _id: true })
export class ManagementReviewInput {
  _id!: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(ManagementReviewInputType) })
  type!: ManagementReviewInputType;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true })
  description?: string;

  /** Módulo fuente declarativo (p. ej. 'annual-audit', 'indicators'). */
  @Prop({ trim: true })
  sourceModule?: string;

  /** Id de la entidad fuente — referencia declarativa; NO dispara queries. */
  @Prop({ trim: true })
  sourceEntityId?: string;

  /** Período al que aplica la entrada (p. ej. '2026-T1'). */
  @Prop({ trim: true })
  referencePeriod?: string;

  @Prop({
    required: true,
    enum: Object.values(ManagementReviewInputStatus),
    default: ManagementReviewInputStatus.PENDING,
  })
  status!: ManagementReviewInputStatus;

  /** Referencia tenant-safe a DocumentMaster (validada en service). */
  @Prop({ type: Types.ObjectId, ref: 'DocumentMaster' })
  evidenceDocumentId?: Types.ObjectId;

  @Prop({ trim: true })
  evidenceUrl?: string;

  @Prop({ trim: true })
  observations?: string;
}

const ManagementReviewInputSchema = SchemaFactory.createForClass(ManagementReviewInput);

// ─── Análisis / resultados (embebido) ───────────────────────────────────────

@Schema({ _id: false })
export class ManagementReviewAnalysis {
  @Prop({ trim: true })
  summary?: string;

  /** Conclusiones de la dirección; NO hallazgos automáticos. */
  @Prop({ type: [String], default: [] })
  strengths!: string[];

  @Prop({ type: [String], default: [] })
  gaps!: string[];

  @Prop({ type: [String], default: [] })
  priorities!: string[];

  @Prop({ trim: true })
  managementObservations?: string;
}

const ManagementReviewAnalysisSchema = SchemaFactory.createForClass(ManagementReviewAnalysis);

// ─── Decisiones de dirección (embebidas) ────────────────────────────────────

@Schema({ _id: true })
export class ManagementReviewDecision {
  _id!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  description!: string;

  @Prop({ required: true, enum: Object.values(ManagementReviewDecisionCategory) })
  category!: ManagementReviewDecisionCategory;

  @Prop({
    required: true,
    enum: Object.values(ManagementReviewDecisionStatus),
    default: ManagementReviewDecisionStatus.PENDING,
  })
  status!: ManagementReviewDecisionStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  responsibleUserId?: Types.ObjectId;

  @Prop({ trim: true })
  responsibleNameSnapshot?: string;

  @Prop()
  dueDate?: Date;

  /** Texto simple: la dirección identificó una necesidad de recursos. */
  @Prop({ trim: true })
  resourcesRequired?: string;

  @Prop({ trim: true })
  evidenceUrl?: string;

  @Prop({ trim: true })
  observations?: string;
}

const ManagementReviewDecisionSchema = SchemaFactory.createForClass(ManagementReviewDecision);

// ─── Revisión por la dirección (6.1.3) ─────────────────────────────────────

@Schema({ timestamps: true, collection: 'managementreviewdirections' })
export class ManagementReviewDirection {
  _id!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  // ── Identificación ──
  /** Código asignado por la empresa (único POR tenant; opcional). */
  @Prop({ trim: true })
  reviewCode?: string;

  @Prop({ required: true, trim: true })
  title!: string;

  // ── Planeación ──
  @Prop({ enum: Object.values(ManagementReviewType), default: ManagementReviewType.ORDINARY })
  reviewType!: ManagementReviewType;

  @Prop()
  plannedDate?: Date;

  @Prop({ trim: true })
  location?: string;

  @Prop({ trim: true })
  scope?: string;

  @Prop({ trim: true })
  objectives?: string;

  // ── Dirección / responsable ──
  /** Usuario del tenant (validado tenant-safe en el service). */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  responsibleUserId?: Types.ObjectId;

  /** Snapshot del nombre del responsable. */
  @Prop({ trim: true })
  responsibleNameSnapshot?: string;

  // ── Participantes ──
  @Prop({ type: [ManagementReviewParticipantSchema], default: [] })
  participants!: ManagementReviewParticipant[];

  // ── Ejecución ──
  @Prop()
  actualStartDate?: Date;

  @Prop()
  actualEndDate?: Date;

  @Prop({
    required: true,
    enum: Object.values(ManagementReviewDirectionStatus),
    default: ManagementReviewDirectionStatus.DRAFT,
  })
  status!: ManagementReviewDirectionStatus;

  // ── Entradas de la revisión ──
  @Prop({ type: [ManagementReviewInputSchema], default: [] })
  inputs!: ManagementReviewInput[];

  // ── Resultados (análisis de la dirección) ──
  @Prop({ type: ManagementReviewAnalysisSchema, default: () => ({}) })
  analysis!: ManagementReviewAnalysis;

  // ── Decisiones de dirección ──
  @Prop({ type: [ManagementReviewDecisionSchema], default: [] })
  decisions!: ManagementReviewDecision[];

  // ── Evidencia del acta ──
  /** Referencia tenant-safe a DocumentMaster (acta de la revisión). */
  @Prop({ type: Types.ObjectId, ref: 'DocumentMaster' })
  minutesDocumentId?: Types.ObjectId;

  @Prop({ trim: true })
  minutesEvidenceUrl?: string;

  /** Título del acta/informe, si el patrón de la empresa lo requiere. */
  @Prop({ trim: true })
  reportTitle?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const ManagementReviewDirectionSchema = SchemaFactory.createForClass(ManagementReviewDirection);

/**
 * Índice tenant-scoped anti-duplicados: un mismo reviewCode no puede repetirse
 * dentro de la misma empresa (reviewCode es OPCIONAL — múltiples null son
 * válidos; el título NO se asume único). Toda consulta del service incluye
 * companyId.
 */
ManagementReviewDirectionSchema.index(
  { companyId: 1, reviewCode: 1 },
  {
    unique: true,
    partialFilterExpression: { reviewCode: { $type: 'string' } },
  },
);
ManagementReviewDirectionSchema.index({ companyId: 1, status: 1 });

/**
 * Derivación dinámica del vencimiento de una decisión (NUNCA persistente):
 * una decisión está vencida cuando su estado no es terminal y su dueDate ya
 * pasó. Helper de dominio para reuso futuro (frontend/E2).
 */
export function isDecisionOverdue(
  decision: Pick<ManagementReviewDecision, 'status' | 'dueDate'>,
  now: Date = new Date(),
): boolean {
  if (!decision.dueDate) return false;
  const terminal =
    decision.status === ManagementReviewDecisionStatus.COMPLETED ||
    decision.status === ManagementReviewDecisionStatus.CANCELLED;
  if (terminal) return false;
  return decision.dueDate.getTime() < now.getTime();
}
