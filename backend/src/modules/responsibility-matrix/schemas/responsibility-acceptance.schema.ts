import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ResponsibilityAcceptanceDocument = HydratedDocument<ResponsibilityAcceptance>;

@Schema({ _id: false })
export class AcceptanceSignature {
  @Prop({ required: true }) signedBy!: string;
  @Prop({ required: true }) signedByEmail!: string;
  @Prop({ default: () => new Date() }) signedAt!: Date;
  @Prop() ipAddress?: string;
  @Prop() device?: string;
  @Prop({ required: true }) signatureHash!: string;
  @Prop() signatureUrl?: string;
}

@Schema({ _id: false })
export class AcceptanceReviewRequest {
  @Prop({ required: true }) type!: 'ACCEPTANCE' | 'CORRECTION';
  @Prop() comment?: string;
  @Prop({ default: () => new Date() }) requestedAt!: Date;
  @Prop() requestedBy?: string;
  @Prop() requestedByEmail?: string;
  @Prop({ default: 'PENDING' }) status!: string;
  @Prop() resolvedAt?: Date;
  @Prop() resolvedBy?: string;
}

@Schema({ _id: false })
export class AcceptanceHistoryEntry {
  @Prop({ required: true }) action!: string;
  @Prop() userEmail?: string;
  @Prop({ default: () => new Date() }) createdAt!: Date;
  @Prop() field?: string;
  @Prop() oldValue?: string;
  @Prop() newValue?: string;
}

@Schema({ timestamps: true })
export class ResponsibilityAcceptance {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' }) companyId!: Types.ObjectId;
  @Prop({ required: true }) matrixItemCode!: string;
  @Prop({ required: true }) matrixVersion!: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' }) userId!: Types.ObjectId;
  @Prop({ required: true }) userEmail!: string;
  @Prop({ required: true }) userName!: string;
  @Prop() userRole?: string;
  @Prop({ type: [Types.ObjectId], ref: 'ResponsibilityItem', default: [] }) assignedItemIds!: Types.ObjectId[];
  @Prop({ default: 'PENDING' }) acceptanceStatus!: string; // PENDING | REVIEWED | ACCEPTED | REJECTED | EXPIRED
  @Prop({ default: false }) hasRead!: boolean;
  @Prop() acceptedAt?: Date;
  @Prop() rejectedAt?: Date;
  @Prop() rejectedReason?: string;
  @Prop({ type: AcceptanceSignature }) signature?: AcceptanceSignature;
  @Prop({ type: [AcceptanceReviewRequest], default: [] }) reviewRequests!: AcceptanceReviewRequest[];
  @Prop({ type: Date }) renewalRequiredAt?: Date;
  @Prop({ type: Date }) lastRenewedAt?: Date;
  @Prop({ default: 1 }) currentCycle!: number;
  @Prop({ type: [AcceptanceHistoryEntry], default: [] }) auditHistory!: AcceptanceHistoryEntry[];
  @Prop({ type: [{ type: Types.ObjectId, ref: 'ResponsibilityMatrix' }] }) matrixId?: Types.ObjectId;
  @Prop({ default: false }) requiresRenewal!: boolean;
}

export const ResponsibilityAcceptanceSchema = SchemaFactory.createForClass(ResponsibilityAcceptance);
ResponsibilityAcceptanceSchema.index({ companyId: 1, userId: 1, matrixVersion: 1 }, { unique: true });
ResponsibilityAcceptanceSchema.index({ companyId: 1, acceptanceStatus: 1 });
