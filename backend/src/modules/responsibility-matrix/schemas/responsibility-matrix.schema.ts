import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ResponsibilityMatrixDocument = HydratedDocument<ResponsibilityMatrix>;

export enum MatrixComplianceStatus { COMPLIES = 'COMPLIES', PENDING = 'PENDING', NON_COMPLIANT = 'NON_COMPLIANT' }
export enum MatrixApprovalStatus { DRAFT = 'DRAFT', PENDING_APPROVAL = 'PENDING_APPROVAL', APPROVED = 'APPROVED', ARCHIVED = 'ARCHIVED' }
export enum ResponsibilityGroup {
  GERENCIA = 'GERENCIA',
  RESPONSABLE_SST = 'RESPONSABLE_SST',
  TRABAJADORES = 'TRABAJADORES',
  COPASST = 'COPASST',
  COMITE_CONVIVENCIA = 'COMITE_CONVIVENCIA',
  BRIGADA_EMERGENCIAS = 'BRIGADA_EMERGENCIAS',
}

@Schema({ _id: false })
export class ResponsibilityItem {
  @Prop({ required: true }) title!: string;
  @Prop({ default: '' }) description!: string;
  @Prop({ required: true, enum: Object.values(ResponsibilityGroup) }) group!: string;
  @Prop({ default: 0 }) order!: number;
  @Prop({ default: true }) active!: boolean;
  @Prop({ default: false }) mandatory!: boolean;
  @Prop({ default: 'PENDING' }) status!: string;
  @Prop({ type: Types.ObjectId, ref: 'Employee' }) assignedEmployeeId?: Types.ObjectId;
  @Prop() assignedEmployeeName?: string;
}

@Schema({ _id: false })
export class MatrixVersion {
  @Prop({ required: true }) version!: string;
  @Prop({ default: () => new Date() }) createdAt!: Date;
  @Prop() createdByEmail?: string;
  @Prop() approvedByEmail?: string;
  @Prop() approvedAt?: Date;
  @Prop({ default: 'DRAFT' }) status!: string;
  @Prop({ type: [{ type: Types.ObjectId, ref: 'ResponsibilityItem' }], default: [] }) items!: Types.ObjectId[];
}

@Schema({ _id: false })
export class MatrixAuditEntry {
  @Prop({ required: true }) action!: string;
  @Prop() userEmail?: string;
  @Prop({ default: () => new Date() }) createdAt!: Date;
  @Prop() field?: string;
  @Prop() oldValue?: string;
  @Prop() newValue?: string;
}

@Schema({ timestamps: true })
export class ResponsibilityMatrix {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' }) companyId!: Types.ObjectId;
  @Prop({ required: true, default: '1.1.2' }) itemCode!: string;
  @Prop({ type: [ResponsibilityItem], default: [] }) items!: ResponsibilityItem[];
  @Prop({ type: [MatrixVersion], default: [] }) versions!: MatrixVersion[];
  @Prop({ required: true, enum: Object.values(MatrixApprovalStatus), default: MatrixApprovalStatus.DRAFT }) approvalStatus!: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) approvedBy?: Types.ObjectId;
  @Prop() approvedByEmail?: string;
  @Prop() approvedAt?: Date;
  @Prop({ type: [MatrixAuditEntry], default: [] }) auditHistory!: MatrixAuditEntry[];
  @Prop({ required: true, enum: Object.values(MatrixComplianceStatus), default: MatrixComplianceStatus.PENDING }) complianceStatus!: string;
  @Prop({ default: 'Pendiente por completar la matriz de responsabilidades.' }) complianceReason!: string;
  @Prop({ default: 1 }) currentVersionNumber!: number;
  @Prop() lockedAt?: Date;
  @Prop({ type: Types.ObjectId, ref: 'User' }) lockedBy?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'SignatureCampaign' }) campaignId?: Types.ObjectId;
}

export const ResponsibilityMatrixSchema = SchemaFactory.createForClass(ResponsibilityMatrix);
ResponsibilityMatrixSchema.index({ companyId: 1, itemCode: 1 }, { unique: true });
