import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CredentialValidationStatus, PhvaComplianceStatus } from '../enums/credential.enums';

export type CredentialValidationDocument = HydratedDocument<CredentialValidation>;

@Schema({ timestamps: true, collection: 'credential_validations' })
export class CredentialValidation {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true }) companyId!: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'ComplianceCredential', index: true }) credentialId!: Types.ObjectId;
  @Prop({ required: true, enum: Object.values(CredentialValidationStatus) }) status!: CredentialValidationStatus;
  @Prop({ required: true }) reason!: string;
  @Prop({ default: false }) requires20HourCourse!: boolean;
  @Prop({ default: false }) hasRequired20HourCourse!: boolean;
  @Prop({ default: false }) hasDocuments!: boolean;
  @Prop({ default: false }) hasActiveResponsible!: boolean;
  @Prop({ required: true, enum: Object.values(PhvaComplianceStatus), default: PhvaComplianceStatus.PENDING }) phvaComplianceStatus!: PhvaComplianceStatus;
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User' }) updatedBy?: Types.ObjectId;
}

export const CredentialValidationSchema = SchemaFactory.createForClass(CredentialValidation);
CredentialValidationSchema.index({ companyId: 1, credentialId: 1, createdAt: -1 });
