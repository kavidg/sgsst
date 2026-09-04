import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MedicalRecommendationDocument = HydratedDocument<MedicalRecommendation>;

/**
 * Tipo de recomendación médica ocupacional (3.1.3).
 *
 * Categorías administrativas para clasificar la recomendación.
 * NO almacena información clínica, diagnósticos ni tratamientos.
 */
export enum RecommendationType {
  WORKPLACE_ADJUSTMENT = 'WORKPLACE_ADJUSTMENT',
  FOLLOW_UP = 'FOLLOW_UP',
  REFERRAL = 'REFERRAL',
  HEALTH_SURVEILLANCE = 'HEALTH_SURVEILLANCE',
  PREVENTIVE_ACTION = 'PREVENTIVE_ACTION',
  OTHER = 'OTHER',
}

/**
 * Estado administrativo de la recomendación.
 *
 * NO utiliza estados de Approval Workflow.
 * Este módulo es de seguimiento operativo continuo.
 */
export enum RecommendationStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * Estado de una acción derivada de la recomendación.
 */
export enum ActionStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * Acción administrativa derivada de una recomendación.
 *
 * Representa una actividad operativa/administrativa.
 * NO almacena información clínica, diagnósticos ni resultados médicos.
 */
@Schema({ _id: false })
export class RecommendationAction {
  /** Descripción de la acción administrativa. */
  @Prop({ required: true, type: String })
  action!: string;

  /** Fecha en que se registró la acción. */
  @Prop({ type: Date, required: true })
  date!: Date;

  /** Responsable de ejecutar la acción. */
  @Prop({ required: true, type: String })
  responsible!: string;

  /** Estado administrativo de la acción. */
  @Prop({ required: true, enum: Object.values(ActionStatus), default: ActionStatus.PENDING, type: String })
  status!: ActionStatus;

  /** Fecha límite para completar la acción (opcional). */
  @Prop({ type: Date })
  dueDate?: Date;

  /** Fecha en que se completó la acción (opcional). */
  @Prop({ type: Date })
  completedDate?: Date;
}

export const RecommendationActionSchema = SchemaFactory.createForClass(RecommendationAction);

/**
 * Modelo de recomendación médica ocupacional (3.1.3).
 *
 * Propósito: seguimiento administrativo de recomendaciones ocupacionales
 * para el cumplimiento del estándar 3.1.3 de la Resolución 0312 de 2019.
 *
 * NO almacena:
 * - diagnósticos
 * - historia clínica
 * - antecedentes clínicos
 * - resultados clínicos
 * - medicamentos
 * - tratamientos
 * - notas médicas
 * - conceptos clínicos detallados
 * - síntomas
 * - enfermedades
 * - información clínica identificable
 * - restricciones médicas individualizadas
 *
 * Solo almacena metadatos administrativos necesarios para:
 * - Registro de recomendaciones ocupacionales
 * - Seguimiento de acciones derivadas
 * - Cumplimiento normativo
 * - Estadísticas agregadas
 * - Alertas de vencimiento
 * - Verificación de efectividad (administrativa)
 */
@Schema({ timestamps: true })
export class MedicalRecommendation {
  /** Empresa propietaria del registro (tenant isolation). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  /** Empleado asociado a la recomendación. */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Employee' })
  employeeId!: Types.ObjectId;

  /** Examen ocupacional relacionado (opcional). */
  @Prop({ type: Types.ObjectId, ref: 'OccupationalExam' })
  examId?: Types.ObjectId;

  /** Tipo de recomendación (categoría administrativa). */
  @Prop({ required: true, enum: Object.values(RecommendationType), type: String })
  recommendationType!: RecommendationType;

  /** Descripción administrativa de la recomendación. */
  @Prop({ required: true, type: String })
  description!: string;

  /** Estado administrativo de la recomendación. */
  @Prop({ required: true, enum: Object.values(RecommendationStatus), default: RecommendationStatus.PENDING, type: String })
  status!: RecommendationStatus;

  /** Fecha en que se asignó la recomendación. */
  @Prop({ type: Date, required: true })
  assignedDate!: Date;

  /** Fecha límite para completar la recomendación. */
  @Prop({ type: Date })
  dueDate?: Date;

  /** Fecha en que se completó la recomendación (opcional). */
  @Prop({ type: Date })
  completedDate?: Date;

  /** Indica si se verificó administrativamente la efectividad. */
  @Prop({ type: Boolean, default: false })
  effectivenessVerified!: boolean;

  /** Fecha de verificación de efectividad (opcional). */
  @Prop({ type: Date })
  effectivenessVerifiedDate?: Date;

  /** Acciones administrativas derivadas de la recomendación. */
  @Prop({ type: [RecommendationActionSchema], default: [] })
  actions!: RecommendationAction[];
}

export const MedicalRecommendationSchema = SchemaFactory.createForClass(MedicalRecommendation);

// Índices para consultas frecuentes
MedicalRecommendationSchema.index({ companyId: 1, employeeId: 1 });
MedicalRecommendationSchema.index({ companyId: 1, recommendationType: 1 });
MedicalRecommendationSchema.index({ companyId: 1, status: 1 });
MedicalRecommendationSchema.index({ companyId: 1, dueDate: 1 });
MedicalRecommendationSchema.index({ companyId: 1, assignedDate: 1 });
MedicalRecommendationSchema.index({ companyId: 1, examId: 1 });
