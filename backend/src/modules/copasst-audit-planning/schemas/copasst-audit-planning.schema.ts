import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CopasstAuditPlanningDocument = HydratedDocument<CopasstAuditPlanning>;

// ─── Enums ──────────────────────────────────────────────────────────────────

/**
 * Ciclo de vida de la PLANIFICACIÓN de auditorías COPASST (6.1.4).
 * Espejo del patrón AnnualAudit/ManagementReviewDirection; las transiciones
 * se validan server-side (CAPSST_AUDIT_PLANNING_VALID_TRANSITIONS).
 */
export enum CopasstAuditPlanningStatus {
  DRAFT = 'DRAFT',
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * Transiciones válidas (ver CopasstAuditPlanningService.assertValidTransition):
 *   DRAFT → PLANNED | CANCELLED
 *   PLANNED → IN_PROGRESS | CANCELLED
 *   IN_PROGRESS → COMPLETED | CANCELLED
 * COMPLETED y CANCELLED son terminales.
 */
export const COPASST_AUDIT_PLANNING_VALID_TRANSITIONS: Readonly<
  Record<CopasstAuditPlanningStatus, readonly CopasstAuditPlanningStatus[]>
> = {
  [CopasstAuditPlanningStatus.DRAFT]: [
    CopasstAuditPlanningStatus.PLANNED,
    CopasstAuditPlanningStatus.CANCELLED,
  ],
  [CopasstAuditPlanningStatus.PLANNED]: [
    CopasstAuditPlanningStatus.IN_PROGRESS,
    CopasstAuditPlanningStatus.CANCELLED,
  ],
  [CopasstAuditPlanningStatus.IN_PROGRESS]: [
    CopasstAuditPlanningStatus.COMPLETED,
    CopasstAuditPlanningStatus.CANCELLED,
  ],
  [CopasstAuditPlanningStatus.COMPLETED]: [],
  [CopasstAuditPlanningStatus.CANCELLED]: [],
};

/**
 * Estado de una auditoría/verificación PLANIFICADA (item). Representa el
 * seguimiento de la planificación — NUNCA la ejecución completa de la
 * auditoría (informe/hallazgos/acciones pertenecen a 6.1.2 y 7.1.x).
 */
export enum PlannedAuditItemStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/** Transiciones válidas del item planificado (validadas server-side). */
export const PLANNED_AUDIT_ITEM_VALID_TRANSITIONS: Readonly<
  Record<PlannedAuditItemStatus, readonly PlannedAuditItemStatus[]>
> = {
  [PlannedAuditItemStatus.PLANNED]: [
    PlannedAuditItemStatus.IN_PROGRESS,
    PlannedAuditItemStatus.CANCELLED,
  ],
  [PlannedAuditItemStatus.IN_PROGRESS]: [
    PlannedAuditItemStatus.COMPLETED,
    PlannedAuditItemStatus.CANCELLED,
  ],
  [PlannedAuditItemStatus.COMPLETED]: [],
  [PlannedAuditItemStatus.CANCELLED]: [],
};

// ─── Participación COPASST (embebida) ───────────────────────────────────────

/**
 * Participación del COPASST en la auditoría planificada — central para 6.1.4.
 * Referencias descriptivas/seguras (snapshots server-side); NO duplica el
 * sistema electoral ni la membresía de CopasstPeriod.
 */
@Schema({ _id: false })
export class CopasstParticipation {
  /** La participación del comité es requerida para esta auditoría planificada. */
  @Prop({ required: true, default: true })
  required!: boolean;

  /** El comité participó (registrado server-side; sin estado persistido aparte). */
  @Prop({ default: false })
  participated!: boolean;

  @Prop()
  participationDate?: Date;

  @Prop({ type: [{ userId: { type: Types.ObjectId, ref: 'User' }, nameSnapshot: String, role: String }], default: [] })
  participants!: Array<{
    userId?: Types.ObjectId;
    nameSnapshot: string;
    role?: string;
  }>;

