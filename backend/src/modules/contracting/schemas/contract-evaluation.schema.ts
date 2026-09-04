import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ContractEvaluationDocument = HydratedDocument<ContractEvaluation>;

/**
 * Evaluación de desempeño de un contratista.
 *
 * Registra la evaluación periódica del cumplimiento SST de un contratista
 * durante la vigencia del contrato.
 */
@Schema({ timestamps: true })
export class ContractEvaluation {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  /** Contrato evaluado. */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Contract' })
  contractId!: Types.ObjectId;

  /** Contratista (Supplier) evaluado. */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Supplier' })
  contractorId!: Types.ObjectId;

  /** Fecha de la evaluación. */
  @Prop({ required: true })
  evaluationDate!: Date;

  /** Calificación de la evaluación (0-100). */
  @Prop({ required: true, min: 0, max: 100 })
  score!: number;

  /** Criterios evaluados (lista de nombres/descripciones). */
  @Prop({ type: [String] })
  criteria?: string[];

  /** Observaciones de la evaluación. */
  @Prop()
  observations?: string;

  /** Usuario que realizó la evaluación. */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  evaluatedBy?: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ContractEvaluationSchema = SchemaFactory.createForClass(ContractEvaluation);

// Índices
ContractEvaluationSchema.index({ companyId: 1, contractId: 1 });
ContractEvaluationSchema.index({ companyId: 1, contractorId: 1 });
ContractEvaluationSchema.index({ companyId: 1, evaluationDate: -1 });
