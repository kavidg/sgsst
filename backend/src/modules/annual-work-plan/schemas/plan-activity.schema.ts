import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PlanActivityDocument = HydratedDocument<PlanActivity>;

export enum ActivityPriority {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  CRITICAL = 'Critical',
}

export enum ActivityStatus {
  PENDING = 'Pending',
  IN_PROGRESS = 'InProgress',
  COMPLETED = 'Completed',
  DELAYED = 'Delayed',
  CANCELLED = 'Cancelled',
}

@Schema({ timestamps: true })
export class PlanActivity {
  @Prop({ required: true, type: Types.ObjectId, ref: 'AnnualWorkPlan' })
  annualPlanId!: Types.ObjectId;

  @Prop({ required: true })
  title!: string;

  @Prop()
  description?: string;

  @Prop({ type: Types.ObjectId })
  objectiveId?: Types.ObjectId;

  @Prop()
  sourceModule?: string;

  @Prop({ required: true })
  startDate!: Date;

  @Prop({ required: true })
  endDate!: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  responsibleUser!: Types.ObjectId;

  @Prop({
    required: true,
    enum: Object.values(ActivityPriority),
    default: ActivityPriority.MEDIUM,
  })
  priority!: ActivityPriority;

  @Prop({ default: 0, min: 0 })
  estimatedCost!: number;

  @Prop({ default: 0, min: 0 })
  actualCost!: number;

  @Prop({ default: 0, min: 0, max: 100 })
  progress!: number;

  @Prop({
    required: true,
    enum: Object.values(ActivityStatus),
    default: ActivityStatus.PENDING,
  })
  status!: ActivityStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy!: Types.ObjectId;
}

export const PlanActivitySchema = SchemaFactory.createForClass(PlanActivity);

PlanActivitySchema.index({ annualPlanId: 1 });
PlanActivitySchema.index({ responsibleUser: 1 });
PlanActivitySchema.index({ status: 1, endDate: 1 });
