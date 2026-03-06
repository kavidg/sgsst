import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DocumentDocument = HydratedDocument<Document>;

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
}

export const DocumentSchema = SchemaFactory.createForClass(Document);
DocumentSchema.index({ companyId: 1, createdAt: -1 });
