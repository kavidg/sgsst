import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  ImprovementPlanStatus,
  ImprovementPlanActivityStatus,
  ImprovementPlanPerceivedEffectiveness,
  ImprovementPlanImplementationStatus,
  isImprovementPlanTransitionValid,
} from './improvement-plan-lifecycle.schema';

export type ImprovementPlanDocument = HydratedDocument<ImprovementPlan>;

// ─── Origen (trazabilidad declarativa — SIN consultas cruzadas) ─────────────

/**
 * E1 (7.1.4) — Origen del plan de mejoramiento. Es DECLARATIVO: sirve para
 * trazabilidad documental, NUNCA dispara queries automáticas contra
 * AnnualAudit, Incidents, ManagementReviewDirection, Indicators,
 * CorrectivePreventiveActions ni ManagementImprovementActions (frontera
 * inter-estándares; sin acoplamiento ni doble scoring en E2).
 */
export enum ImprovementPlanOrigin {
  SELF_ASSESSMENT = 'SELF_ASSESSMENT',
  AUDIT = 'AUDIT',
  INSPECTION = 'INSPECTION',
  ACCIDENT = 'ACCIDENT',
  MANAGEMENT_REVIEW = 'MANAGEMENT_REVIEW',
  INDICATOR = 'INDICATOR',
  LEGAL_REQUIREMENT = 'LEGAL_REQUIREMENT',
  OTHER = 'OTHER',
}

export enum ImprovementPlanPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum ImprovementPlanResourceType {
  HUMAN = 'HUMAN',
  TECHNICAL = 'TECHNICAL',
  FINANCIAL = 'FINANCIAL',
  PHYSICAL = 'PHYSICAL',
  OTHER = 'OTHER',
}

// ─── Evidencia (patrón estándar del repo: referencia declarativa) ───────────

/**
 * Evidencia estructurada: documentId (DocumentMaster, validado tenant-safe en
 * service: {_id, companyId}) y/o evidenceUrl + comentario. NO crea sistema de
 * archivos propio.
 */
@Schema({ _id: false })
export class ImprovementPlanEvidence {
  @Prop({ type: Types.ObjectId, ref: 'DocumentMaster' })
  documentId?: Types.ObjectId;

  /** Snapshot del código/nombre del documento (server-side; sobrevive cambios). */
  @Prop({ trim: true, maxlength: 300 })
  documentSnapshot?: string;

  @Prop({ trim: true, maxlength: 1000 })
  evidenceUrl?: string;

  @Prop({ trim: true, maxlength: 1000 })
  comment?: string;
}

export const ImprovementPlanEvidenceSchema = SchemaFactory.createForClass(
  ImprovementPlanEvidence,
);

// ─── Objetivos (meta + indicador evaluable sin consultar otros módulos) ─────

/**
 * Objetivo del plan con su meta e indicador: permite evaluar la existencia de
 * objetivos/metas/indicadores dentro del propio plan (modeReview 7.1.4).
 */
@Schema({ _id: false })
export class ImprovementPlanObjective {
  /** Identificador estable generado server-side (OBJ-001…). */
  @Prop({ type: String })
  objectiveId?: string;

  @Prop({ required: true, trim: true, maxlength: 1000 })
  description!: string;

  /** Meta del objetivo (texto: valor esperado/fecha). */
  @Prop({ trim: true, maxlength: 500 })
  target?: string;

  /** Indicador de seguimiento del objetivo. */
  @Prop({ trim: true, maxlength: 300 })
  indicator?: string;

  @Prop({ trim: true, maxlength: 1000 })
  observations?: string;
}

export const ImprovementPlanObjectiveSchema = SchemaFactory.createForClass(
  ImprovementPlanObjective,
);

// ─── Follow-up de actividad (percepción de efectividad — NO eficacia formal) ─

/**
 * Seguimiento de la actividad. `perceivedEffectiveness` es PERCEPCIÓN
 * declarada — NO verificación formal de eficacia (frontera con 7.1.1). La
 * formalización del scoring pertenece a E2.
 */
@Schema({ _id: false })
export class ImprovementPlanActivityFollowUp {
  /** Fecha del seguimiento (no futura; validada en service). */
  @Prop({ type: Date })
  followUpDate?: Date;

  @Prop({ trim: true, maxlength: 2000 })
  observations?: string;

  @Prop({ type: String, enum: Object.values(ImprovementPlanImplementationStatus) })
  implementationStatus?: ImprovementPlanImplementationStatus;

  @Prop({ type: String, enum: Object.values(ImprovementPlanPerceivedEffectiveness) })
  perceivedEffectiveness?: ImprovementPlanPerceivedEffectiveness;

  /** ¿La actividad requiere continuar en seguimiento? */
  @Prop()
  requiresContinuedFollowUp?: boolean;
}

