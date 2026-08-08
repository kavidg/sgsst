import { CompliancePhaseKey, PhaseCompliance } from '../interfaces/compliance-engine.interface';

/**
 * Calcula el cumplimiento ponderado a partir del cumplimiento de cada fase PHVA.
 *
 * PLACEHOLDER: aún no se conecta a fuentes reales. La implementación futura
 * combinará módulos reales (riesgos, capacitaciones, documentos, etc.) con los
 * pesos definidos en compliance-weights.ts.
 */
export function calculateWeightedCompliance(
  phases: PhaseCompliance,
  weights: Record<CompliancePhaseKey, number>,
): number {
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);

  if (totalWeight <= 0) {
    return 0;
  }

  const weightedSum =
    phases.plan * weights.plan +
    phases.do * weights.do +
    phases.check * weights.check +
    phases.act * weights.act;

  return weightedSum / totalWeight;
}

/**
 * Calcula el cumplimiento promedio simple entre las cuatro fases PHVA.
 *
 * PLACEHOLDER: útil como referencia rápida sin ponderación.
 */
export function calculateAverageCompliance(phases: PhaseCompliance): number {
  const values = [phases.plan, phases.do, phases.check, phases.act];
  const sum = values.reduce((total, value) => total + value, 0);
  return sum / values.length;
}

/**
 * Identifica las fases PHVA con menor cumplimiento (brechas).
 *
 * PLACEHOLDER: devolverá hallazgos priorizados en la implementación futura.
 */
export function identifyWeakestPhases(
  phases: PhaseCompliance,
  threshold = 80,
): CompliancePhaseKey[] {
  return (Object.keys(phases) as CompliancePhaseKey[]).filter(
    (key) => phases[key] < threshold,
  );
}