  @Prop({ trim: true, maxlength: 2000 })
  observations?: string;
}

const CopasstParticipationSchema = SchemaFactory.createForClass(CopasstParticipation);

// ─── Item planificado (embebido) ────────────────────────────────────────────

/**
 * Auditoría/verificación PLANIFICADA. No representa la ejecución completa:
 * informe, hallazgos y acciones correctivas pertenecen a 6.1.2 (AnnualAudit)
 * y 7.1.x. `annualAuditId` es referencia DECLARativa (trazabilidad); este
 * dominio NUNCA consulta AnnualAudit para calcular nada.
 */
@Schema({ _id: true })
export class CopasstPlannedAuditItem {
  _id!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 300 })
  title!: string;

  @Prop()
  plannedDate?: Date;

  /** Auditor sugerido (usuario del tenant; validado tenant-safe en service). */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  auditorUserId?: Types.ObjectId;

  /** Snapshot del nombre del auditor (server-side; sobrevive cambios). */
  @Prop({ trim: true, maxlength: 300 })
  auditorUserSnapshot?: string;

  /** Responsable de la verificación (usuario del tenant). */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  responsibleUserId?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 300 })
  responsibleUserSnapshot?: string;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  objective!: string;

  @Prop({ trim: true, maxlength: 2000 })
  scope?: string;

  @Prop({ trim: true, maxlength: 2000 })
  criteria?: string;

  @Prop({ trim: true, maxlength: 2000 })
  methodology?: string;

  @Prop({ type: CopasstParticipationSchema, default: () => ({}) })
  copasstParticipation!: CopasstParticipation;

  @Prop({
    required: true,
    enum: Object.values(PlannedAuditItemStatus),
    default: PlannedAuditItemStatus.PLANNED,
  })
  status!: PlannedAuditItemStatus;

  /** Referencia declarativa a la auditoría anual correspondiente (6.1.2). */
  @Prop({ type: Types.ObjectId, ref: 'AnnualAudit' })
  annualAuditId?: Types.ObjectId;
}

const CopasstPlannedAuditItemSchema = SchemaFactory.createForClass(CopasstPlannedAuditItem);

// ─── Planificación de auditorías COPASST (6.1.4) ────────────────────────────

@Schema({ timestamps: true, collection: 'copasstauditplannings' })
export class CopasstAuditPlanning {
  _id!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  /** Código asignado por la empresa (único POR tenant; opcional). */
  @Prop({ trim: true, maxlength: 100 })
  planningCode?: string;

  @Prop({ required: true, trim: true, maxlength: 300 })
  title!: string;

  // ── Período de la planificación ──
  @Prop({ required: true })
  startDate!: Date;

  @Prop({ required: true })
  endDate!: Date;

  // ── Contenido de la planificación ──
  @Prop({ trim: true, maxlength: 2000 })
  scope?: string;

  @Prop({ trim: true, maxlength: 2000 })
  objectives?: string;

  @Prop({ trim: true, maxlength: 2000 })
  criteria?: string;

  @Prop({ trim: true, maxlength: 2000 })
  methodology?: string;

  // ── Responsable ──
  @Prop({ type: Types.ObjectId, ref: 'User' })
  responsibleUserId?: Types.ObjectId;

  /** Snapshot del nombre del responsable (server-side). */
  @Prop({ trim: true, maxlength: 300 })
  responsibleUserSnapshot?: string;

  // ── Referencia declarativa al período COPASST ──
  /** Referencia tenant-safe a CopasstPeriod (trazabilidad; sin scoring). */
  @Prop({ type: Types.ObjectId, ref: 'CopasstPeriod' })
  copasstPeriodId?: Types.ObjectId;

  /** Snapshot del nombre del período (server-side). */
  @Prop({ trim: true, maxlength: 300 })
  copasstPeriodSnapshot?: string;

  @Prop({
    required: true,
    enum: Object.values(CopasstAuditPlanningStatus),
    default: CopasstAuditPlanningStatus.DRAFT,
  })
  status!: CopasstAuditPlanningStatus;

  // ── Auditorías/verificaciones planificadas ──
  @Prop({ type: [CopasstPlannedAuditItemSchema], default: [] })
  items!: CopasstPlannedAuditItem[];

  // ── Autoría (server-side; snapshots descriptivos) ──
  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 300 })
  createdBySnapshot?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 300 })
  updatedBySnapshot?: string;
}

export const CopasstAuditPlanningSchema = SchemaFactory.createForClass(CopasstAuditPlanning);

/**
 * Índice tenant-scoped anti-duplicados: un mismo planningCode no puede
 * repetirse dentro de la misma empresa (planningCode es OPCIONAL — múltiples
 * null son válidos). TODA consulta del service incluye companyId.
 */
CopasstAuditPlanningSchema.index(
  { companyId: 1, planningCode: 1 },
  {
    unique: true,
    partialFilterExpression: { planningCode: { $type: 'string' } },
  },
);
CopasstAuditPlanningSchema.index({ companyId: 1, status: 1 });
