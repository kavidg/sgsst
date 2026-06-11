import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LegalEvidenceDocument = HydratedDocument<LegalEvidence>;

@Schema({ timestamps: true })
export class LegalEvidence {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'LegalRequirement', index: true })
  requirementId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'DocumentMaster' })
  documentId?: Types.ObjectId;

  @Prop()
  documentName?: string;

  @Prop()
  documentVersion?: string;

  @Prop({ required: true })
  description!: string;

  @Prop()
  fileUrl?: string;

  @Prop({ default: 'PENDING', enum: ['PENDING', 'VALID', 'EXPIRED', 'REJECTED'] })
  status!: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  uploadedBy?: Types.ObjectId;

  @Prop()
  uploadDate?: Date;

  @Prop()
  expirationDate?: Date;
}

export const LegalEvidenceSchema = SchemaFactory.createForClass(LegalEvidence);

LegalEvidenceSchema.index({ companyId: 1, requirementId: 1 });
LegalEvidenceSchema.index({ companyId: 1, documentId: 1 });
