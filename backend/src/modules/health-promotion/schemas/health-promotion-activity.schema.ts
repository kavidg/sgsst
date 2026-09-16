import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type HealthPromotionActivityDocument = HydratedDocument<HealthPromotionActivity>;

/**
 * Categorías de actividades de promoción y prevención en salud (3.1.2).
 */
export enum HealthPromotionCategory {
  /** Promoción general de la salud y hábitos saludables. */
  HEALTH_PROMOTION = 'HEALTH_PROMOTION',
  /** Prevención de enfermedades laborales y comunes. */
  DISEASE_PREVENTION = 'DISEASE_PREVENTION',
  /** Educación en salud a la población trabajadora. */
  HEALTH_EDUCATION = 'HEALTH_EDUCATION',
  /** Campañas de salud (jornadas, ferias, semanas de salud). */
  HEALTH_CAMPAIGN = 'HEALTH_CAMPAIGN',
  /** Tamizajes / chequeos preventivos de salud. */
  HEALTH_SCREENING = 'HEALTH_SCREENING',
  /** Jornadas de vacunación. */
  HEALTH_VACCINATION = 'HEALTH_VACCINATION',
  /** Bienestar y estilos de vida saludables. */
  HEALTH_WELLNESS = 'HEALTH_WELLNESS',
}

/**
 * Estado de la actividad. La ejecución real se demuestra con status
 * COMPLETED + activityDate (no futura) + responsable + evidencia + participantes.
 */
export enum HealthPromotionActivityStatus {
  /** Planificada (puede tener fecha futura o aún sin fecha). */
  PLANNED = 'PLANNED',
  /** Ejecutada/completada: es la única evidencia de ejecución real. */
  COMPLETED = 'COMPLETED',
  /** Cancelada: NO se considera evidencia de promoción y prevención. */
  CANCELLED = 'CANCELLED',
}

/**
 * Clasificación NORMATIVA de la actividad (FASE 32 — anti-double-scoring).
 *
 * Regla: una evidencia = un estándar de scoring. La clasificación se asigna
 * en la creación, es INMUTABLE en la práctica (los providers nunca reclasifican)
 * y define inequívocamente a qué estándar puntúa la actividad:
 *
 * - STANDARD_3_1_2 → puntúa exclusivamente 3.1.2 (Promoción y prevención en
 *   salud): promoción, prevención, educación, campañas, tamizajes, vacunación.
 * - STANDARD_3_1_7 → puntúa exclusivamente 3.1.7 (Estilos de vida y entornos
 *   saludables): controles de tabaquismo, alcoholismo, farmacodependencia y
 *   otros, entornos saludables.
 *
 * Los registros legacy (previos a FASE 32, campo ausente) se interpretan como
 * STANDARD_3_1_2 para preservar el comportamiento histórico del scoring.
 */
export enum HealthPromotionComplianceStandard {
  STANDARD_3_1_2 = 'STANDARD_3_1_2',
  STANDARD_3_1_7 = 'STANDARD_3_1_7',
}

/**
 * Tema específico de la intervención 3.1.7 (FASE 32 — tipificación explícita
 * del alcance normativo, Res. 0312 nivel 60): controles de tabaquismo,
 * alcoholismo, farmacodependencia y otros, estilos de vida y entornos
 * saludables. Relevante para actividades clasificadas STANDARD_3_1_7;
 * documentación/temática de gestión — NUNCA contenido clínico.
 */
export enum LifestyleTopic {
  SMOKING_CONTROL = 'SMOKING_CONTROL',
  ALCOHOL_CONTROL = 'ALCOHOL_CONTROL',
  SUBSTANCE_DEPENDENCY_CONTROL = 'SUBSTANCE_DEPENDENCY_CONTROL',
  HEALTHY_LIFESTYLE = 'HEALTHY_LIFESTYLE',
  HEALTHY_ENVIRONMENT = 'HEALTHY_ENVIRONMENT',
  OTHER = 'OTHER',
}

/**
 * Actividad de promoción y prevención en salud (estándar 3.1.2 — FASE 30E).
 *
 * Representa SEMÁNTICAMENTE una actividad real de promoción/prevención
 * dirigida a la población trabajadora de la empresa: identificación, tipo,
 * objetivo, fecha, responsable, población objetivo, trabajadores objetivo,
 * participantes alcanzados, evidencia de ejecución y estado.
 *
 * NO representa:
 * - un examen médico ocupacional (3.1.4 / legacy exámenes);
 * - una recomendación médica (3.1.6);
 * - una capacitación general (1.2.2 / módulo Trainings);
 * - un indicador (3.3.2 / 6.1.1);
 * - un documento (2.x).
 *
 * Los trabajadores se referencian con los IDs reales de Employee (mismo
 * tenant). La relación con peligros/riesgos, cuando existe, referencia la
 * matriz Risk (relatedRiskIds) SIN duplicar información.
 */
