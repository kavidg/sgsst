import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WasteManagementRecordDocument = HydratedDocument<WasteManagementRecord>;

/**
 * Discriminador obligatorio del tipo de residuo (3.1.9 — FASE 34C).
 *
 * El estándar 3.1.9 "Eliminación adecuada de residuos sólidos, líquidos o
 * gaseosos" cubre los TRES tipos normativos. Una sola colección con este enum
 * cerrado los separa semánticamente; NO se permiten valores libres.
 */
export enum WasteType {
  /** Residuos sólidos generados por la operación. */
  SOLID = 'SOLID',
  /** Residuos líquidos generados por la operación. */
  LIQUID = 'LIQUID',
  /**
   * Residuos/emisiones gaseosas SOLO cuando la empresa realmente los genera y
   * dispone. NO se convierte automáticamente una medición de calidad del aire
   * (EnvironmentalMeasurement.AIR_QUALITY) en evidencia de este tipo.
   */
  GASEOUS = 'GASEOUS',
}

/**
 * Estado operativo de la gestión del residuo.
 *
 * Semántica clave (§10/§12): un registro PLANNED existe como identificación
 * del residuo, pero su gestión NO se ha ejecutado — NO es evidencia de
 * disposición (el provider no lo cuenta para C2/C3/C4).
 */
export enum WasteManagementStatus {
  /** Residuo identificado; gestión por definir/programar (NO es disposición). */
  PLANNED = 'PLANNED',
  /** Gestión activa: manejo y disposición en curso. */
  ACTIVE = 'ACTIVE',
  /** Gestión suspendida temporalmente (NO es evidencia de disposición vigente). */
  SUSPENDED = 'SUSPENDED',
}

/**
 * Frecuencia de disposición del residuo (enum cerrado, sin valores libres).
 *
 * Semántica de vigencia (C4):
 * - WEEKLY     → vigente 8 días desde la última disposición.
 * - MONTHLY    → vigente 31 días.
 * - QUARTERLY  → vigente 92 días.
 * - SEMIANNUAL → vigente 183 días.
 * - ANNUAL     → vigente 365 días.
 */
export enum WasteDisposalFrequency {
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  SEMIANNUAL = 'SEMIANNUAL',
  ANNUAL = 'ANNUAL',
}

/** Días de vigencia por frecuencia de disposición (C4 del provider). */
export const WASTE_DISPOSAL_FREQUENCY_DAYS: Record<WasteDisposalFrequency, number> = {
  [WasteDisposalFrequency.WEEKLY]: 8,
  [WasteDisposalFrequency.MONTHLY]: 31,
  [WasteDisposalFrequency.QUARTERLY]: 92,
  [WasteDisposalFrequency.SEMIANNUAL]: 183,
  [WasteDisposalFrequency.ANNUAL]: 365,
};

/**
 * Registro de gestión de residuos generados en el lugar de trabajo
 * (estándar 3.1.9 — FASE 34C).
 *
 * PROPÓSITO: acreditar que los residuos generados por la operación (sólidos,
 * líquidos o gaseosos) son identificados, manejados y eliminados/dispuestos
 * adecuadamente, con trazabilidad (fecha, responsable, evidencia) y
 * continuidad (frecuencia).
 *
 * METADATA-ONLY — NO almacena:
 * - información clínica ni datos personales innecesarios
 * - resultados de mediciones ambientales (eso pertenece a
 *   EnvironmentalMeasurement / 4.1.4)
 *
 * SEMÁNTICA (§34): residuo identificado + manejo + disposición + trazabilidad
 * + continuidad. NO son equivalentes:
 *   sustancia peligrosa ≠ residuo
 *   medición ambiental  ≠ disposición
 *   inspección          ≠ disposición
 *   documento           ≠ ejecución
 *
 * FRONTERA NORMATIVA (anti-double-scoring, FASE 34A/34C):
 * La evidencia de 3.1.9 proviene EXCLUSIVAMENTE de esta entidad. El provider
 * 3.1.9 NO consume HazardousSubstance (4.1.3), EnvironmentalMeasurement
 * (4.1.4), InspectionActivity (4.2.4), Maintenance (4.2.5),
 * HealthPromotionActivity (3.1.2/3.1.7), WorkplaceSanitaryCondition (3.1.8),
 * WorkRestriction, JobProfile, Risk ni DocumentMaster para calcular el score.
 */
