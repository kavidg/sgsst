import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { IndicatorHealthStandardAnalyzer } from './indicator-health-standard.analyzer';
import { StandardAnalysisContext } from '../../dto/standard-analysis.dto';

// ── Mock helpers ──

function createMockContext(overrides: Partial<StandardAnalysisContext> = {}): StandardAnalysisContext {
  return {
    companyId: 'company-123',
    moduleCompliance: {
      module: 'indicators',
      compliance: 0,
      level: 'NO_DATA',
      lastUpdated: new Date().toISOString(),
    },
    findings: [],
    overview: {
      overallCompliance: 0,
      phaseCompliance: { plan: 0, do: 0, check: 0, act: 0 },
      moduleCompliance: [],
    },
    ...overrides,
  };
}

function buildFinding(overrides: {
  id?: string;
  title?: string;
  description?: string;
  priority?: string;
} = {}) {
  return {
    id: overrides.id ?? 'indicators-no-data',
    module: 'indicators',
    title: overrides.title ?? '1 indicador(es) sin medición',
    description: overrides.description ?? 'Test description',
    priority: overrides.priority ?? 'HIGH',
    status: 'OPEN',
    responsible: '',
    dueDate: '',
    createdAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
// SUPPORTS
// ═══════════════════════════════════════════════════════════════

describe('IndicatorHealthStandardAnalyzer (3.3.2 · Medición y análisis de indicadores de salud)', () => {
  const analyzer = new IndicatorHealthStandardAnalyzer();

  it('AN-001: supports 3.3.2', () => {
    assert.equal(analyzer.supports('3.3.2'), true);
  });

  it('AN-002: no soporta otros códigos', () => {
    assert.equal(analyzer.supports('3.3.1'), false);
    assert.equal(analyzer.supports('3.2.1'), false);
    assert.equal(analyzer.supports('3.2.2'), false);
    assert.equal(analyzer.supports('3.1.1'), false);
    assert.equal(analyzer.supports('6.1.1'), false);
    assert.equal(analyzer.supports(''), false);
    assert.equal(analyzer.supports('99.99'), false);
  });

  // ═══════════════════════════════════════════════════════════════
  // MODULE
  // ═══════════════════════════════════════════════════════════════

  it('AN-003: getModule retorna indicators', () => {
    assert.equal(analyzer.getModule(), 'indicators');
  });

  // ═══════════════════════════════════════════════════════════════
  // NO_DATA
  // ═══════════════════════════════════════════════════════════════

  it('AN-004: NO_DATA cuando no existen indicadores', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [buildFinding({ id: 'indicators-no-active', title: 'No hay indicadores configurados', priority: 'HIGH' })],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('No existen indicadores de salud configurados'));
    assert.equal(result.keyIssues.length, 0);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.nextSteps.length > 0);
  });

  it('AN-005: NO_DATA usa finding indicators-no-active', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [buildFinding({ id: 'indicators-no-active', title: 'No hay indicadores', priority: 'HIGH' })],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('No existen indicadores de salud configurados'));
    assert.ok(result.quickWins[0].includes('Configurar'));
    assert.ok(result.nextSteps[0].includes('Configurar'));
  });

  it('AN-006: NO_DATA no se genera cuando existen indicadores', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 60, level: 'PARTIAL', lastUpdated: '' },
      findings: [buildFinding({ id: 'indicators-target-not-met', title: 'Indicadores fuera de rango', priority: 'MEDIUM' })],
    });

    const result = analyzer.analyze(context);
    assert.ok(!result.summary.includes('No existen indicadores'));
    assert.ok(result.keyIssues.length > 0);
  });

  // ═══════════════════════════════════════════════════════════════
  // MEDICIONES
  // ═══════════════════════════════════════════════════════════════

  it('AN-007: indicadores sin medición genera finding indicators-no-data', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [buildFinding({ id: 'indicators-no-data', title: '3 indicador(es) sin medición', priority: 'HIGH' })],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'indicators-no-data');
    assert.ok(issue, 'Should have no-data issue');
    assert.equal(issue!.priority, 'HIGH');
  });

  // ═══════════════════════════════════════════════════════════════
  // TARGET
  // ═══════════════════════════════════════════════════════════════

  it('AN-008: target not met genera finding indicators-target-not-met', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [buildFinding({ id: 'indicators-target-not-met', title: '2 indicador(es) no alcanzan la meta', priority: 'MEDIUM' })],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'indicators-target-not-met');
    assert.ok(issue, 'Should have target-not-met issue');
    assert.equal(issue!.priority, 'MEDIUM');
  });

  it('AN-009: target met no genera finding de incumplimiento', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 100, level: 'COMPLIANT', lastUpdated: '' },
      findings: [],
    });

    const result = analyzer.analyze(context);
    assert.equal(result.keyIssues.length, 0);
    assert.ok(result.summary.includes('100%'));
    assert.ok(result.summary.includes('metas se alcanzan'));
  });

  // ═══════════════════════════════════════════════════════════════
  // FINDINGS
  // ═══════════════════════════════════════════════════════════════

  it('FINDINGS-001: indicators-no-active genera keyIssue HIGH', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [buildFinding({ id: 'indicators-no-active', title: 'No hay indicadores', priority: 'HIGH' })],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'indicators-no-active');
    assert.ok(issue, 'Should have no-active issue');
    assert.equal(issue!.priority, 'HIGH');
    assert.ok(issue!.impact.length > 0);
    assert.ok(issue!.recommendation.length > 0);
  });

  it('FINDINGS-002: indicators-no-data genera keyIssue HIGH', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [buildFinding({ id: 'indicators-no-data', title: '3 sin medición', priority: 'HIGH' })],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'indicators-no-data');
    assert.ok(issue, 'Should have no-data issue');
    assert.equal(issue!.priority, 'HIGH');
  });

  it('FINDINGS-003: indicators-target-not-met genera keyIssue MEDIUM', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [buildFinding({ id: 'indicators-target-not-met', title: '2 fuera de rango', priority: 'MEDIUM' })],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'indicators-target-not-met');
    assert.ok(issue, 'Should have target-not-met issue');
    assert.equal(issue!.priority, 'MEDIUM');
  });

  // ═══════════════════════════════════════════════════════════════
  // QUICK WINS
  // ═══════════════════════════════════════════════════════════════

  it('QUICK-WINS-001: Genera quick wins relevantes', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 40, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'indicators-no-data', title: 'Sin medición', priority: 'HIGH' }),
        buildFinding({ id: 'indicators-target-not-met', title: 'Fuera de rango', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.quickWins.length > 0, 'Should have quick wins');
    assert.ok(result.quickWins.length <= 3, 'Should have at most 3 quick wins');
  });

  it('QUICK-WINS-002: Prioriza HIGH sobre MEDIUM', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 30, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'indicators-no-data', title: 'Sin medición', priority: 'HIGH' }),
        buildFinding({ id: 'indicators-target-not-met', title: 'Fuera de rango', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.quickWins[0].includes('Calcular') || result.quickWins[0].includes('medición'));
  });

  // ═══════════════════════════════════════════════════════════════
  // NEXT STEPS
  // ═══════════════════════════════════════════════════════════════

  it('NEXT-STEPS-001: Genera next steps accionables', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 30, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'indicators-no-data', title: 'Sin medición', priority: 'HIGH' }),
        buildFinding({ id: 'indicators-target-not-met', title: 'Fuera de rango', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.nextSteps.length > 0, 'Should have next steps');
    assert.ok(result.nextSteps.length <= 3, 'Should have at most 3 next steps');
  });

  it('NEXT-STEPS-002: Prioriza issues HIGH', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 30, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'indicators-no-data', title: 'Sin medición', priority: 'HIGH' }),
        buildFinding({ id: 'indicators-target-not-met', title: 'Fuera de rango', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.nextSteps[0].includes('cálculo') || result.nextSteps[0].includes('período'));
  });

  // ═══════════════════════════════════════════════════════════════
  // METRICS
  // ═══════════════════════════════════════════════════════════════

  it('METRICS-001: getMetrics retorna compliancePercentage', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 60, level: 'PARTIAL', lastUpdated: '' },
      findings: [],
    });

    const metrics = analyzer.getMetrics(context);
    assert.equal(metrics.compliancePercentage, 60);
  });

  it('METRICS-002: getMetrics con NO_ACTIVE retorna totalIndicators = 0', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [buildFinding({ id: 'indicators-no-active', title: 'Sin indicadores', priority: 'HIGH' })],
    });

    const metrics = analyzer.getMetrics(context);
    assert.equal(metrics.totalIndicators, 0);
    assert.equal(metrics.activeIndicators, 0);
  });

  it('METRICS-003: getMetrics con NO_DATA retorna noData = 1', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [buildFinding({ id: 'indicators-no-data', title: 'Sin medición', priority: 'HIGH' })],
    });

    const metrics = analyzer.getMetrics(context);
    assert.equal(metrics.noData, 1);
    assert.equal(metrics.withMeasurement, 0);
  });

  it('METRICS-004: getMetrics con target not met retorna targetNotMet = 1', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [buildFinding({ id: 'indicators-target-not-met', title: 'Fuera de rango', priority: 'MEDIUM' })],
    });

    const metrics = analyzer.getMetrics(context);
    assert.equal(metrics.targetNotMet, 1);
    assert.equal(metrics.targetMet, 0);
  });

  it('METRICS-005: getMetrics sin findings retorna targetMet = 1', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 100, level: 'COMPLIANT', lastUpdated: '' },
      findings: [],
    });

    const metrics = analyzer.getMetrics(context);
    assert.equal(metrics.targetMet, 1);
    assert.equal(metrics.targetNotMet, 0);
  });

  // ═══════════════════════════════════════════════════════════════
  // PRIVACY
  // ═══════════════════════════════════════════════════════════════

  it('PRIVACY-001: No contiene información clínica', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [buildFinding({ id: 'indicators-target-not-met', title: 'Fuera de rango', priority: 'MEDIUM' })],
    });

    const result = analyzer.analyze(context);
    const resultStr = JSON.stringify(result);

    assert.ok(!resultStr.includes('diagnóstico'), 'Should not contain diagnostic');
    assert.ok(!resultStr.includes('historia clínica'), 'Should not contain clinical history');
    assert.ok(!resultStr.includes('medicamento'), 'Should not contain medication');
    assert.ok(!resultStr.includes('tratamiento'), 'Should not contain treatment');
    assert.ok(!resultStr.includes('síntoma'), 'Should not contain symptom');
  });

  it('PRIVACY-002: No contiene employeeId ni datos individuales', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [buildFinding({ id: 'indicators-target-not-met', title: 'Fuera de rango', priority: 'MEDIUM' })],
    });

    const result = analyzer.analyze(context);
    const resultStr = JSON.stringify(result);

    assert.ok(!resultStr.includes('employeeId'), 'Should not contain employeeId');
    assert.ok(!resultStr.includes('userId'), 'Should not contain userId');
    assert.ok(!resultStr.includes('64b0000000000000000000'), 'Should not contain ObjectId');
  });

  // ═══════════════════════════════════════════════════════════════
  // COMPATIBILIDAD
  // ═══════════════════════════════════════════════════════════════

  it('COMPAT-001: Comportamiento cuando findings está vacío', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.length > 0);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.nextSteps.length > 0);
  });

  it('COMPAT-002: Comportamiento con múltiples findings', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 30, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'indicators-no-data', title: 'Sin medición', priority: 'HIGH' }),
        buildFinding({ id: 'indicators-target-not-met', title: 'Fuera de rango', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.keyIssues.length >= 2);
    assert.ok(result.quickWins.length <= 3);
    assert.ok(result.nextSteps.length <= 3);
  });

  // ═══════════════════════════════════════════════════════════════
  // CONTRACT
  // ═══════════════════════════════════════════════════════════════

  it('CONTRACT-001: Implementa interfaz StandardAnalyzer', () => {
    assert.equal(typeof analyzer.supports, 'function');
    assert.equal(typeof analyzer.getModule, 'function');
    assert.equal(typeof analyzer.analyze, 'function');
    assert.equal(typeof analyzer.getMetrics, 'function');
  });

  it('CONTRACT-002: analyze retorna estructura correcta', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'indicators', compliance: 75, level: 'PARTIAL', lastUpdated: '' },
      findings: [],
    });

    const result = analyzer.analyze(context);
    assert.equal(typeof result.summary, 'string');
    assert.ok(Array.isArray(result.keyIssues));
    assert.ok(Array.isArray(result.quickWins));
    assert.ok(Array.isArray(result.nextSteps));
  });
});
