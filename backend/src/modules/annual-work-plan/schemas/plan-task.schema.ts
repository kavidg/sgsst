import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PlanTaskDocument = HydratedDocument<PlanTask>;

export enum TaskStatus {
  PENDING = 'Pending',
  IN_PROGRESS = 'InProgress',
  COMPLETED = 'Completed',
  DELAYED = 'Delayed',
  CANCELLED = 'Cancelled',
}

@Schema({ timestamps: true })
export class PlanTask {
  @Prop({ required: true, type: Types.ObjectId, ref: 'PlanActivity' })
  activityId!: Types.ObjectId;

  @Prop({ required: true })
  title!: string;

  @Prop()
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  assignedTo!: Types.ObjectId;

  @Prop({ required: true })
  startDate!: Date;

  @Prop({ required: true })
  dueDate!: Date;

  @Prop({ default: 0, min: 0, max: 100 })
  progress!: number;

  @Prop({
    required: true,
    enum: Object.values(TaskStatus),
    default: TaskStatus.PENDING,
  })
  status!: TaskStatus;

  @Prop({ type: [String], default: [] })
  comments!: string[];
}

export const PlanTaskSchema = SchemaFactory.createForClass(PlanTask);

PlanTaskSchema.index({ activityId: 1 });
PlanTaskSchema.index({ assignedTo: 1 });
PlanTaskSchema.index({ dueDate: 1, status: 1 });
