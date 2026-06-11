import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AccountabilityHistoryDocument = HydratedDocument<AccountabilityHistory>;

export enum AccountabilityHistoryAction {
  REPORT_GENERATED = 'REPORT_GENERATED',
  REPORT_SIGNED = 'REPORT_SIGNED',
  REPORT_ARCHIVED = 'REPORT_ARCHIVED',
  MEETING_CREATED = 'MEETING_CREATED',
  MEETING_COMPLETED = 'MEETING_COMPLETED',
  MEETING_CANCELLED = 'MEETING_CANCELLED',
  MINUTES_GENERATED = 'MINUTES_GENERATED',
  COMMITMENT_CREATED = 'COMMITMENT_CREATED',
  COMMITMENT_UPDATED = 'COMMITMENT_UPDATED',
  COMMITMENT_COMPLETED = 'COMMITMENT_COMPLETED',
  COMMITMENT_OVERDUE = 'COMMITMENT_OVERDUE',
  COMMITMENT_CANCELLED = 'COMMITMENT_CANCELLED',
  JUSTIFICATION_SUBMITTED = 'JUSTIFICATION_SUBMITTED',
  JUSTIFICATION_APPROVED = 'JUSTIFICATION_APPROVED',
  JUSTIFICATION_REJECTED = 'JUSTIFICATION_REJECTED',
  DOCUMENT_REGISTERED = 'DOCUMENT_REGISTERED',
}

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AccountabilityHistory {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  userEmail!: string;

  @Prop({ required: true, enum: Object.values(AccountabilityHistoryAction) })
  action!: AccountabilityHistoryAction;

  @Prop()
  entityType!: string;

  @Prop({ type: Types.ObjectId })
  entityId!: Types.ObjectId;

  @Prop({ type: Object })
  previousValue?: Record<string, unknown>;

  @Prop({ type: Object })
  newValue?: Record<string, unknown>;

  @Prop()
  description!: string;

  createdAt!: Date;
}

export const AccountabilityHistorySchema = SchemaFactory.createForClass(AccountabilityHistory);
AccountabilityHistorySchema.index({ companyId: 1, createdAt: -1 });
AccountabilityHistorySchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
AccountabilityHistorySchema.index({ companyId: 1, action: 1 });
