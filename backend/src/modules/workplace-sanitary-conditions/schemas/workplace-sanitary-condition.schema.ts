import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WorkplaceSanitaryConditionDocument = HydratedDocument<WorkplaceSanitaryCondition>;

/**
 * Discriminador obligatorio del subdominio sanitario (3.1.8 — FASE 34B).
 *
 * El estándar 3.1.8 "Agua potable, servicios sanitarios y disposición de
 * basuras" cubre TRES componentes normativos diferenciados. Una sola
 * colección con este enum cerrado los separa semánticamente; NO se permiten
 * valores libres.
 */
export enum SanitaryConditionType {
  /** Disponibilidad y condición del agua potable en el lugar de trabajo. */
  POTABLE_WATER = 'POTABLE_WATER',
  /** Existencia y condición de los servicios sanitarios. */
  SANITARY_SERVICE = 'SANITARY_SERVICE',
  /** Manejo y disposición de basuras en el lugar de trabajo. */
  GARBAGE_MANAGEMENT = 'GARBAGE_MANAGEMENT',
}

/**
 * Estado operativo de la condición sanitaria verificada.
 *
 * Semántica clave (§5 de la fase): un registro DEFICIENT sigue siendo
 * evidencia de que la condición fue VERIFICADA (trazabilidad), pero NO
 * constituye condición adecuada (C2 lo puntúa como 0.5, no como 1).
 */
export enum SanitaryConditionStatus {
  /** La condición está operativa/adecuada en el punto verificado. */
  OPERATIONAL = 'OPERATIONAL',
  /** La condición existe pero presenta deficiencias a corregir. */
  DEFICIENT = 'DEFICIENT',
  /** La condición está fuera de servicio (no disponible). */
  OUT_OF_SERVICE = 'OUT_OF_SERVICE',
}

/**
 * Resultado de la verificación (hecho verificable, no opinión).
 *
 * APT/NOT_APT/INCONCLUSIVE es la nomenclatura natural de la potabilidad del
 * agua; para SANITARY_SERVICE y GARBAGE_MANAGEMENT se usa la misma escala
 * interpretada como "conforme / no conforme / no concluyente". NO se genera
 * una falsa "potabilidad" para otros dominios: el campo expresa el RESULTADO
 * de la verificación del componente, no un concepto clínico ni químico.
 */
export enum SanitaryConditionResult {
  /** Verificación conforme (agua apta / servicio conforme / manejo adecuado). */
  APT = 'APT',
  /** Verificación no conforme (agua no apta / servicio deficiente / manejo inadecuado). */
  NOT_APT = 'NOT_APT',
  /** Verificación sin resultado concluyente. */
  INCONCLUSIVE = 'INCONCLUSIVE',
}

/**
 * Frecuencia de verificación de la condición (enum cerrado, sin valores libres).
 *
 * Semántica de vigencia (C4):
 * - MONTHLY   → vigente 31 días desde la última verificación.
 * - QUARTERLY → vigente 92 días.
 * - SEMIANNUAL → vigente 183 días.
 * - ANNUAL    → vigente 365 días.
 */
export enum VerificationFrequency {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  SEMIANNUAL = 'SEMIANNUAL',
  ANNUAL = 'ANNUAL',
}

/** Días de vigencia por frecuencia de verificación (C4 del provider). */
export const VERIFICATION_FREQUENCY_DAYS: Record<VerificationFrequency, number> = {
  [VerificationFrequency.MONTHLY]: 31,
  [VerificationFrequency.QUARTERLY]: 92,
  [VerificationFrequency.SEMIANNUAL]: 183,
  [VerificationFrequency.ANNUAL]: 365,
};

