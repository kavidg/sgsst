import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';

/**
 * Pesos por defecto de cada fase PHVA para el cálculo del cumplimiento global.
 * La suma de los pesos es 1.
 *
 * PLACEHOLDER: en el futuro los pesos podrán provenir de configuración por empresa.
 */
export const DEFAULT_PHASE_WEIGHTS: Record<CompliancePhaseKey, number> = {
  plan: 0.25,
  do: 0.35,
  check: 0.25,
  act: 0.15,
};

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
 */
export function getPhaseWeights(): Record<CompliancePhaseKey, number> {
  return { ...DEFAULT_PHASE_WEIGHTS };
}

/**
 * Devuelve una copia de los pesos por módulo para evitar mutaciones accidentales.
 */
export function getModuleWeights(): Record<string, number> {
  return { ...DEFAULT_MODULE_WEIGHTS };
}
