import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WorkplaceSanitaryConditionsStandardAnalyzer } from './workplace-sanitary-conditions-standard.analyzer';
import {
  StandardAnalysisContext,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * FASE 34B — Tests del analyzer 3.1.8.
 *
 * El analyzer interpreta los datos reales del ComplianceEngine; NO recalcula
 * score, NO consulta MongoDB y NO duplica la lógica del provider.
 */

const analyzer = new WorkplaceSanitaryConditionsStandardAnalyzer();

function buildContext(
  overrides: {
    compliance?: number;
    findings?: { id: string; title: string; priority: string; description: string }[];
  } = {},
): StandardAnalysisContext {
  return {
    moduleCompliance: {
      module: 'workplace-sanitary-conditions',
      compliance: overrides.compliance ?? 100,
      level: 'EXCELENTE',
      lastUpdated: new Date().toISOString(),
    },
    findings: (overrides.findings ?? []).map((f) => ({
      id: f.id,
      module: 'workplace-sanitary-conditions',
      title: f.title,
      description: f.description,
      priority: f.priority,
      status: 'OPEN',
      responsible: '',
      dueDate: '',
      createdAt: new Date().toISOString(),
    })),
    companyId: '507f1f77bcf86cd799439011',
  } as unknown as StandardAnalysisContext;
}

describe('WorkplaceSanitaryConditionsStandardAnalyzer — 3.1.8 (FASE 34B)', () => {
  it('supports: solo 3.1.8', () => {
    assert.equal(analyzer.supports('3.1.8'), true);
    assert.equal(analyzer.supports('3.1.7'), false);
    assert.equal(analyzer.supports('4.1.4'), false);
  });

  it('getModule: workplace-sanitary-conditions', () => {
    assert.equal(analyzer.getModule(), 'workplace-sanitary-conditions');
  });

  it('NO_DATA (compliance 0) → resumen de ausencia con quickWins', () => {
    const result = analyzer.analyze(buildContext({ compliance: 0 }));

    assert.match(result.summary, /No existen condiciones sanitarias/);
    assert.equal(result.keyIssues.length, 0);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.nextSteps.length > 0);
  });

  it('finding missing-types → keyIssue con recomendación de cobertura', () => {
    const result = analyzer.analyze(
      buildContext({
        compliance: 60,
        findings: [
          {
            id: 'workplace-sanitary-missing-types',
            title: 'Componente(s) sin cobertura: GARBAGE_MANAGEMENT',
            priority: 'HIGH',
            description: 'Falta cobertura de un componente normativo.',
          },
        ],
      }),
    );

    const issue = result.keyIssues.find((i) => i.id === 'workplace-sanitary-missing-types');
    assert.ok(issue);
    assert.equal(issue.priority, 'HIGH');
    assert.match(issue.recommendation, /Registrar y verificar/);
  });

  it('finding deficient-conditions → keyIssue que distingue verificación de condición adecuada', () => {
    const result = analyzer.analyze(
      buildContext({
        compliance: 70,
        findings: [
          {
            id: 'workplace-sanitary-deficient-conditions',
            title: 'Condición deficiente o fuera de servicio: SANITARY_SERVICE',
            priority: 'HIGH',
            description: 'Registro deficiente.',
          },
        ],
      }),
    );

    const issue = result.keyIssues.find((i) => i.id === 'workplace-sanitary-deficient-conditions');
    assert.ok(issue);
    assert.match(issue.impact, /NO constituye condición adecuada/);
    assert.match(issue.recommendation, /Corregir/);
  });

  it('findings de trazabilidad y vigencia → keyIssues MEDIUM con recomendaciones', () => {
    const result = analyzer.analyze(
      buildContext({
        compliance: 80,
        findings: [
          {
            id: 'workplace-sanitary-traceability-pending',
            title: 'Verificación sin trazabilidad completa: POTABLE_WATER',
            priority: 'MEDIUM',
            description: 'Sin evidencia.',
          },
          {
            id: 'workplace-sanitary-verification-overdue',
            title: '1 componente(s) con verificación vencida',
            priority: 'MEDIUM',
            description: 'Vigencia vencida.',
          },
        ],
      }),
    );

    assert.equal(result.keyIssues.length, 2);
    assert.ok(result.keyIssues.every((i: StandardAnalysisKeyIssue) => i.priority === 'MEDIUM'));
  });

  it('summary escala por porcentaje real (>=90 / >=50 / <50)', () => {
    const ok = analyzer.analyze(buildContext({ compliance: 95, findings: [] }));
    assert.match(ok.summary, /95%/);

    const mid = analyzer.analyze(buildContext({ compliance: 60, findings: [] }));
    assert.match(mid.summary, /avances/);

    const low = analyzer.analyze(buildContext({ compliance: 20, findings: [] }));
    assert.match(low.summary, /atención prioritaria/);
  });

  it('getMetrics: métricas derivadas de findings reales, sin recalcular score', () => {
    const noData = analyzer.getMetrics(buildContext({ compliance: 0, findings: [{ id: 'workplace-sanitary-no-records', title: 'x', priority: 'HIGH', description: '' }] }));
    assert.equal(noData.hasRecords, 0);
    assert.equal(noData.compliancePercentage, 0);

    const full = analyzer.getMetrics(buildContext({ compliance: 100, findings: [] }));
    assert.equal(full.hasRecords, 1);
    assert.equal(full.coverage, 1);
    assert.equal(full.condition, 1);
    assert.equal(full.hasOverdueVerifications, 0);

    const partial = analyzer.getMetrics(
      buildContext({
        compliance: 60,
        findings: [
          { id: 'workplace-sanitary-missing-types', title: 'x', priority: 'HIGH', description: '' },
          { id: 'workplace-sanitary-verification-overdue', title: 'y', priority: 'MEDIUM', description: '' },
        ],
      }),
    );
    assert.equal(partial.coverage, 0.5);
    assert.equal(partial.hasOverdueVerifications, 1);
  });

  it('quickWins y nextSteps: máximo 3 elementos', () => {
    const result = analyzer.analyze(
      buildContext({
        compliance: 50,
        findings: [
          { id: 'workplace-sanitary-missing-types', title: 'a', priority: 'HIGH', description: '' },
          { id: 'workplace-sanitary-deficient-conditions', title: 'b', priority: 'HIGH', description: '' },
          { id: 'workplace-sanitary-traceability-pending', title: 'c', priority: 'MEDIUM', description: '' },
          { id: 'workplace-sanitary-verification-overdue', title: 'd', priority: 'MEDIUM', description: '' },
        ],
      }),
    );

    assert.ok(result.quickWins.length <= 3);
    assert.ok(result.nextSteps.length <= 3);
    assert.ok(result.keyIssues.length <= 5);
  });
});