/**
 * Condición sanitaria del lugar de trabajo verificada por la empresa
 * (estándar 3.1.8 — FASE 34B).
 *
 * PROPÓSITO: acreditar de forma verificable la disponibilidad/condición de
 * agua potable, servicios sanitarios adecuados y manejo/disposición de
 * basuras en el lugar de trabajo.
 *
 * METADATA-ONLY — NO almacena:
 * - información clínica de trabajadores
 * - resultados médicos individuales
 * - diagnósticos o historias clínicas
 * - datos sensibles innecesarios
 *
 * FRONTERA NORMATIVA (anti-double-scoring, FASE 34A):
 * La evidencia de 3.1.8 proviene EXCLUSIVAMENTE de esta entidad. El provider
 * 3.1.8 NO consume EnvironmentalMeasurement (4.1.4), HazardousSubstance
 * (4.1.3), InspectionActivity (4.2.4), Maintenance (4.2.5),
 * HealthPromotionActivity (3.1.2/3.1.7), WorkRestriction, JobProfile, Risk ni
 * DocumentMaster para calcular el score. Una inspección o un documento puede
 * existir como contexto complementario, pero no puntúa aquí.
 */
@Schema({ timestamps: true })
export class WorkplaceSanitaryCondition {
  /** Empresa propietaria del registro (tenant isolation). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  /** Componente normativo del estándar 3.1.8 (discriminador obligatorio). */
  @Prop({ required: true, enum: Object.values(SanitaryConditionType) })
  conditionType!: SanitaryConditionType;

  /** Código interno del registro (identificación operativa). */
  @Prop({ required: true, trim: true, maxlength: 50 })
  code!: string;

  /** Descripción de la condición verificada (operativa, no clínica). */
  @Prop({ required: true, trim: true, maxlength: 500 })
  description!: string;

  /** Ubicación física de la condición (texto; el proyecto no tiene entidad Location). */
  @Prop({ required: true, trim: true, maxlength: 200 })
  location!: string;

  /** Estado operativo de la condición (DEFICIENT sigue siendo evidencia de verificación). */
  @Prop({
    required: true,
    enum: Object.values(SanitaryConditionStatus),
    default: SanitaryConditionStatus.OPERATIONAL,
  })
  status!: SanitaryConditionStatus;

  /** Resultado de la última verificación (hecho verificable). */
  @Prop({
    required: true,
    enum: Object.values(SanitaryConditionResult),
    default: SanitaryConditionResult.APT,
  })
  conditionResult!: SanitaryConditionResult;

  /** Fecha de la última verificación de la condición. */
  @Prop({ required: true, type: Date })
  lastVerificationDate!: Date;

  /** Próxima verificación programada (>= lastVerificationDate; validado en service). */
  @Prop({ type: Date })
  nextVerificationDate?: Date;

  /** Frecuencia de verificación definida por la empresa (enum cerrado). */
  @Prop({
    required: true,
    enum: Object.values(VerificationFrequency),
    default: VerificationFrequency.ANNUAL,
  })
  verificationFrequency!: VerificationFrequency;

  /** Nombre del responsable de la condición/verificación (metadata operativa). */
  @Prop({ required: true, trim: true, maxlength: 200 })
  responsible!: string;

  /** Referencia documental de la verificación (URL/referencia; NO documento clínico). */
  @Prop({ trim: true, maxlength: 500 })
  evidenceUrl?: string;

  /** Observaciones operativas (limpieza, mantenimientos de la condición, etc.). */
  @Prop({ trim: true, maxlength: 2000 })
  observations?: string;

  /** Borrado lógico (el proyecto no usa borrado físico). */
  @Prop({ required: true, default: true })
  active!: boolean;

  /** UID del usuario que creó el registro. */
  @Prop({ trim: true, maxlength: 128 })
  createdBy?: string;

  /** UID del último usuario que modificó el registro. */
  @Prop({ trim: true, maxlength: 128 })
  updatedBy?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const WorkplaceSanitaryConditionSchema =
  SchemaFactory.createForClass(WorkplaceSanitaryCondition);

// Índices tenant-scoped (patrón del proyecto: companyId primero).
WorkplaceSanitaryConditionSchema.index({ companyId: 1, conditionType: 1 });
WorkplaceSanitaryConditionSchema.index({ companyId: 1, status: 1 });
WorkplaceSanitaryConditionSchema.index({ companyId: 1, active: 1 });
WorkplaceSanitaryConditionSchema.index({ companyId: 1, lastVerificationDate: -1 });
WorkplaceSanitaryConditionSchema.index({ companyId: 1, code: 1 });
