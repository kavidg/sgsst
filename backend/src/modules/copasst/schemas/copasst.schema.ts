import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CopasstPeriodDocument = HydratedDocument<CopasstPeriod>;

@Schema({ _id: false })
export class CopasstMember {
  @Prop({ type: Types.ObjectId, required: true }) userId!: Types.ObjectId;
  @Prop({ required: true }) userName!: string;
  @Prop({ enum: ['PRESIDENTE', 'SECRETARIO', 'PRINCIPAL', 'SUPLENTE'], required: true }) committeeRole!: string;
  @Prop({ enum: ['EMPLEADOR', 'TRABAJADOR'], required: true }) representationType!: string;
  @Prop({ enum: ['PRINCIPAL', 'SUPLENTE'], required: true }) principalType!: string;
  @Prop({ required: true }) startDate!: Date;
  @Prop({ required: true }) endDate!: Date;
  @Prop({ enum: ['ACTIVO', 'INACTIVO'], default: 'ACTIVO' }) status!: string;
}

@Schema({ _id: false })
export class CopasstDocument {
  @Prop({ required: true }) type!: string;
  @Prop({ required: true }) title!: string;
  @Prop({ required: true }) content!: string;
  @Prop() pdfUrl?: string;
  @Prop({ default: 1 }) version!: number;
  @Prop({ type: Date, default: Date.now }) generatedAt!: Date;
}

@Schema({ _id: false })
export class CopasstSignature {
  @Prop({ required: true }) documentType!: string;
  @Prop({ required: true }) documentVersion!: number;
  @Prop({ required: true }) signatureImage!: string;
  @Prop({ required: true }) signedBy!: string;
  @Prop({ required: true }) signedAt!: Date;
}

@Schema({ _id: false })
export class CopasstCandidate {
  @Prop({ required: true }) name!: string;
  @Prop({ required: true }) document!: string;
  @Prop({ required: true }) phone!: string;
  @Prop({ required: true }) area!: string;
  @Prop({ required: true }) position!: string;
  @Prop({ required: true }) motivation!: string;
  @Prop({ required: true }) accepted!: boolean;
  @Prop() photoUrl?: string;
  @Prop({ default: 0 }) votes!: number;
}

@Schema({ _id: false })
export class CopasstVote {
  @Prop({ required: true }) electionId!: string;
  @Prop({ required: true }) document!: string;
  @Prop({ required: true }) phone!: string;
  @Prop({ required: true }) candidateDocument!: string;
  @Prop({ required: true }) otpValidated!: boolean;
  @Prop({ required: true }) votedAt!: Date;
}

@Schema({ _id: false })
export class CopasstRegistrationCampaign {
  @Prop({ required: true }) openingDate!: Date;
  @Prop({ required: true }) closingDate!: Date;
  @Prop({ type: [String], default: [] }) includedDepartments!: string[];
  @Prop({ type: [String], default: [] }) requirements!: string[];
  @Prop({ required: true }) secureToken!: string;
  @Prop({ default: true }) isActive!: boolean;
  @Prop({ default: '' }) adminNotes!: string;
}

@Schema({ _id: false })
export class CopasstCandidateExtended {
  @Prop({ required: true }) name!: string;
  @Prop({ required: true }) document!: string;
  @Prop({ required: true }) phone!: string;
  @Prop({ required: true }) area!: string;
  @Prop({ required: true }) position!: string;
  @Prop({ required: true }) motivation!: string;
  @Prop({ default: false }) acceptedTerms!: boolean;
  @Prop({ default: '' }) email?: string;
  @Prop({ enum: ['PENDIENTE', 'APROBADO', 'RECHAZADO', 'INFO_REQUESTED'], default: 'PENDIENTE' }) adminStatus!: string;
  @Prop({ default: '' }) adminComment!: string;
  @Prop({ default: 0 }) votes!: number;
  @Prop() photoUrl?: string;
  @Prop() ipAddress?: string;
  @Prop() device?: string;
  @Prop({ type: Date }) registeredAt?: Date;
}

@Schema({ _id: false })
export class CopasstVoteExtended {
  @Prop({ required: true }) document!: string;
  @Prop({ required: true }) candidateDocument!: string;
  @Prop({ required: true }) otpValidated!: boolean;
  @Prop({ required: true }) votedAt!: Date;
  @Prop() ipAddress?: string;
  @Prop() device?: string;
  @Prop() token?: string;
}

@Schema({ _id: false })
export class CopasstMeetingExtended {
  @Prop({ required: true }) meetingDate!: Date;
  @Prop({ enum: ['PROGRAMADA', 'CANCELADA', 'CERRADA'], default: 'PROGRAMADA' }) status!: string;
  @Prop({ type: [String], default: [] }) attendees!: string[];
  @Prop({ default: '' }) agenda!: string;
  @Prop({ default: '' }) development!: string;
  @Prop({ type: [String], default: [] }) topicList!: string[];
  @Prop() minutesPdfUrl?: string;
  @Prop() attendanceEvidence?: string;
}

