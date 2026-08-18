import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';

/**
 * Pesos OFICIALES de cada fase PHVA para el cálculo del cumplimiento global
 * (AUDIT-2): PLANEAR 25% · HACER 60% · VERIFICAR 5% · ACTUAR 10%. La suma es
 * exactamente 1.
 *
 * Esta es la ÚNICA fuente de verdad de los pesos de fase. Los consumidores
 * (Compliance Engine, PhvaAnalysisService vía overview, PhvaEngine) NO deben
 * duplicar estos literales. Los pesos NORMATIVOS de los estándares de la
 * Resolución 0312 (CATALOG_60 / normativeWeight / effective-weights) son una
 * responsabilidad distinta y NO se tocan aquí.
 *
 * PLACEHOLDER: en el futuro los pesos podrán provenir de configuración por empresa.
 */
export const DEFAULT_PHASE_WEIGHTS: Record<CompliancePhaseKey, number> = {
  plan: 0.25,
  do: 0.6,
  check: 0.05,
  act: 0.1,
};

/** Tolerancia numérica para la validación de la suma de pesos (punto flotante). */
export const PHASE_WEIGHTS_SUM_TOLERANCE = 1e-9;

/**
 * Valida un conjunto de pesos de fase PHVA:
 * - ninguno puede ser negativo;
 * - la suma debe ser exactamente 1 (dentro de la tolerancia de punto flotante).
 * Lanza Error en caso contrario. Usada por getPhaseWeights() y por los tests
 * PHVA-WEIGHTS (no permite que una configuración inválida llegue al motor).
 */
export function assertValidPhaseWeights(
  weights: Record<CompliancePhaseKey, number>,
): void {
  for (const weight of Object.values(weights)) {
    if (typeof weight !== 'number' || Number.isNaN(weight) || weight < 0) {
      throw new Error(`Invalid PHVA phase weight: ${String(weight)} (negative or not a number)`);
    }
  }
  const sum = Object.values(weights).reduce((total, weight) => total + weight, 0);
  if (Math.abs(sum - 1) > PHASE_WEIGHTS_SUM_TOLERANCE) {
    throw new Error(`Invalid PHVA phase weights: sum is ${sum}, expected 1`);
  }
}

/**
 * Pesos por defecto para los módulos fuente del SG-SST.
 * La suma de los pesos es 1.
 *
 * PLACEHOLDER: aún no se consumen módulos reales; esta lista crecerá
 * conforme se integren riesgos, capacitaciones, documentos, EPP, etc.
 */
export const DEFAULT_MODULE_WEIGHTS: Record<string, number> = {
  plan: 0.2,
  risks: 0.2,
  trainings: 0.15,
  documents: 0.15,
  incidents: 0.1,
  inspections: 0.1,
  copasst: 0.05,
  absenteeism: 0.05,
};

/**
 * Devuelve una copia de los pesos por fase para evitar mutaciones accidentales.
 * Valida la configuración oficial (suma 1, sin negativos) antes de devolverla.
 */
export function getPhaseWeights(): Record<CompliancePhaseKey, number> {
  assertValidPhaseWeights(DEFAULT_PHASE_WEIGHTS);
  return { ...DEFAULT_PHASE_WEIGHTS };
}

/**
 * Devuelve una copia de los pesos por módulo para evitar mutaciones accidentales.
 */
export function getModuleWeights(): Record<string, number> {
  return { ...DEFAULT_MODULE_WEIGHTS };
}
