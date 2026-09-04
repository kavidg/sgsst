import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type EnvironmentalMeasurementDocument = HydratedDocument<EnvironmentalMeasurement>;

/**
 * Tipo de medición ambiental ocupacional.
 * Categorías comunes de agentes medidos en higiene industrial.
 */
export enum MeasurementType {
  NOISE = 'NOISE',
  ILLUMINATION = 'ILLUMINATION',
  TEMPERATURE = 'TEMPERATURE',
  AIR_QUALITY = 'AIR_QUALITY',
  CHEMICAL_AGENTS = 'CHEMICAL_AGENTS',
  VIBRATION = 'VIBRATION',
  ERGONOMIC = 'ERGONOMIC',
  OTHER = 'OTHER',
}

/**
 * Estado de una medición ambiental.
 */
export enum MeasurementStatus {
  COMPLETED = 'COMPLETED',
  PENDING = 'PENDING',
  CANCELLED = 'CANCELLED',
}

/**
 * Resultado de la comparación contra un límite normativo.
 */
export enum ComplianceResult {
  WITHIN_LIMITS = 'WITHIN_LIMITS',
  EXCEEDS_LIMITS = 'EXCEEDS_LIMITS',
  INCONCLUSIVE = 'INCONCLUSIVE',
}

@Schema({ timestamps: true })
export class EnvironmentalMeasurement {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  /** Tipo de agente medido */
  @Prop({ required: true, enum: Object.values(MeasurementType), default: MeasurementType.OTHER })
  measurementType!: MeasurementType;

  /** Descripción de la medición */
  @Prop({ required: true, trim: true, maxlength: 300 })
  description!: string;

  /** Área o ubicación donde se realizó la medición */
  @Prop({ required: true, trim: true, maxlength: 200 })
  area!: string;

  /** Fecha de la medición */
  @Prop({ required: true, type: Date })
  measurementDate!: Date;

  /** Nombre del responsable o laboratorio que realizó la medición */
  @Prop({ trim: true, maxlength: 200 })
  responsible?: string;

  /** Valor numérico del resultado */
  @Prop({ type: Number })
  resultValue?: number;

  /** Unidad de medida (dB, lux, °C, mg/m³, ppm, etc.) */
  @Prop({ trim: true, maxlength: 50 })
  resultUnit?: string;

  /** Límite normativo aplicable */
  @Prop({ type: Number })
  regulatoryLimit?: number;

  /** Unidad del límite normativo */
  @Prop({ trim: true, maxlength: 50 })
  regulatoryLimitUnit?: string;

  /** Resultado de la comparación contra el límite */
  @Prop({ enum: Object.values(ComplianceResult) })
  complianceResult?: ComplianceResult;

  /** Método o instrumento utilizado */
  @Prop({ trim: true, maxlength: 200 })
  methodInstrument?: string;

  /** Observaciones adicionales */
  @Prop({ trim: true, maxlength: 2000 })
  observations?: string;

  /** Referencia opcional al Risk asociado */
  @Prop({ type: Types.ObjectId, ref: 'Risk' })
  riskId?: Types.ObjectId;

  /** Estado de la medición */
  @Prop({ required: true, enum: Object.values(MeasurementStatus), default: MeasurementStatus.COMPLETED })
  status!: MeasurementStatus;
}

export const EnvironmentalMeasurementSchema = SchemaFactory.createForClass(EnvironmentalMeasurement);
EnvironmentalMeasurementSchema.index({ companyId: 1, measurementType: 1 });
EnvironmentalMeasurementSchema.index({ companyId: 1, status: 1 });
EnvironmentalMeasurementSchema.index({ companyId: 1, measurementDate: -1 });
EnvironmentalMeasurementSchema.index({ companyId: 1, riskId: 1 });
