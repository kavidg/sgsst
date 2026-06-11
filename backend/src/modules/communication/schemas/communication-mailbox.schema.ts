import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export type MailboxType = 'SUGGESTION' | 'COMPLAINT' | 'UNSAFE_ACT' | 'UNSAFE_CONDITION' | 'IMPROVEMENT_IDEA' | 'REPORT';
export type MailboxStatus = 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED' | 'CLOSED';

@Schema({ timestamps: true })
export class CommunicationMailbox {
  _id!: Types.ObjectId;

  @Prop({ required: true })
  companyId!: string;

  @Prop({ required: true, enum: ['SUGGESTION','COMPLAINT','UNSAFE_ACT','UNSAFE_CONDITION','IMPROVEMENT_IDEA','REPORT'] })
  mailboxType!: MailboxType;

  @Prop({ required: true })
  subject!: string;

  @Prop({ required: true })
  message!: string;

  @Prop({ default: false })
  isAnonymous!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Employee' })
  submittedBy?: Types.ObjectId;

  @Prop()
  submittedByName?: string;

  @Prop({ enum: ['PENDING','UNDER_REVIEW','RESOLVED','CLOSED'], default: 'PENDING' })
  status!: MailboxStatus;

  @Prop()
  response?: string;

  @Prop()
  respondedBy?: string;

  @Prop()
  respondedAt?: string;

  @Prop({ type: [String] })
  attachmentUrls: string[] = [];

  @Prop({ default: false })
  isPriority!: boolean;
}

export const CommunicationMailboxSchema = SchemaFactory.createForClass(CommunicationMailbox);
