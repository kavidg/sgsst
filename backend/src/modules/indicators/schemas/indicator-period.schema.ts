import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { IndicatorPeriodStatus } from '../enums/indicator-period-status.enum';

export type IndicatorPeriodDocument = HydratedDocument<IndicatorPeriod>;

/**
 * Período de medición de indicadores.
 *
 * Controla el ciclo de vida de los períodos: cuando están abiertos
 * permiten crear/editar mediciones, cuando se cierran se vuelven
 * inmutables.
 */
@Schema({ timestamps: true })
export class IndicatorPeriod {
  @Prop({ required: true, type: Types.ObjectId, index: true })
  companyId!: Types.ObjectId;

  /** Identificador del período (ej: '2026-01', '2026-Q1', '2026'). */
  @Prop({ required: true })
  period!: string;

  /** Estado del período. */
  @Prop({ required: true, enum: IndicatorPeriodStatus, default: IndicatorPeriodStatus.OPEN })
  status!: IndicatorPeriodStatus;

  /** Usuario que cerró el período. */
  @Prop({ type: Types.ObjectId })
  closedBy?: Types.ObjectId;

  /** Fecha y hora de cierre. */
  @Prop()
  closedAt?: Date;
}

export const IndicatorPeriodSchema = SchemaFactory.createForClass(IndicatorPeriod);

// Índice compuesto único: companyId + period
IndicatorPeriodSchema.index({ companyId: 1, period: 1 }, { unique: true });
