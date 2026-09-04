import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AcquisitionHistoryDocument = HydratedDocument<AcquisitionHistory>;

@Schema({ timestamps: true, collection: 'acquisition_history' })
export class AcquisitionHistory {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop()
  userEmail?: string;

  @Prop({ required: true })
  action!: string;

  @Prop({ required: true })
  entityType!: string;

  @Prop({ required: true })
  entityId!: string;

  @Prop({ type: Object })
  previousValue?: Record<string, unknown>;

  @Prop({ type: Object })
  newValue?: Record<string, unknown>;

  @Prop()
  description?: string;

  createdAt!: Date;
}

export const AcquisitionHistorySchema = SchemaFactory.createForClass(AcquisitionHistory);
AcquisitionHistorySchema.index({ companyId: 1, createdAt: -1 });
AcquisitionHistorySchema.index({ entityType: 1, entityId: 1 });
