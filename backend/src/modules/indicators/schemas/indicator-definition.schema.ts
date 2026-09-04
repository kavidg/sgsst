import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { IndicatorCategory } from '../enums/indicator-category.enum';
import { IndicatorSubcategory } from '../enums/indicator-subcategory.enum';
import { IndicatorFormulaType } from '../enums/indicator-formula-type.enum';
import { IndicatorFrequency } from '../enums/indicator-frequency.enum';
import { IndicatorTargetOperator } from '../enums/indicator-target-operator.enum';

export type IndicatorDefinitionDocument = HydratedDocument<IndicatorDefinition>;

/**
 * Definición de un indicador SG-SST.
 *
 * Representa la configuración de un indicador: qué mide, cómo se calcula,
 * cuál es su meta y con qué frecuencia se mide.
 *
 * Cada indicador pertenece a una empresa (companyId) y tiene un código
 * único dentro de esa empresa.
 */
@Schema({ timestamps: true })
export class IndicatorDefinition {
  @Prop({ required: true, type: Types.ObjectId, index: true })
  companyId!: Types.ObjectId;

  /** Código único del indicador dentro de la empresa. */
  @Prop({ required: true, lowercase: true, trim: true })
  code!: string;

  /** Nombre legible del indicador. */
  @Prop({ required: true, trim: true })
  name!: string;

  /** Descripción del indicador. */
  @Prop({ default: '' })
  description!: string;

  /** Categoría del indicador (estructura, proceso, resultado). */
  @Prop({ required: true, enum: IndicatorCategory, default: IndicatorCategory.PROCESS })
  category!: IndicatorCategory;

  /** Subcategoría temática. */
  @Prop({ required: true, enum: IndicatorSubcategory, default: IndicatorSubcategory.OTHER })
  subcategory!: IndicatorSubcategory;

  /** Módulo fuente de datos para cálculo automático. */
  @Prop({ default: '' })
  sourceModule!: string;

  /** Tipo de fórmula (automática, semi-automática, manual). */
  @Prop({ required: true, enum: IndicatorFormulaType, default: IndicatorFormulaType.MANUAL })
  formulaType!: IndicatorFormulaType;

  /** Definición declarativa de la fórmula (objeto JSON seguro). */
  @Prop({ type: Object, default: {} })
  formula!: Record<string, unknown>;

  /** Unidad de medida (%, ratio, count, days, etc.). */
  @Prop({ default: '%' })
  unit!: string;

  /** Valor de la meta. */
  @Prop({ type: Number })
  targetValue?: number;

  /** Operador de comparación de meta. */
  @Prop({ enum: IndicatorTargetOperator })
  targetOperator?: IndicatorTargetOperator;

  /** Meta mínima (para operador BETWEEN). */
  @Prop({ type: Number })
  targetMin?: number;

  /** Meta máxima (para operador BETWEEN). */
  @Prop({ type: Number })
  targetMax?: number;

  /** Frecuencia de medición. */
  @Prop({ required: true, enum: IndicatorFrequency, default: IndicatorFrequency.MONTHLY })
  frequency!: IndicatorFrequency;

  /** Responsable del indicador. */
  @Prop({ default: '' })
  responsible!: string;

  /** Área responsable. */
  @Prop({ default: '' })
  responsibleArea!: string;

  /** Indica si el indicador está activo (soft delete). */
  @Prop({ default: true })
  isActive!: boolean;

  /** Niveles de la Resolución 0312 aplicables. */
  @Prop({ type: [String], default: ['60'] })
  applicableLevels!: string[];

  /** Código del catálogo SG-SST relacionado (ej: '6.1.1'). */
  @Prop({ default: '' })
  catalogCode!: string;
}

export const IndicatorDefinitionSchema = SchemaFactory.createForClass(IndicatorDefinition);

// Índice compuesto único: companyId + code
IndicatorDefinitionSchema.index({ companyId: 1, code: 1 }, { unique: true });

// Índice para búsquedas por empresa
IndicatorDefinitionSchema.index({ companyId: 1, isActive: 1 });
