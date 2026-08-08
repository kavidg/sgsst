import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ComplianceLevel } from '../../compliance-engine/enums/compliance-level.enum';

export type ComplianceTimelineDocument = HydratedDocument<ComplianceTimeline>;

/**
 * Cumplimiento porcentual por etapa PHVA dentro de un snapshot.
 */
@Schema({ _id: false })
export class PhaseComplianceSnapshot {
  @Prop({ required: true, min: 0, max: 100 })
  plan!: number;

  @Prop({ required: true, min: 0, max: 100 })
  do!: number;

  @Prop({ required: true, min: 0, max: 100 })
  check!: number;

  @Prop({ required: true, min: 0, max: 100 })
  act!: number;
}

export const PhaseComplianceSnapshotSchema =
  SchemaFactory.createForClass(PhaseComplianceSnapshot);

/**
 * Cumplimiento de un módulo fuente del SG-SST dentro de un snapshot.
 */
@Schema({ _id: false })
export class ModuleComplianceSnapshot {
  @Prop({ required: true })
  module!: string;

  @Prop({ required: true, min: 0, max: 100 })
  compliance!: number;

  @Prop({ required: true, enum: Object.values(ComplianceLevel) })
  level!: ComplianceLevel;

  @Prop()
  lastUpdated!: Date;
}

export const ModuleComplianceSnapshotSchema =
  SchemaFactory.createForClass(ModuleComplianceSnapshot);

/**
 * Snapshot histórico del cumplimiento SG-SST de una empresa.
 *
 * Se genera a partir del ComplianceEngine y nunca calcula indicadores:
 * únicamente almacena la evolución diaria del cumplimiento.
 */
@Schema({ timestamps: true })
export class ComplianceTimeline {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  snapshotDate!: Date;

  @Prop({ required: true, min: 0, max: 100 })
  overallCompliance!: number;

  @Prop({ required: true, type: PhaseComplianceSnapshotSchema })
  phaseCompliance!: PhaseComplianceSnapshot;

  @Prop({ required: true, type: [ModuleComplianceSnapshotSchema] })
  moduleCompliance!: ModuleComplianceSnapshot[];

  @Prop({ required: true, min: 0 })
  findingsCount!: number;

  @Prop({ required: true, min: 0 })
  criticalFindings!: number;

  @Prop({ required: true, min: 0 })
  pendingActivities!: number;

  @Prop({ required: true, min: 0 })
  completedActivities!: number;

  @Prop({ required: true, min: 0 })
  activeAlerts!: number;

  @Prop({ default: true })
  generatedAutomatically!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ComplianceTimelineSchema =
  SchemaFactory.createForClass(ComplianceTimeline);

// Un único snapshot por empresa y día.
ComplianceTimelineSchema.index({ companyId: 1, snapshotDate: 1 }, { unique: true });
// Lectura cronológica.
ComplianceTimelineSchema.index({ companyId: 1, snapshotDate: -1 });
