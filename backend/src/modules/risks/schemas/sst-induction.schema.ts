import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SstInductionDocument = HydratedDocument<SstInduction>;

export enum InductionType {
  INDUCTION = 'INDUCTION',
  REINDUCTION = 'REINDUCTION',
}

export enum InductionStatus {
  COMPLETED = 'COMPLETED',
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  CANCELLED = 'CANCELLED',
}

@Schema({ timestamps: true })
export class SstInduction {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(InductionType), default: InductionType.INDUCTION })
  type!: InductionType;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Employee' })
  employee!: Types.ObjectId;

  @Prop({ required: true })
  date!: Date;

  @Prop({ required: true })
  responsible!: string;

  @Prop({ required: true })
  topics!: string;

  @Prop({ default: '' })
  observations!: string;

  @Prop({ required: true, enum: Object.values(InductionStatus), default: InductionStatus.PENDING })
  status!: InductionStatus;

  @Prop({ default: '' })
  evidenceUrl!: string;

  @Prop({ default: '' })
  certificateUrl!: string;
}

export const SstInductionSchema = SchemaFactory.createForClass(SstInduction);
SstInductionSchema.index({ companyId: 1, type: 1 });
SstInductionSchema.index({ companyId: 1, employee: 1 });
SstInductionSchema.index({ companyId: 1, status: 1 });
SstInductionSchema.index({ companyId: 1, date: -1 });
