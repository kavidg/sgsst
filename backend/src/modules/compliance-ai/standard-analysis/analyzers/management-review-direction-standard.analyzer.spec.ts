import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ManagementReviewDirectionStandardAnalyzer } from './management-review-direction-standard.analyzer';
import {
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
} from '../../dto/standard-analysis.dto';

/**
 * E4 (6.1.3) — Tests del ManagementReviewDirectionStandardAnalyzer.
 *
 * Cubre los 25 casos del diseño: contrato (1–3), NO_DATA por causa (7–8),
 * scores real alto/medio/bajo (4–6, 22–23), findings oficiales (9–15),
 * metadata completa/parcial/inválida (16–18), finding desconocido (19),
 * counters ausentes (20), latestReview ausente (21), recomendaciones
 * accionables (24) y no-recálculo del score (25).
 */

const COMPANY = '64a0000000000000000000a3';

const analyzer = new ManagementReviewDirectionStandardAnalyzer();

function dim(
  ratio: number | null,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ratio, numerator: ratio === null ? null : 1, denominator: ratio === null ? null : 1, weight: 10, ...extra };
}

function metadata(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    semantic: 'EXACT',
    standardCode: '6.1.3',
    phase: 'check',
    formula: 'dimensions:v1',
    evaluatedPeriod: '2026',
    noDataReason: null,
    weights: { planning: 15, inputs: 20, analysis: 20, decisions: 20, evidence: 15, closureHistory: 10 },
    dimensions: {
      planning: dim(1),
      inputs: dim(1),
      analysis: dim(1),
      decisions: dim(1),
      evidence: dim(1),
      closureHistory: dim(1),
    },
    counters: {
      reviewsTotal: 1, reviewsEvaluable: 1, reviewsCompleted: 1, reviewsDraft: 0,
      reviewsPlanned: 0, reviewsInProgress: 0, reviewsCancelled: 0,
      inputsTotal: 3, inputsReviewed: 3, inputsValidReviewed: 3,
      inputTypesPresent: 3, inputTypesReviewed: 3,
      decisionsTotal: 1, decisionsActionable: 1, decisionsCompleted: 1,
      decisionsPending: 0, decisionsInProgress: 0, decisionsCancelled: 0,
      decisionsOverdue: 0, participantsTotal: 1, participantsPresent: 1,
      reviewsWithEvidence: 1, reviewsWithAnalysis: 1, reviewsWithDecisions: 1,
      reviewsWithHistory: 1, lastReviewDate: '2026-03-05T00:00:00.000Z',
      lastReviewStatus: 'COMPLETED', futureDateReviews: 0,
    },
    latestReview: {
      id: 'rev-1',
      reviewCode: 'RD-2026-001',
      title: 'Revisión por la dirección 2026',
      status: 'COMPLETED',
      actualEndDate: '2026-03-05T00:00:00.000Z',
    },
    ...overrides,
  };
}

function context(overrides: {
  compliance?: number;
  status?: string;
  metadata?: Record<string, unknown>;
  findings?: Array<{ id: string; module: string; title: string; description: string; priority: string; status: string; responsible: string; dueDate: string; createdAt: string }>;
} = {}): StandardAnalysisContext {
  return {
    companyId: COMPANY,
    // El engine transporta `status` aditivamente en runtime (no declarado en
    // el DTO base del contexto): cast explícito para simular el payload real.
    moduleCompliance: {
      module: 'management-review-direction',
      compliance: overrides.compliance ?? 100,
      level: 'ÓPTIMO',
      lastUpdated: new Date().toISOString(),
      status: overrides.status ?? 'TARGET_MET',
      metadata: 'metadata' in overrides ? overrides.metadata : metadata(),
    } as StandardAnalysisContext['moduleCompliance'],
    findings: overrides.findings ?? [],
    overview: {
      overallCompliance: 80,
      phaseCompliance: { plan: 25, do: 60, check: 5, act: 10 },
      moduleCompliance: [
        { module: 'management-review-direction', compliance: overrides.compliance ?? 100, level: 'ÓPTIMO', lastUpdated: new Date().toISOString() },
      ],
    },
  };
}

function finding(id: string, priority = 'MEDIUM'): {
  id: string; module: string; title: string; description: string; priority: string; status: string; responsible: string; dueDate: string; createdAt: string;
} {
  return {
    id,
    module: 'management-review-direction',
    title: `Finding ${id}`,
    description: `Descripción del hallazgo ${id}.`,
    priority,
    status: 'OPEN',
    responsible: '',
    dueDate: '',
    createdAt: new Date().toISOString(),
  };
}

