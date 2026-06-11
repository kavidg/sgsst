import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AccountabilityReportDocument = HydratedDocument<AccountabilityReport>;

export enum ReportType {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  SEMIANNUAL = 'SEMIANNUAL',
  ANNUAL = 'ANNUAL',
}

export enum ReportStatus {
  DRAFT = 'DRAFT',
  GENERATED = 'GENERATED',
  SIGNED = 'SIGNED',
  ARCHIVED = 'ARCHIVED',
}

@Schema({ timestamps: true })
export class AccountabilityReport {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  reportNumber!: string;

  @Prop({ required: true, enum: Object.values(ReportType) })
  reportType!: ReportType;

  @Prop({ required: true })
  periodStart!: Date;

  @Prop({ required: true })
  periodEnd!: Date;

  @Prop({ required: true, enum: Object.values(ReportStatus), default: ReportStatus.DRAFT })
  status!: ReportStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  generatedBy!: Types.ObjectId;

  @Prop()
  executiveSummary!: string;

  @Prop()
  achievements!: string;

  @Prop()
  pendingActions!: string;

  @Prop()
  riskAreas!: string;

  @Prop()
  compliancePercentage!: number;

  @Prop()
  criticalFindings!: string;

  @Prop()
  recommendations!: string;

  @Prop()
  nextActions!: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  signedBy?: Types.ObjectId;

  @Prop()
  signedAt?: Date;

  @Prop()
  signatureHash?: string;

  @Prop()
  signatureUrl?: string;

  @Prop()
  documentId?: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], ref: 'User' })
  additionalSigners?: Types.ObjectId[];

  @Prop({ type: Map, of: String, default: {} })
  metadata?: Record<string, string>;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AccountabilityReportSchema = SchemaFactory.createForClass(AccountabilityReport);
AccountabilityReportSchema.index({ companyId: 1, reportNumber: 1 }, { unique: true });
AccountabilityReportSchema.index({ companyId: 1, reportType: 1, periodStart: -1 });
AccountabilityReportSchema.index({ companyId: 1, status: 1 });
