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

export type PhvaAdvancedCopasstTrainingDocument = HydratedDocument<PhvaAdvancedCopasstTraining>;

/**
 * Participante COPASST de una sesión de capacitación (1.1.7).
 *
 * Snapshot histórico de los datos relevantes del miembro al momento de la
 * sesión (fuente: CopasstPeriod.members). Se embebe para conservar el contexto
 * aunque el miembro posteriormente salga del comité o cambie de estado.
 *
 * NO duplica el array completo de miembros: solo userId (referencia) + snapshot
 * mínimo (name, committeeRole, representationType).
 */
@Schema({ _id: false })
export class CopasstTrainingParticipant {
  @Prop({ required: true, type: Types.ObjectId }) userId!: Types.ObjectId;
  @Prop({ required: true }) name!: string;
  @Prop() committeeRole?: string;
  @Prop() representationType?: string;
}

/**
 * Sesión de capacitación COPASST (1.1.7).
 *
 * Reutiliza el sub-schema compartido `Session` por herencia (title, type,
 * responsible, scheduledDate, expirationDate, status, evidences, multimedia,
 * instructor, location, duration, evaluation, completionDate) y agrega un
 * campo NUEVO `copasstParticipants` con el snapshot de los miembros.
 *
 * El campo `participants: string[]` del sub-schema `Session` NO se redefine:
 * el contrato de 1.2.1 se preserva intacto. La participación COPASST vive en
 * `copasstParticipants`.
 */
@Schema({ _id: false })
export class CopasstTrainingSession extends Session {
  @Prop({ type: [CopasstTrainingParticipant], default: [] })
  copasstParticipants!: CopasstTrainingParticipant[];
}

/**
 * Registro de cobertura de capacitación por miembro activo del COPASST (1.1.7).
 *
 * Se recalcula al actualizar sesiones/evidencias. `trained` es true si el
 * miembro participó en al menos una sesión EJECUTADA (no basta programada).
 *
 * Notas de modelado (Fase 2):
 * - `totalHours` queda en 0 (default) porque `Session.duration` es texto libre
 *   ("Ej: 4 horas") y no puede sumarse de forma segura; una fase posterior
 *   introducirá una duración normalizada en horas.
 * - `lastEvaluationScore`/`lastEvaluationDate` quedan sin dato porque
 *   `evaluationAttempts` no tiene relación con un participante concreto;
 *   limitación documentada, no se inventa una relación.
 */
@Schema({ _id: false })
export class CopasstMemberCoverage {
  @Prop({ required: true, type: Types.ObjectId }) userId!: Types.ObjectId;
  @Prop({ required: true }) name!: string;
  @Prop() committeeRole?: string;
  @Prop() representationType?: string;
  @Prop({ default: 'ACTIVO' }) status!: string;
  @Prop({ default: false }) trained!: boolean;
  @Prop() trainedAt?: Date;
  @Prop({ default: 0 }) executedSessions!: number;
  @Prop({ default: 0 }) totalHours!: number;
  @Prop() lastEvaluationScore?: number;
  @Prop() lastEvaluationDate?: Date;
}

/**
 * Gestión avanzada del estándar 1.1.7 — Capacitación COPASST.
 *
 * Colección INDEPENDIENTE de 1.2.1 (TrainingManagement) por decisión
 * arquitectónica de la auditoría: la lógica de cumplimiento de 1.2.1 está
 * hardcodeada y no debe mezclarse con este estándar.
 *
 * Multi-tenant por `companyId`. El `itemCode` es SIEMPRE '1.1.7' (discriminador
 * estable; el service lo fija en creación y filtra en toda consulta).
 */
@Schema({ timestamps: true, collection: 'phva_advanced_copasst_training' })
export class PhvaAdvancedCopasstTraining {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  companyId!: Types.ObjectId;

  /** Discriminador de estándar. Fijo a '1.1.7' en el dominio. */
  @Prop({ required: true, default: '1.1.7' })
  itemCode!: string;

  @Prop({ default: new Date().getFullYear() })
  year!: number;

  /** Periodo COPASST de referencia (CopasstPeriod._id) al momento de creación. */
  @Prop({ type: Types.ObjectId })
  periodId?: Types.ObjectId;

  /** Programa anual planificado (planificación). */
  @Prop({ type: [Session], default: [] })
  annualProgram!: Session[];

  /** Sesiones de capacitación COPASST ejecutadas/gestionadas. */
  @Prop({ type: [CopasstTrainingSession], default: [] })
  sessions!: CopasstTrainingSession[];

  /** Snapshot de cobertura por miembro activo (recalculado). */
  @Prop({ type: [CopasstMemberCoverage], default: [] })
  memberCoverage!: CopasstMemberCoverage[];

  /** Checklist normativo de temas de capacitación (identificación de peligros, etc.). */
  @Prop({ type: [ChecklistItem], default: [] })
  checklistTemplate!: ChecklistItem[];

  @Prop({ type: [EvaluationAttempt], default: [] })
  evaluationAttempts!: EvaluationAttempt[];

  @Prop({ type: [TrainingSignature], default: [] })
  signatures!: TrainingSignature[];

  @Prop({ type: [String], default: [] })
  certificates!: string[];

  @Prop({ type: [String], default: [] })
  evidenceFiles!: string[];

  @Prop({ type: [String], default: [] })
  attendanceEvidence!: string[];

  @Prop({ type: [String], default: [] })
  signatureEvidence!: string[];

  @Prop({ type: [String], default: [] })
  alerts!: string[];

  @Prop({ type: [AuditEntry], default: [] })
  history!: AuditEntry[];

  /** Approval embebido — modelado SOLO para preparar la fase 5 (sin integrar el motor aún). */
  @Prop({ type: Approval, default: { version: 1, status: 'PENDING' } })
  approval!: Approval;

  @Prop({ default: 'PENDING' })
  complianceStatus!: 'COMPLIES'|'PENDING'|'NON_COMPLIANT';

  @Prop({ default: 'Pendiente gestión avanzada de capacitación COPASST (1.1.7).' })
  complianceReason!: string;
}

export const PhvaAdvancedCopasstTrainingSchema = SchemaFactory.createForClass(PhvaAdvancedCopasstTraining);

// Único registro por empresa/año/estándar: un programa de capacitación COPASST
// por año. El itemCode es fijo ('1.1.7') pero se incluye en el índice para
// robustez futura si el dominio llegara a compartir colección.
PhvaAdvancedCopasstTrainingSchema.index(
  { companyId: 1, year: 1, itemCode: 1 },
  { unique: true },
);

// Búsquedas por periodo COPASST de referencia.
PhvaAdvancedCopasstTrainingSchema.index({ companyId: 1, periodId: 1 });
