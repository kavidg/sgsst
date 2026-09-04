import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DocumentDocument = HydratedDocument<Document>;

/** Status of a document with respect to its lifecycle. */
export enum DocumentStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
  EXPIRED = 'EXPIRED',
}

@Schema({ timestamps: true })
export class Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  type!: string;

  @Prop({ required: true })
  fileUrl!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  uploadedBy!: Types.ObjectId;

  /** Optional expiration date. Documents without this field are considered not applicable for validity checks. */
  @Prop()
  expirationDate?: Date;

  /** Document lifecycle status. Defaults to ACTIVE for backward compatibility. */
  @Prop({ default: DocumentStatus.ACTIVE })
  documentStatus?: DocumentStatus;
}

export const DocumentSchema = SchemaFactory.createForClass(Document);
DocumentSchema.index({ companyId: 1, createdAt: -1 });
DocumentSchema.index({ companyId: 1, expirationDate: 1 });
