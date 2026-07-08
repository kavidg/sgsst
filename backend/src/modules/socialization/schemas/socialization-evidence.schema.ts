import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SocializationEvidenceDocument = HydratedDocument<SocializationEvidence>;

@Schema({ timestamps: true })
export class SocializationEvidence {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'SocializationSession' })
  sessionId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'SocializationParticipant' })
  participantId!: Types.ObjectId;

  @Prop({ required: true })
  employeeName!: string;

  @Prop({ required: true })
  employeeIdentification!: string;

  @Prop()
  employeePhone?: string;

  @Prop({ required: true })
  documentVersion!: string;

  @Prop({ required: true })
  presentationTitle!: string;

  @Prop({ required: true })
  slideCompletionPercent!: number;

  @Prop({ required: true })
  totalViewingTimeSeconds!: number;

  @Prop({ default: false })
  hasRead!: boolean;

  @Prop()
  acknowledgedAt?: Date;

  @Prop({ required: true })
  signedAt!: Date;

  @Prop({ required: true })
  signatureHash!: string;

  @Prop()
  signatureMethod?: string;

  @Prop()
  signatureData?: string;

  @Prop()
  ipAddress?: string;

  @Prop()
  browser?: string;

  @Prop()
  os?: string;

  @Prop()
  verificationCode?: string;

  @Prop()
  evidencePdfUrl?: string;
}

export const SocializationEvidenceSchema = SchemaFactory.createForClass(SocializationEvidence);
SocializationEvidenceSchema.index({ companyId: 1, signedAt: -1 });
SocializationEvidenceSchema.index({ sessionId: 1 });
SocializationEvidenceSchema.index({ participantId: 1 }, { unique: true });
