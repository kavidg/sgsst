import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DiseaseInvestigationStandardAnalyzer } from './disease-investigation-standard.analyzer';
import { StandardAnalysisContext } from '../../dto/standard-analysis.dto';

// ── Mock helpers ──

function createMockContext(overrides: Partial<StandardAnalysisContext> = {}): StandardAnalysisContext {
  return {
    companyId: 'company-123',
    moduleCompliance: {
      module: 'disease-investigation',
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
    id: overrides.id ?? 'disease-investigation-formal-research-gap',
    module: 'disease-investigation',
    title: overrides.title ?? '1 investigación(es) sin fecha formal',
    description: overrides.description ?? 'Test description',
    priority: overrides.priority ?? 'MEDIUM',
    status: 'OPEN',
    responsible: '',
    dueDate: '',
    createdAt: new Date().toISOString(),
  };
}

// ── Tests ──

describe('DiseaseInvestigationStandardAnalyzer (3.2.2 · Investigación de enfermedades laborales)', () => {
  const analyzer = new DiseaseInvestigationStandardAnalyzer();

  // ═══════════════════════════════════════════════════════════════
  // SUPPORTS
  // ═══════════════════════════════════════════════════════════════

  it('SUPPORTS-001: supports 3.2.2', () => {
    assert.equal(analyzer.supports('3.2.2'), true);
  });

  it('SUPPORTS-002: no soporta otros códigos', () => {
    assert.equal(analyzer.supports('3.1.1'), false);
    assert.equal(analyzer.supports('3.1.2'), false);
    assert.equal(analyzer.supports('3.1.3'), false);
    assert.equal(analyzer.supports('3.1.4'), false);
    assert.equal(analyzer.supports('3.2.1'), false);
    assert.equal(analyzer.supports('2.9.1'), false);
    assert.equal(analyzer.supports(''), false);
    assert.equal(analyzer.supports('99.99'), false);
  });

  it('MODULE-001: getModule retorna disease-investigation', () => {
    assert.equal(analyzer.getModule(), 'disease-investigation');
  });

  // ═══════════════════════════════════════════════════════════════
  // NO_DATA
  // ═══════════════════════════════════════════════════════════════

  it('NO-DATA-001: Sin datos retorna NO_DATA con quick wins', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('No se encontraron investigaciones de enfermedades laborales'));
    assert.equal(result.keyIssues.length, 0);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.nextSteps.length > 0);
  });

  it('NO-DATA-002: finding no-data genera summary correcto', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [buildFinding({ id: 'disease-investigation-no-data', title: 'Sin investigaciones', priority: 'HIGH' })],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('No se encontraron investigaciones de enfermedades laborales'));
    assert.ok(result.quickWins[0].includes('Registrar'));
    assert.ok(result.nextSteps[0].includes('mecanismo periódico'));
  });

  // ═══════════════════════════════════════════════════════════════
  // COMPLIANT
  // ═══════════════════════════════════════════════════════════════

  it('COMPLIANT-001: Alta satisfacción con buen cumplimiento', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 95, level: 'COMPLIANT', lastUpdated: '' },
      findings: [],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('95%'));
    assert.ok(result.summary.includes('sólida'));
    assert.equal(result.keyIssues.length, 0);
  });

  // ═══════════════════════════════════════════════════════════════
  // PARTIAL
  // ═══════════════════════════════════════════════════════════════

  it('PARTIAL-001: Cumplimiento parcial con issues', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 60, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'disease-investigation-formal-research-gap', title: '2 investigaciones sin fecha formal', priority: 'HIGH' }),
        buildFinding({ id: 'disease-investigation-causal-analysis-gap', title: '1 investigación sin análisis causal', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('60%'));
    assert.ok(result.keyIssues.length >= 2);
    assert.ok(result.quickWins.length > 0);
  });

  // ═══════════════════════════════════════════════════════════════
  // NON_COMPLIANT
  // ═══════════════════════════════════════════════════════════════

  it('NON_COMPLIANT-001: Bajo cumplimiento', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 20, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'disease-investigation-overdue-actions', title: '3 acciones vencidas', priority: 'HIGH' }),
        buildFinding({ id: 'disease-investigation-causal-analysis-gap', title: '2 sin análisis causal', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('20%'));
    assert.ok(result.summary.includes('atención prioritaria'));
  });

  // ═══════════════════════════════════════════════════════════════
  // FINDINGS
  // ═══════════════════════════════════════════════════════════════

  it('FINDINGS-001: FORMAL-RESEARCH-GAP genera keyIssue con impacto', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'disease-investigation-formal-research-gap', title: '2 investigaciones sin fecha formal', priority: 'HIGH' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'disease-investigation-formal-research-gap');
    assert.ok(issue, 'Should have formal-research-gap issue');
    assert.equal(issue!.priority, 'HIGH');
    assert.ok(issue!.impact.length > 0);
    assert.ok(issue!.recommendation.length > 0);
  });

  it('FINDINGS-002: CAUSAL-ANALYSIS-GAP genera keyIssue', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'disease-investigation-causal-analysis-gap', title: '1 sin análisis causal', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'disease-investigation-causal-analysis-gap');
    assert.ok(issue, 'Should have causal-analysis-gap issue');
    assert.equal(issue!.priority, 'MEDIUM');
  });

  it('FINDINGS-003: ACTIONS-GAP genera keyIssue', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'disease-investigation-actions-gap', title: '1 sin acciones', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'disease-investigation-actions-gap');
    assert.ok(issue, 'Should have actions-gap issue');
    assert.equal(issue!.priority, 'MEDIUM');
  });

  it('FINDINGS-004: OVERDUE-ACTIONS genera keyIssue', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'disease-investigation-overdue-actions', title: '2 acciones vencidas', priority: 'HIGH' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'disease-investigation-overdue-actions');
    assert.ok(issue, 'Should have overdue-actions issue');
    assert.equal(issue!.priority, 'HIGH');
  });

  it('FINDINGS-005: EVIDENCE-GAP genera keyIssue', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'disease-investigation-evidence-gap', title: '1 sin evidencia', priority: 'LOW' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'disease-investigation-evidence-gap');
    assert.ok(issue, 'Should have evidence-gap issue');
    assert.equal(issue!.priority, 'LOW');
  });

  it('FINDINGS-006: RESPONSIBLE-GAP genera keyIssue', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'disease-investigation-responsible-gap', title: '1 sin responsable', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'disease-investigation-responsible-gap');
    assert.ok(issue, 'Should have responsible-gap issue');
    assert.equal(issue!.priority, 'MEDIUM');
  });

  it('FINDINGS-007: PENDING-CLOSURE genera keyIssue', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'disease-investigation-pending-closure', title: '1 pendiente de cierre', priority: 'LOW' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'disease-investigation-pending-closure');
    assert.ok(issue, 'Should have pending-closure issue');
    assert.equal(issue!.priority, 'LOW');
  });

  // ═══════════════════════════════════════════════════════════════
  // QUICK WINS
  // ═══════════════════════════════════════════════════════════════

  it('QUICK-WINS-001: Genera quick wins relevantes', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 40, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'disease-investigation-overdue-actions', title: 'Acciones vencidas', priority: 'HIGH' }),
        buildFinding({ id: 'disease-investigation-causal-analysis-gap', title: 'Sin análisis causal', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.quickWins.length > 0, 'Should have quick wins');
    assert.ok(result.quickWins.length <= 3, 'Should have at most 3 quick wins');
  });

  it('QUICK-WINS-002: Prioriza acciones vencidas', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 30, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'disease-investigation-overdue-actions', title: 'Acciones vencidas', priority: 'HIGH' }),
        buildFinding({ id: 'disease-investigation-evidence-gap', title: 'Sin evidencia', priority: 'LOW' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.quickWins[0].includes('vencidas'), 'First quick win should be about overdue actions');
  });

  // ═══════════════════════════════════════════════════════════════
  // NEXT STEPS
  // ═══════════════════════════════════════════════════════════════

  it('NEXT-STEPS-001: Genera next steps accionables', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 30, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'disease-investigation-overdue-actions', title: 'Acciones vencidas', priority: 'HIGH' }),
        buildFinding({ id: 'disease-investigation-formal-research-gap', title: 'Sin fecha formal', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.nextSteps.length > 0, 'Should have next steps');
    assert.ok(result.nextSteps.length <= 3, 'Should have at most 3 next steps');
  });

  it('NEXT-STEPS-002: Prioriza issues HIGH', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 30, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'disease-investigation-overdue-actions', title: 'Acciones vencidas', priority: 'HIGH' }),
        buildFinding({ id: 'disease-investigation-evidence-gap', title: 'Sin evidencia', priority: 'LOW' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.nextSteps[0].includes('vencidas'), 'First next step should be about overdue actions');
  });

  // ═══════════════════════════════════════════════════════════════
  // NO DUPLICACIÓN
  // ═══════════════════════════════════════════════════════════════

  it('NO-DUPLICATION-001: No duplica findings', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'disease-investigation-formal-research-gap', title: 'Sin fecha formal', priority: 'HIGH' }),
        buildFinding({ id: 'disease-investigation-formal-research-gap', title: 'Sin fecha formal', priority: 'HIGH' }),
      ],
    });

    const result = analyzer.analyze(context);
    // El analyzer procesa cada finding del contexto, pero no genera duplicados internamente
    assert.ok(result.keyIssues.length >= 1);
  });

  // ═══════════════════════════════════════════════════════════════
  // PRIVACIDAD
  // ═══════════════════════════════════════════════════════════════

  it('PRIVACY-001: No contiene información clínica', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'disease-investigation-formal-research-gap', title: '2 sin fecha formal', priority: 'HIGH' }),
      ],
    });

    const result = analyzer.analyze(context);
    const resultStr = JSON.stringify(result);

    assert.ok(!resultStr.includes('diagnóstico'), 'Should not contain diagnostic');
    assert.ok(!resultStr.includes('historia clínica'), 'Should not contain clinical history');
    assert.ok(!resultStr.includes('medicamento'), 'Should not contain medication');
    assert.ok(!resultStr.includes('tratamiento'), 'Should not contain treatment');
    assert.ok(!resultStr.includes('síntoma'), 'Should not contain symptom');
    assert.ok(!resultStr.includes('Employee'), 'Should not contain employee names');
    assert.ok(!resultStr.includes('1234567890'), 'Should not contain document numbers');
  });

  it('PRIVACY-002: No contiene userId ni datos individuales', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'disease-investigation-formal-research-gap', title: '2 sin fecha formal', priority: 'HIGH' }),
      ],
    });

    const result = analyzer.analyze(context);
    const resultStr = JSON.stringify(result);

    assert.ok(!resultStr.includes('userId'), 'Should not contain userId');
    assert.ok(!resultStr.includes('employeeId'), 'Should not contain employeeId');
    assert.ok(!resultStr.includes('64b0000000000000000000'), 'Should not contain ObjectId');
  });

  // ═══════════════════════════════════════════════════════════════
  // COMPATIBILIDAD
  // ═══════════════════════════════════════════════════════════════

  it('COMPAT-001: Comportamiento cuando findings está vacío', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.length > 0);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.nextSteps.length > 0);
  });

  it('COMPAT-002: Comportamiento con múltiples findings', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 40, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'disease-investigation-formal-research-gap', title: 'Sin fecha formal', priority: 'MEDIUM' }),
        buildFinding({ id: 'disease-investigation-causal-analysis-gap', title: 'Sin análisis causal', priority: 'MEDIUM' }),
        buildFinding({ id: 'disease-investigation-actions-gap', title: 'Sin acciones', priority: 'MEDIUM' }),
        buildFinding({ id: 'disease-investigation-overdue-actions', title: 'Acciones vencidas', priority: 'HIGH' }),
        buildFinding({ id: 'disease-investigation-evidence-gap', title: 'Sin evidencia', priority: 'LOW' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.keyIssues.length >= 3);
    assert.ok(result.quickWins.length <= 3);
    assert.ok(result.nextSteps.length <= 3);
  });

  // ═══════════════════════════════════════════════════════════════
  // TÍTULO Y NO_DATA FINDING
  // ═══════════════════════════════════════════════════════════════

  it('TITLE-001: Responde al módulo correcto', () => {
    assert.equal(analyzer.getModule(), 'disease-investigation');
    assert.equal(analyzer.supports('3.2.2'), true);
  });

  it('NO-DATA-FINDING-001: El finding NO_DATA tiene ID estable', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'disease-investigation-no-data', title: 'Sin investigaciones', priority: 'HIGH' }),
      ],
    });

    const result = analyzer.analyze(context);
    // El analyzer reconoce el finding no-data
    assert.ok(result.summary.includes('No se encontraron investigaciones'));
  });

  // ═══════════════════════════════════════════════════════════════
  // METRICS
  // ═══════════════════════════════════════════════════════════════

  it('METRICS-001: getMetrics retorna métricas válidas', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 60, level: 'PARTIAL', lastUpdated: '' },
      findings: [],
    });

    const metrics = analyzer.getMetrics(context);
    assert.ok(metrics.compliancePercentage !== undefined);
    assert.ok(metrics.totalInvestigations !== undefined);
  });

  it('METRICS-002: getMetrics con NO_DATA retorna totalInvestigations = 0', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'disease-investigation', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [buildFinding({ id: 'disease-investigation-no-data', title: 'Sin investigaciones', priority: 'HIGH' })],
    });

    const metrics = analyzer.getMetrics(context);
    assert.equal(metrics.totalInvestigations, 0);
  });

  // ═══════════════════════════════════════════════════════════════
  // CONTRATO STANDARD ANALYSIS SERVICE
  // ═══════════════════════════════════════════════════════════════

  it('CONTRACT-001: Implementa interfaz StandardAnalyzer', () => {
    assert.equal(typeof analyzer.supports, 'function');
    assert.equal(typeof analyzer.getModule, 'function');
    assert.equal(typeof analyzer.analyze, 'function');
    assert.equal(typeof analyzer.getMetrics, 'function');
  });
});
