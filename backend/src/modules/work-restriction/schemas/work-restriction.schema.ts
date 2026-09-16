import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WorkRestrictionDocument = HydratedDocument<WorkRestriction>;

/**
 * Tipo de restricción/recomendación médico-laboral (3.1.6 — FASE 33).
 *
 * Representa UNA clasificación administrativa del hecho laboral derivado de
 * una evaluación médico-laboral. NO clasifica contenido clínico: no es
 * diagnóstico, no es CIE, no es tratamiento, no es medicamento.
 */
export enum RestrictionType {
  /** Restricción temporal de actividades/tareas. */
  TEMPORARY_RESTRICTION = 'TEMPORARY_RESTRICTION',
  /** Restricción permanente de actividades/tareas. */
  PERMANENT_RESTRICTION = 'PERMANENT_RESTRICTION',
  /** Recomendación laboral sin restricción estricta de actividad. */
  WORK_RECOMMENDATION = 'WORK_RECOMMENDATION',
  /** Ajuste/adaptación del puesto o de la tarea. */
  JOB_ADJUSTMENT = 'JOB_ADJUSTMENT',
  /** Otro tipo de restricción/recomendación laboral. */
  OTHER = 'OTHER',
}

/**
 * Estado administrativo de la gestión de la restricción/recomendación.
 *
 * Transiciones controladas en el service:
 *   ACTIVE → FOLLOW_UP | CLOSED | CANCELLED
 *   FOLLOW_UP → ACTIVE | CLOSED | CANCELLED
 *   CLOSED / CANCELLED → terminales (no admiten nuevas transiciones).
 */
export enum RestrictionStatus {
  /** Registrada y vigente: acciones laborales pendientes o en curso. */
  ACTIVE = 'ACTIVE',
  /** En seguimiento administrativo formal (fecha de seguimiento definida). */
  FOLLOW_UP = 'FOLLOW_UP',
  /** Cerrada con trazabilidad de la gestión realizada. */
  CLOSED = 'CLOSED',
  /** Cancelada administrativamente (registro anulado; NO es evidencia). */
  CANCELLED = 'CANCELLED',
}

/**
 * Registro administrativo y operativo de una restricción/recomendación
 * médico-laboral (estándar 3.1.6 — FASE 33).
 *
 * PROPÓSITO: acreditar que la empresa RECIBE, REGISTRA, GESTIONA, DA
 * SEGUIMIENTO y CONTROLA restricciones/recomendaciones médico-laborales como
 * HECHO ADMINISTRATIVO Y OPERATIVO, sin almacenar la historia clínica.
 *
 * METADATA-ONLY — NO almacena (§0/§28):
 * - diagnóstico
 * - código CIE
 * - historia clínica
 * - resultados clínicos o de exámenes
 * - medicamentos
 * - tratamientos
 * - síntomas
 * - enfermedades específicas
 * - antecedentes médicos
 * - documentos clínicos completos
 *
 * La evidencia de 3.1.6 proviene EXCLUSIVAMENTE de esta entidad. No se
 * infiere desde MedicalRecommendation (3.1.3), OccupationalExam (3.1.4),
 * JobProfile ni ninguna otra entidad.
 */
@Schema({ timestamps: true })
export class WorkRestriction {
  /** Empresa propietaria del registro (tenant isolation). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  /** Trabajador asociado (debe pertenecer al mismo tenant, validado en service). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Employee' })
  employeeId!: Types.ObjectId;

  /** Clasificación administrativa de la restricción/recomendación laboral. */
  @Prop({ required: true, enum: Object.values(RestrictionType) })
  restrictionType!: RestrictionType;

  /** Estado administrativo de la gestión (transiciones controladas en service). */
  @Prop({
    required: true,
    enum: Object.values(RestrictionStatus),
    default: RestrictionStatus.ACTIVE,
  })
  status!: RestrictionStatus;

  /**
   * Fecha de recepción del concepto/recomendación por parte de la empresa
   * (hecho administrativo: cuándo la empresa la recibió).
   */
  @Prop({ required: true, type: Date })
  receivedAt!: Date;

  /** Inicio de vigencia de la medida laboral (opcional). */
  @Prop({ type: Date })
  effectiveFrom?: Date;

  /** Fin de vigencia de la medida laboral (>= effectiveFrom; validado en service). */
  @Prop({ type: Date })
  effectiveUntil?: Date;

  /**
   * Usuario responsable de la gestión laboral de la medida (debe pertenecer
   * al mismo tenant; validado en service).
   */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  responsibleUserId?: Types.ObjectId;

  /**
   * Acciones laborales registradas (gestión laboral, NO tratamiento médico):
   * adaptación temporal de tarea, cambio de actividad, ajuste de jornada,
   * restricción de exposición, seguimiento administrativo, revisión del
   * puesto, reevaluación de la medida.
   */
  @Prop({ type: String, maxLength: 1000 })
  actions?: string;

  /** Fecha del próximo seguimiento administrativo. */
  @Prop({ type: Date })
  followUpDate?: Date;

  /** Resultado del último seguimiento administrativo (administrativo, no clínico). */
  @Prop({ type: String, maxLength: 500 })
  followUpStatus?: string;

  /**
   * Referencia documental administrativa (constancia de gestión, referencia
   * al concepto emitido por el médico evaluador). NO es el documento clínico
   * completo: solo referencia administrativa.
   */
  @Prop({ type: String, maxLength: 300 })
  evidence?: string;

  /** Registro activo (desactivación blanda, sin borrado físico). */
  @Prop({ type: Boolean, default: true })
  active!: boolean;

  /** Usuario (uid) que creó el registro (trazabilidad básica). */
  @Prop({ type: String, default: '' })
  createdBy?: string;

  /** Usuario (uid) que actualizó por última vez el registro. */
  @Prop({ type: String, default: '' })
  updatedBy?: string;
}

export const WorkRestrictionSchema = SchemaFactory.createForClass(WorkRestriction);

// Índices tenant-scoped para consultas frecuentes
WorkRestrictionSchema.index({ companyId: 1, employeeId: 1 });
WorkRestrictionSchema.index({ companyId: 1, status: 1 });
WorkRestrictionSchema.index({ companyId: 1, active: 1 });
WorkRestrictionSchema.index({ companyId: 1, restrictionType: 1 });
WorkRestrictionSchema.index({ companyId: 1, receivedAt: -1 });
