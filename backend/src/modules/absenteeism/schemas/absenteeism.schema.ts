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

  @Prop()
  descripcion?: string;

  @Prop()
  soporte?: string;
}

export const AbsenteeismSchema = SchemaFactory.createForClass(Absenteeism);
AbsenteeismSchema.index({ companyId: 1, fechaInicio: -1, createdAt: -1 });
AbsenteeismSchema.index({ userId: 1, fechaInicio: -1, createdAt: -1 });