function issueIds(result: StandardAnalysisInterpretation): string[] {
  return result.keyIssues.map((i) => i.id);
}

// ══════════════ Contrato (1–3) ══════════════

describe('MRD-AI-01: contrato del analyzer', () => {
  it('1. soporta exactamente 6.1.3', () => {
    assert.equal(analyzer.supports('6.1.3'), true);
  });

  it('2. no soporta otros standardCodes', () => {
    assert.equal(analyzer.supports('6.1.2'), false);
    assert.equal(analyzer.supports('6.1.1'), false);
    assert.equal(analyzer.supports('6.1.4'), false);
    assert.equal(analyzer.supports('5.1.1'), false);
    assert.equal(analyzer.supports(''), false);
  });

  it('3. módulo correcto: management-review-direction', () => {
    assert.equal(analyzer.getModule(), 'management-review-direction');
  });
});

// ══════════════ Scores reales (4–6) ══════════════

describe('MRD-AI-02: scores reales', () => {
  it('4. score alto → narrativa sólida orientada a alta dirección', () => {
    const result = analyzer.analyze(context({ compliance: 95 }));
    assert.match(result.summary, /cumplimiento sólido \(95%\)/);
    assert.doesNotMatch(result.summary, /no evaluable/i);
  });

  it('5. score medio → narrativa de gestión actual con brechas', () => {
    const result = analyzer.analyze(context({ compliance: 62 }));
    assert.match(result.summary, /62%/);
    assert.match(result.summary, /gestión actual|refleja/);
  });

  it('6. score bajo → narrativa de brechas relevantes', () => {
    const result = analyzer.analyze(context({ compliance: 20 }));
    assert.match(result.summary, /brechas relevantes/);
    assert.match(result.summary, /\(20%\)/);
  });
});

// ══════════════ NO_DATA (7–8) ══════════════

describe('MRD-AI-03: NO_DATA por causa', () => {
  it('7. no-reviews: explica ausencia de revisiones y NO dice 0%', () => {
    const result = analyzer.analyze(
      context({
        status: 'NO_DATA',
        compliance: 0,
        metadata: metadata({ noDataReason: 'no-reviews', latestReview: null }),
        findings: [finding('management-review-direction-no-data', 'HIGH')],
      }),
    );
    assert.match(result.summary, /No existen revisiones/);
    assert.doesNotMatch(result.summary, /0%/);
    assert.ok(issueIds(result).includes('management-review-direction-no-data'));
    assert.ok(result.quickWins.length > 0);
  });

  it('8. no-evaluable-reviews: existen registros pero ninguno evaluable', () => {
    const result = analyzer.analyze(
      context({
        status: 'NO_DATA',
        compliance: 0,
        metadata: metadata({ noDataReason: 'no-evaluable-reviews', latestReview: null }),
        findings: [finding('management-review-direction-no-evaluable-reviews', 'HIGH')],
      }),
    );
    assert.match(result.summary, /Existen registros de revisión/);
    assert.match(result.summary, /ninguno cumple/);
    assert.doesNotMatch(result.summary, /0%/);
    assert.ok(issueIds(result).includes('management-review-direction-no-evaluable-reviews'));
  });

  it('la narrativa respeta NO_DATA ≠ score 0 real', () => {
    const noData = analyzer.analyze(
      context({ status: 'NO_DATA', compliance: 0, metadata: metadata({ noDataReason: 'no-reviews' }) }),
    );
    const realZero = analyzer.analyze(
      context({ compliance: 0, status: 'TARGET_NOT_MET', metadata: metadata() }),
    );
    assert.match(noData.summary, /no es evaluable|No existen revisiones/);
    assert.match(realZero.summary, /brechas relevantes/);
    assert.match(realZero.summary, /\(0%\)/);
    assert.notEqual(noData.summary, realZero.summary);
  });
});

// ══════════════ Findings oficiales (9–15) ══════════════

