import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AccountabilityCommitmentDocument = HydratedDocument<AccountabilityCommitment>;

export enum CommitmentPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum CommitmentStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

@Schema({ timestamps: true })
export class AccountabilityCommitment {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  title!: string;

  @Prop()
  description!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  responsibleUser!: Types.ObjectId;

  @Prop({ required: true })
  dueDate!: Date;

  @Prop({ required: true, enum: Object.values(CommitmentPriority), default: CommitmentPriority.MEDIUM })
  priority!: CommitmentPriority;

  @Prop({ required: true, enum: Object.values(CommitmentStatus), default: CommitmentStatus.OPEN })
  status!: CommitmentStatus;

  @Prop({ type: Types.ObjectId, ref: 'AccountabilityMeeting' })
  meetingId?: Types.ObjectId;

  @Prop()
  justificationReason?: string;

  @Prop()
  justificationCorrectiveAction?: string;

  @Prop()
  justificationNewDate?: Date;

  @Prop()
  justificationStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';

  @Prop({ type: Types.ObjectId, ref: 'User' })
  justificationApprovedBy?: Types.ObjectId;

  @Prop()
  justificationApprovedAt?: Date;

  @Prop()
  annualWorkPlanActivityId?: Types.ObjectId;

  @Prop()
  annualWorkPlanTaskId?: Types.ObjectId;

  @Prop()
  completedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AccountabilityCommitmentSchema = SchemaFactory.createForClass(AccountabilityCommitment);
AccountabilityCommitmentSchema.index({ companyId: 1, status: 1 });
AccountabilityCommitmentSchema.index({ companyId: 1, responsibleUser: 1, status: 1 });
AccountabilityCommitmentSchema.index({ companyId: 1, dueDate: 1 });
AccountabilityCommitmentSchema.index({ meetingId: 1 });
