import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CompanyPeriodScheduledWorkDataDocument =
  HydratedDocument<CompanyPeriodScheduledWorkData>;

/**
 * Días de trabajo programados por empresa y período (FASE 35E-2, estándar 3.3.6).
 *
 * Denominador normativo explícito y persistido del indicador:
 *   ausentismo por causa médica (%) =
 *     (días de ausencia por incapacidad laboral o común en el mes
 *      / días de trabajo programados en el mes) × 100
 *
 * Semántica: el valor almacenado es el valor DECLARADO/AUDITADO por la
 * empresa para ese mes — no se recalcula retroactivamente desde el headcount
 * actual ni desde horas trabajadas. Permite reproducir el denominador
 * históricamente (FASE 35E-2A: la plataforma no posee ninguna otra fuente
 * que represente "días de trabajo programados").
 *
 * Frontera con CompanyPeriodWorkData: ese schema almacena HORAS TRABAJADAS
 * (categoría "trabajado"); este almacena DÍAS PROGRAMADOS (categoría
 * "programado"). Las categorías NO son intercambiables (35E-2A §3).
 *
 * Metadata-only: no contiene información clínica.
 */
@Schema({ timestamps: true })
export class CompanyPeriodScheduledWorkData {
  @Prop({ required: true, type: Types.ObjectId, index: true })
  companyId!: Types.ObjectId;

  /** Período en formato YYYY-MM. */
  @Prop({
    required: true,
    validate: {
      validator: (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value),
      message: 'period must have format YYYY-MM (month 01-12)',
    },
  })
  period!: string;

  /**
   * Número de días de trabajo programados en el mes (declarado/auditado).
   * Entero >= 0; el provider trata 0 como denominador no calculable.
   */
  @Prop({ required: true, type: Number, min: 0, validate: Number.isFinite })
  scheduledWorkDays!: number;

  /** Usuario autenticado que registró el dato (trazabilidad administrativa). */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  /** Usuario autenticado de la última actualización. */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;
}

export const CompanyPeriodScheduledWorkDataSchema =
  SchemaFactory.createForClass(CompanyPeriodScheduledWorkData);

// Índice compuesto único: una entrada por empresa + período (upsert idempotente)
CompanyPeriodScheduledWorkDataSchema.index({ companyId: 1, period: 1 }, { unique: true });
