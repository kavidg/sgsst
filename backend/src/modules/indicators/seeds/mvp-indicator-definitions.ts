import { IndicatorCategory } from '../enums/indicator-category.enum';
import { IndicatorSubcategory } from '../enums/indicator-subcategory.enum';
import { IndicatorFormulaType } from '../enums/indicator-formula-type.enum';
import { IndicatorFrequency } from '../enums/indicator-frequency.enum';
import { IndicatorTargetOperator } from '../enums/indicator-target-operator.enum';
import { FormulaDefinition, DataSourceDefinition } from '../formula/formula-types';

/** Helper to create a typed DataSourceDefinition without string literal issues. */
function ds(module: string, field: string): DataSourceDefinition {
  return { module, field } as DataSourceDefinition;
}

/**
 * Definición de un indicador MVP para seed.
 *
 * Cada seed indicator tiene un `code` estable que lo identifica de forma
 * idempotente. Si el indicador ya existe para una empresa, el seed lo omite.
 */
export interface SeedIndicatorDefinition {
  /** Código estable del indicador (idempotente). */
  code: string;
  /** Nombre legible. */
  name: string;
  /** Descripción. */
  description: string;
  /** Categoría PHVA (estructura/proceso/resultado). */
  category: IndicatorCategory;
  /** Subcategoría temática. */
  subcategory: IndicatorSubcategory;
  /** Módulo fuente (para referencia humana). */
  sourceModule: string;
  /** Tipo de fórmula. */
  formulaType: IndicatorFormulaType;
  /** Definición declarativa de la fórmula. */
  formula: FormulaDefinition;
  /** Unidad de medida. */
  unit: string;
  /** Operador de meta. */
  targetOperator: IndicatorTargetOperator;
  /** Valor de meta. */
  targetValue: number;
  /** Frecuencia de medición. */
  frequency: IndicatorFrequency;
  /** Código del catálogo normativo SG-SST relacionado. */
  catalogCode: string;
  /** Descripción de la meta para referencia humana. */
  targetDescription: string;
}

/**
 * Catálogo MVP de indicadores SG-SST.
 *
 * Estos 5 indicadores son la base mínima para demostrar el flujo end-to-end:
 * IndicatorDefinition → FormulaRegistry → DataSourceResolver → Measurement → Provider → phases.check
 *
 * Todos utilizan fuentes de datos reales actualmente soportadas:
 * - trainings (avgCompletion, effectivenessPercentage)
 * - inspections (completionRate)
 * - risks (controlledPercentage)
 * - incidents (closedCount, count)
 */
