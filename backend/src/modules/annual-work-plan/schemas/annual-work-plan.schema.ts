import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AnnualWorkPlanDocument = HydratedDocument<AnnualWorkPlan>;

export enum AnnualWorkPlanStatus {
  DRAFT = 'Draft',
  ACTIVE = 'Active',
  COMPLETED = 'Completed',
  ARCHIVED = 'Archived',
}

@Schema({ _id: false })
export class PlanApproval {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  approvedBy!: Types.ObjectId;

  @Prop({ required: true })
  approvedByEmail!: string;

  @Prop({ required: true })
  approvedByName!: string;

  @Prop({ required: true })
  approvalDate!: Date;

  @Prop()
  signatureHash?: string;

  @Prop()
  signatureUrl?: string;

  @Prop()
  comments?: string;
}

export const PlanApprovalSchema = SchemaFactory.createForClass(PlanApproval);



@Schema({ timestamps: true })
export class AnnualWorkPlan {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  year!: number;

  @Prop({
    required: true,
    enum: Object.values(AnnualWorkPlanStatus),
    default: AnnualWorkPlanStatus.DRAFT,
  })
  status!: AnnualWorkPlanStatus;

  @Prop({ default: 0, min: 0, max: 100 })
  compliancePercentage!: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy!: Types.ObjectId;

  @Prop({ type: PlanApprovalSchema })
  approval?: PlanApproval;


}

export const AnnualWorkPlanSchema = SchemaFactory.createForClass(AnnualWorkPlan);

AnnualWorkPlanSchema.index({ companyId: 1, year: 1 }, { unique: true });
AnnualWorkPlanSchema.index({ companyId: 1, status: 1 });
