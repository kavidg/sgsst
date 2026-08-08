import { ComplianceLevel } from '../enums/compliance-level.enum';

/**
 * Clasifica un porcentaje de cumplimiento en un nivel cualitativo.
 *
 * PLACEHOLDER: los umbrales podrán configurarse por empresa en el futuro.
 */
export function classifyComplianceLevel(percentage: number): ComplianceLevel {
  if (percentage >= 90) {
    return ComplianceLevel.EXCELLENT;
  }

  if (percentage >= 75) {
    return ComplianceLevel.HIGH;
  }

  if (percentage >= 50) {
    return ComplianceLevel.MEDIUM;
  }

  if (percentage >= 25) {
    return ComplianceLevel.LOW;
  }

  return ComplianceLevel.CRITICAL;
}

/**
 * Normaliza un valor de cumplimiento al rango 0-100.
 *
 * PLACEHOLDER: protege contra datos inconsistentes de los módulos fuente.
 */
export function normalizeComplianceScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}

/**
 * Redondea un porcentaje de cumplimiento a dos decimales.
 *
 * PLACEHOLDER: se usará al exponer valores en respuestas de API.
 */
export function roundComplianceScore(value: number): number {
  return Math.round(normalizeComplianceScore(value) * 100) / 100;
}
