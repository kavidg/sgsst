/**
 * Análisis de una fase del ciclo PHVA.
 */
export interface PhvaPhaseData {
  /** Porcentaje de cumplimiento de la fase (0-100). Proviene del Compliance Engine. */
  percentage: number;
  /** Elementos pendientes de la fase (títulos reales, sin datos ficticios). */
  pending: string[];
}

/**
 * Resultado del análisis PHVA de una empresa.
 */
export interface PhvaAnalysisResult {
  /** Cumplimiento global ponderado (0-100). Reutiliza overallCompliance del Compliance Engine. */
  overall: number;
  planear: PhvaPhaseData;
  hacer: PhvaPhaseData;
  verificar: PhvaPhaseData;
  actuar: PhvaPhaseData;
}
