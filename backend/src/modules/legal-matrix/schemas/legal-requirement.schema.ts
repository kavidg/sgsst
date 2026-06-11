import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LegalRequirementDocument = HydratedDocument<LegalRequirement>;

export type RequirementComplianceStatus = 'CUMPLE' | 'PARCIAL' | 'NO_CUMPLE';
export type ReviewFrequency = 'DIARIA' | 'SEMANAL' | 'MENSUAL' | 'BIMESTRAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL' | 'UNICO';

export type LinkedModule =
  | 'SST_POLICY'
  | 'SST_OBJECTIVES'
  | 'INITIAL_EVALUATION'
  | 'ANNUAL_WORK_PLAN'
  | 'COPASST'
  | 'COMMITTEE'
  | 'TRAINING'
  | 'AUDITS'
  | 'EMERGENCY_PLANS';

@Schema({ timestamps: true })
export class LinkedModuleInfo {
  @Prop({ required: true, enum: ['SST_POLICY', 'SST_OBJECTIVES', 'INITIAL_EVALUATION', 'ANNUAL_WORK_PLAN', 'COPASST', 'COMMITTEE', 'TRAINING', 'AUDITS', 'EMERGENCY_PLANS'] })
  module!: LinkedModule;

  @Prop({ required: true })
  entityId!: string;

  @Prop()
  entityName?: string;

  @Prop({ default: false })
  isCompliant!: boolean;
}

export const LinkedModuleInfoSchema = SchemaFactory.createForClass(LinkedModuleInfo);

@Schema({ timestamps: true })
export class LegalRequirement {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  regulationCode!: string;

  @Prop({ required: true })
  regulationName!: string;

  @Prop()
  article?: string;

  @Prop({ required: true })
  requirement!: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  responsibleUser?: Types.ObjectId;

  @Prop({ required: true, enum: ['DIARIA', 'SEMANAL', 'MENSUAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'UNICO'], default: 'ANUAL' })
  reviewFrequency!: ReviewFrequency;

  @Prop({ required: true, enum: ['CUMPLE', 'PARCIAL', 'NO_CUMPLE'], default: 'NO_CUMPLE' })
  complianceStatus!: RequirementComplianceStatus;

  @Prop({ type: [LinkedModuleInfoSchema], default: [] })
  linkedModules!: LinkedModuleInfo[];

  @Prop()
  notes?: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop()
  lastReviewedAt?: Date;
}

export const LegalRequirementSchema = SchemaFactory.createForClass(LegalRequirement);

LegalRequirementSchema.index({ companyId: 1, regulationCode: 1 });
LegalRequirementSchema.index({ companyId: 1, complianceStatus: 1 });
LegalRequirementSchema.index({ companyId: 1, responsibleUser: 1 });
