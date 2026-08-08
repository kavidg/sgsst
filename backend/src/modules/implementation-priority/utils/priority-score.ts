import { PriorityScoreWeights } from '../interfaces/priority-config.interface';

/** Parámetros normalizados de la fórmula PS(s). */
export interface PriorityScoreParams {
  /** Impacto recuperable normalizado Î ∈ [0,1] = (100 − percentage)/100. */
  impact: number;
  /** Criticidad normativa normalizada Ĉ ∈ [0,1] (config). */
  criticality: number;
  /** Potencial de desbloqueo Û ∈ [0,1] (dependientes / max). FASE 3. */
  unlockPotential: number;
  /** true si el paso está bloqueado por prerrequisitos incompletos (B). FASE 3. */
  blocked: boolean;
  weights: PriorityScoreWeights;
}

/**
 * Fórmula PS(s) del motor de prioridades (determinista).
 *
 *   PS(s) = 100 × [ w_impact·Î(s) + w_criticality·Ĉ(s) + w_unlock·Û(s)
 *                   − w_block·B(s) ]
 *
 * - Î ∈ [0,1]: fracción del paso pendiente de implementar.
 * - Ĉ ∈ [0,1]: criticidad normativa (ALTA=1, MEDIA=0.5, BAJA=0.25).
 * - Û ∈ [0,1]: potencial de desbloqueo de pasos dependientes (FASE 3).
 * - B ∈ {0,1}: penalización por estar bloqueado por prerrequisitos (FASE 3).
 *
 * El resultado se acota a [0, 100]. Función pura (sin estado ni IO).
 */
export function computePriorityScore(params: PriorityScoreParams): number {
  const { impact, criticality, unlockPotential, blocked, weights } = params;
  const blockPenalty = blocked ? weights.block : 0;

  const score = 100 * (
    weights.impact * impact +
    weights.criticality * criticality +
    weights.unlock * unlockPotential -
    blockPenalty
  );

  return Math.max(0, Math.min(100, Math.round(score)));
}
