import { FindingPriority } from '../../compliance-engine/enums/finding-priority.enum';

/**
 * Calcula la prioridad de una recomendación a partir de un porcentaje
 * de cumplimiento. A menor cumplimiento, mayor prioridad.
 */
export function calculatePriority(compliance: number): FindingPriority {
  if (compliance < 50) {
    return FindingPriority.CRITICAL;
  }
  if (compliance < 70) {
    return FindingPriority.HIGH;
  }
  if (compliance < 85) {
    return FindingPriority.MEDIUM;
  }
  return FindingPriority.LOW;
}

/**
 * Calcula la prioridad a partir de una cantidad (por ejemplo, incidentes
 * abiertos). A mayor cantidad, mayor prioridad.
 */
export function calculatePriorityFromCount(count: number): FindingPriority {
  if (count >= 8) {
    return FindingPriority.CRITICAL;
  }
  if (count >= 5) {
    return FindingPriority.HIGH;
  }
  return FindingPriority.MEDIUM;
}
