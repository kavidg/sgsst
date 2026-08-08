import { StepId } from '../implementation-wizard/schemas/implementation-wizard.schema';
import { DEFAULT_STEP_WEIGHTS } from './implementation-weights';

/**
 * Calcula el impacto estimado de completar un paso del Centro de Implementación.
 *
 * Convierte el peso del paso (STEP_WEIGHTS) en el porcentaje visible de
 * implementación que aún puede aportar: peso × porcentaje restante
 * (100 − percentage).
 *
 * Ejemplos:
 * - sst_policy (peso 0.10) al 0% → "+10% implementación"
 * - sst_policy al 40%            → "+6% implementación"
 * - sst_policy al 100%           → null (sin impacto recuperable)
 *
 * Reglas:
 * - percentage >= 100           → null (paso completo, sin impacto recuperable)
 * - peso inexistente o 0        → null (el paso no aporta al ponderado)
 * - restante redondeado a 0     → null (impacto despreciable)
 * - resto                       → "+X% implementación"
 */
export function calculateStepImpact(
  stepId: StepId,
  percentage: number,
  weights: Record<StepId, number> = DEFAULT_STEP_WEIGHTS,
): string | null {
  const weight = weights[stepId] ?? 0;
  // Lectura defensiva: tolera NaN, negativos y valores no numéricos.
  if (!Number.isFinite(percentage) || percentage < 0) return null;
  if (percentage >= 100 || weight <= 0) return null;

  const recoverable = Math.round(weight * (100 - percentage));
  if (recoverable <= 0) return null;

  return `+${recoverable}% implementación`;
}
