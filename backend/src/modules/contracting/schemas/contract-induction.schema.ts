import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ContractInductionDocument = HydratedDocument<ContractInduction>;

/**
 * Estados de una inducción SST para contratistas.
 */
export enum InductionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

/**
 * Registro de inducción SST para trabajadores de un contratista.
 *
 * Cada trabajador de un contratista debe recibir inducción SST antes de
 * iniciar labores. Este schema registra el estado de cada inducción.
 */
@Schema({ timestamps: true })
export class ContractInduction {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  /** Contrato al que pertenece la inducción. */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Contract' })
  contractId!: Types.ObjectId;

  /** Contratista (Supplier) al que pertenece el trabajador. */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Supplier' })
  contractorId!: Types.ObjectId;

  /** Nombre completo del trabajador inducido. */
  @Prop({ required: true })
  workerName!: string;

  /** Cédula o identificación del trabajador (opcional). */
  @Prop()
  workerId?: string;

  /** Estado de la inducción. */
  @Prop({ required: true, enum: Object.values(InductionStatus), default: InductionStatus.PENDING })
  status!: InductionStatus;

  /** Fecha en que se realizó la inducción. */
  @Prop()
  inductionDate?: Date;

  /** Fecha de vencimiento de la inducción (si aplica reinducción). */
  @Prop()
  expirationDate?: Date;

  /** Calificación de la inducción (0-100). */
  @Prop({ min: 0, max: 100 })
  score?: number;

  /** Usuario que registró la inducción. */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ContractInductionSchema = SchemaFactory.createForClass(ContractInduction);

// Índices
ContractInductionSchema.index({ companyId: 1, contractId: 1 });
ContractInductionSchema.index({ companyId: 1, contractorId: 1 });
ContractInductionSchema.index({ companyId: 1, status: 1 });
