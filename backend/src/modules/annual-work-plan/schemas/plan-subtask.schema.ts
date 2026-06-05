import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PlanSubtaskDocument = HydratedDocument<PlanSubtask>;

@Schema({ timestamps: true })
export class PlanSubtask {
  @Prop({ required: true, type: Types.ObjectId, ref: 'PlanTask' })
  taskId!: Types.ObjectId;

  @Prop({ required: true })
  title!: string;

  @Prop({ default: false })
  completed!: boolean;
}

export const PlanSubtaskSchema = SchemaFactory.createForClass(PlanSubtask);

PlanSubtaskSchema.index({ taskId: 1 });
