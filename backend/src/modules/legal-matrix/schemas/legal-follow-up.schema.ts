import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LegalFollowUpDocument = HydratedDocument<LegalFollowUp>;

@Schema({ timestamps: true })
export class LegalFollowUp {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'LegalRequirement', index: true })
  requirementId!: Types.ObjectId;

  @Prop({ required: true })
  reviewDate!: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewer?: Types.ObjectId;

  @Prop()
  reviewerName?: string;

  @Prop()
  findings?: string;

  @Prop()
  recommendations?: string;

  @Prop({ required: true, enum: ['CUMPLE', 'PARCIAL', 'NO_CUMPLE', 'NO_APLICA'] })
  complianceResult!: string;

  @Prop({ default: false })
  isSigned!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  signedBy?: Types.ObjectId;

  @Prop()
  signedByName?: string;

  @Prop()
  signedAt?: Date;

  @Prop()
  signatureHash?: string;

  @Prop()
  signatureUrl?: string;

  @Prop()
  nextReviewDate?: Date;
}

export const LegalFollowUpSchema = SchemaFactory.createForClass(LegalFollowUp);

LegalFollowUpSchema.index({ companyId: 1, requirementId: 1, reviewDate: -1 });
