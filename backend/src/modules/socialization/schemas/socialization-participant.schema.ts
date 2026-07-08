import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SocializationParticipantDocument = HydratedDocument<SocializationParticipant>;

export enum ParticipantStatus {
  PENDING = 'PENDING',
  LINK_SENT = 'LINK_SENT',
  LINK_OPENED = 'LINK_OPENED',
  PRESENTATION_VIEWING = 'PRESENTATION_VIEWING',
  PRESENTATION_COMPLETED = 'PRESENTATION_COMPLETED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  SIGNED = 'SIGNED',
  EXPIRED = 'EXPIRED',
}

export enum SignatureMethod {
  TYPED = 'TYPED',
  DRAWN = 'DRAWN',
}

@Schema({ timestamps: true })
export class SlideViewingProgress {
  @Prop({ default: 0 })
  currentSlide!: number;

  @Prop({ type: [Number], default: [] })
  viewedSlides!: number[];

  @Prop({ default: 0 })
  viewingTimeSeconds!: number;

  @Prop({ default: 0 })
  completionPercent!: number;

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;
}

export const SlideViewingProgressSchema = SchemaFactory.createForClass(SlideViewingProgress);

@Schema({ timestamps: true })
export class SocializationParticipant {
  @Prop({ required: true, type: Types.ObjectId, ref: 'SocializationSession' })
  sessionId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Employee' })
  employeeId!: Types.ObjectId;

  @Prop({ required: true })
  employeeName!: string;

  @Prop({ required: true })
  employeeIdentification!: string;

  @Prop()
  position?: string;

  @Prop()
  department?: string;

  @Prop()
  phone?: string;

  @Prop()
  email?: string;

  @Prop({ required: true, enum: Object.values(ParticipantStatus), default: ParticipantStatus.PENDING })
  status!: string;

  // Token
  @Prop({ unique: true, sparse: true })
  token?: string;

  @Prop()
  tokenExpiresAt?: Date;

  @Prop()
  tokenUsedAt?: Date;

  // Presentation viewing
  @Prop({ type: SlideViewingProgressSchema, default: () => ({}) })
  viewingProgress!: SlideViewingProgress;

  // Acknowledgement
  @Prop({ default: false })
  hasRead!: boolean;

  @Prop()
  acknowledgedAt?: Date;

  // Signature
  @Prop({ enum: Object.values(SignatureMethod) })
  signatureMethod?: string;

  @Prop()
  signatureData?: string;

  @Prop()
  signatureHash?: string;

  @Prop()
  signedAt?: Date;

  // Device & tracking
  @Prop()
  ipAddress?: string;

  @Prop()
  browser?: string;

  @Prop()
  os?: string;

  @Prop()
  userAgent?: string;

  // Reminders
  @Prop()
  lastReminderSentAt?: Date;

  @Prop({ default: 0 })
  reminderCount!: number;

  // Evidence
  @Prop({ type: Types.ObjectId, ref: 'SocializationEvidence' })
  evidenceId?: Types.ObjectId;
}

export const SocializationParticipantSchema = SchemaFactory.createForClass(SocializationParticipant);
SocializationParticipantSchema.index({ sessionId: 1, employeeId: 1 }, { unique: true });
SocializationParticipantSchema.index({ sessionId: 1, status: 1 });
SocializationParticipantSchema.index({ token: 1 }, { unique: true, sparse: true });