@Schema({ timestamps: true })
export class WasteManagementRecord {
  /** Empresa propietaria del registro (tenant isolation). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  /** Código interno del registro (identificación operativa). */
  @Prop({ required: true, trim: true, maxlength: 50 })
  code!: string;

  /** Tipo de residuo (discriminador obligatorio, enum cerrado). */
  @Prop({ required: true, enum: Object.values(WasteType) })
  wasteType!: WasteType;

  /**
   * ¿El residuo es peligroso? Clasificación operativa informativa.
   * hazardous = true NO implica cumplimiento ni evidencia de eliminación.
   */
  @Prop({ required: true, default: false })
  hazardous!: boolean;

  /** Fuente generadora del residuo (proceso/área operativa). */
  @Prop({ required: true, trim: true, maxlength: 200 })
  source!: string;

  /** Descripción operativa de la generación (qué genera el residuo y cómo). */
  @Prop({ required: true, trim: true, maxlength: 500 })
  generationDescription!: string;

  /** Método de manejo: segregación, almacenamiento temporal, contención. */
  @Prop({ required: true, trim: true, maxlength: 300 })
  handlingMethod!: string;

  /**
   * Método de disposición: entrega a gestor autorizado, tratamiento,
   * disposición final o mecanismo de eliminación aplicable.
   * Obligatorio cuando el registro está ACTIVE (validado en service).
   */
  @Prop({ trim: true, maxlength: 300 })
  disposalMethod?: string;

  /**
   * Destino de la disposición: descripción, referencia a gestor, referencia
   * documental o identificador operativo (trazabilidad de dónde terminó).
   */
  @Prop({ trim: true, maxlength: 300 })
  disposalDestination?: string;

  /** Frecuencia de disposición (enum cerrado). */
  @Prop({
    required: true,
    enum: Object.values(WasteDisposalFrequency),
    default: WasteDisposalFrequency.ANNUAL,
  })
  disposalFrequency!: WasteDisposalFrequency;

  /** Fecha de la última disposición ejecutada. */
  @Prop({ type: Date })
  lastDisposalDate?: Date;

  /** Próxima disposición programada (>= lastDisposalDate; validado en service). */
  @Prop({ type: Date })
  nextDisposalDate?: Date;

  /** Responsable de la gestión del residuo (metadata operativa). */
  @Prop({ required: true, trim: true, maxlength: 200 })
  responsible!: string;

  /** Referencia documental (manifiesto, certificado, registro, soporte). */
  @Prop({ trim: true, maxlength: 500 })
  evidenceUrl?: string;

  /** Observaciones operativas (NO información ambiental de mediciones). */
  @Prop({ trim: true, maxlength: 2000 })
  observations?: string;

  /** Estado de la gestión (PLANNED no es disposición ejecutada). */
  @Prop({
    required: true,
    enum: Object.values(WasteManagementStatus),
    default: WasteManagementStatus.PLANNED,
  })
  status!: WasteManagementStatus;

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

export const WasteManagementRecordSchema =
  SchemaFactory.createForClass(WasteManagementRecord);

// Índices tenant-scoped (patrón del proyecto: companyId primero).
WasteManagementRecordSchema.index({ companyId: 1, wasteType: 1 });
WasteManagementRecordSchema.index({ companyId: 1, status: 1 });
WasteManagementRecordSchema.index({ companyId: 1, hazardous: 1 });
WasteManagementRecordSchema.index({ companyId: 1, active: 1 });
WasteManagementRecordSchema.index({ companyId: 1, lastDisposalDate: -1 });
WasteManagementRecordSchema.index({ companyId: 1, code: 1 });
