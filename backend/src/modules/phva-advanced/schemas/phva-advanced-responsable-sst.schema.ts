import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PhvaAdvancedResponsableSstDocument = HydratedDocument<PhvaAdvancedResponsableSst>;

export enum ResponsableSstComplianceStatus {
  COMPLIES = 'COMPLIES',
  PENDING = 'PENDING',
  NON_COMPLIANT = 'NON_COMPLIANT',
}

export enum ResponsableSstDocumentType {
  DIPLOMA = 'DIPLOMA',
  FIFTY_HOUR_CERTIFICATE = 'FIFTY_HOUR_CERTIFICATE',
  TWENTY_HOUR_UPDATE_CERTIFICATE = 'TWENTY_HOUR_UPDATE_CERTIFICATE',
}

@Schema({ _id: false })
export class ResponsableSstStoredDocument {
  @Prop({ required: true, enum: Object.values(ResponsableSstDocumentType) })
  type!: ResponsableSstDocumentType;

  @Prop({ required: true })
  fileName!: string;

  @Prop({ required: true })
  fileUrl!: string;

  @Prop()
  detectedDate?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  uploadedBy?: Types.ObjectId;

  @Prop()
  uploadedAt?: Date;
}

@Schema({ _id: false })
export class ResponsableSstAuditEntry {
  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop()
  userEmail?: string;

  @Prop({ required: true })
  changedAt!: Date;

  @Prop({ required: true })
  field!: string;

  @Prop()
  oldValue?: string;

  @Prop()
  newValue?: string;

  @Prop()
  warning?: string;
}

@Schema({ _id: false })
export class ResponsableSstAlertEntry {
  @Prop({ required: true })
  type!: string;

  @Prop({ required: true })
  message!: string;

  @Prop({ required: true })
  severity!: string;

  @Prop({ required: true })
  dueAt!: Date;

  @Prop({ default: false })
  generated!: boolean;
}

@Schema({ timestamps: true })
export class PhvaAdvancedResponsableSst {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true, default: '1.1.1' })
  itemCode!: string;

  @Prop({ default: '' })
  fullName!: string;

  @Prop({ default: '' })
  documentNumber!: string;

  @Prop({ default: '' })
  position!: string;

  @Prop({ default: '' })
  profession!: string;

  @Prop({ default: '' })
  sstProfessionalType!: string;

  @Prop({ default: '' })
  sstLicenseNumber!: string;

  @Prop()
  licenseExpiresAt?: Date;

  @Prop()
  course50HoursDate?: Date;

  @Prop()
  course50HoursDetectedDate?: Date;

  @Prop()
  course20HoursDate?: Date;

  @Prop({ default: false })
  requires20HourUpdate!: boolean;

  @Prop({ type: [ResponsableSstStoredDocument], default: [] })
  documents!: ResponsableSstStoredDocument[];

  @Prop({ type: [ResponsableSstAlertEntry], default: [] })
  alerts!: ResponsableSstAlertEntry[];

  @Prop({ type: [ResponsableSstAuditEntry], default: [] })
  auditHistory!: ResponsableSstAuditEntry[];

  @Prop({ required: true, enum: Object.values(ResponsableSstComplianceStatus), default: ResponsableSstComplianceStatus.PENDING })
  complianceStatus!: ResponsableSstComplianceStatus;

  @Prop({ default: 'Pendiente por completar la gestión avanzada.' })
  complianceReason!: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;
}

export const PhvaAdvancedResponsableSstSchema = SchemaFactory.createForClass(PhvaAdvancedResponsableSst);
PhvaAdvancedResponsableSstSchema.index({ companyId: 1, itemCode: 1 }, { unique: true });
