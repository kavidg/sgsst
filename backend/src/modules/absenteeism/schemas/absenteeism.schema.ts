import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AbsenteeismDocument = HydratedDocument<Absenteeism>;

export enum AbsenteeismType {
  ENFERMEDAD = 'ENFERMEDAD',
  ACCIDENTE = 'ACCIDENTE',
  PERMISO = 'PERMISO',
}

@Schema({ timestamps: true })
export class Absenteeism {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: AbsenteeismType })
  tipo!: AbsenteeismType;

  @Prop({ required: true })
  fechaInicio!: Date;

  @Prop({ required: true })
  fechaFin!: Date;

  @Prop({ required: true })
  dias!: number;

  /**
   * FASE 35E-2 (3.3.6): naturaleza del ausentismo — señal ESTRUCTURADA y
   * opcional de incapacidad médica (incapacidad laboral o común). Es metadata
   * estadística categórica: NUNCA almacena contenido clínico (diagnóstico,
   * CIE, historia clínica, síntomas, tratamiento).
   *
   * - undefined/null (registros históricos): señal inequívoca NO disponible →
   *   el provider de 3.3.6 NO los cuenta automáticamente (Accidente ≠
   *   automáticamente incapacidad; PERMISO no se infiere) — compatibilidad
   *   hacia atrás sin inventar inferencias ni modificar datos existentes.
   * - true: el registro declara días de incapacidad médica → cuenta para el
   *   numerador de 3.3.6.
   * - false: ausencia administrativa sin incapacidad médica → no cuenta.
   */
  @Prop({ type: Boolean })
  medicalIncapacity?: boolean;

  @Prop()
  descripcion?: string;

  @Prop()
  soporte?: string;
}

export const AbsenteeismSchema = SchemaFactory.createForClass(Absenteeism);
AbsenteeismSchema.index({ companyId: 1, fechaInicio: -1, createdAt: -1 });
AbsenteeismSchema.index({ userId: 1, fechaInicio: -1, createdAt: -1 });
