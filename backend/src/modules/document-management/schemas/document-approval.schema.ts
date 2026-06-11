import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DocumentApprovalDocument = HydratedDocument<DocumentApproval>;

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Schema({ timestamps: true })
export class DocumentApproval {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'DocumentMaster', index: true })
  documentId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  requestedBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  approvedBy?: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(ApprovalStatus), default: ApprovalStatus.PENDING })
  status!: ApprovalStatus;

  @Prop()
  comments?: string;

  @Prop()
  rejectionReason?: string;

  @Prop()
  approvedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'DocumentMaster' })
  newDocumentId?: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const DocumentApprovalSchema = SchemaFactory.createForClass(DocumentApproval);

DocumentApprovalSchema.index({ companyId: 1, documentId: 1, status: 1 });
DocumentApprovalSchema.index({ companyId: 1, status: 1, createdAt: -1 });
