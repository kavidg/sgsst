import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ApprovalStatus } from '../../approval-workflow/enums/approval-status.enum';

export type ContractDocument = HydratedDocument<Contract>;  /**
   * Estados operativos de un contrato.
   *
   * La aprobación (PENDING_APPROVAL, APPROVED, REJECTED, ADJUSTMENTS_REQUESTED)
   * pertenece al Approval Workflow Core y se integra en el BLOQUE 6D.
   */
export enum ContractStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

/**
 * Contrato de prestación de servicios con requisitos SST.
 *
 * Representa un contrato operativo con un contratista/subcontratista.
 * El contratista es un Supplier existente con type === CONTRACTOR o THIRD_PARTY.
 *
 * El schema NO incluye approvalStatus todavía (BLOQUE 6D).
 * El schema NO incluye referencias a DocumentMaster (decisión documentada abajo).
 *
 * Decisión sobre referencias a DocumentMaster:
 * NO se agregan `contractDocumentId` ni `evidenceDocumentIds` en este bloque.
 * Razón: el objetivo de 6A es crear el dominio base sin integrar Document Management.
 * La integración documental se realizará en un bloque posterior cuando se confirme
 * el patrón de referencia existente en el proyecto.
 */
@Schema({ timestamps: true })
export class Contract {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  /** Número único del contrato dentro de la empresa. */
  @Prop({ required: true })
  contractNumber!: string;

  /** Título/descripción corta del contrato. */
  @Prop({ required: true })
  title!: string;

  /** Descripción detallada del contrato. */
  @Prop()
  description?: string;

  /** Referencia al contratista (Supplier con type CONTRACTOR o THIRD_PARTY). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Supplier' })
  contractorId!: Types.ObjectId;

  /** Estado operativo del contrato. */
  @Prop({ required: true, enum: Object.values(ContractStatus), default: ContractStatus.DRAFT })
  status!: ContractStatus;

  /** Fecha de inicio del contrato. */
  @Prop()
  contractStart?: Date;

  /** Fecha de fin del contrato. */
  @Prop()
  contractEnd?: Date;

  /** Requisitos SST establecidos para el contrato. */
  @Prop()
  sstRequirements?: string;

  /** Observaciones adicionales. */
  @Prop()
  observations?: string;

  /** Usuario que creó el contrato. */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  /** Nombre del usuario que creó el contrato. */
  @Prop()
  createdByName?: string;

  // ── Approval Workflow Core (BLOQUE 6D) ──
  /** Estado de aprobación administrativa (canónico del Approval Workflow). */
  @Prop({ enum: Object.values(ApprovalStatus), default: undefined })
  approvalStatus?: ApprovalStatus;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ContractSchema = SchemaFactory.createForClass(Contract);

// Índices — siguen el patrón de AcquisitionSchema
ContractSchema.index({ companyId: 1, contractNumber: 1 }, { unique: true });
ContractSchema.index({ companyId: 1, status: 1 });
ContractSchema.index({ companyId: 1, contractorId: 1 });
ContractSchema.index({ companyId: 1, approvalStatus: 1 }, { sparse: true });
