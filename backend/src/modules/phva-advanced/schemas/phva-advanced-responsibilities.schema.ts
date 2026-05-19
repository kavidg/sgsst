import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PhvaAdvancedResponsibilitiesDocument = HydratedDocument<PhvaAdvancedResponsibilities>;

export enum ResponsibilitiesComplianceStatus { COMPLIES='COMPLIES', PENDING='PENDING', NON_COMPLIANT='NON_COMPLIANT' }

@Schema({ _id:false })
export class ResponsibilitySignatureRecord {
  @Prop({ default: false }) accepted!: boolean;
  @Prop() signatureImage?: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) signedBy?: Types.ObjectId;
  @Prop() signedAt?: Date;
  @Prop({ default: 1 }) version!: number;
  @Prop() pdfUrl?: string;
}

@Schema({ _id:false })
export class ResponsibilityAssignmentEntry {
  @Prop({ required: true }) title!: string;
  @Prop({ required: true }) category!: string;
  @Prop({ required: true }) role!: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) employeeId?: Types.ObjectId;
  @Prop({ default: true }) active!: boolean;
  @Prop({ default: false }) requiresSignature!: boolean;
  @Prop({ default: 'PENDING' }) status!: string;
  @Prop({ type: ResponsibilitySignatureRecord, default: () => ({}) }) signature!: ResponsibilitySignatureRecord;
}

@Schema({ _id:false })
export class ResponsibilitiesAuditEntry {
  @Prop({ type: Types.ObjectId, ref: 'User' }) userId?: Types.ObjectId;
  @Prop() userEmail?: string;
  @Prop({ required: true }) changedAt!: Date;
  @Prop({ required: true }) field!: string;
  @Prop() oldValue?: string;
  @Prop() newValue?: string;
}

@Schema({ timestamps:true })
export class PhvaAdvancedResponsibilities {
  @Prop({ required: true, type: Types.ObjectId, ref:'Company' }) companyId!: Types.ObjectId;
  @Prop({ required: true, default: '1.1.2' }) itemCode!: string;
  @Prop({ type:[ResponsibilityAssignmentEntry], default: [] }) responsibilities!: ResponsibilityAssignmentEntry[];
  @Prop({ type:[String], default: [] }) alerts!: string[];
  @Prop({ type:[ResponsibilitiesAuditEntry], default: [] }) auditHistory!: ResponsibilitiesAuditEntry[];
  @Prop({ required: true, enum: Object.values(ResponsibilitiesComplianceStatus), default: ResponsibilitiesComplianceStatus.PENDING }) complianceStatus!: ResponsibilitiesComplianceStatus;
  @Prop({ default: 'Pendiente por completar la gestión avanzada de responsabilidades.' }) complianceReason!: string;
  @Prop({ type: Types.ObjectId, ref:'User' }) updatedBy?: Types.ObjectId;
}

export const PhvaAdvancedResponsibilitiesSchema = SchemaFactory.createForClass(PhvaAdvancedResponsibilities);
PhvaAdvancedResponsibilitiesSchema.index({ companyId:1, itemCode:1 }, { unique:true });
