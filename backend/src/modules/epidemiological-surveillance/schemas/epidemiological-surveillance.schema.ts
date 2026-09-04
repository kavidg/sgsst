import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type EpidemiologicalSurveillanceProgramDocument =
  HydratedDocument<EpidemiologicalSurveillanceProgram>;

/**
 * Tipo de vigilancia epidemiológica (3.3.1).
 *
 * Clasifica el programa según el tipo de peligro o exposición
 * que monitorea. Basado en las categorías de la Resolución 0312 de 2019.
 *
 * NO almacena información clínica.
 * Solo representa la categoría administrativa de vigilancia.
 */
export enum SurveillanceType {
  BIOMECHANICAL = 'BIOMECHANICAL',
  PSYCHOSOCIAL = 'PSYCHOSOCIAL',
  CHEMICAL = 'CHEMICAL',
  BIOLOGICAL = 'BIOLOGICAL',
  PHYSICAL = 'PHYSICAL',
  OTHER = 'OTHER',
}

/**
 * Estado administrativo de un programa de vigilancia epidemiológica.
 *
 * Ciclo de vida: DRAFT → ACTIVE → COMPLETED | ARCHIVED
 */
export enum SurveillanceProgramStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}

/**
 * Estado de una actividad de vigilancia epidemiológica.
 */
export enum SurveillanceActivityStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * Actividad de un programa de vigilancia epidemiológica.
 *
 * Representa una tarea operativa concreta dentro del PVE.
 * NO almacena información clínica, diagnósticos ni resultados médicos.
 */
@Schema({ _id: false })
export class SurveillanceActivity {
  /** Título de la actividad. */
  @Prop({ required: true, type: String })
  title!: string;

  /** Descripción de la actividad. */
  @Prop({ type: String, default: '' })
  description!: string;

  /** Responsable de ejecutar la actividad. */
  @Prop({ type: String, default: '' })
  responsible!: string;

  /** Fecha de inicio programada. */
  @Prop({ required: true, type: Date })
  startDate!: Date;

  /** Fecha de cierre programada. */
  @Prop({ required: true, type: Date })
  endDate!: Date;

  /** Estado administrativo de la actividad. */
  @Prop({
    required: true,
    enum: Object.values(SurveillanceActivityStatus),
    default: SurveillanceActivityStatus.PENDING,
    type: String,
  })
  status!: SurveillanceActivityStatus;

  /** Progreso de la actividad (0-100). */
  @Prop({ type: Number, default: 0, min: 0, max: 100 })
  progress!: number;

  /** Referencias a evidencias documentales (nombres de archivos o IDs). */
  @Prop({ type: [String], default: [] })
  evidence!: string[];
}

export const SurveillanceActivitySchema =
  SchemaFactory.createForClass(SurveillanceActivity);

/**
 * Programa de Vigilancia Epidemiológica (3.3.1).
 *
 * Representa un programa administrativo/operativo de vigilancia epidemiológica
 * conforme a la Resolución 0312 de 2019.
 *
 * NO almacena:
 * - diagnósticos
 * - síntomas
 * - historia clínica
 * - medicamentos
 * - tratamientos
 * - resultados clínicos
 * - información médica identificable
 *
 * Solo almacena metadatos administrativos necesarios para:
 * - Gestión del programa de vigilancia epidemiológica
 * - Cumplimiento normativo
 * - Estadísticas agregadas
 * - Seguimiento de actividades
 */
@Schema({ timestamps: true })
export class EpidemiologicalSurveillanceProgram {
  /** Empresa propietaria del registro (tenant isolation). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  /** Nombre del programa de vigilancia epidemiológica. */
  @Prop({ required: true, trim: true })
  name!: string;

  /** Descripción del programa. */
  @Prop({ type: String, default: '' })
  description!: string;

  /** Tipo de vigilancia epidemiológica. */
  @Prop({
    required: true,
    enum: Object.values(SurveillanceType),
    type: String,
  })
  surveillanceType!: SurveillanceType;

  /** Peligros asociados al programa (referencias a Risk.hazard). */
  @Prop({ type: [String], default: [] })
  relatedHazards!: string[];

  /** Áreas objetivo del programa (referencias a Employee.area). */
  @Prop({ type: [String], default: [] })
  targetAreas!: string[];

  /** Cargos objetivo del programa (referencias a Employee.position). */
  @Prop({ type: [String], default: [] })
  targetPositions!: string[];

  /** Fecha de inicio del programa. */
  @Prop({ required: true, type: Date })
  startDate!: Date;

  /** Fecha de cierre del programa. */
  @Prop({ required: true, type: Date })
  endDate!: Date;

  /** Estado administrativo del programa. */
  @Prop({
    required: true,
    enum: Object.values(SurveillanceProgramStatus),
    default: SurveillanceProgramStatus.DRAFT,
    type: String,
  })
  status!: SurveillanceProgramStatus;

  /** Periodicidad de actividades de vigilancia (en meses). */
  @Prop({ type: Number, min: 1, max: 60 })
  periodicityMonths?: number;

  /** Responsable administrativo del programa. */
  @Prop({ type: String, default: '' })
  responsible!: string;

  /** Número del estándar SG-SST asociado. */
  @Prop({ type: String, default: '3.3.1' })
  standardNumber!: string;

  /** Actividades del programa de vigilancia. */
  @Prop({ type: [SurveillanceActivitySchema], default: [] })
  activities!: SurveillanceActivity[];
}

export const EpidemiologicalSurveillanceProgramSchema =
  SchemaFactory.createForClass(EpidemiologicalSurveillanceProgram);

// Índices para consultas frecuentes
EpidemiologicalSurveillanceProgramSchema.index({ companyId: 1, status: 1 });
EpidemiologicalSurveillanceProgramSchema.index({
  companyId: 1,
  surveillanceType: 1,
});
EpidemiologicalSurveillanceProgramSchema.index({
  companyId: 1,
  startDate: 1,
});
