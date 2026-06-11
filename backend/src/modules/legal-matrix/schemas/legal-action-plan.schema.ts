import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LegalActionPlanDocument = HydratedDocument<LegalActionPlan>;

export type ActionPlanStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

@Schema({ timestamps: true })
export class LegalActionPlan {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'LegalRequirement', index: true })
  requirementId!: Types.ObjectId;

  @Prop({ required: true })
  title!: string;

  @Prop()
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  responsibleUser?: Types.ObjectId;

  @Prop()
  dueDate?: Date;

  @Prop({ required: true, enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], default: 'PENDING' })
  status!: ActionPlanStatus;

  @Prop({ type: Types.ObjectId, ref: 'PlanActivity' })
  linkedActivityId?: Types.ObjectId;

  @Prop()
  activityTitle?: string;

  @Prop({ default: false })
  syncedToAnnualPlan!: boolean;

  @Prop()
  syncedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop()
  completedAt?: Date;

  @Prop()
  completionNotes?: string;
}

export const LegalActionPlanSchema = SchemaFactory.createForClass(LegalActionPlan);

LegalActionPlanSchema.index({ companyId: 1, status: 1 });
LegalActionPlanSchema.index({ companyId: 1, requirementId: 1 });
LegalActionPlanSchema.index({ companyId: 1, responsibleUser: 1 });
