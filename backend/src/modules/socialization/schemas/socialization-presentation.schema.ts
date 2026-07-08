import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SocializationPresentationDocument = HydratedDocument<SocializationPresentation>;

export enum PresentationFileType {
  PDF = 'PDF',
  POWERPOINT = 'PPTX',
  IMAGE = 'IMAGE',
}

@Schema({ timestamps: true })
export class PresentationVersion {
  @Prop({ required: true })
  version!: string;

  @Prop({ required: true })
  fileName!: string;

  @Prop({ required: true })
  fileUrl!: string;

  @Prop({ required: true, enum: Object.values(PresentationFileType) })
  fileType!: string;

  @Prop({ default: 0 })
  totalSlides!: number;

  @Prop({ type: [String], default: [] })
  pageThumbnailUrls!: string[];

  @Prop()
  uploadedByEmail?: string;

  @Prop()
  uploadedByName?: string;

  @Prop({ default: () => new Date() })
  uploadedAt!: Date;
}

export const PresentationVersionSchema = SchemaFactory.createForClass(PresentationVersion);

@Schema({ timestamps: true })
export class SocializationPresentation {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'SocializationSession' })
  sessionId!: Types.ObjectId;

  @Prop({ required: true })
  title!: string;

  @Prop()
  description?: string;

  @Prop({ type: [PresentationVersionSchema], default: [] })
  versions!: PresentationVersion[];

  @Prop({ required: true })
  currentVersion!: string;
}

export const SocializationPresentationSchema = SchemaFactory.createForClass(SocializationPresentation);
SocializationPresentationSchema.index({ sessionId: 1 });
