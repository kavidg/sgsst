import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { IndicatorsStandardAnalyzer } from './indicators-standard.analyzer';
import {
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
} from '../../dto/standard-analysis.dto';

/**
 * E4-C (6.1.1) — Tests de comportamiento del IndicatorsStandardAnalyzer.
 *
 * Cubre los 15 casos requeridos: interpretación del resultado oficial,
 * NO_DATA por causa, 0% real ≠ NO_DATA, dimensiones débiles, findings
 * múltiples/desconocidos, metadata inválida/ausente, separación de estándares
 * fuente y no-recálculo del score.
 */

const COMPANY = '64a0000000000000000000a1';

const analyzer = new IndicatorsStandardAnalyzer();

function dim(
  ratio: number | null,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ratio, numerator: ratio === null ? null : 1, denominator: ratio === null ? null : 1, weight: 10, ...extra };
}

function metadata(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    semantic: 'EXACT',
    standardCode: '6.1.1',
    phase: 'check',
    formula: 'dimensions:v1',
    evaluatedPeriod: '2026-09',
    noDataReason: null,
    weights: { existence: 10, definitionQuality: 20, measurement: 25, targetCompliance: 20, analysisEvidence: 15, history: 10 },
    dimensions: {
      existence: dim(1),
      definitionQuality: dim(1),
      measurement: dim(1),
      targetCompliance: dim(1),
      analysisEvidence: dim(1),
      history: dim(1),
    },
    counters: {
      totalIndicators: 5, activeIndicators: 5, inactiveIndicators: 0,
      completeDefinitions: 5, incompleteDefinitions: 0,
      indicatorsWithMeasurement: 5, indicatorsWithoutMeasurement: 0,
      validMeasurements: 5, targetMet: 5, targetNotMet: 0,
      calculatedWithoutTarget: 0, measurementsWithEvidence: 5, measurementsWithNotes: 5,
      totalMeasurements: 5, distinctMeasuredPeriods: 3, closedPeriods: 2, openPeriods: 1,
      duplicateMeasurementKeys: 0,
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
      module: 'indicators',
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
      moduleCompliance: [],
    },
  };
}

