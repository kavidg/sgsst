import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type JobProfileDocument = HydratedDocument<JobProfile>;

/**
 * Perfil de cargo (estándar 3.1.3 — "Información al médico de los perfiles de cargo").
 *
 * Representa SEMÁNTICAMENTE el perfil de un cargo con la información que debe
 * estar disponible para el médico que realiza las evaluaciones médicas
 * ocupacionales. Es información DEL CARGO, nunca información clínica
 * individual del trabajador.
 *
 * NO almacena:
 * - diagnósticos, resultados clínicos ni historias clínicas;
 * - datos personales de salud de trabajadores.
 *
 * Los peligros/riesgos NO se duplican: `associatedHazardIds` referencia la
 * matriz de peligros existente (entidad Risk) del mismo tenant.
 *
 * FASE 30D-2 — infraestructura creada para permitir un provider EXACT de 3.1.3.
 */
@Schema({ timestamps: true })
export class JobProfile {
  /** Empresa propietaria del registro (tenant isolation). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  /** Código interno del perfil de cargo dentro de la empresa. */
  @Prop({ required: true, type: String })
  code!: string;

  /** Nombre del cargo. */
  @Prop({ required: true, type: String })
  name!: string;

  /** Descripción del cargo (propósito, alcance, ubicación). */
  @Prop({ type: String, default: '' })
  description!: string;

  /** Funciones principales del cargo. */
  @Prop({ type: [String], default: [] })
  functions!: string[];

  /** Responsabilidades del cargo. */
  @Prop({ type: [String], default: [] })
  responsibilities!: string[];

  /** Condiciones relevantes del trabajo (turnos, carga física, ambiente...). */
  @Prop({ type: [String], default: [] })
  workConditions!: string[];

  /**
   * Referencias a peligros/riesgos de la matriz existente (Risk) asociados al
   * cargo. Se usa la identidad estable de Risk; NO se copian nombres libres.
   */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Risk' }], default: [] })
  associatedHazardIds!: Types.ObjectId[];

  /**
   * Información del CARGO relevante para la valoración médica ocupacional
   * (exigencias físicas, exposición relevante, agentes, requerimientos
   * específicos...). NO es información clínica del trabajador.
   */
  @Prop({ type: String, default: '' })
  medicalRelevantInformation!: string;

  /** Perfil activo (desactivación blanda, sin borrados físicos). */
  @Prop({ type: Boolean, default: true })
  active!: boolean;

  /** Usuario (uid) que creó el perfil (trazabilidad básica). */
  @Prop({ type: String, default: '' })
  createdBy?: string;

  /** Usuario (uid) que actualizó por última vez el perfil. */
  @Prop({ type: String, default: '' })
  updatedBy?: string;
}

export const JobProfileSchema = SchemaFactory.createForClass(JobProfile);

// Índices para consultas frecuentes (tenant-scoped)
JobProfileSchema.index({ companyId: 1, code: 1 });
JobProfileSchema.index({ companyId: 1, active: 1 });
