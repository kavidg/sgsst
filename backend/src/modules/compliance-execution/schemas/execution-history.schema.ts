import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ExecutionError } from '../enums/execution-error.enum';
import { ExecutionStatus } from '../enums/execution-status.enum';
import { ExecutionStep } from '../enums/execution-step.enum';

export type ExecutionHistoryDocument = HydratedDocument<ExecutionHistory>;

/**
 * Trazabilidad de un paso dentro del historial de ejecución.
 */
@Schema({ _id: false })
export class ExecutionStepSnapshot {
  @Prop({ required: true })
  stepId!: string;

  @Prop({ required: true, enum: Object.values(ExecutionStep) })
  type!: ExecutionStep;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true, enum: Object.values(ExecutionStatus) })
  status!: ExecutionStatus;

  @Prop({ type: Date, default: null })
  startedAt!: Date | null;

  @Prop({ type: Date, default: null })
  finishedAt!: Date | null;

  @Prop({ type: String, enum: Object.values(ExecutionError), default: null })
  error!: ExecutionError | null;

  @Prop({ default: false })
  retryable!: boolean;

  @Prop({ type: String, default: null })
  skipReason!: string | null;
}

export const ExecutionStepSnapshotSchema =
  SchemaFactory.createForClass(ExecutionStepSnapshot);

/**
 * Historial de una ejecución del Compliance Execution Engine.
 *
 * Únicamente guarda la trazabilidad: nunca persiste el AutomationResult ni
 * modifica recomendaciones o cumplimiento.
 */
@Schema({ timestamps: true })
export class ExecutionHistory {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  automationId!: string;

  @Prop({ required: true })
  executedBy!: string;

  @Prop({ required: true })
  startedAt!: Date;

  @Prop({ required: true })
  finishedAt!: Date;

  @Prop({ required: true, enum: Object.values(ExecutionStatus) })
  status!: ExecutionStatus;

  @Prop({ required: true, type: [ExecutionStepSnapshotSchema] })
  steps!: ExecutionStepSnapshot[];

  @Prop({ required: true })
  summary!: string;

  @Prop({ required: true, min: 0 })
  duration!: number;

  @Prop({ required: true, type: [String] })
  errors!: string[];

  @Prop({ default: true })
  createdAutomatically!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ExecutionHistorySchema =
  SchemaFactory.createForClass(ExecutionHistory);

// Consulta por empresa y lectura cronológica.
ExecutionHistorySchema.index({ companyId: 1, createdAt: -1 });
ExecutionHistorySchema.index({ automationId: 1 });
