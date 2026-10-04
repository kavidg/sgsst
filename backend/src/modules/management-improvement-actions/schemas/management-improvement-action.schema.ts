import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ManagementImprovementActionDocument =
  HydratedDocument<ManagementImprovementAction>;

// ─── Enums ──────────────────────────────────────────────────────────────────

/**
 * Origen DECLARATIVO de la acción de mejora de la alta dirección (7.1.2).
 * OBLIGATORIO: si la acción no proviene de un módulo concreto se usa OTHER.
 * `originReferenceId` es opcional y NUNCA dispara queries automáticas contra
 * otros dominios (frontera 7.1.2 ↔ 6.1.3 / accountability): la relación es
 * trazabilidad, no dependencia ni double scoring.
 */
export enum ImprovementActionOrigin {
  MEETING = 'MEETING',
  MANAGEMENT_REVIEW_6_1_3 = 'MANAGEMENT_REVIEW_6_1_3',
  OTHER = 'OTHER',
}

export enum ImprovementActionPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Estado de la acción. SOLO 4 estados: OVERDUE es DERIVADO (scorer/frontend,
 * patrón FASE 9 / 6.1.4 / 7.1.1) y NUNCA se persiste. Las transiciones se
 * validan server-side (MIA_VALID_TRANSITIONS) en el endpoint dedicado.
 */
export enum ImprovementActionStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * Transiciones válidas (ver ManagementImprovementActionsService.assertValidTransition):
 *   PENDING → IN_PROGRESS | CANCELLED
 *   IN_PROGRESS → COMPLETED | CANCELLED
 * COMPLETED y CANCELLED son terminales (sin reapertura en E1).
 * PENDING → COMPLETED NO está permitida (paso obligatorio por IN_PROGRESS).
 */
export const MIA_VALID_TRANSITIONS: Readonly<
  Record<ImprovementActionStatus, readonly ImprovementActionStatus[]>
> = {
  [ImprovementActionStatus.PENDING]: [
    ImprovementActionStatus.IN_PROGRESS,
    ImprovementActionStatus.CANCELLED,
  ],
  [ImprovementActionStatus.IN_PROGRESS]: [
    ImprovementActionStatus.COMPLETED,
    ImprovementActionStatus.CANCELLED,
  ],
  [ImprovementActionStatus.COMPLETED]: [],
  [ImprovementActionStatus.CANCELLED]: [],
};

/**
 * Estado de implementación declarado en el seguimiento (follow-up). Es la
 * percepción del seguimiento de la acción de alta dirección — NO es una
 * verificación formal de eficacia (esa es frontera de 7.1.1).
 */
export enum ImplementationStatus {
  NOT_STARTED = 'NOT_STARTED',
  ON_TRACK = 'ON_TRACK',
  DELAYED = 'DELAYED',
  IMPLEMENTED = 'IMPLEMENTED',
}

/**
 * Percepción/resultado de efectividad de la acción registrada durante el
 * seguimiento (criterio 7.1.2: "seguimiento a su implementación y
 * efectividad"). Es declarativa/seguimiento — NO sustituye la verificación
 * formal de eficacia de 7.1.1 ni crea un segundo lifecycle.
 */
export enum PerceivedEffectiveness {
  EFECTIVA = 'EFECTIVA',
  NO_EFECTIVA = 'NO_EFECTIVA',
  INDETERMINADA = 'INDETERMINADA',
}

// ─── Evidencia (referencia declarativa — SIN sistema de archivos propio) ────

/**
 * Evidencia de la acción: referencia declarativa a DocumentManagement
 * (DocumentMaster tenant-safe) y/o URL externa + comentario. NO crea upload
 * system, storage ni colección documental paralela (regla E1).
 */
