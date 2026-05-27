import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TrainingManagementDocument = HydratedDocument<TrainingManagement>;

@Schema({ _id: false })
class AuditEntry { @Prop({ required: true }) action!: string; @Prop({ required: true }) createdBy!: string; @Prop({ default: Date.now }) createdAt!: Date; @Prop() details?: string; }
@Schema({ _id: false })
class Approval { @Prop() approvedBy?: string; @Prop() approvedAt?: Date; @Prop() comments?: string; @Prop({ default: 1 }) version!: number; @Prop({ default: 'PENDING' }) status!: 'PENDING'|'APPROVED'|'REJECTED'|'ADJUSTMENTS_REQUESTED'; }
@Schema({ _id: false })
class Session { @Prop({ required: true }) title!: string; @Prop() type?: string; @Prop() responsible?: string; @Prop() scheduledDate?: Date; @Prop() expirationDate?: Date; @Prop({ default: 'Pendiente' }) status!: string; @Prop({ type: [String], default: [] }) participants!: string[]; @Prop({ type: [String], default: [] }) evidences!: string[]; @Prop({ type: [String], default: [] }) multimedia!: string[]; @Prop() instructor?: string; @Prop() location?: string; @Prop() duration?: string; @Prop() evaluation?: string; @Prop() completionDate?: Date; }
@Schema({ _id: false })
class ChecklistItem { @Prop({ required: true }) key!: string; @Prop({ required: true }) label!: string; @Prop({ default: 'PENDING' }) status!: 'COMPLETED'|'PENDING'|'NOT_APPLICABLE'; }
@Schema({ _id: false })
class TrainingSignature { @Prop() signedBy?: string; @Prop() signedAt?: Date; @Prop() ipAddress?: string; @Prop() device?: string; @Prop() signatureUrl?: string; @Prop() scannedDocumentUrl?: string; }
@Schema({ _id: false })
class EvaluationAttempt { @Prop({ default: 1 }) attemptNumber!: number; @Prop({ default: 0 }) score!: number; @Prop({ default: false }) passed!: boolean; @Prop({ default: 0 }) completionPercentage!: number; @Prop({ default: Date.now }) attemptedAt!: Date; }

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
