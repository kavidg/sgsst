import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SgstProgramDocument = HydratedDocument<SgstProgram>;
export type ProgramActivityDocument = HydratedDocument<ProgramActivity>;

/** Estado de un programa SG-SST. */
export enum ProgramStatus {
  DRAFT = 'Draft',
  ACTIVE = 'Active',
  COMPLETED = 'Completed',
  ARCHIVED = 'Archived',
}

/** Prioridad de una actividad de programa. */
export enum ProgramActivityPriority {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  CRITICAL = 'Critical',
}

/** Estado de una actividad de programa. */
export enum ProgramActivityStatus {
  PENDING = 'Pending',
  IN_PROGRESS = 'InProgress',
  COMPLETED = 'Completed',
  DELAYED = 'Delayed',
  CANCELLED = 'Cancelled',
}

/**
 * Programa SG-SST.
 *
 * Representa un programa operativo del SG-SST (seguridad, salud, emergencias,
 * etc.) con su propio conjunto de actividades, responsables y estados.
 *
 * Multi-tenant: companyId es el único filtro de aislamiento.
 * phvaPhase = "do" por defecto (fase operativa del PHVA).
 */
@Schema({ timestamps: true })
export class SgstProgram {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ default: '' })
  objective!: string;

  /** Número o código del estándar SG-SST asociado (ej: '6.1.1', '3.3.2'). */
  @Prop()
  standardNumber?: string;

  /** Usuario responsable del programa. */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  responsibleUser?: Types.ObjectId;

  @Prop({
    required: true,
    enum: Object.values(ProgramStatus),
    default: ProgramStatus.DRAFT,
  })
  status!: ProgramStatus;

  @Prop({ required: true })
  startDate!: Date;

  @Prop({ required: true })
  endDate!: Date;

  @Prop({ default: 0, min: 0, max: 100 })
  completionPercentage!: number;

  /** Fase PHVA (por defecto "do" para programas operativos). */
  @Prop({ default: 'do' })
  phvaPhase!: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy!: Types.ObjectId;
}

export const SgstProgramSchema = SchemaFactory.createForClass(SgstProgram);

// Índice compuesto: companyId + name único
SgstProgramSchema.index({ companyId: 1, name: 1 }, { unique: true });
SgstProgramSchema.index({ companyId: 1, status: 1 });
SgstProgramSchema.index({ companyId: 1, standardNumber: 1 });

/**
 * Actividad de un programa SG-SST.
 *
 * Cada programa contiene actividades que representan tareas operativas
 * concretes con responsable, fechas, prioridad, progreso y evidencia.
 */
@Schema({ timestamps: true })
export class ProgramActivity {
  @Prop({ required: true, type: Types.ObjectId, ref: 'SgstProgram', index: true })
  programId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ default: '' })
  description!: string;

  /** Número del estándar SG-SST asociado a esta actividad. */
  @Prop()
  standardNumber?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  responsibleUser?: Types.ObjectId;

  @Prop({ required: true })
  startDate!: Date;

  @Prop({ required: true })
  endDate!: Date;

  @Prop({
    required: true,
    enum: Object.values(ProgramActivityPriority),
    default: ProgramActivityPriority.MEDIUM,
  })
  priority!: ProgramActivityPriority;

  @Prop({
    required: true,
    enum: Object.values(ProgramActivityStatus),
    default: ProgramActivityStatus.PENDING,
  })
  status!: ProgramActivityStatus;

  @Prop({ default: 0, min: 0, max: 100 })
  progress!: number;

  @Prop({ default: '' })
  observations!: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy!: Types.ObjectId;
}

export const ProgramActivitySchema = SchemaFactory.createForClass(ProgramActivity);

ProgramActivitySchema.index({ programId: 1 });
ProgramActivitySchema.index({ programId: 1, status: 1 });
ProgramActivitySchema.index({ responsibleUser: 1 });
ProgramActivitySchema.index({ endDate: 1, status: 1 });
