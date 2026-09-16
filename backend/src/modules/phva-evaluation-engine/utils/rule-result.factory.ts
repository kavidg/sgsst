import {
  AutoEvaluationFinding,
  AutoEvaluationResult,
  AutoResultStatus,
  RuleOutcome,
  RuleTrace,
} from '../interfaces/auto-evaluation-result';
import { PHVA_EVALUATION_ENGINE_VERSION } from '../interfaces/auto-evaluation-result';

// ============================================================
// PhvaEvaluationEngine — Fábrica de resultados de regla (FASE 1)
// ============================================================

/**
 * Ensambla el AutoEvaluationResult final a partir de los requisitos que una
 * regla evaluó. Centraliza la semántica del veredicto para que las reglas no
 * dupliquen lógica:
 *
 * 1. Cualquier requisito con `finding` (incumplimiento demostrable) → NO_CUMPLE.
 * 2. Si no hay incumplimiento demostrable y existen requisitos sin demostrar
 *    (satisfied=false con missingInformation, o satisfied=null evaluable) →
 *    PENDIENTE_ANALISIS con missingInformation.
 * 3. Todos los requisitos demostrados → CUMPLE_TOTALMENTE.
 *
 * El NO_APLICA se decide en la regla (condición explícita previa) y llega por
 * el parámetro `notApplicable`.
 */
export function buildRuleResult(params: {
  code: string;
  outcomes: RuleOutcome[];
  notApplicable?: { reason: string } | null;
}): AutoEvaluationResult {
  const { code, outcomes, notApplicable } = params;

  if (notApplicable) {
    return {
      code,
      status: AutoResultStatus.NO_APLICA,
      ruleTrace: [
        {
          requirement: notApplicable.reason,
          satisfied: true,
          evidence: 'Condición de no aplicabilidad declarada por la regla del estándar.',
        },
      ],
      findings: [],
      missingInformation: [],
      evaluatedAt: new Date().toISOString(),
      engineVersion: PHVA_EVALUATION_ENGINE_VERSION,
    };
  }

  const ruleTrace: RuleTrace[] = outcomes.map((outcome) => ({
    requirement: outcome.requirement,
    satisfied: outcome.satisfied,
    ...(outcome.evidence !== undefined ? { evidence: outcome.evidence } : {}),
  }));

  const findings: AutoEvaluationFinding[] = outcomes
    .filter((outcome) => outcome.finding !== undefined)
    .map((outcome) => outcome.finding as AutoEvaluationFinding);

  const missingInformation = outcomes
    .filter((outcome) => outcome.satisfied !== true && Boolean(outcome.missingInformation))
    .map((outcome) => outcome.missingInformation as string);

  const hasDemonstratedBreach = findings.length > 0;
  const hasPendingInformation = missingInformation.length > 0;

  const status = hasDemonstratedBreach
    ? AutoResultStatus.NO_CUMPLE
    : hasPendingInformation
      ? AutoResultStatus.PENDIENTE_ANALISIS
      : AutoResultStatus.CUMPLE_TOTALMENTE;

  return {
    code,
    status,
    ruleTrace,
    findings,
    missingInformation,
    evaluatedAt: new Date().toISOString(),
    engineVersion: PHVA_EVALUATION_ENGINE_VERSION,
  };
}