function finding(id: string, priority = 'MEDIUM') {
  return {
    id, module: 'indicators', title: `Título ${id}`, description: `Descripción ${id}`,
    priority, status: 'OPEN', responsible: '', dueDate: '', createdAt: '',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// IDENTIDAD
// ═══════════════════════════════════════════════════════════════════════════

describe('IndicatorsStandardAnalyzer — identidad y registro', () => {
  it('soporta exclusivamente 6.1.1 y el módulo indicators', () => {
    assert.equal(analyzer.supports('6.1.1'), true);
    assert.equal(analyzer.supports('3.3.2'), false);
    assert.equal(analyzer.supports('6.1.2'), false);
    assert.equal(analyzer.getModule(), 'indicators');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CASOS 1, 4, 15 — score oficial, 0% real, no recálculo
// ═══════════════════════════════════════════════════════════════════════════

describe('IndicatorsStandardAnalyzer — score oficial', () => {
  it('Caso 1: datos completos y buen cumplimiento → narrativa sólida, sin issues', () => {
    const result = analyzer.analyze(context({ compliance: 100 }));
    assert.ok(result.summary.includes('100%'));
    assert.ok(result.summary.includes('sólido'));
    assert.equal(result.keyIssues.length, 0);
    assert.ok(result.quickWins.length > 0);
  });

  it('Caso 4: 0% real con datos evaluables NO se interpreta como ausencia de datos', () => {
    const result = analyzer.analyze(context({
      compliance: 0,
      status: 'TARGET_NOT_MET',
      metadata: metadata({ noDataReason: null }),
      findings: [finding('indicators-target-not-met', 'HIGH')],
    }));
    assert.ok(!result.summary.includes('no es evaluable'));
    assert.ok(result.summary.includes('atención prioritaria'));
    assert.ok(result.keyIssues.some((i) => i.id === 'indicators-target-not-met'));
  });

  it('Caso 15: el analyzer nunca recalcula el score — usa el porcentaje oficial', () => {
    // Metadata con dimensiones imperfectas pero porcentaje oficial 80: la
    // narrativa y métricas deben usar 80, nunca un promedio recalculado.
    const result = analyzer.analyze(context({
      compliance: 80,
      metadata: metadata({
        dimensions: {
          existence: dim(0.5),
          definitionQuality: dim(1),
          measurement: dim(1),
          targetCompliance: dim(1),
          analysisEvidence: dim(1),
          history: dim(1),
        },
      }),
    }));
    assert.ok(result.summary.includes('80%'));
    assert.equal(analyzer.getMetrics(context({ compliance: 80 })).compliancePercentage, 80);
    // Las métricas dimensionales son solo presentación del dato oficial:
    const metrics = analyzer.getMetrics(context({
      compliance: 80,
      metadata: metadata({
        dimensions: {
          existence: dim(0.5), definitionQuality: dim(1), measurement: dim(1),
          targetCompliance: dim(1), analysisEvidence: dim(1), history: dim(1),
        },
      }),
    }));
    assert.equal(metrics['dimension_existence_percent'], 50);
    assert.equal(metrics['compliancePercentage'], 80);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CASOS 2, 3 — NO_DATA por causa
// ═══════════════════════════════════════════════════════════════════════════

describe('IndicatorsStandardAnalyzer — NO_DATA', () => {
  it('Caso 2: NO_DATA no-active-indicators → interpretación explícita', () => {
    const result = analyzer.analyze(context({
      compliance: 0,
      status: 'NO_DATA',
      metadata: metadata({ noDataReason: 'no-active-indicators' }),
      findings: [finding('indicators-no-active', 'HIGH')],
    }));
    assert.ok(result.summary.includes('No existen indicadores activos'));
    assert.ok(result.keyIssues.some((i) => i.id === 'indicators-no-active'));
    assert.ok(result.quickWins.some((q) => /indicadores/i.test(q)));
  });

  it('Caso 3: NO_DATA no-valid-measurements → interpretación explícita', () => {
    const result = analyzer.analyze(context({
      compliance: 0,
      status: 'NO_DATA',
      metadata: metadata({ noDataReason: 'no-valid-measurements' }),
      findings: [finding('indicators-no-data', 'HIGH')],
    }));
    assert.ok(result.summary.includes('no hay mediciones válidas'));
    assert.ok(result.keyIssues.some((i) => i.id === 'indicators-no-data'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CASOS 5–9 — dimensiones débiles
// ═══════════════════════════════════════════════════════════════════════════

describe('IndicatorsStandardAnalyzer — dimensiones débiles', () => {
  const build = (key: string, ratio: number) =>
    metadata({
      dimensions: {
        existence: dim(key === 'existence' ? ratio : 1),
        definitionQuality: dim(key === 'definitionQuality' ? ratio : 1),
        measurement: dim(key === 'measurement' ? ratio : 1),
        targetCompliance: dim(key === 'targetCompliance' ? ratio : 1),
        analysisEvidence: dim(key === 'analysisEvidence' ? ratio : 1),
        history: dim(key === 'history' ? ratio : 1),
      },
    });

  const expectedFinding: Record<string, string> = {
    definitionQuality: 'indicators-definition-incomplete',
    measurement: 'indicators-without-measurement',
    targetCompliance: 'indicators-target-not-met',
    analysisEvidence: 'indicators-analysis-missing',
    history: 'indicators-history-incomplete',
  };

  for (const [key, findingId] of Object.entries(expectedFinding)) {
    it(`Caso: ${key} baja → issue con recomendación específica de 6.1.1`, () => {
      const result = analyzer.analyze(context({
        compliance: 70,
        metadata: build(key, 0.4),
        findings: [finding(findingId)],
      }));
      const issue = result.keyIssues.find((i) => i.id === findingId);
      assert.ok(issue, `esperaba issue ${findingId}`);
      assert.ok(issue.recommendation.length > 10);
      // Recomendación específica del dominio de indicadores:
      assert.ok(
        /ficha|medicion|mediciones|meta|análisis|evidencia|períodos/i.test(issue.recommendation),
        `recomendación no específica: ${issue.recommendation}`,
      );
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CASOS 10, 13 — findings múltiples y desconocidos
// ═══════════════════════════════════════════════════════════════════════════

describe('IndicatorsStandardAnalyzer — findings', () => {
  it('Caso 10: múltiples findings débiles → hasta 5 issues priorizados', () => {
    const result = analyzer.analyze(context({
      compliance: 30,
      metadata: metadata({
        dimensions: {
          existence: dim(1),
          definitionQuality: dim(0.2),
          measurement: dim(0.1),
          targetCompliance: dim(0.3),
          analysisEvidence: dim(0.2),
          history: dim(0.1),
        },
      }),
      findings: [
        finding('indicators-definition-incomplete'),
        finding('indicators-without-measurement'),
        finding('indicators-target-not-met'),
        finding('indicators-analysis-missing'),
        finding('indicators-history-incomplete'),
        finding('indicators-target-not-met'),
      ],
    }));
    assert.ok(result.keyIssues.length > 0 && result.keyIssues.length <= 5);
    // Prioridad del finding oficial se respeta:
    const high = result.keyIssues.find((i) => i.id === 'indicators-target-not-met');
    assert.ok(high);
  });

  it('Caso 13: finding desconocido no rompe el análisis (se ignora si no mapea)', () => {
    const result = analyzer.analyze(context({
      compliance: 75,
      findings: [finding('some-unknown-finding-id')],
    }));
    assert.ok(result.summary.length > 0);
    // No se inventa un issue con el id desconocido:
    assert.ok(!result.keyIssues.some((i) => i.id === 'some-unknown-finding-id'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CASOS 11, 12 — metadata inválida y ausente
// ═══════════════════════════════════════════════════════════════════════════

describe('IndicatorsStandardAnalyzer — tolerancia', () => {
  it('Caso 11: metadata inválida (formula incorrecta) → análisis genérico sin romper', () => {
    const result = analyzer.analyze(context({
      compliance: 60,
      metadata: { formula: 'legacy:v0', dimensions: 'not-an-object' },
    }));
    assert.ok(result.summary.includes('60%'));
    assert.equal(result.keyIssues.length, 0);
  });

  it('Caso 12: metadata ausente → narrativa solo con el porcentaje oficial', () => {
    const result = analyzer.analyze(context({ compliance: 55, metadata: undefined }));
    assert.ok(result.summary.includes('55%'));
    assert.ok(result.summary.length > 20);
  });

  it('duplicados > 0 generan issue de integridad con recommendation', () => {
    const result = analyzer.analyze(context({
      compliance: 70,
      metadata: metadata({ counters: { duplicateMeasurementKeys: 2, activeIndicators: 4, indicatorsWithMeasurement: 4 } }),
      findings: [finding('indicators-duplicate-measurements', 'LOW')],
    }));
    const dup = result.keyIssues.find((i) => i.id === 'indicators-duplicate-measurements');
    assert.ok(dup);
    assert.equal(dup!.priority, 'LOW');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CASO 14 — separación de estándares fuente
// ═══════════════════════════════════════════════════════════════════════════

describe('IndicatorsStandardAnalyzer — separación de dominios', () => {
  it('Caso 14: las recomendaciones no mencionan cumplimiento de estándares fuente', () => {
    const texts: string[] = [];
    const collect = (r: StandardAnalysisInterpretation) => {
      texts.push(r.summary, ...r.quickWins, ...r.nextSteps, ...r.keyIssues.map((i) => `${i.impact} ${i.recommendation}`));
    };
    collect(analyzer.analyze(context({
      compliance: 40,
      metadata: metadata({
        dimensions: {
          existence: dim(0.3), definitionQuality: dim(0.2), measurement: dim(0.1),
          targetCompliance: dim(0.2), analysisEvidence: dim(0.2), history: dim(0.1),
        },
      }),
      findings: [
        finding('indicators-definition-incomplete'),
        finding('indicators-without-measurement'),
        finding('indicators-target-not-met'),
        finding('indicators-analysis-missing'),
        finding('indicators-history-incomplete'),
      ],
    })));

    for (const t of texts) {
      // La gestión del indicador de riesgos ≠ cumplimiento 4.2.2; capacitación ≠ 2.x;
      // documental ≠ 2.5.1. El analyzer interpreta gestión de indicadores:
      assert.doesNotMatch(t, /4\.2\.2|2\.5\.1|3\.3\.2|EPP|matriz de riesgos|emergencias/i);
    }
  });
});
