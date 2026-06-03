import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SstObjectivesDocument = HydratedDocument<SstObjectives>;

export enum SstObjectiveMeasurementMethod {
  MANUAL = 'MANUAL',
  AUTOMATIC = 'AUTOMATIC',
  ACTIVITY_BASED = 'ACTIVITY_BASED',
}

export enum SstObjectiveStatus {
  NOT_STARTED = 'Not Started',
  IN_PROGRESS = 'In Progress',
  COMPLETED = 'Completed',
  DELAYED = 'Delayed',
  CANCELLED = 'Cancelled',
}

export enum SstObjectiveActivityStatus {
  PENDING = 'Pending',
  IN_PROGRESS = 'In Progress',
  COMPLETED = 'Completed',
  DELAYED = 'Delayed',
  CANCELLED = 'Cancelled',
}

export enum SstObjectiveTaskPriority {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  CRITICAL = 'Critical',
}

export enum SstObjectiveAutomaticSource {
  MANUAL = 'MANUAL',
  TRAININGS = 'TRAININGS',
  INSPECTIONS = 'INSPECTIONS',
  EMPLOYEES = 'EMPLOYEES',
  INCIDENTS = 'INCIDENTS',
}


@Schema({ _id: false })
export class SstObjectiveEvidence {
  @Prop({ required: true, default: () => new Types.ObjectId().toString() })
  evidenceId!: string;

  @Prop({ required: true })
  fileName!: string;

  @Prop()
  fileUrl?: string;

  @Prop({ required: true })
  fileType!: string;

  @Prop()
  uploadedBy?: string;

  @Prop({ required: true, default: Date.now })
  uploadedAt!: Date;
}

export const SstObjectiveEvidenceSchema = SchemaFactory.createForClass(SstObjectiveEvidence);

@Schema({ _id: false })
export class SstObjectiveSubtask {
  @Prop({ required: true, default: () => new Types.ObjectId().toString() })
  subtaskId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop()
  description?: string;

  @Prop({ required: true, enum: Object.values(SstObjectiveActivityStatus), default: SstObjectiveActivityStatus.PENDING })
  status!: SstObjectiveActivityStatus;

  @Prop({ required: true, default: 0 })
  progress!: number;
}

export const SstObjectiveSubtaskSchema = SchemaFactory.createForClass(SstObjectiveSubtask);

@Schema({ _id: false })
export class SstObjectiveDelayJustification {
  @Prop({ required: true, default: () => new Types.ObjectId().toString() })
  justificationId!: string;

  @Prop({ required: true })
  reason!: string;

  @Prop()
  comments?: string;

  @Prop()
  userId?: string;

  @Prop()
  userEmail?: string;

  @Prop({ required: true, default: Date.now })
  date!: Date;
}

export const SstObjectiveDelayJustificationSchema = SchemaFactory.createForClass(SstObjectiveDelayJustification);

@Schema({ _id: false })
export class SstObjectiveRescheduleRequest {
  @Prop({ required: true, default: () => new Types.ObjectId().toString() })
  requestId!: string;

  @Prop({ required: true })
  newDueDate!: Date;

  @Prop({ required: true })
  correctiveAction!: string;

  @Prop()
  comments?: string;

  @Prop({ required: true, default: 'Pending Manager Approval' })
  status!: string;

  @Prop()
  managerComments?: string;

  @Prop()
  reviewedBy?: string;

  @Prop()
  reviewedAt?: Date;
}

export const SstObjectiveRescheduleRequestSchema = SchemaFactory.createForClass(SstObjectiveRescheduleRequest);

@Schema({ _id: false })
export class SstObjectiveTask {
  @Prop({ required: true, default: () => new Types.ObjectId().toString() })
  taskId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop()
  description?: string;

  @Prop()
  relatedObjective?: string;

  @Prop()
  relatedActivity?: string;

  @Prop({ required: true })
  responsibleUser!: string;

  @Prop({ required: true, default: Date.now })
  assignmentDate!: Date;

  @Prop({ required: true })
  dueDate!: Date;

  @Prop({ required: true, enum: Object.values(SstObjectiveTaskPriority), default: SstObjectiveTaskPriority.MEDIUM })
  priority!: SstObjectiveTaskPriority;

  @Prop({ default: 0 })
  estimatedCost?: number;

  @Prop()
  notes?: string;

  @Prop({ required: true, enum: Object.values(SstObjectiveActivityStatus), default: SstObjectiveActivityStatus.PENDING })
  status!: SstObjectiveActivityStatus;

  @Prop({ required: true, default: 0 })
  progress!: number;

  @Prop({ type: [SstObjectiveSubtaskSchema], default: [] })
  subtasks!: SstObjectiveSubtask[];

  @Prop({ type: [SstObjectiveEvidenceSchema], default: [] })
  evidence!: SstObjectiveEvidence[];

  @Prop({ type: [SstObjectiveDelayJustificationSchema], default: [] })
  justifications!: SstObjectiveDelayJustification[];

  @Prop({ type: [SstObjectiveRescheduleRequestSchema], default: [] })
  reschedules!: SstObjectiveRescheduleRequest[];

