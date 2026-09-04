import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MedicalRecommendationStandardAnalyzer } from './medical-recommendation-standard.analyzer';
import type { StandardAnalysisContext } from '../../dto/standard-analysis.dto';

/**
 * Tests del MedicalRecommendationStandardAnalyzer (3.1.3).
 */
describe('MedicalRecommendationStandardAnalyzer', () => {
  const analyzer = new MedicalRecommendationStandardAnalyzer();

  const defaultOverview = {
    overallCompliance: 0,
    phaseCompliance: { plan: 0, do: 0, check: 0, act: 0 },
    moduleCompliance: [] as Array<{ module: string; compliance: number; level: string; lastUpdated: string }>,
  };

  function ctx(overrides: Partial<StandardAnalysisContext> = {}): StandardAnalysisContext {
    return {
      companyId: 'test-company-id',
      moduleCompliance: { module: 'medical-recommendation', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [],
      overview: defaultOverview,
      evidence: undefined,
      ...overrides,
    };
  }

  // ==================== SUPPORTS ====================

  it('SUPPORTS-001: supports retorna true para 3.1.3', () => {
    assert.equal(analyzer.supports('3.1.3'), true);
  });

  it('SUPPORTS-002: supports retorna false para otros códigos', () => {
    assert.equal(analyzer.supports('3.1.1'), false);
    assert.equal(analyzer.supports('3.1.2'), false);
    assert.equal(analyzer.supports('2.9.1'), false);
    assert.equal(analyzer.supports('1.1.1'), false);
  });

  it('SUPPORTS-003: getModule retorna medical-recommendation', () => {
    assert.equal(analyzer.getModule(), 'medical-recommendation');
  });

  // ==================== NO_DATA ====================

  it('NO_DATA-001: genera interpretación correcta cuando no hay datos', () => {
    const result = analyzer.analyze(ctx({
      moduleCompliance: { module: 'medical-recommendation', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [
        {
          id: 'recommendation-no-data', module: 'medical-recommendation',
          title: 'Sin datos de seguimiento a recomendaciones médicas',
          description: 'No hay recomendaciones registradas.',
          priority: 'HIGH', status: 'OPEN', responsible: '', dueDate: '', createdAt: '',
        },
      ],
    }));

    assert.ok(result.summary.includes('No existen recomendaciones'));
    assert.equal(result.keyIssues.length, 0);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.nextSteps.length > 0);
  });

  // ==================== FINDING: OVERDUE ====================

  it('FINDING-OVERDUE-001: interpreta correctamente finding recommendation-overdue', () => {
    const result = analyzer.analyze(ctx({
      moduleCompliance: { module: 'medical-recommendation', compliance: 50, level: 'LOW', lastUpdated: '' },
      findings: [
        {
          id: 'recommendation-overdue', module: 'medical-recommendation',
          title: '2 recomendación(es) vencida(s)', description: '2 recomendaciones vencidas.',
          priority: 'HIGH', status: 'OPEN', responsible: '', dueDate: '', createdAt: '',
        },
      ],
    }));

    const overdueIssue = result.keyIssues.find((i) => i.id === 'recommendation-overdue');
    assert.ok(overdueIssue);
    assert.equal(overdueIssue.priority, 'HIGH');
    assert.ok(overdueIssue.impact.includes('vencida'));
    assert.ok(overdueIssue.recommendation.includes('Priorizar'));
  });

  // ==================== FINDING: PENDING FOLLOW-UP ====================

  it('FINDING-PENDING-001: interpreta correctamente finding recommendation-pending-follow-up', () => {
    const result = analyzer.analyze(ctx({
      moduleCompliance: { module: 'medical-recommendation', compliance: 60, level: 'MEDIUM', lastUpdated: '' },
      findings: [
        {
          id: 'recommendation-pending-follow-up', module: 'medical-recommendation',
          title: '3 recomendación(es) pendiente(s) de seguimiento', description: '3 recomendaciones pendientes.',
          priority: 'MEDIUM', status: 'OPEN', responsible: '', dueDate: '', createdAt: '',
        },
      ],
    }));

    const pendingIssue = result.keyIssues.find((i) => i.id === 'recommendation-pending-follow-up');
    assert.ok(pendingIssue);
    assert.equal(pendingIssue.priority, 'MEDIUM');
  });

  // ==================== FINDING: ACTIONS PENDING ====================

  it('FINDING-ACTIONS-001: interpreta correctamente finding recommendation-actions-pending', () => {
    const result = analyzer.analyze(ctx({
      moduleCompliance: { module: 'medical-recommendation', compliance: 70, level: 'MEDIUM', lastUpdated: '' },
      findings: [
        {
          id: 'recommendation-actions-pending', module: 'medical-recommendation',
          title: '4 acción(es) derivada(s) pendiente(s)', description: '4 acciones pendientes.',
          priority: 'MEDIUM', status: 'OPEN', responsible: '', dueDate: '', createdAt: '',
        },
      ],
    }));

    const actionsIssue = result.keyIssues.find((i) => i.id === 'recommendation-actions-pending');
    assert.ok(actionsIssue);
    assert.ok(actionsIssue.impact.includes('acciones'));
  });

  // ==================== FINDING: EFFECTIVENESS PENDING ====================

  it('FINDING-EFFECTIVENESS-001: interpreta correctamente finding recommendation-effectiveness-pending', () => {
    const result = analyzer.analyze(ctx({
      moduleCompliance: { module: 'medical-recommendation', compliance: 75, level: 'MEDIUM', lastUpdated: '' },
      findings: [
        {
          id: 'recommendation-effectiveness-pending', module: 'medical-recommendation',
          title: '2 recomendación(es) sin verificación de efectividad',
          description: '2 recomendaciones sin efectividad verificada.',
          priority: 'LOW', status: 'OPEN', responsible: '', dueDate: '', createdAt: '',
        },
      ],
    }));

    const effectivenessIssue = result.keyIssues.find((i) => i.id === 'recommendation-effectiveness-pending');
    assert.ok(effectivenessIssue);
    assert.ok(effectivenessIssue.impact.includes('efectividad'));
  });

  // ==================== BUEN CUMPLIMIENTO ====================

  it('HIGH-001: genera summary positivo con alto cumplimiento', () => {
    const result = analyzer.analyze(ctx({
      moduleCompliance: { module: 'medical-recommendation', compliance: 95, level: 'EXCELLENT', lastUpdated: '' },
      findings: [],
    }));

    assert.ok(result.summary.includes('95%'));
    assert.ok(result.summary.includes('sólida'));
  });

  // ==================== QUICK WINS ====================

  it('QUICKWINS-001: genera quick wins basados en findings reales', () => {
    const result = analyzer.analyze(ctx({
      moduleCompliance: { module: 'medical-recommendation', compliance: 40, level: 'LOW', lastUpdated: '' },
      findings: [
        {
          id: 'recommendation-overdue', module: 'medical-recommendation',
          title: '1 recomendación(es) vencida(s)', description: '',
          priority: 'HIGH', status: 'OPEN', responsible: '', dueDate: '', createdAt: '',
        },
        {
          id: 'recommendation-actions-pending', module: 'medical-recommendation',
          title: '2 acción(es) derivada(s) pendiente(s)', description: '',
          priority: 'MEDIUM', status: 'OPEN', responsible: '', dueDate: '', createdAt: '',
        },
      ],
    }));

    assert.ok(result.quickWins.length > 0);
    assert.ok(result.quickWins.length <= 3);
    assert.ok(result.quickWins.some((w) => w.toLowerCase().includes('vencidas')));
  });

  // ==================== NEXT STEPS ====================

  it('NEXTSTEPS-001: genera next steps accionables', () => {
    const result = analyzer.analyze(ctx({
      moduleCompliance: { module: 'medical-recommendation', compliance: 50, level: 'LOW', lastUpdated: '' },
      findings: [
        {
          id: 'recommendation-overdue', module: 'medical-recommendation',
          title: '1 recomendación(es) vencida(s)', description: '',
          priority: 'HIGH', status: 'OPEN', responsible: '', dueDate: '', createdAt: '',
        },
      ],
    }));

    assert.ok(result.nextSteps.length > 0);
    assert.ok(result.nextSteps.length <= 3);
  });

  // ==================== PRIVACIDAD ====================

  it('PRIVACY-001: interpretación no contiene nombres ni documentos', () => {
    const result = analyzer.analyze(ctx({
      moduleCompliance: { module: 'medical-recommendation', compliance: 30, level: 'LOW', lastUpdated: '' },
      findings: [
        {
          id: 'recommendation-overdue', module: 'medical-recommendation',
          title: '5 recomendación(es) vencida(s)', description: '5 recomendaciones vencidas.',
          priority: 'HIGH', status: 'OPEN', responsible: '', dueDate: '', createdAt: '',
        },
      ],
    }));

    const fullText = [
      result.summary,
      ...result.keyIssues.map((i) => `${i.title} ${i.impact} ${i.recommendation}`),
      ...result.quickWins,
      ...result.nextSteps,
    ].join(' ');

    assert.ok(!fullText.includes('employeeId'));
    assert.ok(!fullText.includes('nombre'));
    assert.ok(!fullText.includes('documento'));
    assert.ok(!fullText.includes('diagnóstico'));
    assert.ok(!fullText.includes('historia clínica'));
    assert.ok(!fullText.includes('tratamiento'));
    assert.ok(!fullText.includes('medicamento'));
  });

  it('PRIVACY-002: interpretación no contiene información clínica', () => {
    const result = analyzer.analyze(ctx({
      moduleCompliance: { module: 'medical-recommendation', compliance: 80, level: 'HIGH', lastUpdated: '' },
      findings: [],
    }));

    const fullText = [result.summary, ...result.quickWins, ...result.nextSteps].join(' ');

    assert.ok(!fullText.includes('paciente'));
    assert.ok(!fullText.includes('enfermedad'));
    assert.ok(!fullText.includes('síntoma'));
  });

  // ==================== NO RECOMENDACIONES CLÍNICAS ====================

  it('CLINICAL-001: quick wins no contienen recomendaciones clínicas', () => {
    const result = analyzer.analyze(ctx({
      moduleCompliance: { module: 'medical-recommendation', compliance: 60, level: 'MEDIUM', lastUpdated: '' },
      findings: [
        {
          id: 'recommendation-effectiveness-pending', module: 'medical-recommendation',
          title: '3 recomendación(es) sin verificación de efectividad', description: '',
          priority: 'LOW', status: 'OPEN', responsible: '', dueDate: '', createdAt: '',
        },
      ],
    }));

    for (const win of result.quickWins) {
      assert.ok(!win.includes('diagnóstico'));
      assert.ok(!win.includes('tratamiento'));
      assert.ok(!win.includes('medicamento'));
    }
  });

  it('CLINICAL-002: next steps no contienen recomendaciones clínicas', () => {
    const result = analyzer.analyze(ctx({
      moduleCompliance: { module: 'medical-recommendation', compliance: 40, level: 'LOW', lastUpdated: '' },
      findings: [
        {
          id: 'recommendation-overdue', module: 'medical-recommendation',
          title: '2 recomendación(es) vencida(s)', description: '',
          priority: 'HIGH', status: 'OPEN', responsible: '', dueDate: '', createdAt: '',
        },
      ],
    }));

    for (const step of result.nextSteps) {
      assert.ok(!step.includes('diagnóstico'));
      assert.ok(!step.includes('tratamiento'));
      assert.ok(!step.includes('medicamento'));
    }
  });
});
