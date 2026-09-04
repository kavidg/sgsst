/**
 * DTO para la respuesta del Dashboard de Indicadores.
 *
 * El response contract respeta los schemas existentes:
 * - IndicatorDefinition (code, name, formulaType, formula, targetOperator, targetValue, etc.)
 * - IndicatorMeasurement (calculatedValue, status, source, period, etc.)
 *
 * NO_DATA NO se convierte en TARGET_NOT_MET.
 * compliancePercentage solo considera eligible (status !== NO_DATA).
 */

/** Resumen agregado del dashboard para un período. */
export interface IndicatorDashboardSummary {
  /** Total de indicadores activos. */
  total: number;
  /** Indicadores con medición válida (status !== NO_DATA). */
  eligible: number;
  /** Indicadores que alcanzan la meta. */
  targetMet: number;
  /** Indicadores que no alcanzan la meta. */
  targetNotMet: number;
  /** Indicadores sin datos para el período. */
  noData: number;
  /** Porcentaje de cumplimiento: (targetMet / eligible) * 100, o 0 si eligible === 0. */
  compliancePercentage: number;
}

/** Información de la meta del indicador. */
export interface IndicatorTargetInfo {
  operator?: string;
  value?: number;
  min?: number;
  max?: number;
}

/** Un indicador individual en el dashboard. */
export interface IndicatorDashboardItem {
  /** ObjectId del IndicatorDefinition. */
  id: string;
  /** Código estable del indicador (ej: 'ind-09-incident-closure'). */
  code: string;
  /** Nombre legible del indicador. */
  name: string;
  /** Tipo de fórmula. */
  formulaType: string;
  /** Valor calculado de la medición, o null si NO_DATA. */
  calculatedValue: number | null;
  /** Meta del indicador. */
  target: IndicatorTargetInfo;
  /** Estado de la medición: TARGET_MET | TARGET_NOT_MET | NO_DATA | CALCULATED. */
  status: string;
  /** Fuente de la medición: AUTOMATIC | MANUAL, o null si NO_DATA. */
  source: string | null;
  /** Período de la medición. */
  period: string;
  /** Unidad de medida (ej: '%', 'registros', '× 200,000 hrs'). */
  unit: string;
}

/** Respuesta completa del dashboard. */
export interface IndicatorDashboardResponse {
  /** Período consultado. */
  period: string;
  /** Resumen agregado. */
  summary: IndicatorDashboardSummary;
  /** Lista de indicadores ordenada por code ascendente. */
  indicators: IndicatorDashboardItem[];
}

/** Detalle de un indicador individual. */
export interface IndicatorDetailResponse {
  /** Definición del indicador. */
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  subcategory: string;
  sourceModule: string;
  formulaType: string;
  formula: Record<string, unknown>;
  unit: string;
  /** Meta del indicador. */
  target: IndicatorTargetInfo;
  /** Medición para el período (null si NO_DATA). */
  measurement: {
    calculatedValue: number | null;
    numerator: number;
    denominator: number;
    status: string;
    source: string | null;
    period: string;
    periodStart: Date;
    periodEnd: Date;
    measuredAt: Date | null;
  } | null;
  /** Estado consolidado. */
  status: string;
}
