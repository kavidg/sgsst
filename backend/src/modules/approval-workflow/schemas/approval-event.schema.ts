import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ApprovalStatus } from '../enums/approval-status.enum';

export type ApprovalEventDocument = HydratedDocument<ApprovalEvent>;

/**
 * Evento de historial append-only del Approval Workflow Core.
 *
 * Fase 0: se registra cada transición de estado; los eventos son inmutables
 * (no se actualizan ni eliminan).
 */
@Schema({ timestamps: true })
export class ApprovalEvent {
  @Prop({ required: true, type: Types.ObjectId, ref: 'ApprovalRequest', index: true })
  requestId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  action!: string;

  @Prop({ type: Object, required: true })
  actor!: {
    userId: string;
    firebaseUid?: string;
    email: string;
    name?: string;
    role: string;
    timestamp: Date;
  };

  @Prop({ required: true, enum: Object.values(ApprovalStatus) })
  previousStatus!: ApprovalStatus;

  @Prop({ required: true, enum: Object.values(ApprovalStatus) })
  newStatus!: ApprovalStatus;

  @Prop()
  reason?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  /** Timestamps de Mongoose (timestamps: true). */
  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const ApprovalEventSchema = SchemaFactory.createForClass(ApprovalEvent);

ApprovalEventSchema.index({ requestId: 1, createdAt: 1 });
ApprovalEventSchema.index({ companyId: 1, createdAt: -1 });
