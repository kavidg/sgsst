import { StepId, StepStatus } from '../implementation-wizard/schemas/implementation-wizard.schema';
import { ProviderValidationResult } from './interfaces/wizard-validation-provider.interface';

/**
 * Calcula el progreso ponderado de implementación a partir de los resultados
 * de los providers y los pesos de cada paso.
 *
 * Los pasos sin peso definido se ignoran y el total se normaliza por la suma
 * de pesos aplicables, de modo que un subconjunto de providers nunca distorsiona
 * el resultado (mismo comportamiento que calculateWeightedCompliance).
 */
export function calculateWeightedImplementation(
  results: ProviderValidationResult[],
  weights: Record<StepId, number>,
): number {
  const applicable = results.filter((result) => weights[result.stepId] !== undefined);

  const totalWeight = applicable.reduce((sum, result) => sum + weights[result.stepId], 0);
  if (totalWeight <= 0) {
    return 0;
  }

  const weightedSum = applicable.reduce(
    (sum, result) => sum + result.percentage * weights[result.stepId],
    0,
  );

  return Math.round(weightedSum / totalWeight);
}

/**
 * Deriva el estado del paso a partir del porcentaje real validado.
 *
 * - >= 80  → COMPLETED
 * - > 0    → IN_PROGRESS
 * - 0      → PENDING
 */
export function deriveStepStatus(percentage: number): StepStatus {
  if (percentage >= 80) return 'COMPLETED';
  if (percentage > 0) return 'IN_PROGRESS';
  return 'PENDING';
}

/**
 * Clasifica el estado textual del módulo fuente para el historial.
 */
export function classifyImplementationLevel(percentage: number): string {
  if (percentage >= 80) return 'EXCELLENT';
  if (percentage >= 60) return 'GOOD';
  if (percentage >= 40) return 'FAIR';
  if (percentage > 0) return 'POOR';
  return 'NO_DATA';
}
