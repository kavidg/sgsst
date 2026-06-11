import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ timestamps: true })
export class CommunicationSignature {
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

  @Prop({ required: true })
  signatureDate!: string;

  @Prop()
  signatureHash?: string;

  @Prop()
  signatureUrl?: string;

  @Prop()
  comments?: string;

  @Prop({ default: false })
  isMandatorySigned!: boolean;
}

export const CommunicationSignatureSchema = SchemaFactory.createForClass(CommunicationSignature);