@Schema({ _id: false })
export class ImprovementActionEvidence {
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

const ImprovementActionEvidenceSchema = SchemaFactory.createForClass(
  ImprovementActionEvidence,
);

// ─── Follow-up (seguimiento de implementación — frontera con 7.1.1) ─────────

/**
 * Seguimiento de la acción de mejora de la alta dirección. Expresa:
 * seguimiento realizado (lastFollowUpDate/observations), estado de
 * implementación (implementationStatus), percepción de efectividad
 * (perceivedEffectiveness) y necesidad de continuar el seguimiento
 * (requiresContinuedFollowUp). Diseñado para crecer si el negocio exige
 * después una verificación formal separada (hoy NO existe ese lifecycle).
 */
@Schema({ _id: false })
export class ImprovementActionFollowUp {
  /** Última fecha de seguimiento registrada (no futura; default: ahora). */
  @Prop()
  lastFollowUpDate?: Date;

  @Prop({ trim: true, maxlength: 2000 })
  observations?: string;

  @Prop({ type: String, enum: Object.values(ImplementationStatus) })
  implementationStatus?: ImplementationStatus;

  @Prop({ type: String, enum: Object.values(PerceivedEffectiveness) })
  perceivedEffectiveness?: PerceivedEffectiveness;

  /** ¿La acción requiere continuar en seguimiento? (default implícito: true). */
  @Prop()
  requiresContinuedFollowUp?: boolean;
}

const ImprovementActionFollowUpSchema = SchemaFactory.createForClass(
  ImprovementActionFollowUp,
);

// ─── Acción (7.1.2 — collection `managementimprovementactions`) ─────────────

@Schema({ timestamps: true, collection: 'managementimprovementactions' })
export class ManagementImprovementAction {
  _id!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  /** Código asignado por la empresa (único POR tenant; opcional). */
  @Prop({ trim: true, maxlength: 100 })
  actionCode?: string;

  @Prop({ required: true, trim: true, maxlength: 300 })
  title!: string;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  description!: string;

  /** Origen DECLARATIVO obligatorio (OTHER si no proviene de un módulo). */
  @Prop({ required: true, enum: Object.values(ImprovementActionOrigin) })
  origin!: ImprovementActionOrigin;

  /**
   * Referencia declarativa al documento origen (acta de reunión, decisión de
   * la revisión por la dirección, etc.) — OPCIONAL, validada solo como
   * ObjectId; NO es foreign key y NUNCA dispara queries automáticas
   * (frontera inter-estándares; sin double scoring).
   */
  @Prop({ type: Types.ObjectId })
  originReferenceId?: Types.ObjectId;

  /** Decisión de la alta dirección que originó la acción (trazabilidad). */
  @Prop({ trim: true, maxlength: 2000 })
  decisionReference?: string;

  @Prop({
    required: true,
    enum: Object.values(ImprovementActionPriority),
    default: ImprovementActionPriority.MEDIUM,
  })
  priority!: ImprovementActionPriority;

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

  /** Fecha de ejecución real (si existe, no anterior a plannedDate, no futura). */
  @Prop()
  executionDate?: Date;

  @Prop({
    required: true,
    enum: Object.values(ImprovementActionStatus),
    default: ImprovementActionStatus.PENDING,
  })
  status!: ImprovementActionStatus;

  @Prop({ type: ImprovementActionEvidenceSchema })
  evidence?: ImprovementActionEvidence;

  @Prop({ type: ImprovementActionFollowUpSchema })
  followUp?: ImprovementActionFollowUp;

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

export const ManagementImprovementActionSchema = SchemaFactory.createForClass(
  ManagementImprovementAction,
);

/**
 * Índice tenant-scoped anti-duplicados: un mismo actionCode no puede
 * repetirse dentro de la misma empresa (actionCode es OPCIONAL — múltiples
 * null son válidos). TODA consulta del service incluye companyId.
 */
ManagementImprovementActionSchema.index(
  { companyId: 1, actionCode: 1 },
  {
    unique: true,
    partialFilterExpression: { actionCode: { $type: 'string' } },
  },
);
ManagementImprovementActionSchema.index({ companyId: 1, status: 1 });
ManagementImprovementActionSchema.index({ companyId: 1, dueDate: 1 });
ManagementImprovementActionSchema.index({ companyId: 1, responsibleUserId: 1 });
ManagementImprovementActionSchema.index({ companyId: 1, origin: 1 });
