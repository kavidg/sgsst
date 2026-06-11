import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

@Schema({ timestamps: true })
export class CommunicationCampaign {
  _id!: Types.ObjectId;

  @Prop({ required: true })
  companyId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop()
  description?: string;

  @Prop({ enum: ['DRAFT','ACTIVE','COMPLETED','CANCELLED'], default: 'DRAFT' })
  status!: CampaignStatus;

  @Prop()
  startDate?: string;

  @Prop()
  endDate?: string;

  @Prop({ type: [String] })
  linkedCommunicationIds: string[] = [];

  @Prop({ type: [String] })
  attachmentUrls: string[] = [];

  @Prop({ type: [String] })
  tags: string[] = [];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ default: 0 })
  totalReached!: number;

  @Prop({ default: 0 })
  totalRead!: number;

  @Prop({ default: 0 })
  totalSigned!: number;
}

export const CommunicationCampaignSchema = SchemaFactory.createForClass(CommunicationCampaign);