@Schema({ _id: false })
export class CopasstAuditHistory {
  @Prop({ required: true }) action!: string;
  @Prop({ required: true }) createdBy!: string;
  @Prop({ required: true }) createdAt!: Date;
  @Prop({ required: true }) data!: string;
}

@Schema({ timestamps: true, collection: 'copasst_periods' })
export class CopasstPeriod {
  @Prop({ type: Types.ObjectId, required: true, index: true }) companyId!: Types.ObjectId;
  @Prop({ required: true }) periodName!: string;
  @Prop({ required: true }) startDate!: Date;
  @Prop({ required: true }) endDate!: Date;
  @Prop({ enum: ['ACTIVO', 'PROXIMO_A_VENCER', 'VENCIDO', 'ARCHIVADO'], default: 'ACTIVO' }) status!: string;
  @Prop({ type: [CopasstMember], default: [] }) members!: CopasstMember[];
  @Prop({ type: [CopasstCandidate], default: [] }) candidates!: CopasstCandidate[];
  @Prop({ type: [CopasstVote], default: [] }) votes!: CopasstVote[];
  @Prop({ type: [CopasstMeetingExtended], default: [] }) meetings!: CopasstMeetingExtended[];
  @Prop({ type: [CopasstDocument], default: [] }) documents!: CopasstDocument[];
  @Prop({ type: [CopasstSignature], default: [] }) signatures!: CopasstSignature[];
  @Prop({ type: [CopasstAuditHistory], default: [] }) auditHistory!: CopasstAuditHistory[];
  @Prop({ type: [CopasstCandidateExtended], default: [] }) candidateExtended!: CopasstCandidateExtended[];
  @Prop({ type: [CopasstVoteExtended], default: [] }) votesExtended!: CopasstVoteExtended[];
  @Prop({ type: CopasstRegistrationCampaign }) registrationCampaign?: CopasstRegistrationCampaign;
  @Prop({ type: [Object], default: [] }) commitments!: Array<{
    _id?: Types.ObjectId;
    description: string;
    responsibleParty: string;
    deadline: Date;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED';
    meetingId?: string;
    evidenceUrl?: string;
    createdAt: Date;
    updatedAt?: Date;
    completedAt?: Date;
  }>;
  @Prop({ type: [Object], default: [] }) evidence!: Array<{
    _id?: Types.ObjectId;
    type: 'MINUTES' | 'ATTENDANCE' | 'PHOTO' | 'DOCUMENT' | 'PDF';
    title: string;
    fileName: string;
    fileUrl: string;
    uploadedBy: string;
    uploadedAt: Date;
    meetingId?: string;
  }>;
  // Approval workflow
  @Prop({ enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'APPROVED_AND_SIGNED', 'REJECTED', 'ARCHIVED'], default: 'DRAFT' }) approvalStatus!: string;
  @Prop({ default: false }) locked!: boolean;
  @Prop({ default: '' }) rejectionReason!: string;
  @Prop({ default: '1.0' }) currentVersion!: string;
  @Prop({ default: 'Manager' }) assignedReviewer!: string;
  @Prop() submittedAt?: Date;
  @Prop({ type: Object }) approvedBy?: { userId: string; email: string; role: string; timestamp: string };
  @Prop({ type: Object }) rejectedBy?: { userId: string; email: string; role: string; reason: string; timestamp: string };
  @Prop({ type: Types.ObjectId }) updatedBy?: Types.ObjectId;
  @Prop({ default: 0 }) totalEmployees!: number;
  // F7B-10.6-C — Estado electoral explícito y control temporal del flujo COPASST.
  // Responsabilidades SEPARADAS de CopasstPeriod.status (estado administrativo
  // del periodo): electionState controla el ciclo electoral (OTP, voto,
  // resultados, registro público). El estado efectivo se deriva de forma
  // determinista a partir de este valor + las fechas (nunca se escribe desde
  // un GET).
  @Prop({ enum: ['NOT_STARTED', 'OPEN', 'CLOSED'], default: 'NOT_STARTED' }) electionState!: string;
  /** Apertura de la ventana de votación (límite temporal, no requiere escritura). */
  @Prop() votingOpenAt?: Date;
  /** Cierre de la ventana de votación (límite temporal, no requiere escritura). */
  @Prop() votingClosedAt?: Date;
  @Prop({ default: true }) requiresCopasst!: boolean;
  @Prop({ default: '' }) constitutionMinutesPdfUrl!: string;

}

export const CopasstPeriodSchema = SchemaFactory.createForClass(CopasstPeriod);
