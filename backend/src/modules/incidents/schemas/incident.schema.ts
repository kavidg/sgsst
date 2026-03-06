import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type IncidentDocument = HydratedDocument<Incident>;

@Schema({ timestamps: true })
export class Incident {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Employee' })
  employeeId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  type!: string;

  @Prop({ required: true })
  date!: Date;

  @Prop({ required: true })
  description!: string;

  @Prop({ required: true })
  severity!: string;

  @Prop({ required: true })
  status!: string;
}

export const IncidentSchema = SchemaFactory.createForClass(Incident);
IncidentSchema.index({ companyId: 1, date: -1 });
