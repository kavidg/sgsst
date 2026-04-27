import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TemplateDocument = HydratedDocument<Template>;

@Schema({ timestamps: true })
export class Template {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  uploadedBy!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true })
  originalFileName!: string;

  @Prop({ required: true })
  fileUrl!: string;

  @Prop({ required: true })
  storagePath!: string;

  @Prop({ type: [String], default: [] })
  variables!: string[];
}

export const TemplateSchema = SchemaFactory.createForClass(Template);
TemplateSchema.index({ companyId: 1, createdAt: -1 });
