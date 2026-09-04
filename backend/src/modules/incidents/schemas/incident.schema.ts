import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type IncidentDocument = HydratedDocument<Incident>;

/**
 * Tipo de investigación asociada al incidente.
 *
 * ACCIDENT — Registro de accidentalidad laboral (estándar 3.2.1 / accidentalidad).
 * DISEASE  — Investigación de enfermedad laboral (estándar 3.2.2).
 *
 * Campo opcional con default ACCIDENT para mantener compatibilidad con
 * documentos existentes de accidentalidad que no tienen este campo.
 */
export enum InvestigationType {
  ACCIDENT = 'ACCIDENT',
  DISEASE = 'DISEASE',
}

/**
 * Estado administrativo de una acción de investigación (correctiva o preventiva).
 *
 * PENDING    — Acción creada, sin avance registrado.
 * IN_PROGRESS — Acción en ejecución.
 * COMPLETED  — Acción finalizada.
 * CANCELLED  — Acción cancelada.
 */
export enum InvestigationActionStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * Acción correctiva o preventiva derivada de la investigación.
 *
 * Representa una actividad administrativa de seguimiento.
 * NO almacena información clínica.
 */
@Schema({ _id: false })
export class InvestigationAction {
  /** Descripción de la acción. */
  @Prop({ required: true, type: String })
  action!: string;

  /** Responsable de ejecutar la acción. */
  @Prop({ required: true, type: String })
  responsible!: string;

  /** Estado administrativo de la acción. */
  @Prop({ required: true, enum: Object.values(InvestigationActionStatus), default: InvestigationActionStatus.PENDING, type: String })
  status!: InvestigationActionStatus;

  /** Fecha límite para completar la acción (opcional). */
  @Prop({ type: Date })
  dueDate?: Date;

  /** Fecha en que se completó la acción (opcional). */
  @Prop({ type: Date })
  completedDate?: Date;
}

export const InvestigationActionSchema = SchemaFactory.createForClass(InvestigationAction);

@Schema({ timestamps: true })
export class Incident {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Employee' })
  employeeId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  type!: string;

  @Prop({ required: true })
  date!: Date;

  @Prop({ required: true })
  description!: string;

  @Prop({ required: true })
  severity!: string;

  @Prop({ required: true })
  status!: string;

  /**
   * Días perdidos por el accidente/incidente.
   * Opcional: registros históricos pueden no tener este campo.
   * 0 significa "sin días perdidos", NO "dato no informado".
   */
  @Prop({ type: Number, default: 0, min: 0 })
  daysLost?: number;

  /**
   * Clasificación del tipo de accidente.
   * Opcional: registros históricos pueden no tener clasificación.
   * Valores válidos: 'AT' (Accidente de Trabajo), 'ATEL' (Accidente de Trabajo con Lesión),
   * 'INCIDENTE' (casi-accidente sin lesión), o cualquier string libre.
   */
  @Prop({ default: '' })
  accidentType?: string;

  // ── Campos de investigación (estándar 3.2.2 — Enfermedades Laborales) ──

  /**
   * Tipo de investigación asociada al incidente.
   * ACCIDENT para accidentalidad laboral, DISEASE para investigación de enfermedad laboral.
   * Default: ACCIDENT — mantiene compatibilidad con documentos existentes.
   */
  @Prop({ enum: Object.values(InvestigationType), default: InvestigationType.ACCIDENT, type: String })
  investigationType?: InvestigationType;

  /**
   * Causas básicas identificadas en la investigación.
   * Arreglo de strings descriptivos (ej: 'Falta de capacitación', 'Procedimiento inadecuado').
   * NO almacena información clínica.
   */
  @Prop({ type: [String], default: [] })
  rootCauses?: string[];

  /**
   * Causas inmediatas identificadas en la investigación.
   * Arreglo de strings descriptivos (ej: 'Contacto con sustancia química', 'Postura inadecuada').
   * NO almacena información clínica ni diagnósticos.
   */
  @Prop({ type: [String], default: [] })
  immediateCauses?: string[];

  /**
   * Factores relacionados con el evento.
   * Arreglo de strings (ej: 'Ergonomía', 'Psicosocial', 'Químico', 'Biológico').
   * Representa factores ocupacionales/administrativos, NO diagnósticos.
   */
  @Prop({ type: [String], default: [] })
  relatedFactors?: string[];

  /**
   * Acciones correctivas derivadas de la investigación.
   * Cada acción incluye descripción, responsable y estado administrativo.
   */
  @Prop({ type: [InvestigationActionSchema], default: [] })
  correctiveActions?: InvestigationAction[];

  /**
   * Acciones preventivas derivadas de la investigación.
   * Cada acción incluye descripción, responsable y estado administrativo.
   */
  @Prop({ type: [InvestigationActionSchema], default: [] })
  preventiveActions?: InvestigationAction[];

  /**
   * Responsable de la investigación.
   * Identificador o referencia administrativa del responsable.
   * NO almacena nombre completo innecesariamente.
   */
  @Prop({ type: String })
  responsible?: string;

  /**
   * Fecha en que se inició formalmente la investigación.
   */
  @Prop({ type: Date })
  investigationDate?: Date;

  /**
   * Fecha de cierre de la investigación.
   */
  @Prop({ type: Date })
  closureDate?: Date;

  /**
   * Referencias a evidencias documentales (nombres de archivos o IDs).
   * NO almacena contenido clínico.
   */
  @Prop({ type: [String], default: [] })
  evidence?: string[];
}

export const IncidentSchema = SchemaFactory.createForClass(Incident);
IncidentSchema.index({ companyId: 1, date: -1 });
IncidentSchema.index({ companyId: 1, investigationType: 1 });
