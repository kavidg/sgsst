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
 * Tipos de evidencia persistida de la Capacitación COPASST (1.1.7, Fase 4).
 *
 * Estructura abierta aditiva: los documentos generados por el motor
 * (certificado, asistencia, informe, cumplimiento) se registran también como
 * evidencias estructuradas para que la UI las liste sin URLs ficticias.
 */
export enum CopasstTrainingEvidenceType {
  /** Material, presentaciones o soportes cargados por el usuario. */
  GENERAL = 'GENERAL',
  /** Lista de asistencia de una sesión (generada o cargada). */
  ATTENDANCE = 'ATTENDANCE',
  /** Registro de firmas de una sesión. */
  SIGNATURE = 'SIGNATURE',
  /** Certificado de capacitación de un participante. */
  CERTIFICATE = 'CERTIFICATE',
  /** Informe documental de la capacitación. */
  REPORT = 'REPORT',
  /** Reporte de cumplimiento del estándar. */
  COMPLIANCE_REPORT = 'COMPLIANCE_REPORT',
}

/**
 * Evidencia persistida de la Capacitación COPASST (1.1.7, Fase 4).
 *
 * Estructura PARALELA específica de 1.1.7: NO se agrega metadata al
 * sub-schema compartido `Session` (que 1.2.1 reutiliza y no debe modificarse).
 *
 * La sesión se referencia por `sessionIndex` (índice ESTABLE del arreglo
 * `sessions` según el modelo existente — las sesiones no poseen _id propio) y
 * se denormaliza un snapshot mínimo (sessionTitle, sessionDate) para conservar
 * el contexto aunque la sesión se elimine o reordene posteriormente.
 */
@Schema({ _id: false })
export class CopasstTrainingEvidence {
  @Prop({ type: String, required: true, enum: Object.values(CopasstTrainingEvidenceType) })
  type!: CopasstTrainingEvidenceType;

  /** Nombre original del archivo (legible en la UI). */
  @Prop({ required: true })
  fileName!: string;

  /** URL pública del archivo en Firebase Storage (nunca inventada). */
  @Prop({ required: true })
  fileUrl!: string;

  /** Ruta de Storage (para futuras descargas/eliminaciones). */
  @Prop()
  storagePath?: string;

  /** Índice estable de la sesión asociada (opcional para evidencias globales). */
  @Prop()
  sessionIndex?: number;

  /** Snapshot denormalizado del título de la sesión al momento de cargar. */
  @Prop()
  sessionTitle?: string;

  /** Snapshot denormalizado de la fecha de la sesión al momento de cargar. */
  @Prop()
  sessionDate?: Date;

  /** Usuario que registró la evidencia (referencia a User._id). */
  @Prop({ type: Types.ObjectId })
  uploadedBy?: Types.ObjectId;

  @Prop({ default: Date.now })
  uploadedAt!: Date;

  /** Metadata abierta específica (p.ej. participantUserId de un certificado). */
  @Prop({ type: Object, default: undefined })
  metadata?: Record<string, unknown>;
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

  /**
   * Evidencias estructuradas persistentes (Fase 4). Fuente de verdad para la
   * UI de evidencias de 1.1.7; los arreglos legacy de strings se conservan
   * intactos por compatibilidad aditiva.
   */
  @Prop({ type: [CopasstTrainingEvidence], default: [] })
  evidences!: CopasstTrainingEvidence[];

  @Prop({ type: [String], default: [] })
  alerts!: string[];

  @Prop({ type: [AuditEntry], default: [] })
  history!: AuditEntry[];

  /**
   * Approval embebido del flujo de aprobación (Fase 5). El estado lo escribe
   * el dominio vía submitCopasstTraining/approveCopasstTraining (a través del
   * CopasstTrainingHandler); la ApprovalRequest del Approval Workflow Core es
   * la fuente de verdad del ciclo (GET /copasst-training/approval).
   */
  @Prop({ type: Approval, default: { version: 1, status: 'PENDING' } })
  approval!: Approval;

  /**
   * Locking del flujo de aprobación (Fase 5): true mientras la entidad está
   * PENDIENTE de aprobación o APROBADA (no editable). REJECTED y
   * ADJUSTMENTS_REQUESTED liberan la edición para correcciones.
   *
   * Campo PROPIO de 1.1.7 (aditivo): NO se usa el Approval embebido compartido
   * con 1.2.1 para derivar el lock, porque su estado inicial 'PENDING' es
   * ambiguo (no enviado vs pendiente de decisión).
   */
  @Prop({ default: false })
  locked!: boolean;

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
