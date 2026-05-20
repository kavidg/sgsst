import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum ArlAffiliationStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  PENDING = 'PENDING',
}

export enum ArlComplianceStatus {
  COMPLIES = 'COMPLIES',
  PENDING = 'PENDING',
  NON_COMPLIANT = 'NON_COMPLIANT',
}

@Schema({ _id: false })
export class ArlEmployeeAffiliation {
  @Prop({ required: true }) employeeId!: string;
  @Prop({ required: true }) employeeName!: string;
  @Prop({ default: '' }) document!: string;
  @Prop({ default: '' }) position!: string;
  @Prop({ default: '' }) arlName!: string;
  @Prop({ default: '' }) riskClass!: string;
  @Prop({ enum: Object.values(ArlAffiliationStatus), default: ArlAffiliationStatus.PENDING }) affiliationStatus!: ArlAffiliationStatus;
  @Prop() affiliationDate?: Date;
  @Prop() retirementDate?: Date;
  @Prop({ default: false }) socialSecurityActive!: boolean;
  @Prop({ type: [String], default: [] }) evidences!: string[];
  @Prop({ default: '' }) workCenter!: string;
  @Prop({ default: '' }) contractType!: string;
}

@Schema({ _id: false })
export class CompanySocialSecurityDocument {
  @Prop({ required: true }) type!: string;
  @Prop({ required: true }) fileName!: string;
  @Prop({ required: true }) fileUrl!: string;
  @Prop() uploadedAt?: Date;
}

@Schema({ _id: false })
export class SocialSecurityPeriod {
  @Prop({ required: true }) period!: string;
  @Prop() paymentDate?: Date;
  @Prop({ default: 'PENDIENTE' }) status!: string;
  @Prop({ default: '' }) supportDocument!: string;
  @Prop({ default: '' }) observations!: string;
}

@Schema({ _id: false })
export class ArlAuditEntry {
  @Prop({ required: true }) field!: string;
  @Prop({ default: '' }) oldValue!: string;
  @Prop({ default: '' }) newValue!: string;
  @Prop({ default: '' }) user!: string;
  @Prop({ default: Date.now }) timestamp!: Date;
}

@Schema({ timestamps: true, collection: 'phva_advanced_arl_affiliations' })
export class PhvaAdvancedArlAffiliations {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true }) companyId!: Types.ObjectId;
  @Prop({ required: true, default: '1.1.4', index: true }) itemCode!: string;
  @Prop({ type: [ArlEmployeeAffiliation], default: [] }) employees!: ArlEmployeeAffiliation[];
  @Prop({ type: [CompanySocialSecurityDocument], default: [] }) companyDocuments!: CompanySocialSecurityDocument[];
  @Prop({ type: [SocialSecurityPeriod], default: [] }) socialSecurityPeriods!: SocialSecurityPeriod[];
  @Prop({ type: [String], default: [] }) alerts!: string[];
  @Prop({ type: [ArlAuditEntry], default: [] }) auditHistory!: ArlAuditEntry[];
  @Prop({ enum: Object.values(ArlComplianceStatus), default: ArlComplianceStatus.PENDING }) complianceStatus!: ArlComplianceStatus;
}

export type PhvaAdvancedArlAffiliationsDocument = HydratedDocument<PhvaAdvancedArlAffiliations>;
export const PhvaAdvancedArlAffiliationsSchema = SchemaFactory.createForClass(PhvaAdvancedArlAffiliations);
PhvaAdvancedArlAffiliationsSchema.index({ companyId: 1, itemCode: 1 }, { unique: true });