export const ImprovementPlanActivityFollowUpSchema = SchemaFactory.createForClass(
  ImprovementPlanActivityFollowUp,
);

// ─── Actividad del plan ─────────────────────────────────────────────────────

/**
 * Actividad del plan de mejoramiento. PERTENECE al plan (embebida). Los ids
 * (ACT-001…) se generan server-side y son únicos dentro del plan. OVERDUE es
 * DERIVADO (dueDate < now && estado no terminal) — NUNCA se persiste.
 */
@Schema({ _id: false })
export class ImprovementPlanActivity {
  /** Identificador estable generado server-side (ACT-001…). */
  @Prop({ type: String })
  activityId?: string;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  description!: string;

  /** Responsable tenant-safe (validado {_id, companyId} en service). */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  responsibleUserId?: Types.ObjectId;

  /** Snapshot del nombre del responsable (server-side). */
  @Prop({ trim: true, maxlength: 300 })
  responsibleUserSnapshot?: string;

  /** Fecha programada (si existe, no posterior a dueDate). */
  @Prop({ type: Date })
  plannedDate?: Date;

  /** Fecha límite. */
  @Prop({ type: Date })
  dueDate?: Date;

  /** Fecha de ejecución real (no futura; exigida para COMPLETED). */
  @Prop({ type: Date })
  executionDate?: Date;

  @Prop({
    required: true,
    enum: Object.values(ImprovementPlanActivityStatus),
    default: ImprovementPlanActivityStatus.PENDING,
    type: String,
  })
  status!: ImprovementPlanActivityStatus;

  /** Avance 0–100 (validado en service). */
  @Prop({ default: 0, min: 0, max: 100 })
  progress?: number;

  /** Evidencia declarativa de la actividad. */
  @Prop({ type: ImprovementPlanEvidenceSchema })
  evidence?: ImprovementPlanEvidence;

  @Prop({ trim: true, maxlength: 2000 })
  observations?: string;

  /** Seguimiento de la actividad (percepción de efectividad). */
  @Prop({ type: ImprovementPlanActivityFollowUpSchema })
  followUp?: ImprovementPlanActivityFollowUp;
}

export const ImprovementPlanActivitySchema = SchemaFactory.createForClass(
  ImprovementPlanActivity,
);

// ─── Seguimiento periódico del plan (independiente de las actividades) ──────

/**
 * Registro de seguimiento periódico del PLAN (no de una actividad): fecha,
 * avance global, desviaciones y acciones de ajuste. Los ids (MON-001…) se
 * generan server-side. Fecha no futura; progreso 0–100.
 */
@Schema({ _id: false })
export class ImprovementPlanMonitoring {
  @Prop({ type: String })
  monitoringId?: string;

  /** Fecha del seguimiento (no futura; validada en service). */
  @Prop({ type: Date })
  date?: Date;

  /** Avance global del plan en el momento del seguimiento (0–100). */
  @Prop({ min: 0, max: 100 })
  progress?: number;

  /** Desviaciones detectadas. */
  @Prop({ trim: true, maxlength: 2000 })
  deviations?: string;

  /** Acciones de ajuste derivadas del seguimiento. */
  @Prop({ trim: true, maxlength: 2000 })
  adjustmentActions?: string;

  @Prop({ trim: true, maxlength: 1000 })
  observations?: string;
}

export const ImprovementPlanMonitoringSchema = SchemaFactory.createForClass(
  ImprovementPlanMonitoring,
);

// ─── Recursos del plan (estructura simple — sin sistema financiero) ─────────

/**
 * Recursos contemplados por el plan (humanos, técnicos, financieros,
 * físicos, otros) con descripción. Suficiente para demostrar que el plan
 * contempla recursos; sin complejidad financiera.
 */
@Schema({ _id: false })
export class ImprovementPlanResource {
  @Prop({ required: true, enum: Object.values(ImprovementPlanResourceType), type: String })
  type!: ImprovementPlanResourceType;

  @Prop({ required: true, trim: true, maxlength: 500 })
  description!: string;

  @Prop({ trim: true, maxlength: 500 })
  observations?: string;
}

export const ImprovementPlanResourceSchema = SchemaFactory.createForClass(
  ImprovementPlanResource,
);

// ─── Plan de mejoramiento (7.1.4 — collection `improvementplans`) ───────────

/**
 * E1 (7.1.4) — PLAN DE MEJORAMIENTO del SG-SST.
 *
 * Representa el PLAN como estructura integral (identificación, origen
 * declarativo, priorización, objetivos/metas/indicadores, cronograma,
 * responsables, recursos, actividades, seguimiento periódico y cierre
 * documentado) — NO un agregador de acciones de 7.1.1/7.1.2/7.1.3 ni un
 * programa operativo (eso es SgstProgram, dominio `programs`, intocable).
 *
 * Tenant: companyId SIEMPRE server-side; TODAS las operaciones del service
 * filtran por companyId (nunca findById sin tenant).
 */
