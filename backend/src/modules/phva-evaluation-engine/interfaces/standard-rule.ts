import { AutoEvaluationResult, AutoResultStatus } from './auto-evaluation-result';

// ============================================================
// PhvaEvaluationEngine — Contrato de regla por estándar (FASE 1)
// ============================================================

/**
 * Contexto de ejecución que el motor entrega a cada regla.
 */
export interface StandardRuleContext {
  /** Empresa propietaria (ObjectId validado por el servicio). */
  companyId: string;
}

/**
 * Contrato que toda regla de evaluación automática de un estándar PHVA debe
 * implementar (patrón StandardAnalyzer de compliance-ai y WizardValidation-
 * Provider de implementation-validator).
 *
 * Responsabilidad única: UNA regla por estándar. La regla consulta SOLO su
 * módulo fuente mediante servicios existentes, declara sus requisitos concretos
 * y produce un AutoEvaluationResult completo con traza explicable.
 *
 * PROHIBIDO: una regla genérica que infiera cumplimiento por la mera existencia
 * de datos. Cada requisito debe estar declarado explícitamente.
 */
export interface StandardRule {
  /** Código canónico del estándar que evalúa (p. ej. '1.1.1'). */
  supports(code: string): boolean;

  /** Módulo fuente de los datos (p. ej. 'phva-advanced/responsable-sst'). */
  getModule(): string;

  /**
   * Ejecuta la regla y devuelve el resultado tipado y auditable.
   * La regla NUNCA lanza por datos ausentes: la ausencia de información se
   * traduce en PENDIENTE_ANALISIS con missingInformation.
   */
  evaluate(context: StandardRuleContext): Promise<AutoEvaluationResult>;
}

/**
 * Helper interno de las reglas: determina el veredicto final a partir de los
 * requisitos evaluados, con la semántica del contrato:
 * - cualquier requisito incumplido demostrable → NO_CUMPLE;
 * - si no hay incumplimiento demostrable y falta información → PENDIENTE_ANALISIS;
 * - todos los requisitos demostrados → CUMPLE_TOTALMENTE.
 */
export function resolveStatusFromOutcomes(
  unsatisfied: number,
  pending: number,
): AutoResultStatus {
  if (unsatisfied > 0) return AutoResultStatus.NO_CUMPLE;
  if (pending > 0) return AutoResultStatus.PENDIENTE_ANALISIS;
  return AutoResultStatus.CUMPLE_TOTALMENTE;
}
