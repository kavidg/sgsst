/**
 * E4-A (6.1.1) — Tipos de la metadata OFICIAL del ComplianceEngine para
 * `module === 'indicators'` / `standardCode === '6.1.1'`.
 *
 * Espejo exacto de la metadata producida por
 * `backend/src/modules/compliance-engine/providers/indicators-scoring.ts`
 * (formula `dimensions:v1`). El frontend es SOLO LECTOR:
 * - NO recalcula el score (fuente oficial: `moduleCompliance.percentage`).
 * - NO recalcula dimensiones ni pesos.
 * - La conversión ratio 0–1 → porcentaje 0–100 está permitida únicamente
 *   para PRESENTACIÓN visual.
 */

/** Dimensión oficial tal como la emite indicators-scoring.ts. */
export interface IndicatorComplianceDimensionDetail {
  /** 0–1; null = NO evaluable (redistribuida en backend; nunca convertir null en 0). */
  ratio: number | null;
  numerator: number | null;
  denominator: number | null;
  /** Peso informativo de la dimensión (0–100). */
  weight: number;
  /** Detalles contextuales adicionales provistos por el backend. */
  [key: string]: unknown;
}

/** Counters oficiales (17) emitidos por indicators-scoring.ts. */
export interface IndicatorsComplianceCounters {
  totalIndicators: number;
  activeIndicators: number;
  inactiveIndicators: number;
  completeDefinitions: number;
  incompleteDefinitions: number;
  indicatorsWithMeasurement: number;
  indicatorsWithoutMeasurement: number;
  validMeasurements: number;
  targetMet: number;
  targetNotMet: number;
  calculatedWithoutTarget: number;
  measurementsWithEvidence: number;
  measurementsWithNotes: number;
  totalMeasurements: number;
  distinctMeasuredPeriods: number;
  closedPeriods: number;
  openPeriods: number;
  duplicateMeasurementKeys: number;
}

/** Las 6 dimensiones oficiales de 6.1.1 (denominaciones exactas del backend). */
export interface IndicatorsComplianceDimensions {
  existence: IndicatorComplianceDimensionDetail;
  definitionQuality: IndicatorComplianceDimensionDetail;
  measurement: IndicatorComplianceDimensionDetail;
  targetCompliance: IndicatorComplianceDimensionDetail;
  analysisEvidence: IndicatorComplianceDimensionDetail;
  history: IndicatorComplianceDimensionDetail;
}

/**
 * Metadata oficial `dimensions:v1` de 6.1.1.
 * `semantic`, `standardCode` y `phase` se declaran según el contrato del
 * provider; el type guard exige `formula` y la estructura dimensional,
 * sin asumir campos que puedan faltar en versiones futuras.
 */
export interface IndicatorsComplianceMetadataV1 {
  semantic?: 'EXACT';
  standardCode?: '6.1.1';
  phase?: 'check';
  formula: 'dimensions:v1';
  evaluatedPeriod?: string | null;
  noDataReason?: 'no-active-indicators' | 'no-valid-measurements' | null;
  weights?: Record<string, number>;
  dimensions: IndicatorsComplianceDimensions;
  counters: IndicatorsComplianceCounters;
}

/** Claves dimensionales oficiales (orden de presentación). */
export const INDICATOR_DIMENSION_KEYS = [
  'existence',
  'definitionQuality',
  'measurement',
  'targetCompliance',
  'analysisEvidence',
  'history',
] as const;

export type IndicatorDimensionKey = (typeof INDICATOR_DIMENSION_KEYS)[number];

/**
 * Type guard — valida `formula === 'dimensions:v1'` y las propiedades
 * estructurales necesarias (6 dimensiones con `ratio` y counters objetos).
 * NO valida números: los valores recibidos son oficiales del backend.
 */
export function isIndicatorsComplianceMetadataV1(
  value: unknown,
): value is IndicatorsComplianceMetadataV1 {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;

  if (m.formula !== 'dimensions:v1') return false;
  if (!m.dimensions || typeof m.dimensions !== 'object') return false;
  if (!m.counters || typeof m.counters !== 'object') return false;

  const dims = m.dimensions as Record<string, unknown>;
  return INDICATOR_DIMENSION_KEYS.every((key) => {
    const dim = dims[key];
    return (
      !!dim &&
      typeof dim === 'object' &&
      'ratio' in (dim as Record<string, unknown>) &&
      ('weight' in (dim as Record<string, unknown>))
    );
  });
}

/** Conversión SOLO de presentación: ratio 0–1 → 0–100. null → null (no evaluable). */
export function indicatorRatioToPercent(ratio: number | null | undefined): number | null {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return null;
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}
