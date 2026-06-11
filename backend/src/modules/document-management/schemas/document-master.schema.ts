import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DocumentMasterDocument = HydratedDocument<DocumentMaster>;

export enum DocumentType {
  POLICY = 'POLICY',
  PROCEDURE = 'PROCEDURE',
  MANUAL = 'MANUAL',
  FORMAT = 'FORMAT',
  RECORD = 'RECORD',
  MEETING_MINUTES = 'MEETING_MINUTES',
  TRAINING_RECORD = 'TRAINING_RECORD',
  AUDIT = 'AUDIT',
  INSPECTION = 'INSPECTION',
  EMERGENCY_PLAN = 'EMERGENCY_PLAN',
  COPASST = 'COPASST',
  COMMITTEE = 'COMMITTEE',
  LEGAL_DOCUMENT = 'LEGAL_DOCUMENT',
  MEDICAL_RECORD = 'MEDICAL_RECORD',
  CONTRACTOR_RECORD = 'CONTRACTOR_RECORD',
  OTHER = 'OTHER',
}

export enum DocumentStatus {
  DRAFT = 'DRAFT',
  UNDER_REVIEW = 'UNDER_REVIEW',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  ACTIVE = 'ACTIVE',
  OBSOLETE = 'OBSOLETE',
  ARCHIVED = 'ARCHIVED',
}

@Schema({ timestamps: true })
export class DocumentMaster {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  code!: string;

  @Prop({ required: true })
  name!: string;

  @Prop()
  description?: string;

  @Prop({ required: true, enum: Object.values(DocumentType) })
  documentType!: DocumentType;

  @Prop()
  process?: string;

  @Prop({ default: 1 })
  version!: number;

  @Prop({ required: true, enum: Object.values(DocumentStatus), default: DocumentStatus.DRAFT })
  status!: DocumentStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  ownerUser?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  approvalUser?: Types.ObjectId;

  @Prop()
  approvalDate?: Date;

  @Prop()
  expirationDate?: Date;

  @Prop({ default: true })
  isActive!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const DocumentMasterSchema = SchemaFactory.createForClass(DocumentMaster);

DocumentMasterSchema.index({ companyId: 1, code: 1 }, { unique: true });
DocumentMasterSchema.index({ companyId: 1, documentType: 1 });
DocumentMasterSchema.index({ companyId: 1, status: 1 });
DocumentMasterSchema.index({ companyId: 1, expirationDate: 1 });
DocumentMasterSchema.index({ name: 'text', code: 'text', description: 'text' });
