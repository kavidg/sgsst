import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TrainingDocument = HydratedDocument<Training>;

@Schema({ timestamps: true })
export class Training {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  topic!: string;

  @Prop({ required: true })
  date!: Date;

  @Prop({ required: true })
  instructor!: string;

  @Prop({ required: true })
  description!: string;

  @Prop()
  evidenceUrl?: string;
}

export const TrainingSchema = SchemaFactory.createForClass(Training);
TrainingSchema.index({ companyId: 1, date: -1 });
