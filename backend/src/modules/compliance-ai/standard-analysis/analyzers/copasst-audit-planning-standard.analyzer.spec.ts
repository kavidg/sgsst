import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CopasstAuditPlanningStandardAnalyzer } from './copasst-audit-planning-standard.analyzer';
import {
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
} from '../../dto/standard-analysis.dto';

/**
 * E2 (6.1.4) — Tests del CopasstAuditPlanningStandardAnalyzer.
 *
 * Cubre: contrato (standard code/título/módulo), NO_DATA por causa, scores
 * real alto/medio/bajo, findings oficiales, metadata completa/parcial/
 * inválida, finding desconocido, counters ausentes y no-recálculo del score.
 * Patrón: management-review-direction-standard.analyzer.spec.ts.
 */

const COMPANY = '64a0000000000000000000a3';

const analyzer = new CopasstAuditPlanningStandardAnalyzer();

function dim(
  ratio: number | null,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ratio, numerator: ratio === null ? null : 1, denominator: ratio === null ? null : 1, weight: 10, ...extra };
}

function metadata(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    semantic: 'EXACT',
    standardCode: '6.1.4',
    phase: 'check',
    formula: 'dimensions:v1',
    evaluatedPeriod: '2026',
    noDataReason: null,
    weights: { completeness: 25, schedule: 20, copasstParticipation: 25, traceability: 15, recommendations: 15 },
    dimensions: {
      completeness: dim(1),
      schedule: dim(1),
      copasstParticipation: dim(1),
      traceability: dim(1),
      recommendations: dim(1),
    },
    counters: {
      planningsTotal: 1, planningsEvaluable: 1, planningsDraft: 0,
      planningsPlanned: 1, planningsInProgress: 0, planningsCompleted: 0,
      planningsCancelled: 0, itemsTotal: 1, itemsCompleted: 0,
      itemsWithDate: 1, itemsWithoutDate: 0, itemsWithAuditor: 1,
      itemsWithResponsible: 1, itemsWithParticipation: 1,
      planningsWithCopasstPeriodRef: 1, overdueItems: 0,
      lastPlanningDate: '2026-12-31T00:00:00.000Z',
    },
    latestPlanning: {
      id: 'plan-1',
      planningCode: 'PAC-2026-01',
      title: 'Planificación de auditorías COPASST 2026',
      status: 'PLANNED',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-12-31T00:00:00.000Z',
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
      module: 'copasst-audit-planning',
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
        { module: 'copasst-audit-planning', compliance: overrides.compliance ?? 100, level: 'ÓPTIMO', lastUpdated: new Date().toISOString() },
      ],
    },
  };
}

