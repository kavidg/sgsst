import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PlanHistoryDocument = HydratedDocument<PlanHistory>;

@Schema({ timestamps: true })
export class PlanHistory {
  @Prop({ required: true })
  entityType!: string;

  @Prop({ required: true })
  entityId!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  userEmail!: string;

  @Prop({ required: true })
  action!: string;

  @Prop()
  previousValue?: string;

  @Prop()
  newValue?: string;

  @Prop({ required: true, default: Date.now })
  timestamp!: Date;
}

export const PlanHistorySchema = SchemaFactory.createForClass(PlanHistory);

PlanHistorySchema.index({ entityType: 1, entityId: 1 });
PlanHistorySchema.index({ timestamp: -1 });
