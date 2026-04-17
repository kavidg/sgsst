import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type InspectionActivityDocument = HydratedDocument<InspectionActivity>;

@Schema({ timestamps: true })
export class InspectionActivity {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ required: true })
  plannedDate!: Date;

  @Prop({ default: 'pendiente' })
  status!: string;

  @Prop()
  responsible?: string;

  @Prop()
  frequency?: string;

  @Prop()
  notes?: string;

  @Prop()
  completedDate?: Date;
}

export const InspectionActivitySchema = SchemaFactory.createForClass(InspectionActivity);
InspectionActivitySchema.index({ companyId: 1, plannedDate: 1 });
InspectionActivitySchema.index({ companyId: 1, status: 1 });