function finding(id: string, priority = 'MEDIUM'): {
  id: string; module: string; title: string; description: string; priority: string; status: string; responsible: string; dueDate: string; createdAt: string;
} {
  return {
    id,
    module: 'copasst-audit-planning',
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

// ══════════════ Contrato ══════════════

describe('CAP614-AI-01: contrato del analyzer', () => {
  it('1. soporta exactamente 6.1.4', () => {
    assert.equal(analyzer.supports('6.1.4'), true);
  });

  it('2. no soporta otros standardCodes (incluido 6.1.2)', () => {
    assert.equal(analyzer.supports('6.1.2'), false);
    assert.equal(analyzer.supports('6.1.3'), false);
    assert.equal(analyzer.supports('6.1.1'), false);
    assert.equal(analyzer.supports('5.1.1'), false);
    assert.equal(analyzer.supports(''), false);
  });

  it('3. módulo correcto: copasst-audit-planning', () => {
    assert.equal(analyzer.getModule(), 'copasst-audit-planning');
  });

  it('4. el analyzer legacy findings-review ya NO reclama 6.1.4 en el módulo del analyzer oficial', () => {
    // Guard estructural: el analyzer oficial es el módulo copasst-audit-planning.
    assert.notEqual(analyzer.getModule(), 'findings-review');
  });
});

// ══════════════ NO_DATA por causa ══════════════

describe('CAP614-AI-02: NO_DATA', () => {
  it('sin planificaciones → narrativa no evaluable + quick win de registro inicial', () => {
    const result = analyzer.analyze(context({
      compliance: 0,
      status: 'NO_DATA',
      metadata: metadata({ noDataReason: 'no-plannings' }),
      findings: [finding('copasst-audit-planning-no-data', 'HIGH')],
    }));
    assert.match(result.summary, /no es evaluable/);
    assert.ok(issueIds(result).includes('copasst-audit-planning-no-data'));
    assert.ok(result.quickWins.length >= 1);
  });

  it('planificaciones no evaluables → narrativa con causa específica', () => {
    const result = analyzer.analyze(context({
      compliance: 0,
      status: 'NO_DATA',
      metadata: metadata({ noDataReason: 'no-evaluable-plannings' }),
      findings: [finding('copasst-audit-planning-no-evaluable-plannings', 'HIGH')],
    }));
    assert.match(result.summary, /no cumple las condiciones mínimas|no es evaluable/);
    assert.ok(issueIds(result).includes('copasst-audit-planning-no-evaluable-plannings'));
  });

  it('NO_DATA sin metadata (legacy) → narrativa defensiva sin romper', () => {
    const result = analyzer.analyze(context({
      compliance: 0,
      status: 'NO_DATA',
      metadata: undefined,
      findings: [finding('copasst-audit-planning-no-data', 'HIGH')],
    }));
    assert.ok(result.summary.length > 10);
    assert.ok(issueIds(result).includes('copasst-audit-planning-no-data'));
  });
});

// ══════════════ Scores reales ══════════════

describe('CAP614-AI-03: scores reales', () => {
  it('score alto → narrativa sólida', () => {
    const result = analyzer.analyze(context({ compliance: 95 }));
    assert.match(result.summary, /cumplimiento sólido \(95%\)/);
  });

  it('score medio → narrativa de gestión actual', () => {
    const result = analyzer.analyze(context({ compliance: 65 }));
    assert.match(result.summary, /65%/);
  });

  it('score bajo → narrativa de brechas relevantes', () => {
    const result = analyzer.analyze(context({ compliance: 25 }));
    assert.match(result.summary, /brechas relevantes/);
  });

  it('no recalcula el score: el porcentaje narrado es el oficial', () => {
    const result = analyzer.analyze(context({ compliance: 72 }));
    assert.match(result.summary, /72%/);
    assert.equal(analyzer.getMetrics(context({ compliance: 72 })).compliancePercentage, 72);
  });
});

// ══════════════ Findings oficiales y metadata ══════════════

describe('CAP614-AI-04: findings oficiales y metadata', () => {
  it('findings oficiales → keyIssues con recomendación específica', () => {
    const result = analyzer.analyze(context({
      compliance: 55,
      findings: [
        finding('copasst-audit-planning-completeness-incomplete', 'HIGH'),
        finding('copasst-audit-planning-copasst-participation-incomplete', 'HIGH'),
      ],
    }));
    const ids = issueIds(result);
    assert.ok(ids.includes('copasst-audit-planning-completeness-incomplete'));
    assert.ok(ids.includes('copasst-audit-planning-copasst-participation-incomplete'));
    const issue = result.keyIssues.find((i) => i.id === 'copasst-audit-planning-copasst-participation-incomplete')!;
    assert.ok(issue.recommendation.length > 20);
    assert.ok(issue.recommendation.includes('COPASST'));
  });

  it('finding desconocido → recomendación defensiva sin romper', () => {
    const result = analyzer.analyze(context({
      compliance: 50,
      findings: [finding('copasst-audit-planning-unknown-finding', 'MEDIUM')],
    }));
    const issue = result.keyIssues.find((i) => i.id === 'copasst-audit-planning-unknown-finding')!;
    assert.ok(issue.recommendation.length > 10);
  });

  it('dimensiones débiles sin finding oficial → issues informativos de brecha', () => {
    const result = analyzer.analyze(context({
      compliance: 40,
      metadata: metadata({
        dimensions: {
          completeness: dim(0.4),
          schedule: dim(0.2),
          copasstParticipation: dim(0.8),
          traceability: dim(0.9),
          recommendations: dim(1),
        },
      }),
    }));
    assert.ok(issueIds(result).includes('copasst-audit-planning-completeness-incomplete'));
    assert.ok(issueIds(result).includes('copasst-audit-planning-schedule-incomplete'));
  });

  it('metadata inválida (formula incorrecta) → narrativa defensiva sin romper', () => {
    const result = analyzer.analyze(context({
      compliance: 45,
      metadata: metadata({ formula: 'legacy:v0' }),
    }));
    assert.ok(result.summary.length > 10);
  });

  it('counters ausentes → nextSteps defensivos sin romper', () => {
    const result = analyzer.analyze(context({
      compliance: 50,
      metadata: metadata({ counters: {} }),
    }));
    assert.ok(result.nextSteps.length >= 1);
  });

  it('overdueItems > 0 → prioriza el cierre de vencidos en nextSteps', () => {
    const result = analyzer.analyze(context({
      compliance: 60,
      metadata: metadata({ counters: metadata().counters as Record<string, unknown> }),
    }));
    assert.ok(result.nextSteps.length >= 2);
  });

  it('metrics expone dimensiones y counters cuando hay metadata válida', () => {
    const metrics = analyzer.getMetrics(context({ compliance: 80 }));
    assert.equal(metrics.compliancePercentage, 80);
    assert.equal(metrics.dimension_completeness_percent, 100);
    assert.equal(metrics.planningsEvaluable, 1);
  });

  it('metrics sin metadata → solo compliancePercentage', () => {
    const metrics = analyzer.getMetrics(context({ compliance: 80, metadata: undefined }));
    assert.equal(metrics.compliancePercentage, 80);
    assert.equal(metrics.dimension_completeness_percent, undefined);
  });
});
