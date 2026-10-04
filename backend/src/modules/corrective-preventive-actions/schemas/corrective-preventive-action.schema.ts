import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CorrectivePreventiveActionDocument = HydratedDocument<CorrectivePreventiveAction>;

// ─── Enums ──────────────────────────────────────────────────────────────────

/**
 * Tipo de acción (7.1.1 — Acciones preventivas y correctivas).
 * Diferencial normativo del estándar: el proxy legacy
 * (AccountabilityCommitment) NO distingue el tipo de acción.
 */
export enum ActionItemType {
  PREVENTIVE = 'PREVENTIVE',
  CORRECTIVE = 'CORRECTIVE',
  IMPROVEMENT = 'IMPROVEMENT',
}

/**
 * Origen DECLARATIVO de la acción. OBLIGATORIO: si la acción no proviene de
 * un módulo concreto se usa OTHER (evita crear referencias técnicas falsas).
 * `originReferenceId` es opcional y NUNCA es foreign key obligatoria — la
 * relación con AnnualAudit/ManagementReview/Incidents es trazabilidad, no
 * dependencia (frontera 7.1.1 ↔ 6.1.2 / 6.1.3 / 7.1.3).
 */
export enum ActionOrigin {
  AUDIT_6_1_2 = 'AUDIT_6_1_2',
  MANAGEMENT_REVIEW_6_1_3 = 'MANAGEMENT_REVIEW_6_1_3',
  INCIDENT_7_1_3 = 'INCIDENT_7_1_3',
  INSPECTION = 'INSPECTION',
  INDICATOR = 'INDICATOR',
  LEGAL_MATRIX = 'LEGAL_MATRIX',
  OTHER = 'OTHER',
}

export enum ActionPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Estado de la acción. SOLO 4 estados: OVERDUE es DERIVADO (scorer/frontend,
 * patrón FASE 9 / 6.1.4) y NUNCA se persiste. Las transiciones se validan
 * server-side (CPA_VALID_TRANSITIONS) en el endpoint dedicado de estado.
 */
export enum ActionStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * Transiciones válidas (ver CorrectivePreventiveActionsService.assertValidTransition):
 *   PENDING → IN_PROGRESS | CANCELLED
 *   IN_PROGRESS → COMPLETED | CANCELLED
 * COMPLETED y CANCELLED son terminales (sin reapertura en E1).
 */
export const CPA_VALID_TRANSITIONS: Readonly<
  Record<ActionStatus, readonly ActionStatus[]>
> = {
  [ActionStatus.PENDING]: [
    ActionStatus.IN_PROGRESS,
    ActionStatus.CANCELLED,
  ],
  [ActionStatus.IN_PROGRESS]: [
    ActionStatus.COMPLETED,
    ActionStatus.CANCELLED,
  ],
  [ActionStatus.COMPLETED]: [],
  [ActionStatus.CANCELLED]: [],
};

/**
 * Resultado de la verificación de eficacia — componente CENTRAL de 7.1.1
 * (el criterio normativo exige acciones "ejecutadas y verificadas").
 * COMPLETED ≠ eficacia verificada: son conceptos distintos.
 */
export enum EffectivenessResult {
  EFECTIVA = 'EFECTIVA',
  NO_EFECTIVA = 'NO_EFECTIVA',
  REQUIERE_NUEVA_ACCION = 'REQUIERE_NUEVA_ACCION',
}

// ─── Evidencia (referencia declarativa — SIN sistema de archivos propio) ────

/**
 * Evidencia de la acción: referencia declarativa a DocumentManagement
 * (DocumentMaster tenant-safe) y/o URL externa + comentario. NO crea upload
 * system, storage ni colección documental paralela (regla E1).
 */
@Schema({ _id: false })
export class ActionEvidence {
  /** Referencia declarativa a DocumentMaster (validada tenant-safe en service). */
  @Prop({ type: Types.ObjectId, ref: 'DocumentMaster' })
  documentId?: Types.ObjectId;

  /** Snapshot del código/nombre del documento (server-side; sobrevive cambios). */
  @Prop({ trim: true, maxlength: 300 })
  documentSnapshot?: string;

  @Prop({ trim: true, maxlength: 1000 })
  evidenceUrl?: string;

  @Prop({ trim: true, maxlength: 1000 })
  comment?: string;
}

const ActionEvidenceSchema = SchemaFactory.createForClass(ActionEvidence);

// ─── Verificación de eficacia (embebida) ────────────────────────────────────

