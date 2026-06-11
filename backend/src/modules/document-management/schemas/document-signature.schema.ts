import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DocumentSignatureDocument = HydratedDocument<DocumentSignature>;

@Schema({ timestamps: true })
export class DocumentSignature {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'DocumentMaster', index: true })
  documentId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  signerName!: string;

  @Prop()
  signerEmail?: string;

  @Prop()
  signatureHash?: string;

  @Prop()
  signatureUrl?: string;

  @Prop()
  comments?: string;

  @Prop({ default: false })
  isExecutiveSignature!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const DocumentSignatureSchema = SchemaFactory.createForClass(DocumentSignature);

DocumentSignatureSchema.index({ companyId: 1, documentId: 1, createdAt: -1 });
