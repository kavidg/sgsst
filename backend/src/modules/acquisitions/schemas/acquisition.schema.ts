import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ApprovalStatus } from '../../approval-workflow/enums/approval-status.enum';

export type AcquisitionDocument = HydratedDocument<Acquisition>;

export enum AcquisitionPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum AcquisitionStatus {
  DRAFT = 'DRAFT',
  REQUESTED = 'REQUESTED',
  IN_REVIEW = 'IN_REVIEW',
  SUPPLIER_SELECTED = 'SUPPLIER_SELECTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Schema({ timestamps: true })
export class Acquisition {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  requestNumber!: string;

  @Prop({ required: true })
  title!: string;

  @Prop()
  description?: string;

  @Prop()
  requestingArea?: string;

  @Prop()
  requestedBy?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  responsibleUser?: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(AcquisitionPriority), default: AcquisitionPriority.MEDIUM })
  priority!: AcquisitionPriority;

  @Prop({ required: true, enum: Object.values(AcquisitionStatus), default: AcquisitionStatus.DRAFT })
  status!: AcquisitionStatus;

  @Prop({ type: Types.ObjectId, ref: 'Supplier' })
  supplierId?: Types.ObjectId;

  @Prop()
  sstCriteria?: string;

  @Prop()
  observations?: string;

  @Prop()
  requestedAt?: Date;

  @Prop()
  requiredDate?: Date;

  @Prop()
  completedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop()
  createdByName?: string;

  // ── Approval Workflow Core (FASE 1) ──
  /** Estado de aprobación administrativa (canónico del Approval Workflow). */
  @Prop({ enum: Object.values(ApprovalStatus), default: undefined })
  approvalStatus?: ApprovalStatus;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AcquisitionSchema = SchemaFactory.createForClass(Acquisition);
AcquisitionSchema.index({ companyId: 1, requestNumber: 1 }, { unique: true });
AcquisitionSchema.index({ companyId: 1, status: 1 });
AcquisitionSchema.index({ companyId: 1, supplierId: 1 });
AcquisitionSchema.index({ companyId: 1, approvalStatus: 1 }, { sparse: true });
