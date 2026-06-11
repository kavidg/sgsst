import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type LegalHistoryDocument = HydratedDocument<LegalHistory>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class LegalHistory {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  userEmail!: string;

  @Prop()
  userName?: string;

  @Prop({ required: true })
  action!: string;

  @Prop({ required: true })
  entityType!: string;

  @Prop({ required: true })
  entityId!: string;

  @Prop({ type: Types.ObjectId, ref: 'LegalRequirement' })
  requirementId?: Types.ObjectId;

  @Prop()
  description?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  previousValue?: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  newValue?: Record<string, unknown>;

  createdAt!: Date;
}

export const LegalHistorySchema = SchemaFactory.createForClass(LegalHistory);

LegalHistorySchema.index({ companyId: 1, createdAt: -1 });
LegalHistorySchema.index({ companyId: 1, entityType: 1, entityId: 1 });
LegalHistorySchema.index({ companyId: 1, requirementId: 1 });
