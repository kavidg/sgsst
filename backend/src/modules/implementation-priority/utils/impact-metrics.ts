import { calculateStepImpact } from '../../implementation-validator/implementation-impact';
import { getImplementationWeights } from '../../implementation-validator/implementation-weights';
import { StepId } from '../../implementation-wizard/schemas/implementation-wizard.schema';

/** Métricas de impacto calculadas para un paso. */
export interface ImpactMetrics {
  /** Impacto numérico recuperable: peso × (100 − percentage). */
  impactPoints: number;
  /** Impacto visible "+X% implementación" (calculateStepImpact). */
  estimatedImpact: string | null;
}

/**
 * Métricas de impacto por paso.
 *
 * Reutiliza la infraestructura existente (sin duplicar lógica ni pesos):
 * - getImplementationWeights() para el peso del paso,
 * - calculateStepImpact() (implementation-impact.ts) para el impacto visible.
 *
 * impactPoints = redondeo(peso × (100 − percentage)), acotado a ≥ 0.
 */
export function computeImpactMetrics(
  stepId: StepId,
  percentage: number,
  weights: Record<StepId, number> = getImplementationWeights(),
): ImpactMetrics {
  const weight = weights[stepId] ?? 0;
  const impactPoints = Math.max(0, Math.round(weight * (100 - percentage)));

  return {
    impactPoints,
    estimatedImpact: calculateStepImpact(stepId, percentage, weights),
  };
}
