import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PhvaAdvancedResourceAssignmentDocument = HydratedDocument<PhvaAdvancedResourceAssignment>;

export enum ResourceAssignmentComplianceStatus {
  COMPLIES = 'COMPLIES',
  PENDING = 'PENDING',
  NON_COMPLIANT = 'NON_COMPLIANT',
}

@Schema({ _id: false })
export class ResourceEvidence {
  @Prop({ required: true })
  fileName!: string;

  @Prop({ required: true })
  fileUrl!: string;
}

@Schema({ _id: false })
export class FinancialResourceRow {
  @Prop({ required: true })
  concept!: string;
  @Prop({ default: '' })
  description!: string;
  @Prop({ default: 0 })
  value!: number;
  @Prop({ default: 'PENDIENTE' })
  status!: string;
  @Prop({ default: '' })
  responsible!: string;
  @Prop({ type: ResourceEvidence, required: false })
  evidence?: ResourceEvidence;
  @Prop({ required: false })
  date?: Date;
}

@Schema({ _id: false })
export class HumanResourceRow {
  @Prop({ required: true })
  employeeId!: string;
  @Prop({ required: true })
  role!: string;
  @Prop({ type: [String], default: [] })
  responsibilities!: string[];
  @Prop({ default: true })
  active!: boolean;
}

@Schema({ _id: false })
export class TechnicalResourceRow {
  @Prop({ required: true })
  name!: string;
  @Prop({ default: 'OPERATIVO' })
  status!: string;
  @Prop({ default: 1 })
  quantity!: number;
  @Prop({ default: '' })
  responsible!: string;
  @Prop({ required: false })
  maintenanceDate?: Date;
  @Prop({ type: ResourceEvidence, required: false })
  evidence?: ResourceEvidence;
}

@Schema({ _id: false })
export class TimeActivityRow {
  @Prop({ required: true })
  name!: string;
  @Prop({ default: 'Mensual' })
  frequency!: string;
  @Prop({ type: [String], default: [] })
  assignedUsers!: string[];
  @Prop({ default: 0 })
  plannedHours!: number;
  @Prop({ default: 'PENDIENTE' })
  completionStatus!: string;
}

@Schema({ _id: false })
export class ManagerApproval {
  @Prop({ default: false })
  approved!: boolean;
  @Prop()
  signatureImage?: string;
  @Prop()
  signedAt?: Date;
  @Prop()
  signedBy?: string;
  @Prop({ default: 1 })
  version!: number;
  @Prop()
  pdfUrl?: string;
}

@Schema({ _id: false })
export class ResourceAuditEntry {
  @Prop({ required: true })
  field!: string;
  @Prop()
  oldValue?: string;
  @Prop()
  newValue?: string;
  @Prop({ required: true })
  user!: string;
  @Prop({ required: true })
  timestamp!: Date;
}

@Schema({ timestamps: true, collection: 'phva_advanced_resource_assignment' })
export class PhvaAdvancedResourceAssignment {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId!: Types.ObjectId;

  @Prop({ default: '1.1.3', index: true })
  itemCode!: string;

  @Prop({ type: [FinancialResourceRow], default: [] })
  financialResources!: FinancialResourceRow[];
  @Prop({ type: [HumanResourceRow], default: [] })
  humanResources!: HumanResourceRow[];
  @Prop({ type: [TechnicalResourceRow], default: [] })
  technicalResources!: TechnicalResourceRow[];
  @Prop({ type: [TimeActivityRow], default: [] })
  activities!: TimeActivityRow[];
  @Prop({ type: [ResourceEvidence], default: [] })
  evidences!: ResourceEvidence[];
  @Prop({ type: ManagerApproval, default: {} })
  approval!: ManagerApproval;
  @Prop({ type: [String], default: [] })
  alerts!: string[];
  @Prop({ type: [ResourceAuditEntry], default: [] })
  auditHistory!: ResourceAuditEntry[];
  @Prop({ enum: ResourceAssignmentComplianceStatus, default: ResourceAssignmentComplianceStatus.PENDING })
  complianceStatus!: ResourceAssignmentComplianceStatus;
  @Prop({ default: 'Pendiente completar recursos y aprobación gerencial.' })
  complianceReason!: string;
}

export const PhvaAdvancedResourceAssignmentSchema = SchemaFactory.createForClass(PhvaAdvancedResourceAssignment);