export const MVP_INDICATOR_DEFINITIONS: readonly SeedIndicatorDefinition[] = [
  // ─── IND-01: Frecuencia de accidentalidad ──────────────────────────────
  {
    code: 'ind-01-accident-frequency',
    name: 'Frecuencia de accidentalidad',
    description: 'Número de accidentes de trabajo por cada 200.000 horas trabajadas en el período.',
    category: IndicatorCategory.RESULT,
    subcategory: IndicatorSubcategory.SAFETY,
    sourceModule: 'incidents',
    formulaType: IndicatorFormulaType.AUTOMATIC,
    formula: {
      type: 'RATIO_SCALED',
      numerator: ds('incidents', 'accidentCount'),
      denominator: ds('work-data', 'hoursWorked'),
      scale: 200000,
    } as FormulaDefinition,
    unit: '× 200,000 hrs',
    targetOperator: IndicatorTargetOperator.LTE,
    targetValue: 10,
    frequency: IndicatorFrequency.MONTHLY,
    catalogCode: '3.3.2',
    targetDescription: '<= 10 accidentes por 200,000 horas trabajadas',
  },

  // ─── IND-02: Severidad de accidentalidad ────────────────────────────────
  {
    code: 'ind-02-accident-severity',
    name: 'Severidad de accidentalidad',
    description: 'Días perdidos por cada 200.000 horas trabajadas en el período.',
    category: IndicatorCategory.RESULT,
    subcategory: IndicatorSubcategory.SAFETY,
    sourceModule: 'incidents',
    formulaType: IndicatorFormulaType.AUTOMATIC,
    formula: {
      type: 'RATIO_SCALED',
      numerator: ds('incidents', 'daysLost'),
      denominator: ds('work-data', 'hoursWorked'),
      scale: 200000,
    } as FormulaDefinition,
    unit: 'días / 200,000 hrs',
    targetOperator: IndicatorTargetOperator.LTE,
    targetValue: 500,
    frequency: IndicatorFrequency.MONTHLY,
    catalogCode: '3.3.2',
    targetDescription: '<= 500 días perdidos por 200,000 horas trabajadas',
  },

  // ─── IND-03: Índice de ausentismo ──────────────────────────────────────
  {
    code: 'ind-03-absenteeism-rate',
    name: 'Índice de ausentismo',
    description: 'Días de ausentismo por cada 200.000 horas trabajadas en el período.',
    category: IndicatorCategory.RESULT,
    subcategory: IndicatorSubcategory.HEALTH,
    sourceModule: 'absenteeism',
    formulaType: IndicatorFormulaType.AUTOMATIC,
    formula: {
      type: 'RATIO_SCALED',
      numerator: ds('absenteeism', 'daysAbsent'),
      denominator: ds('work-data', 'hoursWorked'),
      scale: 200000,
    } as FormulaDefinition,
    unit: 'días / 200,000 hrs',
    targetOperator: IndicatorTargetOperator.LTE,
    targetValue: 500,
    frequency: IndicatorFrequency.MONTHLY,
    catalogCode: '3.2.1',
    targetDescription: '<= 500 días ausentes por 200,000 horas trabajadas',
  },

  // ─── IND-04: Cumplimiento de capacitaciones ─────────────────────────────
  {
    code: 'ind-04-training-compliance',
    name: 'Cumplimiento de capacitaciones',
    description: 'Porcentaje promedio de completitud de las capacitaciones ejecutadas en el período.',
    category: IndicatorCategory.PROCESS,
    subcategory: IndicatorSubcategory.TRAINING,
    sourceModule: 'trainings',
    formulaType: IndicatorFormulaType.AUTOMATIC,
    formula: {
      type: 'AVERAGE',
      source: ds('trainings', 'avgCompletion'),
    } as FormulaDefinition,
    unit: '%',
    targetOperator: IndicatorTargetOperator.GTE,
    targetValue: 80,
    frequency: IndicatorFrequency.QUARTERLY,
    catalogCode: '6.1.1',
    targetDescription: '>= 80% de completitud promedio en capacitaciones',
  },

  // ─── IND-05: Cumplimiento de inspecciones ───────────────────────────────
  {
    code: 'ind-05-inspection-compliance',
    name: 'Cumplimiento de inspecciones',
    description: 'Porcentaje de inspecciones ejecutadas respecto a las programadas.',
    category: IndicatorCategory.PROCESS,
    subcategory: IndicatorSubcategory.SAFETY,
    sourceModule: 'inspections',
    formulaType: IndicatorFormulaType.AUTOMATIC,
    formula: {
      type: 'AVERAGE',
      source: ds('inspections', 'completionRate'),
    } as FormulaDefinition,
    unit: '%',
    targetOperator: IndicatorTargetOperator.GTE,
    targetValue: 90,
    frequency: IndicatorFrequency.MONTHLY,
    catalogCode: '4.2.2',
    targetDescription: '>= 90% de inspecciones ejecutadas',
  },

  // ─── IND-06: Riesgos controlados ────────────────────────────────────────
  {
    code: 'ind-06-risk-controlled',
    name: 'Riesgos controlados',
    description: 'Porcentaje de riesgos con nivel aceptable (riskLevel <= 6).',
    category: IndicatorCategory.PROCESS,
    subcategory: IndicatorSubcategory.RISK,
    sourceModule: 'risks',
    formulaType: IndicatorFormulaType.AUTOMATIC,
    formula: {
      type: 'AVERAGE',
      source: ds('risks', 'controlledPercentage'),
    } as FormulaDefinition,
    unit: '%',
    targetOperator: IndicatorTargetOperator.GTE,
    targetValue: 70,
    frequency: IndicatorFrequency.QUARTERLY,
    catalogCode: '4.2.2',
    targetDescription: '>= 70% de riesgos con nivel controlado',
  },

  // ─── IND-07: Registros de ausentismo ──────────────────────────────────
  {
    code: 'ind-07-absenteeism-records',
    name: 'Registros de ausentismo',
    description: 'Cantidad de registros de ausentismo en el período.',
    category: IndicatorCategory.PROCESS,
    subcategory: IndicatorSubcategory.HEALTH,
    sourceModule: 'absenteeism',
    formulaType: IndicatorFormulaType.AUTOMATIC,
    formula: {
      type: 'COUNT',
      source: ds('absenteeism', 'count'),
    } as FormulaDefinition,
    unit: 'registros',
    targetOperator: IndicatorTargetOperator.LTE,
    targetValue: 10,
    frequency: IndicatorFrequency.MONTHLY,
    catalogCode: '3.2.1',
    targetDescription: '<= 10 registros de ausentismo por mes (informativo)',
  },

  // ─── IND-08: Efectividad de capacitación ────────────────────────────────
  {
    code: 'ind-08-training-effectiveness',
    name: 'Efectividad de capacitación',
    description: 'Porcentaje promedio de efectividad de las capacitaciones según evaluación.',
    category: IndicatorCategory.RESULT,
    subcategory: IndicatorSubcategory.TRAINING,
    sourceModule: 'trainings',
    formulaType: IndicatorFormulaType.AUTOMATIC,
    formula: {
      type: 'AVERAGE',
      source: ds('trainings', 'effectivenessPercentage'),
    } as FormulaDefinition,
    unit: '%',
    targetOperator: IndicatorTargetOperator.GTE,
    targetValue: 70,
    frequency: IndicatorFrequency.QUARTERLY,
    catalogCode: '6.1.1',
    targetDescription: '>= 70% de efectividad en capacitaciones',
  },

  // ─── IND-09: Incidentes cerrados ────────────────────────────────────────
  {
    code: 'ind-09-incident-closure',
    name: 'Incidentes cerrados',
    description: 'Porcentaje de incidentes cerrados respecto al total registrado en el período.',
    category: IndicatorCategory.PROCESS,
    subcategory: IndicatorSubcategory.SAFETY,
    sourceModule: 'incidents',
    formulaType: IndicatorFormulaType.AUTOMATIC,
    formula: {
      type: 'PERCENTAGE',
      part: ds('incidents', 'closedCount'),
      whole: ds('incidents', 'count'),
    } as FormulaDefinition,
    unit: '%',
    targetOperator: IndicatorTargetOperator.GTE,
    targetValue: 80,
    frequency: IndicatorFrequency.MONTHLY,
    catalogCode: '3.3.2',
    targetDescription: '>= 80% de incidentes cerrados',
  },

  // ─── IND-10: Cumplimiento documental ──────────────────────────────────
  {
    code: 'ind-10-document-compliance',
    name: 'Cumplimiento documental',
    description: 'Porcentaje de documentos vigentes (con fecha de expiración >= fecha de referencia) respecto al total.',
    category: IndicatorCategory.PROCESS,
    subcategory: IndicatorSubcategory.DOCUMENTATION,
    sourceModule: 'documents',
    formulaType: IndicatorFormulaType.AUTOMATIC,
    formula: {
      type: 'PERCENTAGE',
      part: ds('documents', 'validCount'),
      whole: ds('documents', 'count'),
    } as FormulaDefinition,
    unit: '%',
    targetOperator: IndicatorTargetOperator.GTE,
    targetValue: 90,
    frequency: IndicatorFrequency.MONTHLY,
    catalogCode: '6.1.1',
    targetDescription: '>= 90% de documentos vigentes',
  },

  // ─── IND-11: Documentos vencidos ──────────────────────────────────────
  {
    code: 'ind-11-expired-documents',
    name: 'Documentos vencidos',
    description: 'Porcentaje de documentos vencidos (con fecha de expiración < fecha de referencia) respecto al total.',
    category: IndicatorCategory.PROCESS,
    subcategory: IndicatorSubcategory.DOCUMENTATION,
    sourceModule: 'documents',
    formulaType: IndicatorFormulaType.AUTOMATIC,
    formula: {
      type: 'PERCENTAGE',
      part: ds('documents', 'expiredCount'),
      whole: ds('documents', 'count'),
    } as FormulaDefinition,
    unit: '%',
    targetOperator: IndicatorTargetOperator.LTE,
    targetValue: 10,
    frequency: IndicatorFrequency.MONTHLY,
    catalogCode: '6.1.1',
    targetDescription: '<= 10% de documentos vencidos',
  },
];
