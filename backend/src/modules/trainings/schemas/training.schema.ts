import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TrainingDocument = HydratedDocument<Training>;

@Schema({ _id: false })
export class TrainingAttendanceControl {
  @Prop()
  initialListUrl?: string;

  @Prop()
  middleListUrl?: string;

  @Prop()
  finalListUrl?: string;
}

@Schema({ _id: false })
export class TrainingMedia {
  @Prop({ type: [String], default: [] })
  videos!: string[];

  @Prop({ type: [String], default: [] })
  presentations!: string[];

  @Prop({ type: [String], default: [] })
  pdfs!: string[];

  @Prop({ type: [String], default: [] })
  images!: string[];

  @Prop({ type: [String], default: [] })
  supportMaterials!: string[];
}

@Schema({ _id: false })
export class TrainingIndicators {
  @Prop({ default: 0 })
  initialAttendancePercentage!: number;

  @Prop({ default: 0 })
  permanencePercentage!: number;

  @Prop({ default: 0 })
  completionPercentage!: number;

  @Prop({ default: 0 })
  finalAttendancePercentage!: number;

  @Prop({ default: 0 })
  participationPercentage!: number;

  @Prop({ default: 0 })
  effectivenessPercentage!: number;

  @Prop({ default: 0 })
  missingAttendees!: number;
}

@Schema({ _id: false })
export class TrainingStructure {
  @Prop()
  duration?: string;

  @Prop()
  modality?: string;

  @Prop({ default: 0 })
  participants!: number;

  @Prop({ type: [String], default: [] })
  certificates!: string[];

  @Prop({ type: [String], default: [] })
  evidence!: string[];
}

@Schema({ _id: false })
export class TrainingHistory {
  @Prop({ type: [String], default: [] })
  uploadHistory!: string[];

  @Prop({ type: [String], default: [] })
  attendanceChanges!: string[];

  @Prop({ type: [String], default: [] })
  materialUpdates!: string[];

  @Prop({ type: [String], default: [] })
  trainingEdits!: string[];
}

@Schema({ timestamps: true })
export class Training {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  copasstId?: Types.ObjectId;

  @Prop({ required: true })
  topic!: string;

  @Prop({ required: true })
  date!: Date;

  @Prop({ required: true })
  instructor!: string;

  @Prop({ required: true })
  description!: string;

  @Prop()
  evidenceUrl?: string;

  @Prop({ type: TrainingAttendanceControl, default: {} })
  attendanceControl!: TrainingAttendanceControl;

  @Prop({ type: TrainingMedia, default: { videos: [], presentations: [], pdfs: [], images: [], supportMaterials: [] } })
  media!: TrainingMedia;

  @Prop({ type: TrainingIndicators, default: {} })
  indicators!: TrainingIndicators;

  @Prop({ type: TrainingStructure, default: {} })
  structure!: TrainingStructure;

  @Prop({ type: [String], default: [] })
  alerts!: string[];

  @Prop({ type: TrainingHistory, default: {} })
  history!: TrainingHistory;
}

export const TrainingSchema = SchemaFactory.createForClass(Training);
TrainingSchema.index({ companyId: 1, date: -1 });
TrainingSchema.index({ companyId: 1, copasstId: 1 });