@Schema({ timestamps: true })
export class HealthPromotionActivity {
  /** Empresa propietaria del registro (tenant isolation). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  /** Código interno de la actividad dentro de la empresa. */
  @Prop({ required: true, type: String })
  code!: string;

  /** Título/nombre de la actividad. */
  @Prop({ required: true, type: String })
  title!: string;

  /** Descripción de la actividad. */
  @Prop({ type: String, default: '' })
  description!: string;

  /** Categoría de promoción o prevención en salud. */
  @Prop({
    type: String,
    enum: Object.values(HealthPromotionCategory),
    default: HealthPromotionCategory.HEALTH_PROMOTION,
  })
  category!: HealthPromotionCategory;

  /**
   * Estándar normativo al que puntúa esta actividad (FASE 32).
   * Frontera anti-double-scoring: cada actividad alimenta EXACTAMENTE un
   * estándar (3.1.2 ó 3.1.7), nunca ambos. Valor por defecto STANDARD_3_1_2
   * (compatibilidad con registros previos a la discriminación).
   */
  @Prop({
    type: String,
    enum: Object.values(HealthPromotionComplianceStandard),
    default: HealthPromotionComplianceStandard.STANDARD_3_1_2,
  })
  complianceStandard!: HealthPromotionComplianceStandard;

  /** Tema específico de la intervención 3.1.7 (tipificación explícita). */
  @Prop({
    type: String,
    enum: Object.values(LifestyleTopic),
    required: false,
  })
  lifestyleTopic?: LifestyleTopic;

  /** Objetivo de la actividad. */
  @Prop({ type: String, default: '' })
  objective!: string;

  /** Fecha de la actividad (ejecución o programada). */
  @Prop({ type: Date })
  activityDate?: Date;

  /** Responsable de la actividad (nombre/rol). */
  @Prop({ type: String, default: '' })
  responsible!: string;

  /** Descripción de la población objetivo. */
  @Prop({ type: String, default: '' })
  targetPopulation!: string;

  /** Trabajadores convocados/objetivo (referencias a Employee del mismo tenant). */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Employee' }], default: [] })
  targetEmployeeIds!: Types.ObjectId[];

  /** Trabajadores que realmente participaron (referencias a Employee del mismo tenant). */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Employee' }], default: [] })
  participantEmployeeIds!: Types.ObjectId[];

  /** Peligros/riesgos prioritarios relacionados (matriz Risk), sin duplicación. */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Risk' }], default: [] })
  relatedRiskIds!: Types.ObjectId[];

  /** Evidencia/registro de ejecución (descripción, acta, URL, etc.). */
  @Prop({ type: String, default: '' })
  evidence!: string;

  /** Estado de la actividad (solo COMPLETED demuestra ejecución real). */
  @Prop({
    type: String,
    enum: Object.values(HealthPromotionActivityStatus),
    default: HealthPromotionActivityStatus.PLANNED,
  })
  status!: HealthPromotionActivityStatus;

  /** Registro activo (desactivación blanda, sin borrados físicos). */
  @Prop({ type: Boolean, default: true })
  active!: boolean;

  /** Usuario (uid) que creó la actividad (trazabilidad básica). */
  @Prop({ type: String, default: '' })
  createdBy?: string;

  /** Usuario (uid) que actualizó por última vez la actividad. */
  @Prop({ type: String, default: '' })
  updatedBy?: string;
}

export const HealthPromotionActivitySchema =
  SchemaFactory.createForClass(HealthPromotionActivity);

// Índices para consultas frecuentes (tenant-scoped)
HealthPromotionActivitySchema.index({ companyId: 1, code: 1 });
HealthPromotionActivitySchema.index({ companyId: 1, status: 1 });
HealthPromotionActivitySchema.index({ companyId: 1, activityDate: 1 });
// FASE 32: frontera normativa por estándar (3.1.2 vs 3.1.7) sin doble scoring.
HealthPromotionActivitySchema.index({ companyId: 1, complianceStandard: 1 });
HealthPromotionActivitySchema.index({ companyId: 1, complianceStandard: 1, lifestyleTopic: 1 });
