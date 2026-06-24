import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ImplementationWizardDoc = HydratedDocument<ImplementationWizard>;

export type StepId =
  | 'company_info' | 'users_roles' | 'responsible_sst' | 'course_50_hours'
  | 'sst_policy' | 'sst_objectives' | 'initial_evaluation' | 'annual_plan'
  | 'copasst' | 'convivencia_committee' | 'training' | 'communication'
  | 'legal_matrix' | 'document_management';

export type StepStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';

export interface StepValidation {
  stepId: StepId;
  status: StepStatus;
  score: number; // 0-100
  validatedAt?: string;
  details?: string;
}

export interface WizardHistoryEntry {
  userId: string;
  userEmail?: string;
  action: string;
  stepId?: StepId;
  previousStatus?: StepStatus;
  newStatus?: StepStatus;
  description?: string;
  timestamp: string;
}

@Schema({ timestamps: true })
export class ImplementationWizard {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', unique: true })
  companyId!: Types.ObjectId;

  @Prop({ default: 0, min: 0, max: 100 })
  overallScore!: number;

  @Prop({ default: 0, min: 0, max: 100 })
  completionPercentage!: number;

  @Prop({ type: [Object], default: [] })
  steps!: StepValidation[];

  @Prop({ default: false })
  isOnboardingComplete!: boolean;

  @Prop({ default: false })
  isImplementationComplete!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  certificateGeneratedBy?: Types.ObjectId;

  @Prop()
  certificateGeneratedAt?: string;

  @Prop()
  certificateVerificationCode?: string;

  @Prop({ type: [Object], default: [] })
  history!: WizardHistoryEntry[];

  @Prop()
  lastAutoValidationAt?: string;
}

export const ImplementationWizardSchema = SchemaFactory.createForClass(ImplementationWizard);
