import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CredentialOCRDataDocument = HydratedDocument<CredentialOCRData>;

@Schema({ timestamps: true, collection: 'credential_ocr_data' })
export class CredentialOCRData {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true }) companyId!: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'ComplianceCredential', index: true }) credentialId!: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'CredentialDocument', index: true }) documentId!: Types.ObjectId;
  @Prop() extractedCourseDate?: Date;
  @Prop() extractedCertificateNumber?: string;
  @Prop() extractedTrainingEntity?: string;
  @Prop() rawText?: string;
  @Prop({ default: 'credential-ocr-adapter' }) engine!: string;
  @Prop({ default: 0 }) confidence!: number;
  @Prop() originalOCRDate?: Date;
  @Prop() modifiedDate?: Date;
  @Prop({ type: Types.ObjectId, ref: 'User' }) modifiedBy?: Types.ObjectId;
  @Prop() modifiedAt?: Date;
  @Prop({ default: false }) hasManualDateModification!: boolean;
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User' }) updatedBy?: Types.ObjectId;
}

export const CredentialOCRDataSchema = SchemaFactory.createForClass(CredentialOCRData);
CredentialOCRDataSchema.index({ companyId: 1, credentialId: 1, documentId: 1 });
