import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { IndicatorMeasurementStatus } from '../enums/indicator-measurement-status.enum';

export type IndicatorMeasurementDocument = HydratedDocument<IndicatorMeasurement>;

/**
 * Medición histórica de un indicador.
 *
 * Almacena el resultado calculado o manual de un indicador para un período
 * específico. Incluye numerador/denominador para trazabilidad del cálculo.
 */
@Schema({ timestamps: true })
export class IndicatorMeasurement {
  @Prop({ required: true, type: Types.ObjectId, index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'IndicatorDefinition' })
  indicatorId!: Types.ObjectId;

  /** Período de la medición (ej: '2026-01', '2026-Q1', '2026'). */
  @Prop({ required: true })
  period!: string;

  /** Fecha de inicio del período. */
  @Prop({ required: true })
  periodStart!: Date;

  /** Fecha de fin del período. */
  @Prop({ required: true })
  periodEnd!: Date;

  /** Numerador de la fórmula. */
  @Prop({ type: Number, default: 0 })
  numerator!: number;

  /** Denominador de la fórmula. */
  @Prop({ type: Number, default: 0 })
  denominator!: number;

  /** Valor calculado del indicador. */
  @Prop({ type: Number, default: 0 })
  calculatedValue!: number;

  /** Estado de la medición. */
  @Prop({ required: true, enum: IndicatorMeasurementStatus, default: IndicatorMeasurementStatus.NO_DATA })
  status!: IndicatorMeasurementStatus;

  /** Fuente del dato: automática o manual. */
  @Prop({ enum: ['AUTOMATIC', 'MANUAL'], default: 'MANUAL' })
  source!: 'AUTOMATIC' | 'MANUAL';

  /** URL o referencia a evidencia documental. */
  @Prop({ default: '' })
  evidence!: string;

  /** Notas adicionales. */
  @Prop({ default: '' })
  notes!: string;

  /** Usuario que registró la medición. */
  @Prop({ type: Types.ObjectId })
  measuredBy?: Types.ObjectId;

  /** Fecha y hora de la medición. */
  @Prop({ default: Date.now })
  measuredAt!: Date;

  /** Usuario que aprobó la medición. */
  @Prop({ type: Types.ObjectId })
  approvedBy?: Types.ObjectId;

  /** Fecha de aprobación. */
  @Prop()
  approvedAt?: Date;
}

export const IndicatorMeasurementSchema = SchemaFactory.createForClass(IndicatorMeasurement);

// Índice compuesto único: companyId + indicatorId + period
IndicatorMeasurementSchema.index(
  { companyId: 1, indicatorId: 1, period: 1 },
  { unique: true },
);

// Índice para búsquedas por empresa e indicador
IndicatorMeasurementSchema.index({ companyId: 1, indicatorId: 1, measuredAt: -1 });
