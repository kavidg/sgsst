import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CredentialCourseType, CredentialStatus, CredentialValidationStatus, PhvaComplianceStatus } from '../enums/credential.enums';

export type ComplianceCredentialDocument = HydratedDocument<ComplianceCredential>;

@Schema({ timestamps: true, collection: 'compliance_credentials' })
export class ComplianceCredential {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true }) companyId!: Types.ObjectId;
  @Prop({ required: true, default: '1.2.3', index: true }) itemCode!: string;
  @Prop({ type: Types.ObjectId, ref: 'Employee', index: true }) responsibleUserId?: Types.ObjectId;
  @Prop({ required: true, enum: Object.values(CredentialCourseType), index: true }) courseType!: CredentialCourseType;
  @Prop({ default: '' }) trainingEntity!: string;
  @Prop({ default: '' }) certificateNumber!: string;
  @Prop() courseDate?: Date;
  @Prop() expirationDate?: Date;
  @Prop({ required: true, enum: Object.values(CredentialStatus), default: CredentialStatus.VIGENTE }) status!: CredentialStatus;
  @Prop({ default: '' }) comments!: string;
  @Prop({ default: false }) requires20HourCourse!: boolean;
  @Prop({ type: Types.ObjectId, ref: 'ComplianceCredential' }) relatedFiftyHourCredentialId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'ComplianceCredential' }) relatedTwentyHourCredentialId?: Types.ObjectId;
  @Prop({ required: true, enum: Object.values(CredentialValidationStatus), default: CredentialValidationStatus.INVALID }) validationStatus!: CredentialValidationStatus;
  @Prop({ required: true, enum: Object.values(PhvaComplianceStatus), default: PhvaComplianceStatus.PENDING }) phvaComplianceStatus!: PhvaComplianceStatus;
  @Prop({ default: 'Pendiente validación del curso SG-SST.' }) phvaComplianceReason!: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User' }) updatedBy?: Types.ObjectId;
}

export const ComplianceCredentialSchema = SchemaFactory.createForClass(ComplianceCredential);
ComplianceCredentialSchema.index({ companyId: 1, courseType: 1, responsibleUserId: 1 });
ComplianceCredentialSchema.index({ companyId: 1, expirationDate: 1 });
ComplianceCredentialSchema.index({ companyId: 1, certificateNumber: 1 }, { sparse: true });
