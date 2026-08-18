import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PipelineModule } from '../enums/pipeline-module.enum';

export type PipelineTraceDocument = HydratedDocument<PipelineTrace>;

/**
 * Vínculo de trazabilidad entre dos entidades del pipeline
 * PHVA → IA → findings → acciones → plan → tareas → evidencias → verificación.
 *
 * AUDIT-3: permite responder "¿por qué existe esta acción?" siguiendo la
 * cadena completa de relaciones. Guarda SOLO referencias (ids), nunca
 * duplica los datos completos de las entidades origen.
 *
 * Tenant isolation: companyId es obligatorio y cada vínculo es único por
 * (companyId, source, target) → el vínculo de A no puede colisionar con B y
 * reprocesar una relación no la duplica.
 */
@Schema({ timestamps: true, collection: 'ai_pipeline_traces' })
export class PipelineTrace {
  @Prop({ required: true, type: Types.ObjectId, index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(PipelineModule) })
  sourceModule!: PipelineModule;

  /** Id de la entidad origen (id de finding/action o _id de entidad persistida). */
  @Prop({ required: true })
  sourceEntityId!: string;

  @Prop({ required: true, enum: Object.values(PipelineModule) })
  targetModule!: PipelineModule;

  @Prop({ required: true })
  targetEntityId!: string;

  /** Origen del vínculo (ej: 'PHVA_PLANEAR' → finding). */
  @Prop()
  originType?: string;

  @Prop()
  originId?: string;

  /** Metadata opcional (ej: evidencia vinculada a una tarea). */
  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  /** Timestamps de Mongoose (timestamps: true). */
  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const PipelineTraceSchema = SchemaFactory.createForClass(PipelineTrace);

// Idempotencia: la misma relación (source→target) solo existe una vez.
PipelineTraceSchema.index(
  {
    companyId: 1,
    sourceModule: 1,
    sourceEntityId: 1,
    targetModule: 1,
    targetEntityId: 1,
  },
  { unique: true },
);
PipelineTraceSchema.index({ companyId: 1, sourceModule: 1 });
