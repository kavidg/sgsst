// ============================================================
// PhvaEvaluationEngine — Contratos del resultado automático (FASE 1)
// ============================================================
//
// Este módulo NO reemplaza el flujo manual del PHVA ni el Compliance
// Engine: expone un veredicto tipado y auditable por estándar a partir
// de los datos reales de Gestión avanzada (módulo phva-advanced).

/**
 * Versión del motor. Se incluye en cada resultado para trazabilidad:
 * si una regla cambia en el futuro, el resultado histórico conserva la
 * referencia de qué versión del motor lo produjo.
 */
export const PHVA_EVALUATION_ENGINE_VERSION = 'fase-1.0.0';

/**
 * Estados posibles del veredicto automático de un estándar PHVA.
 *
 * Correspondencia con el flujo existente:
 * - CUMPLE_TOTALMENTE  → equivalente al estado manual 'Cumple totalmente'.
 * - NO_CUMPLE          → equivalente al estado manual 'No cumple'.
 * - NO_APLICA          → equivalente al estado manual 'No aplica' (solo con
 *                        condición explícita y verificable en los datos; los
 *                        datos vacíos, un módulo no creado o un error de
 *                        consulta NUNCA se convierten en NO_APLICA).
 * - PENDIENTE_ANALISIS → no existe en el flujo manual: la información aún no
 *                        alcanza para evaluar de forma segura.
 */
export enum AutoResultStatus {
  CUMPLE_TOTALMENTE = 'CUMPLE_TOTALMENTE',
  NO_CUMPLE = 'NO_CUMPLE',
  NO_APLICA = 'NO_APLICA',
  PENDIENTE_ANALISIS = 'PENDIENTE_ANALISIS',
}

/**
 * Traza de un requisito evaluado por una regla.
 *
 * `satisfied` nunca es un booleano opaco como única explicación:
 * - true  → el requisito está demostrado (`evidence` referencia el dato real).
 * - false → el requisito está incumplido o pendiente (`evidence` explica qué
 *           falta y `missingInformation` aporta el mensaje para el usuario).
 * - null  → el requisito no es evaluable en el estado actual del módulo
 *           (p. ej. informativo, o condicionado a otro requisito no alcanzado).
 */
export interface RuleTrace {
  requirement: string;
  satisfied: boolean | null;
  evidence?: string;
}

/**
 * Hallazgo derivado del incumplimiento demostrable de un estándar.
 * Preparado para alimentar en fases posteriores el plan de mejoramiento
 * (no genera acciones ni alertas en esta fase).
 */
export interface AutoEvaluationFinding {
  title: string;
  description: string;
  /** Origen del hallazgo (p. ej. 'phva-advanced/responsable-sst'). */
  source: string;
}

/**
 * Resultado intermedio que produce una regla por cada requisito que evalúa.
 * La fábrica (utils/rule-result.factory.ts) lo convierte en el resultado
 * final (trace + findings + missingInformation) sin que la regla ensamble
 * el objeto a mano.
 */
export interface RuleOutcome {
  requirement: string;
  satisfied: boolean | null;
  evidence?: string;
  /** Mensaje para missingInformation cuando el requisito no está demostrado. */
  missingInformation?: string;
  /** Hallazgo asociado cuando el requisito constituye incumplimiento demostrable. */
  finding?: AutoEvaluationFinding;
}

/**
 * Resultado completo y auditable de la evaluación automática de un estándar.
 */
export interface AutoEvaluationResult {
  /** Código canónico del estándar (p. ej. '1.1.1'). */
  code: string;
  /** Veredicto automático. */
  status: AutoResultStatus;
  /** Traza explicativa de cada requisito evaluado. */
  ruleTrace: RuleTrace[];
  /** Hallazgos por incumplimiento demostrable (status NO_CUMPLE). */
  findings: AutoEvaluationFinding[];
  /** Qué información falta cuando el veredicto es PENDIENTE_ANALISIS. */
  missingInformation: string[];
  /** Momento de la evaluación (ISO 8601). */
  evaluatedAt: string;
  /** Versión del motor que produjo el resultado. */
  engineVersion: string;
}
