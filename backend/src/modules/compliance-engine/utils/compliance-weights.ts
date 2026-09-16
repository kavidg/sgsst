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

// ─── Multi-Provider Phase Deduplication (PLANEAR-BLOQUE-4A) ───────────────

/**
 * Dependencias de consolidación de fuentes para phases.plan.
 *
 * CLAVE: AnnualWorkPlan consolida las actividades derivadas de SST Objectives
 * e InitialEvaluation. Si AWP tiene una contribución válida que realmente
 * represente esa consolidación, se ignoran SST Objectives e InitialEvaluation
 * como fuentes individuales.
 *
 * EvaluationsProvider NO participa en esta deduplicación: se considera una
 * fuente legacy independiente.
 *
 * Fuente: schema PlanActivity.sourceModule (Bloques 1 y 2).
 */
export const PHASE_DEPENDENCIES: Record<string, string[]> = {
  'annual-work-plan': ['sst-objectives', 'initial-evaluation'],
};

/**
 * Módulos fuente cuyos sourceModule en PlanActivity indican que AWP
 * consolida esas fuentes.  Usado por AnnualWorkPlanProvider para
 * determinar si el plan tiene actividades sincronizadas.
 */
export const AWP_CONSOLIDATED_SOURCES = [
  'sst-objectives',
  'initial-evaluation',
];

// ─── FASE 30A/30B-2: Scoring Boundary ───────────────────────────────────────

/**
 * Módulos cuyo estándar asociado tiene classification DUPLICATE, COMPLEMENTARY
 * o PHANTOM. Estos módulos NO deben contribuir al cálculo de cumplimiento
 * global (phases → PHASE_WEIGHTS → overall score).
 *
 * Regla: classification === 'DUPLICATE' | 'COMPLEMENTARY' | 'PHANTOM'
 *        → exclude from scoring.
 */
export const SCORING_EXCLUDED_MODULES: ReadonlySet<string> = new Set([
  // DUPLICATE → 1.1.10 (duplicate of 1.1.3)
  'emergencies',
  // DUPLICATE → 4.3.1 (duplicate of 3.2.2)
  'control-verification-standard',
  // COMPLEMENTARY → 4.4.1
  'emergency-management',
]);

/**
 * Módulos cuyo mapping semántico es PARTIAL o WRONG_MAPPING.
 * Estos módulos existen técnicamente y producen hallazgos/diagnósticos,
 * pero NO deben contribuir al cálculo de cumplimiento porque su evidencia
 * no representa adecuadamente el estándar normativo.
 *
 * Regla: semantic status === 'PARTIAL' | 'WRONG_MAPPING'
 *        → exclude from scoring.
 *
 * FASE 30B-2: Estos providers fueron auditados y clasificados como PARTIAL
 * porque su evidencia no corresponde exactamente al estándar oficial:
 * - occupational-exam → 3.1.2 (promoción y prevención ≠ exámenes médicos)
 * - medical-recommendation → 3.1.3 (recomendaciones ≠ información al médico)
 * - health-indicators → 3.3.2 (indicadores genéricos ≠ severidad específica)
 *
 * NOTA: disease-investigation (3.2.2) fue clasificado como EXACT/VALID_REUSE
 * y SÍ puede scorear.
 */
export const SCORING_INELIGIBLE_MODULES: ReadonlySet<string> = new Set([
  // PARTIAL → 3.1.2: Promoción y prevención ≠ exámenes médicos ocupacionales
  'occupational-exam',
  // PARTIAL → 3.1.3: Información al médico ≠ recomendaciones médicas
  'medical-recommendation',
  // PARTIAL → 3.3.2: Severidad de accidentalidad ≠ indicadores genéricos de salud
  'health-indicators',
]);

/**

/**
 * Filtra resultados de providers eliminando los módulos excluidos del scoring.
 * Los módulos excluidos conservan su funcionalidad técnica pero NO contribuyen
 * al cálculo global de cumplimiento.
 *
 * Combina:
 * - SCORING_EXCLUDED_MODULES: DUPLICATE / COMPLEMENTARY / PHANTOM
 * - SCORING_INELIGIBLE_MODULES: PARTIAL / WRONG_MAPPING
 */
export function filterScoringEligible<T extends { module: string }>(
  results: readonly T[],
): T[] {
  return results.filter(
    (result) =>
      !SCORING_EXCLUDED_MODULES.has(result.module) &&
      !SCORING_INELIGIBLE_MODULES.has(result.module),
  );
}
