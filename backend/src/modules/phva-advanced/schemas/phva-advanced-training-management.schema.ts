import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  Approval,
  AuditEntry,
  ChecklistItem,
  EvaluationAttempt,
  Session,
  TrainingSignature,
} from './training-management.subschemas';

export type TrainingManagementDocument = HydratedDocument<TrainingManagement>;

@Schema({ timestamps: true, collection: 'phva_advanced_training_management' })
export class TrainingManagement {
  @Prop({ type: Types.ObjectId, required: true, index: true }) companyId!: Types.ObjectId;
  @Prop({ default: '1.2.1' }) itemCode!: string;
  @Prop({ default: new Date().getFullYear() }) year!: number;
  @Prop({ type: [Session], default: [] }) annualProgram!: Session[];
  @Prop({ type: [Session], default: [] }) inductions!: Session[];
  @Prop({ type: [Session], default: [] }) reinductions!: Session[];
  @Prop({ type: [ChecklistItem], default: [] }) checklistTemplate!: ChecklistItem[];
  @Prop({ type: [EvaluationAttempt], default: [] }) evaluationAttempts!: EvaluationAttempt[];
  @Prop({ type: [TrainingSignature], default: [] }) signatures!: TrainingSignature[];
  @Prop({ type: [String], default: [] }) certificates!: string[];
  @Prop({ type: [String], default: [] }) evidenceFiles!: string[];
  @Prop({ type: [Session], default: [] }) trainings!: Session[];
  @Prop({ type: [String], default: [] }) attendanceEvidence!: string[];
  @Prop({ type: [String], default: [] }) signatureEvidence!: string[];
  @Prop({ type: [String], default: [] }) alerts!: string[];
  @Prop({ type: [AuditEntry], default: [] }) history!: AuditEntry[];
  @Prop({ type: Approval, default: { version: 1, status: 'PENDING' } }) approval!: Approval;
  @Prop({ default: 'PENDING' }) complianceStatus!: 'COMPLIES'|'PENDING'|'NON_COMPLIANT';
  @Prop({ default: 'Pendiente gestión avanzada de capacitación SST.' }) complianceReason!: string;
}

export const TrainingManagementSchema = SchemaFactory.createForClass(TrainingManagement);
