import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DocumentVersionDocument = HydratedDocument<DocumentVersion>;

@Schema({ timestamps: true })
export class DocumentVersion {
  @Prop({ required: true, type: Types.ObjectId, ref: 'DocumentMaster', index: true })
  documentId!: Types.ObjectId;

  @Prop({ required: true })
  versionNumber!: number;

  @Prop({ required: true })
  fileUrl!: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  uploadedBy?: Types.ObjectId;

  @Prop()
  uploadDate?: Date;

  @Prop()
  changeDescription?: string;

  @Prop({ default: false })
  isCurrent!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const DocumentVersionSchema = SchemaFactory.createForClass(DocumentVersion);

DocumentVersionSchema.index({ documentId: 1, versionNumber: -1 });
DocumentVersionSchema.index({ documentId: 1, isCurrent: 1 });