/**
 * Verificación de EFICACIA de la acción. Solo aplica a acciones COMPLETED
 * (validado server-side). `REQUIERE_NUEVA_ACCION` se conserva como
 * trazabilidad: E1 NO crea automáticamente otra acción (sin reapertura).
 */
@Schema({ _id: false })
export class EffectivenessVerification {
  @Prop({ required: true })
  verified!: boolean;

  @Prop({ type: String, enum: Object.values(EffectivenessResult) })
  result?: EffectivenessResult;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  verifiedByUserId?: Types.ObjectId;

  /** Snapshot del verificador (server-side; sobrevive cambios). */
  @Prop({ trim: true, maxlength: 300 })
  verifiedBySnapshot?: string;

  @Prop()
  verificationDate?: Date;

  @Prop({ trim: true, maxlength: 2000 })
  observations?: string;
}

const EffectivenessVerificationSchema = SchemaFactory.createForClass(EffectivenessVerification);

// ─── Acción (7.1.1 — collection `correctivepreventiveactions`) ──────────────

@Schema({ timestamps: true, collection: 'correctivepreventiveactions' })
export class CorrectivePreventiveAction {
  _id!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  /** Código asignado por la empresa (único POR tenant; opcional). */
  @Prop({ trim: true, maxlength: 100 })
  actionCode?: string;

  @Prop({ required: true, enum: Object.values(ActionItemType) })
  type!: ActionItemType;

  @Prop({ required: true, trim: true, maxlength: 300 })
  title!: string;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  description!: string;

  /** Origen DECLARATIVO obligatorio (OTHER si no proviene de un módulo). */
  @Prop({ required: true, enum: Object.values(ActionOrigin) })
  origin!: ActionOrigin;

  /**
   * Referencia declarativa al documento origen (hallazgo de auditoría,
   * decisión de dirección, incidente, etc.) — OPCIONAL, validada solo como
   * ObjectId; NO es foreign key obligatoria (frontera inter-estándares).
   */
  @Prop({ type: Types.ObjectId })
  originReferenceId?: Types.ObjectId;

  /** Descripción del hallazgo/problema que motiva la acción. */
  @Prop({ trim: true, maxlength: 2000 })
  finding?: string;

  /** Causa raíz identificada (análisis). */
  @Prop({ trim: true, maxlength: 2000 })
  rootCause?: string;

  /** Plan/acción definida (qué se hará). */
  @Prop({ trim: true, maxlength: 2000 })
  actionPlan?: string;

  @Prop({ required: true, enum: Object.values(ActionPriority), default: ActionPriority.MEDIUM })
  priority!: ActionPriority;

  /** Responsable (usuario del tenant; validado tenant-safe en service). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  responsibleUserId!: Types.ObjectId;

  /** Snapshot del nombre del responsable (server-side; sobrevive cambios). */
  @Prop({ trim: true, maxlength: 300 })
  responsibleSnapshot?: string;

  /** Fecha de programación (si existe, no posterior a dueDate). */
  @Prop()
  plannedDate?: Date;

  /** Fecha compromiso (obligatoria). */
  @Prop({ required: true })
  dueDate!: Date;

  /** Fecha de ejecución real (si existe, no anterior a plannedDate). */
  @Prop()
  executionDate?: Date;

  @Prop({
    required: true,
    enum: Object.values(ActionStatus),
    default: ActionStatus.PENDING,
  })
  status!: ActionStatus;

  @Prop({ type: ActionEvidenceSchema })
  evidence?: ActionEvidence;

  @Prop({ type: EffectivenessVerificationSchema })
  effectivenessVerification?: EffectivenessVerification;

  /** Fecha de cierre operacional (establecida en la transición a COMPLETED). */
  @Prop()
  closureDate?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  closedByUserId?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 300 })
  closedBySnapshot?: string;

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

export const CorrectivePreventiveActionSchema =
  SchemaFactory.createForClass(CorrectivePreventiveAction);

/**
 * Índice tenant-scoped anti-duplicados: un mismo actionCode no puede
 * repetirse dentro de la misma empresa (actionCode es OPCIONAL — múltiples
 * null son válidos). TODA consulta del service incluye companyId.
 */
CorrectivePreventiveActionSchema.index(
  { companyId: 1, actionCode: 1 },
  {
    unique: true,
    partialFilterExpression: { actionCode: { $type: 'string' } },
  },
);
CorrectivePreventiveActionSchema.index({ companyId: 1, status: 1 });
CorrectivePreventiveActionSchema.index({ companyId: 1, dueDate: 1 });
CorrectivePreventiveActionSchema.index({ companyId: 1, responsibleUserId: 1 });
CorrectivePreventiveActionSchema.index({ companyId: 1, origin: 1 });
