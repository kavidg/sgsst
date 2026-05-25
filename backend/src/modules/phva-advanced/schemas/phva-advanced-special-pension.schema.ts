import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum SpecialPensionComplianceStatus { COMPLIES = 'COMPLIES', PENDING = 'PENDING', NON_COMPLIANT = 'NON_COMPLIANT' }

@Schema({ _id: false })
export class SpecialPensionRecord {
  @Prop({ required: true }) employeeId!: string;
  @Prop({ default: '' }) employeeName!: string;
  @Prop({ default: '' }) position!: string;
  @Prop({ default: '' }) highRiskType!: string;
  @Prop({ default: false }) requiresSpecialContribution!: boolean;
  @Prop({ default: 'PENDING' }) contributionStatus!: string;
  @Prop() startDate?: Date;
  @Prop({ default: '' }) observations!: string;
  @Prop({ default: '' }) supportDocument!: string;
}

@Schema({ _id: false })
export class SpecialPensionDocument {
  @Prop({ required: true }) type!: string;
  @Prop({ required: true }) fileName!: string;
  @Prop({ required: true }) fileUrl!: string;
  @Prop({ default: Date.now }) uploadedAt!: Date;
}

@Schema({ timestamps: true, collection: 'phva_advanced_special_pension' })
export class SpecialPensionConfiguration {
  @Prop({ type: Types.ObjectId, required: true, index: true }) companyId!: Types.ObjectId;
  @Prop({ required: true, default: '1.1.5' }) itemCode!: string;
  @Prop({ default: false }) enabled!: boolean;
  @Prop({ type: [SpecialPensionRecord], default: [] }) records!: SpecialPensionRecord[];
  @Prop({ type: [SpecialPensionDocument], default: [] }) documents!: SpecialPensionDocument[];
  @Prop({ type: [String], default: [] }) alerts!: string[];
  @Prop({ type: [String], default: [] }) warnings!: string[];
  @Prop({ default: SpecialPensionComplianceStatus.PENDING }) complianceStatus!: SpecialPensionComplianceStatus;
  @Prop({ type: [Object], default: [] }) auditHistory!: Array<{ field: string; oldValue?: string; newValue?: string; user?: string; timestamp?: Date }>;
}

export type SpecialPensionConfigurationDocument = HydratedDocument<SpecialPensionConfiguration>;
export const SpecialPensionConfigurationSchema = SchemaFactory.createForClass(SpecialPensionConfiguration);
