import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type InitialEvaluationDocument = HydratedDocument<InitialEvaluation>;

export enum InitialEvaluationStatus {
  DRAFT = 'Borrador',
  IN_PROGRESS = 'En evaluación',
  PENDING_APPROVAL = 'Pendiente aprobación',
  APPROVED = 'Aprobada',
  ARCHIVED = 'Archivada',
}

export enum StandardEvaluationStatus {
  COMPLIES = 'Cumple',
  DOES_NOT_COMPLY = 'No Cumple',
  NOT_APPLICABLE = 'No Aplica',
}

export enum FindingSeverity {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  CRITICAL = 'Critical',
}

export enum WorkStatus {
  OPEN = 'Open',
  IN_PROGRESS = 'In Progress',
  CLOSED = 'Closed',
}

@Schema({ _id: false })
export class EvaluationStandard {
  @Prop({ required: true }) code!: string;
  @Prop({ required: true }) chapter!: string;
  @Prop({ required: true }) title!: string;
  @Prop({ required: true }) description!: string;
  @Prop({ required: true }) weight!: number;
  @Prop({ required: true, enum: Object.values(StandardEvaluationStatus), default: StandardEvaluationStatus.DOES_NOT_COMPLY }) status!: StandardEvaluationStatus;
  @Prop({ default: '' }) observations!: string;
  @Prop({ type: [String], default: [] }) evidence!: string[];
  @Prop({ type: [String], default: [] }) attachments!: string[];
  @Prop({ default: false }) autoEvaluated!: boolean;
  @Prop() autoSource?: string;
  @Prop() evaluatedAt?: Date;
  @Prop({ type: Types.ObjectId, ref: 'User' }) evaluatedBy?: Types.ObjectId;
}
export const EvaluationStandardSchema = SchemaFactory.createForClass(EvaluationStandard);

@Schema({ _id: false })
export class EvaluationGap {
  @Prop({ required: true }) code!: string;
  @Prop({ required: true }) chapter!: string;
  @Prop({ required: true }) title!: string;
  @Prop({ required: true }) status!: string;
  @Prop({ required: true }) recommendedAction!: string;
}
export const EvaluationGapSchema = SchemaFactory.createForClass(EvaluationGap);

@Schema({ _id: false })
export class EvaluationFinding {
  @Prop({ required: true, default: () => new Types.ObjectId().toString() }) id!: string;
  @Prop({ required: true }) title!: string;
  @Prop({ default: '' }) description!: string;
  @Prop({ required: true, enum: Object.values(FindingSeverity), default: FindingSeverity.MEDIUM }) severity!: FindingSeverity;
  @Prop({ default: '' }) responsible!: string;
  @Prop() dueDate?: Date;
  @Prop({ required: true, enum: Object.values(WorkStatus), default: WorkStatus.OPEN }) status!: WorkStatus;
  @Prop({ default: Date.now }) createdAt!: Date;
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy?: Types.ObjectId;
}
export const EvaluationFindingSchema = SchemaFactory.createForClass(EvaluationFinding);

@Schema({ _id: false })
export class EvaluationActionPlan {
  @Prop({ required: true, default: () => new Types.ObjectId().toString() }) id!: string;
  @Prop({ required: true }) source!: string;
  @Prop({ required: true }) title!: string;
  @Prop({ default: '' }) description!: string;
  @Prop({ default: '' }) responsible!: string;
  @Prop() dueDate?: Date;
  @Prop({ default: 0, min: 0, max: 100 }) manualProgress!: number;
  @Prop({ default: 0, min: 0, max: 100 }) automaticProgress!: number;
  @Prop({ default: 0, min: 0, max: 100 }) activityProgress!: number;
  @Prop({ default: 0, min: 0, max: 100 }) progress!: number;
  @Prop({ required: true, enum: Object.values(WorkStatus), default: WorkStatus.OPEN }) status!: WorkStatus;
  @Prop({ type: [String], default: [] }) evidence!: string[];
}
export const EvaluationActionPlanSchema = SchemaFactory.createForClass(EvaluationActionPlan);

@Schema({ _id: false })
export class EvaluationSignature {
  @Prop({ required: true }) signerRole!: string;
  @Prop({ required: true }) signerName!: string;
  @Prop({ required: true }) signerEmail!: string;
  @Prop({ required: true }) signatureHash!: string;
  @Prop({ required: true }) signedAt!: Date;
  @Prop({ default: '' }) signatureUrl!: string;
}
export const EvaluationSignatureSchema = SchemaFactory.createForClass(EvaluationSignature);

@Schema({ _id: false })
export class EvaluationApproval {
  @Prop({ required: true }) approvedBy!: Types.ObjectId;
  @Prop({ required: true }) approvedByEmail!: string;
  @Prop({ required: true }) approvedAt!: Date;
  @Prop({ required: true }) compliancePercentage!: number;
  @Prop({ default: '' }) comments!: string;
  @Prop({ type: EvaluationSignatureSchema, required: true }) signature!: EvaluationSignature;
  @Prop({ default: '' }) approvalDocumentUrl!: string;
}
export const EvaluationApprovalSchema = SchemaFactory.createForClass(EvaluationApproval);

@Schema({ _id: false })
export class EvaluationHistory {
  @Prop({ type: Types.ObjectId, ref: 'User' }) userId?: Types.ObjectId;
  @Prop() userEmail?: string;
  @Prop({ required: true }) date!: Date;
  @Prop({ required: true }) entity!: string;
  @Prop({ required: true }) field!: string;
  @Prop() previousValue?: string;
  @Prop() newValue?: string;
}
export const EvaluationHistorySchema = SchemaFactory.createForClass(EvaluationHistory);

@Schema({ timestamps: true })
export class InitialEvaluation {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true }) companyId!: Types.ObjectId;
  @Prop({ required: true, default: 'Evaluación Inicial SG-SST' }) name!: string;
  @Prop({ required: true, default: Date.now }) evaluationDate!: Date;
  @Prop({ default: '' }) responsibleSst!: string;
  @Prop({ required: true, enum: Object.values(InitialEvaluationStatus), default: InitialEvaluationStatus.DRAFT }) status!: InitialEvaluationStatus;
  @Prop({ default: 0 }) overallCompliance!: number;
  @Prop({ default: 0 }) totalStandardsEvaluated!: number;
  @Prop({ type: [EvaluationStandardSchema], default: [] }) standards!: EvaluationStandard[];
  @Prop({ type: [EvaluationGapSchema], default: [] }) gaps!: EvaluationGap[];
  @Prop({ type: [EvaluationFindingSchema], default: [] }) findings!: EvaluationFinding[];
  @Prop({ type: [EvaluationActionPlanSchema], default: [] }) actionPlan!: EvaluationActionPlan[];
  @Prop({ type: EvaluationApprovalSchema }) approval?: EvaluationApproval;
  @Prop({ type: [EvaluationSignatureSchema], default: [] }) signatures!: EvaluationSignature[];
  @Prop({ type: [EvaluationHistorySchema], default: [] }) history!: EvaluationHistory[];
  @Prop() nextReassessmentAt?: Date;
  @Prop({ default: false }) archived!: boolean;
}

export const InitialEvaluationSchema = SchemaFactory.createForClass(InitialEvaluation);
InitialEvaluationSchema.index({ companyId: 1, archived: 1 });
