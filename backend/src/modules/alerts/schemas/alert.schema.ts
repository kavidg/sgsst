import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AlertDocument = HydratedDocument<Alert>;

export enum AlertSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Alert {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  type!: string;

  @Prop({ required: true })
  message!: string;

  @Prop({ required: true, enum: Object.values(AlertSeverity) })
  severity!: AlertSeverity;

  @Prop({ default: false })
  isRead!: boolean;

  // --- Approval notification fields ---
  @Prop({ type: Types.ObjectId, ref: 'User' })
  targetUserId?: Types.ObjectId;

  @Prop()
  actionUrl?: string;

  @Prop()
  moduleCode?: string;

  @Prop()
  moduleName?: string;

  @Prop()
  submittedBy?: string;

  @Prop()
  submittedAt?: Date;

  @Prop()
  documentId?: string;

  createdAt!: Date;
}

export const AlertSchema = SchemaFactory.createForClass(Alert);
AlertSchema.index({ companyId: 1, createdAt: -1 });
AlertSchema.index({ companyId: 1, targetUserId: 1 });
AlertSchema.index({ companyId: 1, type: 1, message: 1 }, { unique: true });
