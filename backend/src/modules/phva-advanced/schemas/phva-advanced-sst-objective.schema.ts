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
}

export enum SstObjectiveActivityStatus {
  PENDING = 'Pending',
  IN_PROGRESS = 'In Progress',
  COMPLETED = 'Completed',
}

export enum SstObjectiveAutomaticSource {
  MANUAL = 'MANUAL',
  TRAININGS = 'TRAININGS',
  INSPECTIONS = 'INSPECTIONS',
  EMPLOYEES = 'EMPLOYEES',
  INCIDENTS = 'INCIDENTS',
}

@Schema({ _id: false })
export class SstObjectiveActivity {
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
