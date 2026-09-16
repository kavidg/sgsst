import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WasteManagementStandardAnalyzer } from './waste-management-standard.analyzer';
import {
  StandardAnalysisContext,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * FASE 34C — Tests del analyzer 3.1.9.
 *
 * El analyzer interpreta los datos reales del ComplianceEngine; NO recalcula
 * score, NO consulta MongoDB y NO duplica la lógica del provider.
 */

const analyzer = new WasteManagementStandardAnalyzer();

function buildContext(
  overrides: {
    compliance?: number;
    findings?: { id: string; title: string; priority: string; description: string }[];
  } = {},
): StandardAnalysisContext {
  return {
    moduleCompliance: {
      module: 'waste-management',
      compliance: overrides.compliance ?? 100,
      level: 'EXCELENTE',
      lastUpdated: new Date().toISOString(),
    },
    findings: (overrides.findings ?? []).map((f) => ({
      id: f.id,
      module: 'waste-management',
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

describe('WasteManagementStandardAnalyzer — 3.1.9 (FASE 34C)', () => {
  it('supports: solo 3.1.9', () => {
    assert.equal(analyzer.supports('3.1.9'), true);
    assert.equal(analyzer.supports('3.1.8'), false);
    assert.equal(analyzer.supports('4.1.3'), false);
  });

  it('getModule: waste-management', () => {
    assert.equal(analyzer.getModule(), 'waste-management');
  });

  it('NO_DATA (compliance 0) → resumen de ausencia con quickWins', () => {
    const result = analyzer.analyze(buildContext({ compliance: 0 }));

    assert.match(result.summary, /No existen registros de gestión de residuos/);
    assert.equal(result.keyIssues.length, 0);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.nextSteps.length > 0);
  });

  it('finding no-managed-records → keyIssue: PLANNED no demuestra disposición ejecutada', () => {
    const result = analyzer.analyze(
      buildContext({
        compliance: 40,
        findings: [
          {
            id: 'waste-management-no-managed-records',
            title: 'Residuos identificados sin gestión activa',
            priority: 'HIGH',
            description: 'Solo PLANNED/SUSPENDED.',
          },
        ],
      }),
    );

    const issue = result.keyIssues.find((i) => i.id === 'waste-management-no-managed-records');
    assert.ok(issue);
    assert.equal(issue.priority, 'HIGH');
    assert.match(issue.impact, /NO demuestra disposición ejecutada/);
  });

  it('finding disposal-method-pending → keyIssue: la existencia del residuo no es cumplimiento', () => {
    const result = analyzer.analyze(
      buildContext({
        compliance: 50,
        findings: [
          {
            id: 'waste-management-disposal-method-pending',
            title: '1 registro(s) activo(s) sin método de disposición',
            priority: 'HIGH',
            description: 'ACTIVE sin disposalMethod.',
          },
        ],
      }),
    );

    const issue = result.keyIssues.find((i) => i.id === 'waste-management-disposal-method-pending');
    assert.ok(issue);
    assert.match(issue.impact, /NO es cumplimiento/);
    assert.match(issue.recommendation, /disposición/);
  });

  it('findings de trazabilidad, vencidos y hazardous → keyIssues con recomendaciones', () => {
    const result = analyzer.analyze(
      buildContext({
        compliance: 70,
        findings: [
          {
            id: 'waste-management-traceability-pending',
            title: '2 registro(s) sin trazabilidad completa',
            priority: 'MEDIUM',
            description: 'Sin fecha/evidencia.',
          },
          {
            id: 'waste-management-disposal-overdue',
            title: '1 registro(s) con disposición vencida',
            priority: 'MEDIUM',
            description: 'Fuera de frecuencia.',
          },
          {
            id: 'waste-management-hazardous-not-evidence',
            title: '1 residuo(s) peligroso(s) sin disposición demostrada',
            priority: 'MEDIUM',
            description: 'hazardous sin gestión.',
          },
        ],
      }),
    );

    assert.equal(result.keyIssues.length, 3);
    assert.ok(result.keyIssues.every((i: StandardAnalysisKeyIssue) => i.priority === 'MEDIUM'));
    // hazardous ≠ cumplimiento automático (CASO L).
    const hazardous = result.keyIssues.find(
      (i) => i.id === 'waste-management-hazardous-not-evidence',
    );
    assert.ok(hazardous);
    assert.match(hazardous.impact, /NO cumplimiento automático/);
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
    const noData = analyzer.getMetrics(
      buildContext({
        compliance: 0,
        findings: [{ id: 'waste-management-no-records', title: 'x', priority: 'HIGH', description: '' }],
      }),
    );
    assert.equal(noData.hasRecords, 0);
    assert.equal(noData.compliancePercentage, 0);

    const full = analyzer.getMetrics(buildContext({ compliance: 100, findings: [] }));
    assert.equal(full.hasRecords, 1);
    assert.equal(full.hasManagedRecords, 1);
    assert.equal(full.hasDisposalMethod, 1);
    assert.equal(full.hasOverdueDisposals, 0);

    const partial = analyzer.getMetrics(
      buildContext({
        compliance: 50,
        findings: [
          { id: 'waste-management-disposal-method-pending', title: 'x', priority: 'HIGH', description: '' },
          { id: 'waste-management-disposal-overdue', title: 'y', priority: 'MEDIUM', description: '' },
        ],
      }),
    );
    assert.equal(partial.hasDisposalMethod, 0.5);
    assert.equal(partial.hasOverdueDisposals, 1);
  });

  it('quickWins y nextSteps: máximo 3 elementos', () => {
    const result = analyzer.analyze(
      buildContext({
        compliance: 50,
        findings: [
          { id: 'waste-management-no-managed-records', title: 'a', priority: 'HIGH', description: '' },
          { id: 'waste-management-disposal-method-pending', title: 'b', priority: 'HIGH', description: '' },
          { id: 'waste-management-traceability-pending', title: 'c', priority: 'MEDIUM', description: '' },
          { id: 'waste-management-disposal-overdue', title: 'd', priority: 'MEDIUM', description: '' },
        ],
      }),
    );

    assert.ok(result.quickWins.length <= 3);
    assert.ok(result.nextSteps.length <= 3);
  });
});
