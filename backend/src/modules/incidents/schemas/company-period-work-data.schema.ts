import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CompanyPeriodWorkDataDocument = HydratedDocument<CompanyPeriodWorkData>;

/**
 * Datos de trabajo por empresa y período.
 *
 * Almacena las horas trabajadas totales de la empresa en un período donné.
 * Se utiliza como denominador para indicadores de frecuencia y severidad
 * de accidentalidad.
 *
 * Ejemplo:
 *   companyId: ObjectId("abc...")
 *   period: "2026-08"
 *   hoursWorked: 3200
 *
 * Permite calcular:
 *   frecuencia = (accidentes × 200000) / 3200
 *   severidad = (días perdidos × 200000) / 3200
 */
@Schema({ timestamps: true })
export class CompanyPeriodWorkData {
  @Prop({ required: true, type: Types.ObjectId, index: true })
  companyId!: Types.ObjectId;

  /** Período en formato YYYY-MM. */
  @Prop({ required: true })
  period!: string;

  /** Total de horas trabajadas en la empresa durante el período. */
  @Prop({ required: true, type: Number, min: 0 })
  hoursWorked!: number;
}

export const CompanyPeriodWorkDataSchema = SchemaFactory.createForClass(CompanyPeriodWorkData);

// Índice compuesto único: una entrada por empresa + período
CompanyPeriodWorkDataSchema.index(
  { companyId: 1, period: 1 },
  { unique: true },
);
