import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OccupationalMedicalRecordCustodyDocument = HydratedDocument<OccupationalMedicalRecordCustody>;

/**
 * Tipo de registro médico ocupacional bajo custodia.
 *
 * Representa UNA referencia administrativa al tipo de documento/registro clínico
 * ocupacional que se encuentra bajo custodia. NO almacena contenido clínico:
 * no es diagnóstico, no es resultado de examen, no es concepto médico.
 */
export enum RecordType {
  /** Examen médico ocupacional de ingreso (admisión al trabajo). */
  INITIAL_OCCUPATIONAL_EXAM = 'INITIAL_OCCUPATIONAL_EXAM',
  /** Examen médico ocupacional periódico (vigilancia de salud). */
  PERIODIC_OCCUPATIONAL_EXAM = 'PERIODIC_OCCUPATIONAL_EXAM',
  /** Examen médico ocupacional de egreso (retiro/salida del trabajo). */
  EXIT_OCCUPATIONAL_EXAM = 'EXIT_OCCUPATIONAL_EXAM',
  /** Registro médico ocupacional no categorizado en los tipos anteriores. */
  OTHER_OCCUPATIONAL_RECORD = 'OTHER_OCCUPATIONAL_RECORD',
}

/**
 * Estado de custodia del registro médico ocupacional.
 *
 * - IN_CUSTODY: el registro está bajo custodia activa del responsable indicado.
 * - TRANSFERRED: la custodia fue transferida a otro responsable/ubicación.
 * - ARCHIVED: el registro fue archivado (custodia histórica/conservación).
 * - RELEASED: el registro fue liberado/devuelto (fin de la custodia).
 */
export enum CustodyStatus {
  IN_CUSTODY = 'IN_CUSTODY',
  TRANSFERRED = 'TRANSFERRED',
  ARCHIVED = 'ARCHIVED',
  RELEASED = 'RELEASED',
}

/**
 * Registro administrativo y de CONTROL de custodia de una historia clínica
 * ocupacional (estándar 3.1.5 — FASE 30F).
 *
 * PROPÓSITO: acreditar que existe un mecanismo formal de custodia (quién, qué,
 * desde cuándo, dónde, estado, trazabilidad, condiciones mínimas de conservación)
 * sin almacenar el CONTENIDO CLÍNICO de la historia clínica.
 *
 * NO almacena:
 * - diagnósticos
 * - síntomas
 * - resultados de laboratorio
 * - resultados de exámenes médicos
 * - conceptos médicos
 * - tratamientos
 * - medicamentos
 * - enfermedades
 * - imágenes clínicas
 * - historia médica completa
 *
 * La evidencia de custodia se basa exclusivamente en este registro. No se
 * infiere custodia desde OccupationalExam, MedicalRecommendation, Employee,
 * JobProfile ni ninguna otra entidad.
 */
@Schema({ timestamps: true })
export class OccupationalMedicalRecordCustody {
  /** Empresa propietaria del registro (tenant isolation). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  /** Empleado dueño del registro médico ocupacional bajo custodia. */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Employee' })
  employeeId!: Types.ObjectId;

  /**
   * Referencia administrativa al documento/registro clínico ocupacional bajo
   * custodia (NO contenido clínico).
   *
   * Ejemplos: número de expediente físico, código de registro en sistema de
   * archivos, número de carpeta, código de documento administrativo, etc.
   *
   * NO debe contener información clínica ni resultado de exámenes.
   */
  @Prop({ required: true, type: String, maxLength: 200 })
  recordReference!: string;

  /** Tipo de registro médico ocupacional bajo custodia. */
  @Prop({ required: true, enum: Object.values(RecordType) })
  recordType!: RecordType;

  /** Estado actual de la custodia. */
  @Prop({
    required: true,
    enum: Object.values(CustodyStatus),
    default: CustodyStatus.IN_CUSTODY,
  })
  custodyStatus!: CustodyStatus;

  /**
   * Nombre del responsable de la custodia (custodio identificable).
   *
   * Persona, entidad o rol responsable de conservar la historia clínica
   * ocupacional bajo las condiciones establecidas.
   */
  @Prop({ required: true, type: String, maxLength: 200 })
  custodianName!: string;

  /** Rol o cargo del custodio dentro de la organización (opcional). */
  @Prop({ type: String, maxLength: 200 })
  custodianRole?: string;

  /** Fecha de inicio de la custodia (cuándo comenzó el control de custodia). */
  @Prop({ required: true, type: Date })
  custodyStartDate!: Date;

  /**
   * Fecha hasta la cual se debe conservar el registro (retención).
   *
   * Debe ser >= custodyStartDate. Opcional porque algunos registros pueden no
   * tener una fecha de retención explícita, pero si existe debe ser válida.
   */
  @Prop({ type: Date })
  retentionUntil?: Date;

  /**
   * Referencia controlada a la ubicación física o virtual donde se conserva el
   * registro (NO URL pública, no información clínica).
   *
   * Ejemplo: código de oficina/área, referencia de archivo seguro, sistema de
   * gestión de documentos, etc.
   */
  @Prop({ required: true, type: String, maxLength: 300 })
  storageLocationReference!: string;

  /**
   * Descripción de los controles de acceso (quién puede acceder, bajo qué
   * condiciones, etc.) — nivel administrativo, no sensitivo.
   */
  @Prop({ type: String, maxLength: 500 })
  accessControlDescription?: string;

  /** Confidencialidad confirmada (el acceso está restringido conforme a la normatividad). */
  @Prop({ required: true, type: Boolean, default: false })
  confidentialityConfirmed!: boolean;

  /** Integridad confirmada (el registro se conserva íntegro, sin alteraciones no autorizadas). */
  @Prop({ required: true, type: Boolean, default: false })
  integrityConfirmed!: boolean;

  /** Disponibilidad confirmada (el registro está disponible cuando un profesional autorizado lo requiere). */
  @Prop({ required: true, type: Boolean, default: false })
  availabilityConfirmed!: boolean;

  /** Notas/observaciones administrativas adicionales (NO información clínica). */
  @Prop({ type: String, maxLength: 1000 })
  notes?: string;

  /** Registro activo (desactivación blanda para eliminar sin borrado físico). */
  @Prop({ type: Boolean, default: true })
  active!: boolean;

  /** Usuario (uid) que creó el registro de custodia (trazabilidad básica). */
  @Prop({ type: String, default: '' })
  createdBy?: string;

  /** Usuario (uid) que actualizó por última vez el registro. */
  @Prop({ type: String, default: '' })
  updatedBy?: string;
}

export const OccupationalMedicalRecordCustodySchema =
  SchemaFactory.createForClass(OccupationalMedicalRecordCustody);

// Índices para consultas frecuentes (tenant-scoped)
OccupationalMedicalRecordCustodySchema.index({ companyId: 1, employeeId: 1 });
OccupationalMedicalRecordCustodySchema.index({ companyId: 1, custodyStatus: 1 });
OccupationalMedicalRecordCustodySchema.index({ companyId: 1, active: 1 });
OccupationalMedicalRecordCustodySchema.index({ companyId: 1, recordType: 1 });
OccupationalMedicalRecordCustodySchema.index({ companyId: 1, custodyStartDate: 1 });
OccupationalMedicalRecordCustodySchema.index({ companyId: 1, retentionUntil: 1 });