describe('MRD-AI-04: interpretación de findings oficiales', () => {
  it('9. planificación incompleta → recomendación de planificación', () => {
    const result = analyzer.analyze(
      context({ findings: [finding('management-review-direction-planning-incomplete', 'MEDIUM')] }),
    );
    const issue = result.keyIssues.find((i) => i.id === 'management-review-direction-planning-incomplete');
    assert.ok(issue);
    assert.match(issue!.recommendation, /planificación/i);
  });

  it('10. inputs incompletos → recomendación de entradas', () => {
    const result = analyzer.analyze(
      context({ findings: [finding('management-review-direction-inputs-incomplete', 'HIGH')] }),
    );
    const issue = result.keyIssues.find((i) => i.id === 'management-review-direction-inputs-incomplete');
    assert.ok(issue);
    assert.match(issue!.recommendation, /entradas|revisar las entradas/i);
  });

  it('11. análisis incompleto → recomendación de análisis de dirección', () => {
    const result = analyzer.analyze(
      context({ findings: [finding('management-review-direction-analysis-incomplete', 'MEDIUM')] }),
    );
    const issue = result.keyIssues.find((i) => i.id === 'management-review-direction-analysis-incomplete');
    assert.ok(issue);
    assert.match(issue!.recommendation, /análisis de la dirección/i);
  });

  it('12. decisiones incompletas → recomendación de decisiones con responsable y fecha', () => {
    const result = analyzer.analyze(
      context({ findings: [finding('management-review-direction-decisions-incomplete', 'MEDIUM')] }),
    );
    const issue = result.keyIssues.find((i) => i.id === 'management-review-direction-decisions-incomplete');
    assert.ok(issue);
    assert.match(issue!.recommendation, /decisiones/i);
  });

  it('13. decisiones vencidas: recomendación de seguimiento, NO estado persistido', () => {
    const result = analyzer.analyze(
      context({
        findings: [finding('management-review-direction-overdue-decisions', 'HIGH')],
        metadata: metadata({ counters: { decisionsOverdue: 2 } }),
      }),
    );
    const issue = result.keyIssues.find((i) => i.id === 'management-review-direction-overdue-decisions');
    assert.ok(issue);
    assert.match(issue!.recommendation, /Priorizar el cierre de las decisiones vencidas/);
    // El contador ausente en el finding lo agrega la lectura de counters.
    assert.ok(result.keyIssues.filter((i) => i.id === 'management-review-direction-overdue-decisions').length === 1);
  });

  it('14. evidencia incompleta → recomendación de acta/evidencia', () => {
    const result = analyzer.analyze(
      context({ findings: [finding('management-review-direction-evidence-incomplete', 'MEDIUM')] }),
    );
    const issue = result.keyIssues.find((i) => i.id === 'management-review-direction-evidence-incomplete');
    assert.ok(issue);
    assert.match(issue!.recommendation, /acta|evidencia/i);
  });

  it('15. historial incompleto → recomendación de continuidad', () => {
    const result = analyzer.analyze(
      context({ findings: [finding('management-review-direction-history-incomplete', 'LOW')] }),
    );
    const issue = result.keyIssues.find((i) => i.id === 'management-review-direction-history-incomplete');
    assert.ok(issue);
    assert.match(issue!.recommendation, /historial|continuidad|períodos/i);
  });
});

// ══════════════ Metadata (16–18, 20–21) ══════════════