  @Prop()
  lastProgressAt?: Date;
}

export const SstObjectiveTaskSchema = SchemaFactory.createForClass(SstObjectiveTask);

@Schema({ _id: false })
export class SstObjectiveExecutionLog {
  @Prop({ required: true, default: () => new Types.ObjectId().toString() })
  logId!: string;

  @Prop()
  userId?: string;

  @Prop()
  userEmail?: string;

  @Prop({ required: true, default: Date.now })
  date!: Date;

  @Prop()
  progressNotes?: string;

  @Prop()
  achievements?: string;

  @Prop()
  difficulties?: string;

  @Prop()
  observations?: string;

  @Prop()
  nextActions?: string;
}

export const SstObjectiveExecutionLogSchema = SchemaFactory.createForClass(SstObjectiveExecutionLog);

@Schema({ _id: false })
export class SstObjectiveActivity {
  @Prop({ required: true, default: () => new Types.ObjectId().toString() })
  activityId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  responsible!: string;

  @Prop({ required: true })
  dueDate!: Date;

  @Prop({ required: true, enum: Object.values(SstObjectiveActivityStatus), default: SstObjectiveActivityStatus.PENDING })
  status!: SstObjectiveActivityStatus;

  @Prop()
  completedAt?: Date;

  @Prop({ type: [SstObjectiveTaskSchema], default: [] })
  tasks!: SstObjectiveTask[];
}

export const SstObjectiveActivitySchema = SchemaFactory.createForClass(SstObjectiveActivity);

@Schema({ _id: false })
export class SstObjectiveItem {
  @Prop({ required: true, default: () => new Types.ObjectId().toString() })
  objectiveId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  responsible!: string;

  @Prop({ required: true })
  dueDate!: Date;

  @Prop({ required: true, default: true })
  active!: boolean;

  @Prop({ required: true, enum: Object.values(SstObjectiveMeasurementMethod), default: SstObjectiveMeasurementMethod.MANUAL })
  measurementMethod!: SstObjectiveMeasurementMethod;

  @Prop({ required: true, enum: Object.values(SstObjectiveStatus), default: SstObjectiveStatus.NOT_STARTED })
  status!: SstObjectiveStatus;

  @Prop({ required: true, default: 0 })
  currentProgress!: number;

  @Prop({ required: true, default: 100 })
  targetProgress!: number;

  @Prop()
  indicator?: string;

  @Prop({ default: 0 })
  targetValue?: number;

  @Prop({ default: 0 })
  currentValue?: number;

  @Prop({ enum: Object.values(SstObjectiveAutomaticSource), default: SstObjectiveAutomaticSource.MANUAL })
  automaticSource?: SstObjectiveAutomaticSource;

  @Prop({ type: [SstObjectiveActivitySchema], default: [] })
  activities!: SstObjectiveActivity[];

  @Prop({ type: [SstObjectiveExecutionLogSchema], default: [] })
  executionLog!: SstObjectiveExecutionLog[];

  @Prop()
  lastUpdatedAt?: Date;
}

export const SstObjectiveItemSchema = SchemaFactory.createForClass(SstObjectiveItem);

@Schema({ _id: false })
export class SstObjectiveAlert {
  @Prop({ required: true })
  type!: string;

  @Prop({ required: true })
  objectiveId!: string;

  @Prop({ required: true })
  message!: string;

  @Prop({ required: true, type: [String], default: ['ADMIN', 'MANAGER'] })
  recipients!: string[];

  @Prop({ required: true })
  dueAt!: Date;

  @Prop({ default: false })
  generated!: boolean;
}

export const SstObjectiveAlertSchema = SchemaFactory.createForClass(SstObjectiveAlert);

@Schema({ _id: false })
export class SstObjectiveHistory {
  @Prop()
  userId?: string;

  @Prop()
  userEmail?: string;

  @Prop({ required: true })
  action!: string;

  @Prop({ required: true })
  objectiveId!: string;

  @Prop({ required: true })
  field!: string;

  @Prop({ required: true, default: Date.now })
  date!: Date;

  @Prop()
  previousValue?: string;

  @Prop()
  newValue?: string;
}

export const SstObjectiveHistorySchema = SchemaFactory.createForClass(SstObjectiveHistory);

@Schema({ timestamps: true })
export class SstObjectives {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true, default: '2.2.1' })
  itemCode!: string;

  @Prop({ type: [SstObjectiveItemSchema], default: [] })
  objectives!: SstObjectiveItem[];

  @Prop({ type: [SstObjectiveAlertSchema], default: [] })
  alerts!: SstObjectiveAlert[];

  @Prop({ type: [SstObjectiveHistorySchema], default: [] })
  history!: SstObjectiveHistory[];

  @Prop({ required: true, default: 'NON_COMPLIANT' })
  complianceStatus!: 'COMPLIES' | 'PENDING' | 'NON_COMPLIANT';

  @Prop({ default: 'No existen objetivos SST medibles con seguimiento documentado.' })
  complianceReason!: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;
}

export const SstObjectivesSchema = SchemaFactory.createForClass(SstObjectives);
SstObjectivesSchema.index({ companyId: 1, itemCode: 1 }, { unique: true });
