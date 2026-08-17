import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ConvivenciaPeriodDocument = HydratedDocument<ConvivenciaPeriod>;

/** Discriminador estable del estándar 1.1.8 (nunca editable). */
export const CONVIVENCIA_ITEM_CODE = '1.1.8';

/** Estado de cumplimiento del estándar 1.1.8 (dominio de cumplimiento, Fase 2). */
export type ConvivenciaComplianceStatus = 'COMPLIES' | 'PENDING' | 'NON_COMPLIANT';

@Schema({ _id: false })
export class ConvivenciaMember {
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
export class ConvivenciaCandidateExtended {
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
export class ConvivenciaVoteExtended {
  @Prop({ required: true }) document!: string;
  @Prop({ required: true }) candidateDocument!: string;
  @Prop({ required: true }) otpValidated!: boolean;
  @Prop({ required: true }) votedAt!: Date;
  @Prop() ipAddress?: string;
  @Prop() device?: string;
  @Prop() token?: string;
}

@Schema({ _id: false })
export class ConvivenciaRegistrationCampaign {
  @Prop({ required: true }) openingDate!: Date;
  @Prop({ required: true }) closingDate!: Date;
  @Prop({ type: [String], default: [] }) includedDepartments!: string[];
  @Prop({ type: [String], default: [] }) requirements!: string[];
  @Prop({ required: true }) secureToken!: string;
  @Prop({ default: true }) isActive!: boolean;
  @Prop({ default: '' }) adminNotes!: string;
}

@Schema({ _id: false })
export class ConvivenciaMeetingExtended {
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
export class ConvivenciaAuditHistory {
  @Prop({ required: true }) action!: string;
  @Prop({ required: true }) createdBy!: string;
  @Prop({ required: true }) createdAt!: Date;
  @Prop({ required: true }) data!: string;
}

@Schema({ _id: false })
export class ConvivenciaCase {
  @Prop({ required: true }) caseNumber!: string;
  @Prop({ default: false }) isAnonymous!: boolean;
  @Prop({ default: '' }) complainantName!: string;
  @Prop({ required: true }) respondentName!: string;
  @Prop({ required: true }) description!: string;
  @Prop({ type: [String], default: [] }) evidence!: string[];
  @Prop({ enum: ['PENDING', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED'], default: 'PENDING' }) status!: string;
  @Prop({ default: '' }) assignedCommitteeMember!: string;
  @Prop({ type: [Object], default: [] }) meetings!: Record<string, unknown>[];
  @Prop({ default: '' }) recommendations!: string;
  @Prop() closureDate?: Date;
  @Prop({ type: [ConvivenciaAuditHistory], default: [] }) caseAuditHistory!: ConvivenciaAuditHistory[];
}

@Schema({ timestamps: true, collection: 'convivencia_periods' })
export class ConvivenciaPeriod {
  @Prop({ type: Types.ObjectId, required: true, index: true }) companyId!: Types.ObjectId;
  @Prop({ required: true }) periodName!: string;
  @Prop({ required: true }) startDate!: Date;
  @Prop({ required: true }) endDate!: Date;
  @Prop({ enum: ['ACTIVO', 'PROXIMO_A_VENCER', 'VENCIDO', 'ARCHIVADO'], default: 'ACTIVO' }) status!: string;
  @Prop({ type: [ConvivenciaMember], default: [] }) members!: ConvivenciaMember[];
  @Prop({ type: [ConvivenciaMeetingExtended], default: [] }) meetings!: ConvivenciaMeetingExtended[];
  @Prop({ type: [ConvivenciaCandidateExtended], default: [] }) candidateExtended!: ConvivenciaCandidateExtended[];
  @Prop({ type: [ConvivenciaVoteExtended], default: [] }) votesExtended!: ConvivenciaVoteExtended[];
  /**
   * Estado persistido de la elección (F7B-3, 1.1.8): NOT_STARTED → OPEN → CLOSED.
   * Fuente de verdad: ConvivenciaService (initVoting abre, closeVoting cierra).
   */
  @Prop({ enum: ['NOT_STARTED', 'OPEN', 'CLOSED'], default: 'NOT_STARTED' }) electionState!: string;
  /** Inicio de la ventana de votación (fijado por initVoting al abrir). */
  @Prop() votingStartedAt?: Date;
  /** Cierre de la ventana de votación (fijado por closeVoting al cerrar). */
  @Prop() votingClosedAt?: Date;
  @Prop({ type: ConvivenciaRegistrationCampaign }) registrationCampaign?: ConvivenciaRegistrationCampaign;
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
  @Prop({ type: [ConvivenciaCase], default: [] }) cases!: ConvivenciaCase[];
  @Prop({ type: [ConvivenciaAuditHistory], default: [] }) auditHistory!: ConvivenciaAuditHistory[];
  // Approval workflow
  @Prop({ enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'APPROVED_AND_SIGNED', 'REJECTED', 'ARCHIVED'], default: 'DRAFT' }) approvalStatus!: string;
  @Prop({ default: false }) locked!: boolean;
  @Prop({ default: '' }) rejectionReason!: string;
  @Prop({ default: '1.0' }) currentVersion!: string;
  @Prop() submittedAt?: Date;
  @Prop({ type: Object }) approvedBy?: { userId: string; email: string; role: string; timestamp: string };
  @Prop({ type: Object }) rejectedBy?: { userId: string; email: string; role: string; reason: string; timestamp: string };
  @Prop({ default: '' }) constitutionMinutesPdfUrl!: string;
  @Prop({ default: 0 }) totalEmployees!: number;
  @Prop({ default: true }) requiresConvivencia!: boolean;

  /**
   * Discriminador estable del estándar 1.1.8 (Comité de Convivencia Laboral).
   * Nunca editable: el dominio lo fija en creación y lo filtra en toda consulta.
   */
  @Prop({ required: true, default: CONVIVENCIA_ITEM_CODE })
  itemCode!: string;

  /**
   * Estado de cumplimiento del estándar (Fase 2 — dominio de cumplimiento).
   * Fuente de verdad: ConvivenciaService.resolveCompliance(). Los futuros
   * consumidores (Compliance Engine, Initial Evaluation, IA) leerán SOLO este
   * campo + complianceReason; no reimplementarán la regla.
   */
  @Prop({ default: 'PENDING' })
  complianceStatus!: ConvivenciaComplianceStatus;

  /** Razón legible del estado de cumplimiento (Fase 2). */
  @Prop({ default: 'Pendiente gestión avanzada del Comité de Convivencia (1.1.8).' })
  complianceReason!: string;
}

export const ConvivenciaPeriodSchema = SchemaFactory.createForClass(ConvivenciaPeriod);

// Búsquedas por empresa y estándar (el itemCode es fijo '1.1.8' pero se incluye
// en el índice para robustez futura si el dominio llegara a compartir colección).
ConvivenciaPeriodSchema.index({ companyId: 1, itemCode: 1 });

/**
 * Secuencia persistente de números de caso del Comité de Convivencia (F7B-6,
 * 1.1.8). Reemplaza el contador en memoria (`caseCounter`) que se reiniciaba
 * al reiniciar el backend, no sobrevivía a múltiples instancias y podía
 * reutilizar números tras un reinicio.
 *
 * Clave de unicidad: { companyId, year } — la secuencia es INDEPENDIENTE por
 * empresa y por año (CC-YYYY-NNNN inicia una nueva serie cada año). El
 * incremento es atómico (findOneAndUpdate + $inc con upsert, respaldado por el
 * índice único) de modo que dos createCase() concurrentes de la misma empresa
 * y año reciben números distintos.
 */
@Schema({ timestamps: true, collection: 'convivencia_case_sequences' })
export class ConvivenciaCaseSequence {
  @Prop({ type: Types.ObjectId, required: true }) companyId!: Types.ObjectId;
  /** Año de la secuencia: cada año arranca en CC-YYYY-0001. */
  @Prop({ required: true }) year!: number;
  /** Último número emitido para (companyId, year). 0 = sin casos aún. */
  @Prop({ default: 0 }) sequence!: number;
}

export type ConvivenciaCaseSequenceDocument = HydratedDocument<ConvivenciaCaseSequence>;

export const ConvivenciaCaseSequenceSchema =
  SchemaFactory.createForClass(ConvivenciaCaseSequence);

// Índice único: evita que dos upserts concurrentes dupliquen la secuencia de
// (empresa, año). El contador vive en su PROPIA colección (nueva, sin datos
// legacy), por lo que el índice puede crearse con seguridad.
ConvivenciaCaseSequenceSchema.index({ companyId: 1, year: 1 }, { unique: true });
