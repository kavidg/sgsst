import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SignatureCampaignDocument = HydratedDocument<SignatureCampaign>;
export type SignatureCampaignWorkerDocument = HydratedDocument<SignatureCampaignWorker>;
export type SignatureTokenDocument = HydratedDocument<SignatureToken>;
export type SignatureEvidenceDocument = HydratedDocument<SignatureEvidence>;
export type SignatureAuditDocument = HydratedDocument<SignatureAudit>;
export type SignatureReminderDocument = HydratedDocument<SignatureReminder>;

export enum CampaignStatus { DRAFT = 'DRAFT', ACTIVE = 'ACTIVE', COMPLETED = 'COMPLETED', EXPIRED = 'EXPIRED', ARCHIVED = 'ARCHIVED' }
export enum WorkerStatus { PENDING = 'PENDING', LINK_SENT = 'LINK_SENT', LINK_OPENED = 'LINK_OPENED', OTP_SENT = 'OTP_SENT', OTP_VALIDATED = 'OTP_VALIDATED', DOCUMENT_VIEWED = 'DOCUMENT_VIEWED', ACCEPTED = 'ACCEPTED', SIGNED = 'SIGNED', REJECTED = 'REJECTED', EXPIRED = 'EXPIRED' }
export enum SignatureMethod { TYPED = 'TYPED', DRAWN = 'DRAWN', UPLOADED = 'UPLOADED' }
export enum DeliveryMethod { SMS = 'SMS', WHATSAPP = 'WHATSAPP', EMAIL = 'EMAIL', MANUAL = 'MANUAL' }

@Schema({ timestamps: true })
export class SignatureCampaign {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' }) companyId!: Types.ObjectId;
  @Prop({ required: true }) name!: string;
  @Prop() description?: string;
  @Prop({ required: true }) documentType!: string;
  @Prop() documentVersion?: string;
  @Prop() documentUrl?: string;
  @Prop() documentContent?: string;
  @Prop() sourceModule?: string;
  @Prop() sourceEntityId?: string;
  @Prop({ default: false }) requireOtp!: boolean;
  @Prop({ default: true }) requireSignature!: boolean;
  @Prop({ default: false }) requirePdfAcceptance!: boolean;
  @Prop({ type: [Number], default: [7, 5, 3, 1] }) reminderDays!: number[]; // [7, 5, 3, 1]
  @Prop() expiresAt?: Date;
  @Prop({ required: true, enum: Object.values(CampaignStatus), default: CampaignStatus.DRAFT }) status!: string;
  @Prop() createdByEmail?: string;
  @Prop() createdByName?: string;
  @Prop({ type: [{ type: Types.ObjectId, ref: 'SignatureCampaignWorker' }], default: [] }) workers!: Types.ObjectId[];
  @Prop({ type: [{ type: Types.ObjectId, ref: 'SignatureAudit' }], default: [] }) auditHistory!: Types.ObjectId[];
}

export const SignatureCampaignSchema = SchemaFactory.createForClass(SignatureCampaign);
SignatureCampaignSchema.index({ companyId: 1, status: 1 });
SignatureCampaignSchema.index({ companyId: 1, createdAt: -1 });

@Schema({ timestamps: true })
export class SignatureCampaignWorker {
  @Prop({ required: true, type: Types.ObjectId, ref: 'SignatureCampaign' }) campaignId!: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' }) companyId!: Types.ObjectId;
  @Prop() employeeId?: string;
  @Prop({ required: true }) name!: string;
  @Prop({ required: true }) identification!: string;
  @Prop() position?: string;
  @Prop() area?: string;
  @Prop() phone?: string;
  @Prop() email?: string;
  @Prop({ required: true, enum: Object.values(WorkerStatus), default: WorkerStatus.PENDING }) status!: string;
  @Prop({ unique: true, sparse: true }) token?: string;
  @Prop() tokenExpiresAt?: Date;
  @Prop() tokenUsedAt?: Date;
  @Prop() otpCode?: string;
  @Prop() otpSentAt?: Date;
  @Prop() otpValidatedAt?: Date;
  @Prop() documentViewedAt?: Date;
  @Prop() acceptedAt?: Date;
  @Prop() signedAt?: Date;
  @Prop({ default: false }) hasRead!: boolean;
  @Prop({ enum: Object.values(SignatureMethod) }) signatureMethod?: string;
  @Prop() signatureData?: string; // Base64 or typed name
  @Prop() signatureHash?: string;
  @Prop() signatureUrl?: string;
  @Prop() deliveryMethod?: string;
  @Prop() linkSentAt?: Date;
  @Prop() openedAt?: Date;
  @Prop() ipAddress?: string;
  @Prop() browser?: string;
  @Prop() os?: string;
  @Prop() userAgent?: string;
  @Prop() rejectionReason?: string;
  @Prop() evidencePdfUrl?: string;
  @Prop() verificationCode?: string;
  @Prop() lastReminderSentAt?: Date;
  @Prop() reminderCount?: number;
  @Prop({ type: [{ type: Types.ObjectId, ref: 'SignatureAudit' }], default: [] }) auditHistory!: Types.ObjectId[];
}