@Schema({ timestamps: true, collection: 'improvementplans' })
export class ImprovementPlan {
  _id!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  /** Código del plan (único POR tenant; índice parcial companyId+code). */
  @Prop({ required: true, trim: true, maxlength: 100 })
  code!: string;

  @Prop({ required: true, trim: true, maxlength: 300 })
  title!: string;

  @Prop({ trim: true, maxlength: 3000 })
  description?: string;

  /** Período del plan (texto: '2026', '2026-2027', 'Vigilancia 2026'…). */
  @Prop({ trim: true, maxlength: 100 })
  period?: string;

  /** Año del plan (para evaluatedPeriod del scorer E2). */
  @Prop()
  year?: number;

  /** Responsable del plan (usuario del tenant; validado en service). */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  responsibleUserId?: Types.ObjectId;

  /** Snapshot del nombre del responsable (server-side). */
  @Prop({ trim: true, maxlength: 300 })
  responsibleUserSnapshot?: string;

  // ── Origen (declarativo — sin queries cruzadas) ──
  @Prop({ required: true, enum: Object.values(ImprovementPlanOrigin), type: String })
  origin!: ImprovementPlanOrigin;

  /** Referencia declarativa al documento/registro origen (sin FK estricta). */
  @Prop({ type: Types.ObjectId })
  originReferenceId?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 2000 })
  originDescription?: string;

  // ── Priorización ──
  @Prop({ required: true, enum: Object.values(ImprovementPlanPriority), default: ImprovementPlanPriority.MEDIUM, type: String })
  priority!: ImprovementPlanPriority;

  /** Criterios de priorización aplicados. */
  @Prop({ trim: true, maxlength: 2000 })
  prioritizationCriteria?: string;

  // ── Estructura del plan ──
  @Prop({ type: [ImprovementPlanObjectiveSchema], default: [] })
  objectives!: ImprovementPlanObjective[];

  @Prop({ type: [ImprovementPlanActivitySchema], default: [] })
  activities!: ImprovementPlanActivity[];

  @Prop({ type: [ImprovementPlanResourceSchema], default: [] })
  resources!: ImprovementPlanResource[];

  @Prop({ type: [ImprovementPlanMonitoringSchema], default: [] })
  monitoring!: ImprovementPlanMonitoring[];

  // ── Cronograma ──
  @Prop({ required: true, type: Date })
  startDate!: Date;

  /** Fecha de fin (>= startDate; validado en service). */
  @Prop({ required: true, type: Date })
  endDate!: Date;

  // ── Lifecycle canónico (el proxy legacy no lo tiene; aquí es tipado) ──
  @Prop({
    required: true,
    enum: Object.values(ImprovementPlanStatus),
    default: ImprovementPlanStatus.DRAFT,
    type: String,
  })
  status!: ImprovementPlanStatus;

  // ── Cierre documentado (sellado al CLOSED) ──
  @Prop({ type: Date })
  closureDate?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  closedByUserId?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 300 })
  closedByUserSnapshot?: string;

  @Prop({ trim: true, maxlength: 2000 })
  closureObservations?: string;

  // ── Autoría (server-side) ──
  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 300 })
  createdBySnapshot?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 300 })
  updatedBySnapshot?: string;
}

export const ImprovementPlanSchema = SchemaFactory.createForClass(ImprovementPlan);

/**
 * Índice tenant-scoped anti-duplicados de código (code es OBLIGATORIO —
 * múltiples planes sin código no existen; el code identifica el plan).
 */
ImprovementPlanSchema.index({ companyId: 1, code: 1 }, { unique: true });
ImprovementPlanSchema.index({ companyId: 1, status: 1 });
ImprovementPlanSchema.index({ companyId: 1, year: 1 });
ImprovementPlanSchema.index({ companyId: 1, responsibleUserId: 1 });
// Índices de embebidos para consultas del scorer E2 (todas tenant-scoped).
ImprovementPlanSchema.index({ companyId: 1, 'activities.status': 1 });
ImprovementPlanSchema.index({ companyId: 1, 'activities.dueDate': 1 });

// Re-export de utilidades del lifecycle para consumers del módulo.
export {
  ImprovementPlanStatus,
  ImprovementPlanActivityStatus,
  ImprovementPlanImplementationStatus,
  ImprovementPlanPerceivedEffectiveness,
  IMPROVEMENT_PLAN_TRANSITIONS,
  isImprovementPlanTransitionValid,
  isActivityTransitionValid,
  isImprovementPlanActivityOverdue,
} from './improvement-plan-lifecycle.schema';
