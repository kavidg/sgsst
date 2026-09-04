import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OccupationalEvaluationStandardAnalyzer } from './occupational-evaluation-standard.analyzer';
import { StandardAnalysisContext } from '../../dto/standard-analysis.dto';

// ── Mock helpers ──

function createMockContext(overrides: Partial<StandardAnalysisContext> = {}): StandardAnalysisContext {
  return {
    companyId: 'company-123',
    moduleCompliance: {
      module: 'occupational-evaluation',
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
    id: overrides.id ?? 'occupational-evaluation-entry-pending',
    module: 'occupational-evaluation',
    title: overrides.title ?? '2 trabajador(es) sin evaluación de ingreso',
    description: overrides.description ?? 'Test description',
    priority: overrides.priority ?? 'HIGH',
    status: 'OPEN',
    responsible: '',
    dueDate: '',
    createdAt: new Date().toISOString(),
  };
}

// ── Tests ──

describe('OccupationalEvaluationStandardAnalyzer (3.1.4 · Realización de Evaluaciones Médicas Ocupacionales)', () => {
  const analyzer = new OccupationalEvaluationStandardAnalyzer();

  it('SUPPORTS-001: supports 3.1.4', () => {
    assert.equal(analyzer.supports('3.1.4'), true);
  });

  it('SUPPORTS-002: no soporta otros códigos', () => {
    assert.equal(analyzer.supports('3.1.1'), false);
    assert.equal(analyzer.supports('3.1.2'), false);
    assert.equal(analyzer.supports('3.1.3'), false);
    assert.equal(analyzer.supports('2.9.1'), false);
    assert.equal(analyzer.supports(''), false);
  });

  it('MODULE-001: getModule retorna occupational-evaluation', () => {
    assert.equal(analyzer.getModule(), 'occupational-evaluation');
  });

  it('NO-DATA-001: Sin datos retorna NO_DATA con quick wins', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'occupational-evaluation', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('No existen evaluaciones médicas ocupacionales'));
    assert.equal(result.keyIssues.length, 0);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.nextSteps.length > 0);
  });

  it('COMPLIANT-001: Alta satisfacción con buen cumplimiento', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'occupational-evaluation', compliance: 95, level: 'COMPLIANT', lastUpdated: '' },
      findings: [],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('95%'));
    assert.ok(result.summary.includes('sólida'));
    assert.equal(result.keyIssues.length, 0);
  });

  it('PARTIAL-001: Cumplimiento parcial con issues', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'occupational-evaluation', compliance: 60, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'occupational-evaluation-entry-pending', title: '3 trabajador(es) sin evaluación de ingreso', priority: 'HIGH' }),
        buildFinding({ id: 'occupational-evaluation-communication-pending', title: '5 evaluación(es) sin comunicación confirmada al trabajador', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('60%'));
    assert.ok(result.keyIssues.length >= 2);
    assert.ok(result.quickWins.length > 0);
  });

  it('NON_COMPLIANT-001: Bajo cumplimiento', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'occupational-evaluation', compliance: 20, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'occupational-evaluation-entry-pending', title: '8 trabajador(es) sin evaluación de ingreso', priority: 'HIGH' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('20%'));
    assert.ok(result.summary.includes('atención prioritaria'));
  });

  it('FINDINGS-001: ENTRY-PENDING genera keyIssue con impacto', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'occupational-evaluation', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'occupational-evaluation-entry-pending', title: '3 trabajador(es) sin evaluación de ingreso', priority: 'HIGH' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'occupational-evaluation-entry-pending');
    assert.ok(issue, 'Should have entry-pending issue');
    assert.equal(issue!.priority, 'HIGH');
    assert.ok(issue!.impact.length > 0);
    assert.ok(issue!.recommendation.length > 0);
  });

  it('FINDINGS-002: COMMUNICATION-PENDING genera keyIssue', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'occupational-evaluation', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'occupational-evaluation-communication-pending', title: '5 evaluación(es) sin comunicación confirmada al trabajador', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'occupational-evaluation-communication-pending');
    assert.ok(issue, 'Should have communication-pending issue');
    assert.equal(issue!.priority, 'MEDIUM');
  });

  it('FINDINGS-003: HAZARD-COVERAGE-PENDING genera keyIssue', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'occupational-evaluation', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'occupational-evaluation-hazard-coverage-pending', title: '4 evaluación(es) sin relación con peligros ocupacionales', priority: 'LOW' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'occupational-evaluation-hazard-coverage-pending');
    assert.ok(issue, 'Should have hazard-coverage-pending issue');
    assert.equal(issue!.priority, 'LOW');
  });

  it('FINDINGS-004: PERIODICITY-PENDING genera keyIssue', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'occupational-evaluation', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'occupational-evaluation-periodicity-pending', title: '3 evaluación(es) periódica(s) sin periodicidad definida', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'occupational-evaluation-periodicity-pending');
    assert.ok(issue, 'Should have periodicity-pending issue');
  });

  it('QUICK-WINS-001: Genera quick wins relevantes', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'occupational-evaluation', compliance: 40, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'occupational-evaluation-entry-pending', title: '5 trabajador(es) sin evaluación de ingreso', priority: 'HIGH' }),
        buildFinding({ id: 'occupational-evaluation-communication-pending', title: '5 evaluación(es) sin comunicación confirmada al trabajador', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.quickWins.length > 0, 'Should have quick wins');
    assert.ok(result.quickWins.length <= 3, 'Should have at most 3 quick wins');
  });

  it('NEXT-STEPS-001: Genera next steps accionables', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'occupational-evaluation', compliance: 30, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'occupational-evaluation-entry-pending', title: '5 trabajador(es) sin evaluación de ingreso', priority: 'HIGH' }),
        buildFinding({ id: 'occupational-evaluation-communication-pending', title: '5 evaluación(es) sin comunicación confirmada al trabajador', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.nextSteps.length > 0, 'Should have next steps');
    assert.ok(result.nextSteps.length <= 3, 'Should have at most 3 next steps');
  });

  it('PRIVACY-001: No contiene información clínica', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'occupational-evaluation', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'occupational-evaluation-entry-pending', title: '3 trabajador(es) sin evaluación de ingreso', priority: 'HIGH' }),
      ],
    });

    const result = analyzer.analyze(context);
    const resultStr = JSON.stringify(result);

    assert.ok(!resultStr.includes('diagnóstico'), 'Should not contain diagnostic');
    assert.ok(!resultStr.includes('historia clínica'), 'Should not contain clinical history');
    assert.ok(!resultStr.includes('medicamento'), 'Should not contain medication');
    assert.ok(!resultStr.includes('tratamiento'), 'Should not contain treatment');
    assert.ok(!resultStr.includes('síntoma'), 'Should not contain symptom');
    assert.ok(!resultStr.includes('enfermedad'), 'Should not contain disease');
    assert.ok(!resultStr.includes('Employee'), 'Should not contain employee names');
    assert.ok(!resultStr.includes('1234567890'), 'Should not contain document numbers');
  });

  it('METRICS-001: getMetrics retorna métricas válidas', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'occupational-evaluation', compliance: 60, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'occupational-evaluation-entry-pending', title: '2 trabajador(es) sin evaluación de ingreso', priority: 'HIGH' }),
      ],
    });

    const metrics = analyzer.getMetrics(context);
    assert.ok(metrics.compliancePercentage !== undefined);
  });

  it('NO-DATA-002: finding no-data genera summary correcto', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'occupational-evaluation', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('No existen evaluaciones médicas ocupacionales'));
    assert.ok(result.quickWins[0].includes('Registrar'));
    assert.ok(result.nextSteps[0].includes('Empleados'));
  });

  it('EXIT-PENDING-001: Genera keyIssue para evaluaciones de egreso pendientes', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'occupational-evaluation', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'occupational-evaluation-exit-pending', title: '2 trabajador(es) inactivos sin evaluación de egreso', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'occupational-evaluation-exit-pending');
    assert.ok(issue, 'Should have exit-pending issue');
    assert.equal(issue!.priority, 'MEDIUM');
  });
});
