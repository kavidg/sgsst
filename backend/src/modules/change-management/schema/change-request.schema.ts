import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ApprovalStatus } from '../../approval-workflow/enums/approval-status.enum';

export type ChangeRequestDocument = HydratedDocument<ChangeRequest>;

/**
 * Tipos de cambio reconocidos por el estándar 2.11.1.
 */
export enum ChangeType {
  PROCESS = 'PROCESS',
  STRUCTURE = 'STRUCTURE',
  PERSONNEL = 'PERSONNEL',
  TECHNOLOGY = 'TECHNOLOGY',
  INFRASTRUCTURE = 'INFRASTRUCTURE',
}

/**
 * Nivel de impacto en SST del cambio.
 */
export enum ImpactLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Estados de una solicitud de cambio.
 *
 * La aprobación formal se implementará mediante Approval Workflow
 * en un bloque posterior. El campo `status` representa el estado
 * operativo propio de la entidad.
 */
export enum ChangeStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  IMPLEMENTED = 'IMPLEMENTED',
  REJECTED = 'REJECTED',
}

/**
 * Solicitud de gestión del cambio (2.11.1).
 *
 * Representa un cambio organizacional que puede impactar el SST.
 * Incluye análisis de riesgos, acciones de control, y seguimiento.
 *
 * NOTA: approvalStatus se prepara conceptualmente pero NO se integra
 * todavía con el Approval Workflow Core.
 *
 * NO incluye referencias a DocumentMaster (pendiente para bloque documental).
 * NO incluye relación con Risk Matrix (pendiente para integración futura).
 */
@Schema({ timestamps: true })
export class ChangeRequest {
  /** Empresa propietaria del cambio (tenant isolation). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  /** Título descriptivo del cambio solicitado. */
  @Prop({ required: true, trim: true })
  title!: string;

  /** Descripción detallada del cambio, su alcance y justificación. */
  @Prop({ required: true })
  description!: string;

  /** Tipo de cambio: proceso, estructura, personal, tecnología o infraestructura. */
  @Prop({ required: true, enum: Object.values(ChangeType) })
  changeType!: ChangeType;

  /** Nivel de impacto esperado en SST. */
  @Prop({ required: true, enum: Object.values(ImpactLevel) })
  impactLevel!: ImpactLevel;

  /** Estado operativo de la solicitud. */
  @Prop({ required: true, enum: Object.values(ChangeStatus), default: ChangeStatus.DRAFT })
  status!: ChangeStatus;

  /** Usuario que solicita el cambio. */
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  requestedBy!: Types.ObjectId;

  /** Nombre del usuario que solicita. */
  @Prop({ required: true })
  requestedByName!: string;

  /** Análisis de riesgos SST asociado al cambio. */
  @Prop()
  riskAnalysis?: string;

  /** Acciones de control a implementar antes/durante/después del cambio. */
  @Prop({ type: [String], default: [] })
  controlActions!: string[];

  /** Procesos de la organización afectados por el cambio. */
  @Prop({ type: [String], default: [] })
  affectedProcesses!: string[];

  /** Trabajadores o áreas afectadas por el cambio. */
  @Prop({ type: [String], default: [] })
  affectedWorkers!: string[];

  /** Fecha planificada de implementación del cambio. */
  @Prop()
  implementationDate?: Date;

  /** Fecha de seguimiento post-implementación. */
  @Prop()
  followUpDate?: Date;

  /** Observaciones adicionales. */
  @Prop()
  observations?: string;

  /** Usuario que creó el registro. */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  /** Nombre del usuario que creó el registro. */
  @Prop()
  createdByName?: string;

  // ── Approval Workflow Core ──
  /** Estado de aprobación administrativa (canónico del Approval Workflow). */
  @Prop({ enum: Object.values(ApprovalStatus), default: undefined })
  approvalStatus?: ApprovalStatus;

  /** Usuario que aprobó el cambio. */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  approvedBy?: Types.ObjectId;

  /** Nombre del usuario que aprobó. */
  @Prop()
  approvedByName?: string;

  /** Fecha de aprobación. */
  @Prop()
  approvedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ChangeRequestSchema = SchemaFactory.createForClass(ChangeRequest);

// Índices — siguen el patrón de ContractSchema
ChangeRequestSchema.index({ companyId: 1, status: 1 });
ChangeRequestSchema.index({ companyId: 1, changeType: 1 });
ChangeRequestSchema.index({ companyId: 1, impactLevel: 1 });
ChangeRequestSchema.index({ companyId: 1, createdAt: -1 });
