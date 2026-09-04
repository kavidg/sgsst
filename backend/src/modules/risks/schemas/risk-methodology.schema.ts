import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RiskMethodologyDocument = HydratedDocument<RiskMethodology>;

/**
 * Estado de la metodología de identificación de peligros.
 *
 * DRAFT    — Metodología en elaboración, no vigente.
 * ACTIVE   — Metodología vigente y aplicable.
 * ARCHIVED — Metodología reemplazada o retirada.
 */
export enum RiskMethodologyStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

/**
 * Entidad que representa la metodología empresarial para la
 * identificación de peligros, evaluación y valoración de riesgos.
 *
 * NO representa un riesgo individual ni un peligro individual.
 * Representa el marco metodológico que la empresa aplica.
 *
 * Relación conceptual:
 *   RiskMethodology → define criterios → Risk (registros individuales)
 */
@Schema({ timestamps: true })
export class RiskMethodology {
  /** Empresa propietaria (tenant isolation). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  /** Nombre de la metodología (ej: 'GTC 45', 'Metodología interna SG-SST'). */
  @Prop({ required: true, type: String })
  name!: string;

  /** Versión de la metodología (ej: '1.0'). */
  @Prop({ required: true, type: String })
  version!: string;

  /** Descripción funcional de la metodología. */
  @Prop({ type: String, default: '' })
  description?: string;

  /** Estado de la metodología. */
  @Prop({
    required: true,
    enum: Object.values(RiskMethodologyStatus),
    default: RiskMethodologyStatus.DRAFT,
    type: String,
  })
  status!: RiskMethodologyStatus;

  /** Fecha desde la cual la metodología entra en vigencia. */
  @Prop({ type: Date })
  effectiveFrom?: Date;

  /** Fecha prevista para revisión. */
  @Prop({ type: Date })
  reviewDate?: Date;

  /** Periodicidad de revisión en meses. */
  @Prop({ type: Number, min: 1 })
  reviewFrequencyMonths?: number;

  /** Responsable de la metodología (referencia administrativa). */
  @Prop({ type: String, default: '' })
  responsible?: string;

  /** Criterios de identificación de peligros. */
  @Prop({ type: String, default: '' })
  identificationCriteria?: string;

  /** Criterios de evaluación del riesgo. */
  @Prop({ type: String, default: '' })
  evaluationCriteria?: string;

  /** Criterios de valoración/clasificación del riesgo. */
  @Prop({ type: String, default: '' })
  valuationCriteria?: string;

  /** Escala de probabilidad utilizada (ej: '1-5', '1-10'). */
  @Prop({ type: String, default: '' })
  probabilityScale?: string;

  /** Escala de consecuencia utilizada (ej: '1-5', '1-10'). */
  @Prop({ type: String, default: '' })
  consequenceScale?: string;

  /** Reglas de clasificación del nivel de riesgo (ej: 'P × C'). */
  @Prop({ type: String, default: '' })
  riskLevelRules?: string;
}

export const RiskMethodologySchema = SchemaFactory.createForClass(RiskMethodology);
RiskMethodologySchema.index({ companyId: 1, status: 1 });
RiskMethodologySchema.index({ companyId: 1, version: 1 });
