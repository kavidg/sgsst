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
  // WRONG_MAPPING → 5.1.1: "Plan de emergencias" (catálogo) ≠ procedimientos
  // genéricos de DocumentMaster que este provider medía. Retirado del scoring;
  // el provider OFICIAL de 5.1.1 es ahora 'emergency-plan' (SstEmergencias,
  // legacy-aware 5.1.1/1.1.10). Se conserva en moduleCompliance para
  // hallazgos/diagnósticos de su evidencia documental propia (DocumentManagement
  // y el provider NO se eliminan).
  'procedures-doc',
  // ESTÁNDAR 5.1.2: records-doc evaluaba 5.1.2 como wrong-mapping (registros
  // genéricos de DocumentMaster, no brigadas). El provider OFICIAL de 5.1.2 es
  // ahora 'emergency-brigade' (SstEmergencias.brigades[].typedMembers[]).
  // records-doc se conserva para hallazgos/diagnósticos de registros
  // documentales; NO se reasigna a otro estándar.
  'records-doc',
  // ESTÁNDAR 6.1.1: DUPLICATE del provider OFICIAL 'indicators'. Ambos medían
  // el mismo estándar sobre el mismo dominio (IndicatorDefinition/Measurement)
  // y contribuían DOS veces a phases.check. Desde la consolidación E1, el
  // provider OFICIAL de 6.1.1 es 'indicators' (scoring puro dimensions:v1);
  // management-measurement se conserva para hallazgos/diagnósticos en
  // moduleCompliance pero NO contribuye al score oficial de fase.
  'management-measurement',
  // ESTÁNDAR 6.1.2 uses annual-audit as the canonical scoring source.
  // management-review represents management/accountability review
  // (AccountabilityMeeting) and must not contribute to the 6.1.2 score.
  // Se conserva en moduleCompliance para hallazgos/diagnósticos; NO se
  // reasigna a 6.1.3 en esta etapa.
  'management-review',
  // ESTÁNDAR 6.1.3 — WRONG_MAPPING: internal-audit puntuaba 6.1.3 a partir de
  // documentos genéricos de DocumentMaster clasificados como AUDIT, pero eso
  // corresponde conceptualmente a la auditoría del SG-SST, no a la revisión
  // por la dirección. Fuentes canónicas: AnnualAudit (6.1.2, Auditoría anual)
  // y ManagementReviewDirection (6.1.3, Revisión por la dirección, dominio
  // propio E1 con provider oficial dimensions:v1). internal-audit se conserva
  // en moduleCompliance para hallazgos/diagnósticos de su evidencia
  // documental; el provider y el analyzer NO se eliminan físicamente en esta
  // fase (el retiro del analyzer es parte de la etapa de IA posterior).
  'internal-audit',
  // ESTÁNDAR 6.1.4 — WRONG_MAPPING: findings-review puntuaba 6.1.4 (VERIFICAR)
  // a partir de AccountabilityCommitment (rendición de cuentas), que no
  // representa semánticamente la planificación de auditorías COPASST.
  // Fuente canónica: CopasstAuditPlanning (dominio propio E1, provider oficial
  // 'copasst-audit-planning' con scoring dimensions:v1). findings-review se
  // conserva en moduleCompliance para hallazgos/diagnósticos de su evidencia
  // (compromisos de seguimiento); el provider y su analyzer NO se eliminan
  // físicamente (el retiro del analyzer del registro IA se hizo en E2) y el
  // módulo queda SIN estándar canónico asignado — NO se reasigna a otro
  // estándar.
  'findings-review',
  // ESTÁNDAR 7.1.1 — PROXY_LEGACY: corrective-preventive puntuaba 7.1.1
  // (ACTUAR) a partir de AccountabilityCommitment (compromisos de rendición
  // de cuentas), un proxy degradado sin tipo de acción, origen, evidencia ni
  // verificación de eficacia. Fuente canónica: CorrectivePreventiveAction
  // (dominio propio E1, provider oficial 'corrective-preventive-actions' con
  // scoring dimensions:v1). corrective-preventive se conserva en
  // moduleCompliance para compatibilidad/hallazgos; el provider y su analyzer
  // NO se eliminan físicamente y el módulo queda SIN estándar canónico
  // asignado — NO se reasigna a otro estándar.
  'corrective-preventive',
  // ESTÁNDAR 7.1.2 — PROXY_LEGACY: management-improvement puntuaba 7.1.2
  // (ACTUAR) a partir de AccountabilityMeeting (reuniones de rendición de
  // cuentas), un proxy existencial (existencia/completadas/recientes/
  // participantes) sin acciones, responsables, seguimiento, evidencia ni
  // trazabilidad de la decisión de origen. Fuente canónica:
  // ManagementImprovementAction (dominio propio E1, provider oficial
  // 'management-improvement-actions' con scoring dimensions:v1).
  // management-improvement se conserva en moduleCompliance para
  // compatibilidad/hallazgos; el provider y su analyzer NO se eliminan
  // físicamente y el módulo queda SIN estándar canónico asignado — NO se
  // reasigna a otro estándar.
  'management-improvement',
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
