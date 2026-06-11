import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export type RecipientStatus = 'PENDING' | 'DELIVERED' | 'READ' | 'SIGNED';

@Schema({ timestamps: true })
export class CommunicationRecipient {
  _id!: Types.ObjectId;

  @Prop({ required: true })
  companyId!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Communication' })
  communicationId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Employee' })
  employeeId!: Types.ObjectId;

  @Prop()
  employeeName?: string;

  @Prop()
  employeeEmail?: string;

  @Prop({ required: true, enum: ['PENDING','DELIVERED','READ','SIGNED'], default: 'PENDING' })
  status!: RecipientStatus;

  @Prop()
  deliveredAt?: string;

  @Prop()
  readAt?: string;

  @Prop()
  signedAt?: string;

  @Prop({ type: Types.ObjectId, ref: 'CommunicationSignature' })
  signatureId?: Types.ObjectId;
}

export const CommunicationRecipientSchema = SchemaFactory.createForClass(CommunicationRecipient);
