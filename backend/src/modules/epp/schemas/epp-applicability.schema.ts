import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type EppApplicabilityDocument = HydratedDocument<EppApplicability>;

/**
 * ETAPA 4.2.6 — Matriz de aplicabilidad EPP (fuente de verdad de REQUISITOS).
 *
 * Representa: Empresa → Cargo/JobProfile → EPP requerido.
 *
 * FRONTERAS DE DOMINIO (requisitos ≠ cumplimiento):
 *  - EppApplicability SOLO define QUÉ EPP requiere cada cargo (requisito).
 *  - EppDelivery sigue siendo la ÚNICA fuente de verdad de lo que fue
 *    entregado realmente (cumplimiento). Esta matriz NO acredita entregas.
 *  - NO genera score: el scoring de 4.2.6 (epp-scoring.ts /
 *    EppComplianceProvider) NO se modifica en esta etapa; consumirá la matriz
 *    como dependencia de contexto en una etapa posterior.
 *  - NO duplica riesgos (JobProfile.associatedHazardIds → Risk sigue siendo la
 *    relación Cargo → Riesgo), ni controles (4.2.2), ni capacitación (1.2.x).
 *
 * IDENTIDAD:
 *  - jobProfileId → JobProfile._id del MISMO tenant (validado en service).
 *  - eppItemId  → `eppId` LÓGICO dentro de SstEpp.catalog[] de la empresa.
 *    SstEppCatalogItem tiene `_id: false`: NO se inventa ObjectId; la
 *    identidad lógica del ítem de catálogo es su `eppId` (igual que
 *    EppDelivery.eppItemId).
 *
 * Unicidad lógica: companyId + jobProfileId + eppItemId (índice único con
 * collation case-insensitive como el resto de índices del repo). Duplicado →
 * 409 Conflict en el service.
 *
 * Baja lógica: `active = false` (nunca DELETE físico) para conservar el
 * histórico de auditoría de la matriz.
 */
@Schema({ timestamps: true })
export class EppApplicability {
  /** Empresa propietaria de la relación (tenant isolation, server-side). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  /** Perfil de cargo (JobProfile._id del MISMO tenant; validado en service). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'JobProfile' })
  jobProfileId!: Types.ObjectId;

  /** Identidad LÓGICA del ítem en SstEpp.catalog[] (eppId; validado en service). */
  @Prop({ required: true, trim: true, maxlength: 128 })
  eppItemId!: string;

  /** true = el cargo requiere este EPP; false = explícitamente no requerido. */
  @Prop({ required: true, type: Boolean, default: true })
  required!: boolean;

  /** Motivo del requisito (ej. "Trabajo en altura"). Máx. 250 caracteres. */
  @Prop({ trim: true, maxlength: 250 })
  reason?: string;

  /**
   * Ámbito de aplicación en texto (ej. "Durante soldadura"). NO es una entidad
   * de tareas: solo describe el alcance sin estructura adicional.
   */
  @Prop({ trim: true, maxlength: 250 })
  scope?: string;

  /** Desactivación lógica (nunca borrado físico; histórico de auditoría). */
  @Prop({ required: true, type: Boolean, default: true })
  active!: boolean;

  /** UID Firebase del creador (server-side; nunca del cliente). */
  @Prop({ required: true, trim: true, maxlength: 128 })
  createdBy!: string;

  /** UID Firebase del último editor (server-side). */
  @Prop({ trim: true, maxlength: 128 })
  updatedBy?: string;
}

export const EppApplicabilitySchema = SchemaFactory.createForClass(EppApplicability);

/** Índices tenant-scoped para las consultas de la matriz. */
EppApplicabilitySchema.index({ companyId: 1, jobProfileId: 1 });
EppApplicabilitySchema.index({ companyId: 1, eppItemId: 1 });

/** Unicidad lógica: como máximo una relación empresa + cargo + EPP. */
EppApplicabilitySchema.index(
  { companyId: 1, jobProfileId: 1, eppItemId: 1 },
  {
    unique: true,
    collation: { locale: 'es', strength: 2 },
  },
);
