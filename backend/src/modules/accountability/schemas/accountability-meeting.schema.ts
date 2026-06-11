import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AccountabilityMeetingDocument = HydratedDocument<AccountabilityMeeting>;

export enum MeetingType {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  EXTRAORDINARY = 'EXTRAORDINARY',
}

export enum MeetingStatus {
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Schema({ timestamps: true })
export class AccountabilityMeeting {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  date!: Date;

  @Prop()
  time!: string;

  @Prop()
  location!: string;

  @Prop({ required: true, enum: Object.values(MeetingType) })
  meetingType!: MeetingType;

  @Prop({ required: true, enum: Object.values(MeetingStatus), default: MeetingStatus.SCHEDULED })
  status!: MeetingStatus;

  @Prop({ type: [Types.ObjectId], ref: 'User' })
  participants!: Types.ObjectId[];

  @Prop()
  topicsDiscussed!: string;

  @Prop()
  decisions!: string;

  @Prop()
  minutesContent?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy!: Types.ObjectId;

  @Prop()
  minutesDocumentId?: Types.ObjectId;

  @Prop()
  completedAt?: Date;

  @Prop({ type: Map, of: String, default: {} })
  metadata?: Record<string, string>;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AccountabilityMeetingSchema = SchemaFactory.createForClass(AccountabilityMeeting);
AccountabilityMeetingSchema.index({ companyId: 1, date: -1 });
AccountabilityMeetingSchema.index({ companyId: 1, status: 1 });
AccountabilityMeetingSchema.index({ companyId: 1, meetingType: 1 });
