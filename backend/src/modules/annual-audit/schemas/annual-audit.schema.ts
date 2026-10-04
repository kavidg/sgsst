import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AnnualAuditDocument = HydratedDocument<AnnualAudit>;

// ─── Enums ──────────────────────────────────────────────────────────────────

/** Ciclo de vida de la auditoría anual (transiciones validadas en service). */
export enum AnnualAuditStatus {
  DRAFT = 'DRAFT',
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * Transiciones válidas (ver AnnualAuditService.assertValidTransition):
 *   DRAFT → PLANNED | CANCELLED
 *   PLANNED → IN_PROGRESS | CANCELLED
 *   IN_PROGRESS → COMPLETED
 * No se permite reabrir COMPLETED ni "revivir" CANCELLED: si el dominio lo
 * exige a futuro, será una transición EXPLÍCITA nueva con historial.
 */
export const ANNUAL_AUDIT_VALID_TRANSITIONS: Readonly<
  Record<AnnualAuditStatus, readonly AnnualAuditStatus[]>
> = {
  [AnnualAuditStatus.DRAFT]: [AnnualAuditStatus.PLANNED, AnnualAuditStatus.CANCELLED],
  [AnnualAuditStatus.PLANNED]: [AnnualAuditStatus.IN_PROGRESS, AnnualAuditStatus.CANCELLED],
  [AnnualAuditStatus.IN_PROGRESS]: [AnnualAuditStatus.COMPLETED],
  [AnnualAuditStatus.COMPLETED]: [],
  [AnnualAuditStatus.CANCELLED]: [],
};

/** Clasificación simple y extensible del hallazgo (sin normativa inventada). */
export enum AuditFindingType {
  NON_CONFORMITY = 'NON_CONFORMITY',
  OBSERVATION = 'OBSERVATION',
  OPPORTUNITY_FOR_IMPROVEMENT = 'OPPORTUNITY_FOR_IMPROVEMENT',
}

/** Severidad simple del hallazgo (la decide el auditor; no el sistema). */
export enum AuditFindingSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum AuditFindingStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  CLOSED = 'CLOSED',
}

export enum AuditActionStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

// ─── Acciones de seguimiento (embebidas en el hallazgo) ─────────────────────

@Schema({ _id: true })
export class AuditFollowUpAction {
  _id!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  description!: string;

  /** Responsable (texto libre con snapshot del usuario cuando esté disponible). */
  @Prop({ required: true, trim: true })
  responsible!: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  responsibleUserId?: Types.ObjectId;

  @Prop()
  dueDate?: Date;

  @Prop({ required: true, enum: Object.values(AuditActionStatus), default: AuditActionStatus.PENDING })
  status!: AuditActionStatus;

  @Prop()
  completedDate?: Date;

  @Prop({ trim: true })
  evidenceUrl?: string;

  @Prop({ trim: true })
  observations?: string;
}

// ─── Hallazgos (embebidos en la auditoría) ──────────────────────────────────

@Schema({ _id: true })
export class AuditFinding {
  _id!: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(AuditFindingType) })
  type!: AuditFindingType;

  @Prop({ required: true, trim: true })
  description!: string;

  /** Criterio normativo/procedimental contra el cual se detecta el hallazgo. */
  @Prop({ trim: true })
  criterion?: string;

  @Prop({ trim: true })
  evidence?: string;

  @Prop({ enum: Object.values(AuditFindingSeverity) })
  severity?: AuditFindingSeverity;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  responsibleUserId?: Types.ObjectId;

  @Prop({ trim: true })
  responsibleNameSnapshot?: string;

  @Prop()
  dueDate?: Date;

  @Prop({ required: true, enum: Object.values(AuditFindingStatus), default: AuditFindingStatus.OPEN })
  status!: AuditFindingStatus;

  @Prop({ trim: true })
  observations?: string;

  /** Acciones de seguimiento del hallazgo (ciclo propio de la auditoría;
   * NO se reutiliza AccountabilityCommitment). */
  @Prop({ type: [AuditFollowUpAction], default: [] })
  actions!: AuditFollowUpAction[];
}

const AuditFollowUpActionSchema = SchemaFactory.createForClass(AuditFollowUpAction);
const AuditFindingSchema = SchemaFactory.createForClass(AuditFinding);
AuditFindingSchema.add({ actions: { type: [AuditFollowUpActionSchema], default: [] } });

// ─── Auditoría anual ────────────────────────────────────────────────────────

@Schema({ timestamps: true, collection: 'annualaudits' })
export class AnnualAudit {
  _id!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  // ── Identidad ──
  /** Código de auditoría asignado por la empresa (único POR tenant, opcional). */
  @Prop({ trim: true })
  auditCode?: string;

  @Prop({ required: true, trim: true })
  title!: string;

  // ── Planificación ──
  @Prop({ enum: ['INTERNAL', 'EXTERNAL'] })
  auditType?: 'INTERNAL' | 'EXTERNAL';

  @Prop()
  plannedStartDate?: Date;

  @Prop()
  plannedEndDate?: Date;

  @Prop({ trim: true })
  scope?: string;

  @Prop({ trim: true })
  objectives?: string;

  /** Criterios de auditoría (normativa, procedimientos, requisitos). */
  @Prop({ trim: true })
  criteria?: string;

  @Prop({ trim: true })
  methodology?: string;

  // ── Auditor ──
  @Prop({ type: Types.ObjectId, ref: 'User' })
  auditorUserId?: Types.ObjectId;

  /** Snapshot del nombre del auditor (sobrevive cambios del usuario). */
  @Prop({ trim: true })
  auditorNameSnapshot?: string;

  /** Texto libre que demuestra competencia (formación/experiencia) — sin
   * sistema completo de certificaciones. */
  @Prop({ trim: true })
  auditorCompetence?: string;

  /** Referencia tenant-safe a DocumentMaster (evidencia de competencia). */
  @Prop({ type: Types.ObjectId, ref: 'DocumentMaster' })
  auditorCompetenceEvidenceId?: Types.ObjectId;

  // ── Ejecución ──
  @Prop()
  actualStartDate?: Date;

  @Prop()
  actualEndDate?: Date;

  @Prop({ required: true, enum: Object.values(AnnualAuditStatus), default: AnnualAuditStatus.DRAFT })
  status!: AnnualAuditStatus;

  // ── Informe ──
  @Prop({ trim: true })
  reportTitle?: string;

  @Prop()
  reportDate?: Date;

  @Prop({ trim: true })
  reportSummary?: string;

  /** Referencia tenant-safe a DocumentMaster (informe de auditoría). */
  @Prop({ type: Types.ObjectId, ref: 'DocumentMaster' })
  reportDocumentId?: Types.ObjectId;

  @Prop({ trim: true })
  reportEvidenceUrl?: string;

  @Prop({ trim: true })
  findingsSummary?: string;

  // ── Hallazgos (embebidos) ──
  @Prop({ type: [AuditFindingSchema], default: [] })
  findings!: AuditFinding[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const AnnualAuditSchema = SchemaFactory.createForClass(AnnualAudit);

/**
 * Índice tenant-scoped anti-duplicados: un mismo auditCode no puede repetirse
 * dentro de la misma empresa (auditCode es OPCIONAL — múltiples null son
 * válidos; el título NO se asume único). Toda consulta del service incluye
 * companyId.
 */
AnnualAuditSchema.index(
  { companyId: 1, auditCode: 1 },
  {
    unique: true,
    partialFilterExpression: { auditCode: { $type: 'string' } },
  },
);
AnnualAuditSchema.index({ companyId: 1, status: 1 });