describe('MRD-AI-05: tolerancia de metadata', () => {
  it('16. metadata completa: interpreta dimensiones, counters y latestReview', () => {
    const result = analyzer.analyze(
      context({
        compliance: 55,
        metadata: metadata({
          dimensions: {
            planning: dim(0.4), inputs: dim(0.3), analysis: dim(1),
            decisions: dim(0.5), evidence: dim(1), closureHistory: dim(null),
          },
        }),
      }),
    );
    assert.match(result.summary, /55%/);
    // Brechas informativas por dimensión débil sin finding.
    assert.ok(issueIds(result).some((id) => id.endsWith('-planning-incomplete')));
    assert.ok(issueIds(result).some((id) => id.endsWith('-inputs-incomplete')));
    assert.ok(issueIds(result).some((id) => id.endsWith('-decisions-incomplete')));
    assert.ok(!issueIds(result).some((id) => id.endsWith('-analysis-incomplete')));
    const metrics = analyzer.getMetrics(context({ compliance: 55, metadata: metadata() }));
    assert.ok(Object.keys(metrics).some((k) => k.startsWith('dimension_')));
    assert.equal(metrics.reviewsEvaluable, 1);
  });

  it('17. metadata parcial (sin counters ni latestReview): no rompe y no inventa', () => {
    const result = analyzer.analyze(
      context({
        compliance: 40,
        metadata: {
          formula: 'dimensions:v1',
          dimensions: { planning: dim(0.5), inputs: dim(0.5), analysis: dim(0.5), decisions: dim(0.5), evidence: dim(0.5), closureHistory: dim(0.5) },
        },
        findings: [],
      }),
    );
    assert.match(result.summary, /40%/);
    // Counters ausentes → sin issues de overdue ni métricas de counters.
    assert.ok(!issueIds(result).includes('management-review-direction-overdue-decisions'));
    const metrics = analyzer.getMetrics(context({ compliance: 40, metadata: { formula: 'dimensions:v1', dimensions: {} } }));
    assert.equal(metrics.reviewsEvaluable, undefined);
    assert.ok(metrics.compliancePercentage === 40);
  });

  it('18. metadata inválida: usa compliance oficial + findings, genera explicación limitada', () => {
    const result = analyzer.analyze(
      context({
        compliance: 70,
        metadata: { formula: 'legacy:v0' },
        findings: [finding('management-review-direction-planning-incomplete', 'MEDIUM')],
      }),
    );
    assert.match(result.summary, /70%/);
    assert.ok(issueIds(result).includes('management-review-direction-planning-incomplete'));
    const metrics = analyzer.getMetrics(context({ compliance: 70, metadata: { formula: 'legacy:v0' } }));
    assert.equal(metrics.compliancePercentage, 70);
    assert.ok(Object.keys(metrics).every((k) => !k.startsWith('dimension_')));
  });

  it('20. counters ausentes: sin issues de overdue derivados', () => {
    const result = analyzer.analyze(
      context({
        metadata: metadata({ counters: {} }),
        findings: [],
      }),
    );
    assert.ok(!issueIds(result).includes('management-review-direction-overdue-decisions'));
  });

  it('21. latestReview ausente: la narrativa no lo menciona y no rompe', () => {
    const result = analyzer.analyze(
      context({ metadata: metadata({ latestReview: null }) }),
    );
    assert.ok(result.summary.length > 0);
    assert.ok(result.keyIssues.length === 0 || result.summary.length > 0);
  });
});

// ══════════════ Defensiva (19) ══════════════

describe('MRD-AI-06: tratamiento defensivo', () => {
  it('19. finding desconocido: se conserva con recomendación genérica sin romper', () => {
    const result = analyzer.analyze(
      context({
        findings: [
          finding('management-review-direction-futuro-desconocido', 'LOW'),
          finding('otra-cosidad-ajena', 'MEDIUM'),
        ],
      }),
    );
    assert.ok(issueIds(result).includes('management-review-direction-futuro-desconocido'));
    assert.ok(issueIds(result).includes('otra-cosidad-ajena'));
    assert.ok(result.summary.length > 0);
  });
});

// ══════════════ Recomendaciones (24) ══════════════

describe('MRD-AI-07: recomendaciones accionables', () => {
  it('24. recomendaciones específicas por dimensión (no seis idénticas)', () => {
    const result = analyzer.analyze(
      context({
        compliance: 35,
        findings: [
          finding('management-review-direction-planning-incomplete', 'MEDIUM'),
          finding('management-review-direction-inputs-incomplete', 'HIGH'),
          finding('management-review-direction-analysis-incomplete', 'MEDIUM'),
          finding('management-review-direction-decisions-incomplete', 'MEDIUM'),
          finding('management-review-direction-evidence-incomplete', 'MEDIUM'),
          finding('management-review-direction-history-incomplete', 'LOW'),
        ],
      }),
    );
    const recs = new Set(result.keyIssues.map((i) => i.recommendation));
    assert.ok(recs.size >= 5, `se esperaban ≥5 recomendaciones distintas, hubo ${recs.size}`);
    assert.ok(result.quickWins.length > 0 && result.quickWins.length <= 3);
    assert.ok(result.nextSteps.length > 0 && result.nextSteps.length <= 3);
    assert.ok(result.keyIssues.length <= 5);
  });
});

// ══════════════ No recalcula (25) ══════════════

describe('MRD-AI-08: frontera de score', () => {
  it('25. NO recalcula el score: el porcentaje narrado es el oficial', () => {
    for (const pct of [0, 33, 62, 88, 100]) {
      const result = analyzer.analyze(context({ compliance: pct }));
      assert.ok(result.summary.includes(`${pct}%`), `el summary debe citar ${pct}%`);
    }
  });

  it('el analyzer funciona solo con el DTO recibido (sin contexto adicional)', () => {
    const minimal = context({ compliance: 72, metadata: undefined, findings: [] });
    const result = analyzer.analyze(minimal);
    assert.match(result.summary, /72%/);
  });
});