export const SignatureCampaignWorkerSchema = SchemaFactory.createForClass(SignatureCampaignWorker);
SignatureCampaignWorkerSchema.index({ campaignId: 1, status: 1 });
SignatureCampaignWorkerSchema.index({ companyId: 1, identification: 1 });
SignatureCampaignWorkerSchema.index({ token: 1 }, { unique: true, sparse: true });

@Schema({ timestamps: true })
export class SignatureToken {
  @Prop({ required: true, unique: true }) token!: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' }) companyId!: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'SignatureCampaignWorker' }) workerId!: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'SignatureCampaign' }) campaignId!: Types.ObjectId;
  @Prop({ required: true }) expiresAt!: Date;
  @Prop({ default: false }) used!: boolean;
  @Prop() usedAt?: Date;
  @Prop() ipAddress?: string;
  @Prop() userAgent?: string;
}

export const SignatureTokenSchema = SchemaFactory.createForClass(SignatureToken);
SignatureTokenSchema.index({ token: 1 }, { unique: true });
SignatureTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

@Schema({ timestamps: true })
export class SignatureEvidence {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' }) companyId!: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'SignatureCampaignWorker' }) workerId!: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'SignatureCampaign' }) campaignId!: Types.ObjectId;
  @Prop({ required: true }) workerName!: string;
  @Prop({ required: true }) workerIdentification!: string;
  @Prop() workerPhone?: string;
  @Prop({ required: true }) documentType!: string;
  @Prop() documentVersion?: string;
  @Prop({ required: true }) signedAt!: Date;
  @Prop({ required: true }) signatureHash!: string;
  @Prop() signatureMethod?: string;
  @Prop() signatureData?: string;
  @Prop() ipAddress?: string;
  @Prop() browser?: string;
  @Prop() os?: string;
  @Prop() otpValidated!: boolean;
  @Prop() verificationCode?: string;
  @Prop() evidencePdfUrl?: string;
  @Prop({ type: Object }) metadata?: Record<string, unknown>;
}

export const SignatureEvidenceSchema = SchemaFactory.createForClass(SignatureEvidence);
SignatureEvidenceSchema.index({ companyId: 1, signedAt: -1 });
SignatureEvidenceSchema.index({ campaignId: 1 });

@Schema({ timestamps: true })
export class SignatureAudit {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' }) companyId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'SignatureCampaign' }) campaignId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'SignatureCampaignWorker' }) workerId?: Types.ObjectId;
  @Prop({ required: true }) action!: string;
  @Prop() userEmail?: string;
  @Prop() workerName?: string;
  @Prop() workerIdentification?: string;
  @Prop() ipAddress?: string;
  @Prop() userAgent?: string;
  @Prop({ type: Object }) metadata?: Record<string, unknown>;
  @Prop({ default: () => new Date() }) timestamp!: Date;
}

export const SignatureAuditSchema = SchemaFactory.createForClass(SignatureAudit);
SignatureAuditSchema.index({ companyId: 1, timestamp: -1 });
SignatureAuditSchema.index({ campaignId: 1 });

@Schema({ timestamps: true })
export class SignatureReminder {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' }) companyId!: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'SignatureCampaign' }) campaignId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'SignatureCampaignWorker' }) workerId?: Types.ObjectId;
  @Prop({ default: 7 }) daysBeforeExpiration!: number;
  @Prop() sentAt?: Date;
  @Prop() deliveryMethod?: string;
  @Prop({ default: false }) sent!: boolean;
  @Prop() error?: string;
}

export const SignatureReminderSchema = SchemaFactory.createForClass(SignatureReminder);
SignatureReminderSchema.index({ companyId: 1, sent: 1 });
