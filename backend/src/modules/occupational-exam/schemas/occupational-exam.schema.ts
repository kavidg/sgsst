import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OccupationalExamDocument = HydratedDocument<OccupationalExam>;

/**
 * Tipos de examen médico ocupacional (3.1.2).
 *
 * Cada tipo representa un momento específico en la relación laboral
 * donde se requiere una evaluación médica ocupacional.
 */
export enum ExamType {
  ENTRY = 'ENTRY',
  PERIODIC = 'PERIODIC',
  EXIT = 'EXIT',
  POST_INCAPACITY = 'POST_INCAPACITY',
  CHANGE_OF_OCCUPATION = 'CHANGE_OF_OCCUPATION',
  OTHER = 'OTHER',
}

/**
 * Estado administrativo del examen.
 *
 * NO utiliza estados de Approval Workflow.
 * Este módulo es de trazabilidad administrativa, no de aprobación.
 */
export enum ExamStatus {
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

/**
 * Estado de aptitud médica (nivel administrativo).
 *
 * NO almacena información clínica detallada.
 * Solo la categoría administrativa de aptitud.
 */
export enum FitnessStatus {
  FIT = 'FIT',
  FIT_WITH_RESTRICTIONS = 'FIT_WITH_RESTRICTIONS',
  UNFIT = 'UNFIT',
  PENDING = 'PENDING',
  NOT_REPORTED = 'NOT_REPORTED',
}

/**
 * Modelo de examen médico ocupacional.
 *
 * Propósito: trazabilidad administrativa de exámenes médicos ocupacionales
 * para el cumplimiento del estándar 3.1.2 de la Resolución 0312 de 2019.
 *
 * NO almacena:
 * - diagnósticos
 * - enfermedades
 * - resultados clínicos detallados
 * - valores de laboratorio
 * - antecedentes médicos
 * - historias clínicas
 * - observaciones clínicas libres
 * - restricciones médicas detalladas
 * - documentos clínicos completos
 *
 * Solo almacena metadatos administrativos necesarios para:
 * - Trazabilidad de exámenes
 * - Cumplimiento normativo
 * - Estadísticas agregadas
 * - Alertas de vencimiento
 */
@Schema({ timestamps: true })
export class OccupationalExam {
  /** Empresa propietaria del registro (tenant isolation). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  /** Empleado asociado al examen. */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Employee' })
  employeeId!: Types.ObjectId;

  /** Tipo de examen médico ocupacional. */
  @Prop({ required: true, enum: Object.values(ExamType) })
  examType!: ExamType;

  /** Fecha en que se realizó (o se realizó) el examen. */
  @Prop({ type: Date })
  examDate?: Date;

  /** Estado administrativo del examen. */
  @Prop({ required: true, enum: Object.values(ExamStatus), default: ExamStatus.SCHEDULED })
  status!: ExamStatus;

  /** Fecha de próximo examen requerido (opcional). */
  @Prop({ type: Date })
  nextDueDate?: Date;

  /** Estado de aptitud médica (categoría administrativa, no clínica). */
  @Prop({ enum: Object.values(FitnessStatus) })
  fitnessStatus?: FitnessStatus;

  /** Indica si se requiere seguimiento post-examen. */
  @Prop({ type: Boolean, default: false })
  followUpRequired!: boolean;

  /** Fecha programada para seguimiento (requerido si followUpRequired=true). */
  @Prop({ type: Date })
  followUpDate?: Date;

  // ── Campos adicionales para 3.1.4 ──
  // Periodicidad, peligros relacionados y comunicación al trabajador.
  // Todos opcionales para mantener compatibilidad con registros existentes.

  /** Periodicidad administrativa de la evaluación periódica (en meses). */
  @Prop({ type: Number, min: 1 })
  periodicityMonths?: number;

  /** Referencias administrativas a peligros ocupacionales relacionados con la evaluación. */
  @Prop({ type: [String], default: [] })
  relatedHazards!: string[];

  /** Indica si existe constancia administrativa de comunicación de resultados al trabajador. */
  @Prop({ type: Boolean, default: false })
  workerAcknowledged!: boolean;

  /** Fecha administrativa de comunicación de resultados al trabajador. */
  @Prop({ type: Date })
  communicationDate?: Date;
}

export const OccupationalExamSchema = SchemaFactory.createForClass(OccupationalExam);

// Índices para consultas frecuentes
OccupationalExamSchema.index({ companyId: 1, employeeId: 1 });
OccupationalExamSchema.index({ companyId: 1, examType: 1 });
OccupationalExamSchema.index({ companyId: 1, status: 1 });
OccupationalExamSchema.index({ companyId: 1, nextDueDate: 1 });
OccupationalExamSchema.index({ companyId: 1, examDate: 1 });
