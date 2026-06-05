import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TaskJustificationDocument = HydratedDocument<TaskJustification>;

export enum JustificationApprovalStatus {
  PENDING = 'Pending',
  APPROVED = 'Approved',
  REJECTED = 'Rejected',
}

@Schema({ timestamps: true })
export class TaskJustification {
  @Prop({ required: true, type: Types.ObjectId, ref: 'PlanTask' })
  taskId!: Types.ObjectId;

  @Prop({ required: true })
  reason!: string;

  @Prop()
  correctiveAction?: string;

  @Prop()
  newDueDate?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  approvedBy?: Types.ObjectId;

  @Prop()
  approvedByEmail?: string;

  @Prop({
    enum: Object.values(JustificationApprovalStatus),
    default: JustificationApprovalStatus.PENDING,
  })
  approvalStatus!: JustificationApprovalStatus;

  @Prop()
  rejectionReason?: string;
}

export const TaskJustificationSchema = SchemaFactory.createForClass(TaskJustification);

TaskJustificationSchema.index({ taskId: 1 });
TaskJustificationSchema.index({ approvalStatus: 1 });
