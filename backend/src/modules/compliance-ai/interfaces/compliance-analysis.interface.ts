/**
 * Resultado del análisis de cumplimiento SG-SST de una empresa.
 *
 * Estructura preparada para soportar catálogos de 7, 21 o 60 estándares:
 * la semántica de `completed`/`pending` es independiente del tamaño del
 * catálogo (cuenta ítems evaluados, no códigos hardcodeados).
 */
export interface ComplianceAnalysisResult {
  /** Cumplimiento global ponderado (0-100). Reutiliza el Compliance Engine. */
  overall: number;
  /** Marco de estándares aplicables (ej: '21 estándares') o 'Sin catálogo de estándares'. */
  standardLevel: string;
  /** Ítems/estándares cumplidos (evaluación inicial + autoevaluaciones). */
  completed: number;
  /** Ítems/estándares pendientes por cumplir. */
  pending: number;
  /** Hallazgos críticos o de alta prioridad (títulos reales). */
  criticalFindings: string[];
  /** Recomendaciones derivadas de datos reales (sin IA). */
  recommendations: string[];
}
