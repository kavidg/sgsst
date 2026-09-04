import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AbsenteeismStandardAnalyzer } from './absenteeism-standard.analyzer';
import { StandardAnalysisContext } from '../../dto/standard-analysis.dto';

// ── Mock helpers ──

function createMockContext(overrides: Partial<StandardAnalysisContext> = {}): StandardAnalysisContext {
  return {
    companyId: 'company-123',
    moduleCompliance: {
      module: 'absenteeism',
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
    id: overrides.id ?? 'absenteeism-records-incomplete',
    module: 'absenteeism',
    title: overrides.title ?? '2 registro(s) de ausentismo con información incompleta',
    description: overrides.description ?? 'Test description',
    priority: overrides.priority ?? 'HIGH',
    status: 'OPEN',
    responsible: '',
    dueDate: '',
    createdAt: new Date().toISOString(),
  };
}

// ── Tests ──

describe('AbsenteeismStandardAnalyzer (3.2.1 · Registro de ausentismo)', () => {
  const analyzer = new AbsenteeismStandardAnalyzer();

  it('SUPPORTS-001: supports 3.2.1', () => {
    assert.equal(analyzer.supports('3.2.1'), true);
  });

  it('SUPPORTS-002: no soporta otros códigos', () => {
    assert.equal(analyzer.supports('3.1.1'), false);
    assert.equal(analyzer.supports('3.1.2'), false);
    assert.equal(analyzer.supports('3.1.3'), false);
    assert.equal(analyzer.supports('3.1.4'), false);
    assert.equal(analyzer.supports('2.9.1'), false);
    assert.equal(analyzer.supports(''), false);
  });

  it('MODULE-001: getModule retorna absenteeism', () => {
    assert.equal(analyzer.getModule(), 'absenteeism');
  });

  it('NO-DATA-001: Sin datos retorna NO_DATA con quick wins', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'absenteeism', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('No se encontraron registros de ausentismo'));
    assert.equal(result.keyIssues.length, 0);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.nextSteps.length > 0);
  });

  it('NO-DATA-002: finding no-data genera summary correcto', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'absenteeism', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('No se encontraron registros de ausentismo'));
    assert.ok(result.quickWins[0].includes('Registrar'));
    assert.ok(result.nextSteps[0].includes('Ausentismos'));
  });

  it('COMPLIANT-001: Alta satisfacción con buen cumplimiento', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'absenteeism', compliance: 95, level: 'COMPLIANT', lastUpdated: '' },
      findings: [],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('95%'));
    assert.ok(result.summary.includes('sólida'));
    assert.equal(result.keyIssues.length, 0);
  });

  it('PARTIAL-001: Cumplimiento parcial con issues', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'absenteeism', compliance: 60, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'absenteeism-records-incomplete', title: '3 registro(s) con información incompleta', priority: 'HIGH' }),
        buildFinding({ id: 'absenteeism-limited-temporal-coverage', title: 'Registros concentrados en un solo período', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('60%'));
    assert.ok(result.keyIssues.length >= 2);
    assert.ok(result.quickWins.length > 0);
  });

  it('NON_COMPLIANT-001: Bajo cumplimiento', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'absenteeism', compliance: 20, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'absenteeism-no-recent-records', title: 'Sin registros de ausentismo en los últimos 12 meses', priority: 'HIGH' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('20%'));
    assert.ok(result.summary.includes('atención prioritaria'));
  });

  it('FINDINGS-001: RECORDS-INCOMPLETE genera keyIssue con impacto', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'absenteeism', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'absenteeism-records-incomplete', title: '3 registro(s) con información incompleta', priority: 'HIGH' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'absenteeism-records-incomplete');
    assert.ok(issue, 'Should have records-incomplete issue');
    assert.equal(issue!.priority, 'HIGH');
    assert.ok(issue!.impact.length > 0);
    assert.ok(issue!.recommendation.length > 0);
  });

  it('FINDINGS-002: NO-RECENT-RECORDS genera keyIssue', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'absenteeism', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'absenteeism-no-recent-records', title: 'Sin registros en últimos 12 meses', priority: 'HIGH' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'absenteeism-no-recent-records');
    assert.ok(issue, 'Should have no-recent-records issue');
    assert.equal(issue!.priority, 'HIGH');
  });

  it('FINDINGS-003: LIMITED-TEMPORAL-COVERAGE genera keyIssue', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'absenteeism', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'absenteeism-limited-temporal-coverage', title: 'Registros en 1 solo mes', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'absenteeism-limited-temporal-coverage');
    assert.ok(issue, 'Should have limited-temporal-coverage issue');
    assert.equal(issue!.priority, 'MEDIUM');
  });

  it('FINDINGS-004: LOW-TYPE-DIVERSITY genera keyIssue', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'absenteeism', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'absenteeism-low-type-diversity', title: 'Registros en 1 solo tipo', priority: 'LOW' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'absenteeism-low-type-diversity');
    assert.ok(issue, 'Should have low-type-diversity issue');
    assert.equal(issue!.priority, 'LOW');
  });

  it('FINDINGS-005: INSUFFICIENT-TREND-DATA genera keyIssue', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'absenteeism', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'absenteeism-insufficient-trend-data', title: 'Datos insuficientes para tendencias', priority: 'LOW' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'absenteeism-insufficient-trend-data');
    assert.ok(issue, 'Should have insufficient-trend-data issue');
    assert.equal(issue!.priority, 'LOW');
  });

  it('QUICK-WINS-001: Genera quick wins relevantes', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'absenteeism', compliance: 40, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'absenteeism-no-recent-records', title: 'Sin registros recientes', priority: 'HIGH' }),
        buildFinding({ id: 'absenteeism-records-incomplete', title: '5 registros incompletos', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.quickWins.length > 0, 'Should have quick wins');
    assert.ok(result.quickWins.length <= 3, 'Should have at most 3 quick wins');
  });

  it('NEXT-STEPS-001: Genera next steps accionables', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'absenteeism', compliance: 30, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'absenteeism-no-recent-records', title: 'Sin registros recientes', priority: 'HIGH' }),
        buildFinding({ id: 'absenteeism-limited-temporal-coverage', title: 'Cobertura limitada', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.nextSteps.length > 0, 'Should have next steps');
    assert.ok(result.nextSteps.length <= 3, 'Should have at most 3 next steps');
  });

  it('PRIVACY-001: No contiene información clínica', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'absenteeism', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'absenteeism-records-incomplete', title: '3 registros incompletos', priority: 'HIGH' }),
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

  it('PRIVACY-002: No contiene userId ni datos individuales', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'absenteeism', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'absenteeism-records-incomplete', title: '3 registros incompletos', priority: 'HIGH' }),
      ],
    });

    const result = analyzer.analyze(context);
    const resultStr = JSON.stringify(result);

    assert.ok(!resultStr.includes('userId'), 'Should not contain userId');
    assert.ok(!resultStr.includes('employeeId'), 'Should not contain employeeId');
    assert.ok(!resultStr.includes('64b0000000000000000000'), 'Should not contain ObjectId');
  });

  it('METRICS-001: getMetrics retorna métricas válidas', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'absenteeism', compliance: 60, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'absenteeism-records-incomplete', title: '2 registro(s) incompletos', priority: 'HIGH' }),
      ],
    });

    const metrics = analyzer.getMetrics(context);
    assert.ok(metrics.compliancePercentage !== undefined);
  });

  it('TITLE-001: Responde al módulo correcto', () => {
    assert.equal(analyzer.getModule(), 'absenteeism');
    assert.equal(analyzer.supports('3.2.1'), true);
  });

  it('TRENDS-001: finding insufficient-trend-data genera keyIssue', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'absenteeism', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'absenteeism-insufficient-trend-data', title: 'Datos insuficientes para tendencias', priority: 'LOW' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'absenteeism-insufficient-trend-data');
    assert.ok(issue, 'Should have insufficient-trend-data issue');
    assert.ok(issue!.recommendation.includes('Consolidar'));
  });
});
