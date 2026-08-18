import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AiAnalysisActorType, AiAnalysisType } from '../enums/pipeline-module.enum';

export type AiAnalysisRecordDocument = HydratedDocument<AiAnalysisRecord>;

/** Mensaje de error emitido al intentar mutar un análisis histórico (AUDIT-4). */
export const IMMUTABLE_ANALYSIS_MESSAGE =
  'AiAnalysisRecord is immutable: historical analyses cannot be updated';

/**
 * Guard de inmutabilidad para el schema de análisis históricos.
 *
 * Un análisis persistido es un registro de auditoría: una vez creado no puede
 * modificarse (ni score, ni findings, ni actor). Se registra como middleware
 * pre('updateOne') / pre('findOneAndUpdate') en el schema. La eliminación
 * queda gobernada únicamente por el TTL de retención (expiresAt).
 */
export function immutableAnalysisUpdateGuard(next: (error?: Error) => void): void {
  next(new Error(IMMUTABLE_ANALYSIS_MESSAGE));
}

/** Hallazgo persistido en el análisis (snapshot mínimo, sin PII). */
export interface AiAnalysisFindingSnapshot {
  id: string;
  module: string;
  title: string;
  description?: string;
  priority?: string;
}

/** Recomendación persistida en el análisis (snapshot mínimo). */
export interface AiAnalysisRecommendationSnapshot {
  id: string;
  module: string;
  title: string;
  targetPhase?: string;
}

/**
 * Registro persistente de un análisis de cumplimiento/PHVA de una empresa.
 *
 * AUDIT-3: hace trazable el resultado del motor determinista existente
 * (ComplianceAIEngine / PhvaAnalysisService) sin convertirlo en LLM ni
 * duplicar motores: el motor sigue siendo la fuente; este registro es un
 * snapshot con su fingerprint de idempotencia.
 *
 * Tenant isolation: companyId es obligatorio y todas las consultas se hacen
 * con { companyId, ... }. Nunca acepta companyId del cliente como autoridad.
 */
@Schema({ timestamps: true, collection: 'ai_analysis_records' })
export class AiAnalysisRecord {
  @Prop({ required: true, type: Types.ObjectId, index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(AiAnalysisType) })
  analysisType!: AiAnalysisType;

  /** Versión del motor determinista que generó el análisis. */
  @Prop({ required: true })
  engineVersion!: string;

  /** Cumplimiento global ponderado (0-100). */
  @Prop({ required: true, min: 0, max: 100 })
  score!: number;

  /** Fingerprint de idempotencia: hash de companyId+type+contenido. */
  @Prop({ required: true })
  fingerprint!: string;

  @Prop({ type: [Object], default: [] })
  findings!: AiAnalysisFindingSnapshot[];

  @Prop({ type: [Object], default: [] })
  recommendations!: AiAnalysisRecommendationSnapshot[];

  /** Fase PHVA de origen del análisis (null para análisis de cumplimiento). */
  @Prop()
  phvaPhase?: string;

  /**
   * Actor que solicitó/ejecutó el análisis (AUDIT-4).
   * - USER: usuario autenticado (requestedBy = firebaseUid autorizado).
   * - SYSTEM: proceso automático/pipeline sin actor humano.
   */
  @Prop({ required: true, enum: Object.values(AiAnalysisActorType), default: AiAnalysisActorType.SYSTEM })
  actorType!: AiAnalysisActorType;

  /** Identidad autorizada del solicitante (firebaseUid). Nunca credenciales/tokens. */
  @Prop()
  requestedBy?: string;

  @Prop({ type: Date })
  expiresAt?: Date;

  /** Timestamps de Mongoose (timestamps: true). */
  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const AiAnalysisRecordSchema = SchemaFactory.createForClass(AiAnalysisRecord);

// Idempotencia: mismo análisis (empresa+tipo+contenido) no crea duplicados.
AiAnalysisRecordSchema.index(
  { companyId: 1, analysisType: 1, fingerprint: 1 },
  { unique: true },
);
AiAnalysisRecordSchema.index({ companyId: 1, createdAt: -1 });
// Retención real: purga automática de análisis expirados (90 días).
AiAnalysisRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Inmutabilidad (AUDIT-4): un análisis histórico no puede actualizarse.
// La eliminación queda exclusivamente a cargo del TTL de retención.
AiAnalysisRecordSchema.pre('updateOne', immutableAnalysisUpdateGuard as never);
AiAnalysisRecordSchema.pre('findOneAndUpdate', immutableAnalysisUpdateGuard as never);
AiAnalysisRecordSchema.pre('updateMany', immutableAnalysisUpdateGuard as never);
