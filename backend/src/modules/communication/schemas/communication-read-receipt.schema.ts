import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ timestamps: true })
export class CommunicationReadReceipt {
  _id!: Types.ObjectId;

  @Prop({ required: true })
  companyId!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Communication' })
  communicationId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Employee' })
  employeeId!: Types.ObjectId;

  @Prop()
  employeeName?: string;

  @Prop({ required: true })
  readDate!: string;

  @Prop()
  readTime?: string;

  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;

  @Prop({ default: false })
  isEvidenceStored!: boolean;
}

export const CommunicationReadReceiptSchema = SchemaFactory.createForClass(CommunicationReadReceipt);
