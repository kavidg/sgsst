import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CorrectivePreventiveActionsStandardAnalyzer } from './corrective-preventive-actions-standard.analyzer';
import type { StandardAnalysisContext } from '../../dto/standard-analysis.dto';

/**
 * E2 (7.1.1) — Tests del analyzer IA oficial de las Acciones preventivas y
 * correctivas (consume el resultado oficial; NO calcula, NO consulta Mongo).
 */

function buildContext(overrides: {
  compliance?: number;
  status?: string;
  metadata?: unknown;
  findings?: Array<{ id: string; module: string; title: string; description: string; priority: string; status: string; responsible: string; dueDate: string; createdAt: string }>;
} = {}): StandardAnalysisContext {
  return {
    moduleCompliance: {
      module: 'corrective-preventive-actions',
      compliance: overrides.compliance ?? 75,
      level: 'HIGH',
      lastUpdated: new Date().toISOString(),
      status: overrides.status ?? 'TARGET_NOT_MET',
      pending: 2,
      completed: 5,
      overdue: 1,
      metadata: overrides.metadata ?? {
        semantic: 'EXACT',
        standardCode: '7.1.1',
        formula: 'dimensions:v1',
        target: 90,
        evaluatedPeriod: '2026',
        noDataReason: null,
        weights: { programming: 20, execution: 25, evidence: 20, effectiveness: 25, continuity: 10 },
        dimensions: {
          programming: { ratio: 1, numerator: 5, denominator: 5, weight: 20 },
          execution: { ratio: 0.75, numerator: 3, denominator: 4, weight: 25, subchecks: { satisfied: 3, total: 4 } },
          evidence: { ratio: 0.75, numerator: 3, denominator: 4, weight: 20 },
          effectiveness: { ratio: 0.75, numerator: 3, denominator: 4, weight: 25 },
          continuity: { ratio: null, numerator: null, denominator: null, weight: 10 },
        },
        counters: {
          totalActions: 6,
          evaluableActions: 6,
          pendingActions: 1,
          inProgressActions: 0,
          completedActions: 5,
          cancelledActions: 0,
          overdueActions: 1,
          actionsWithExecutionDate: 5,
          actionsWithEvidence: 4,
          actionsWithoutEvidence: 2,
          actionsWithEffectiveness: 4,
          actionsWithoutEffectiveness: 1,
          effectiveActions: 3,
          ineffectiveActions: 1,
          actionsRequiringNewAction: 0,
          lastActionDate: '2026-06-30T00:00:00.000Z',
        },
        latestAction: { id: 'a1', actionCode: 'AC-01', title: 'Acción correctiva por auditoría', type: 'CORRECTIVE', status: 'COMPLETED', dueDate: '2026-06-30' },
      },
    } as never,
    findings: (overrides.findings ?? [
      {
        id: 'corrective-preventive-actions-overdue',
        module: 'corrective-preventive-actions',
        title: '1 acción(es) vencida(s) sin cierre',
        description: 'Existen acciones cuya fecha compromiso ya pasó sin estado terminal.',
        priority: 'HIGH',
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'corrective-preventive-actions-effectiveness-unverified',
        module: 'corrective-preventive-actions',
        title: 'Eficacia sin verificar en acciones completadas',
        description: '1 de 5 acción(es) COMPLETED no tienen verificación de eficacia registrada.',
        priority: 'HIGH',
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      },
    ]) as never,
  } as unknown as StandardAnalysisContext;
}

const analyzer = new CorrectivePreventiveActionsStandardAnalyzer();

describe('CPA-AI (7.1.1): contrato del analyzer oficial', () => {
  it('1. soporta exactamente 7.1.1', () => {
    assert.equal(analyzer.supports('7.1.1'), true);
    assert.equal(analyzer.supports('6.1.2'), false);
    assert.equal(analyzer.supports('7.1.2'), false);
    assert.equal(analyzer.supports(''), false);
  });

  it('2. módulo correcto: corrective-preventive-actions', () => {
    assert.equal(analyzer.getModule(), 'corrective-preventive-actions');
  });

  it('3. clase oficial con STANDARD_CODE y MODULE correctos (código fuente)', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const source = readFileSync(
      join(__dirname, '..', '..', '..', '..', '..', 'src', 'modules', 'compliance-ai', 'standard-analysis', 'analyzers', 'corrective-preventive-actions-standard.analyzer.ts'),
      'utf8',
    );
    assert.ok(source.includes("STANDARD_CODE = '7.1.1'"));
    assert.ok(source.includes("MODULE = 'corrective-preventive-actions'"));
    assert.ok(source.includes("'Acciones preventivas y correctivas'"));
    // NO consulta Mongo (sin Mongoose/NestJS en el analyzer).
    assert.ok(!source.includes('@nestjs/mongoose'));
    assert.ok(!source.includes('InjectModel'));
  });

  it('4. consume el resultado oficial (porcentaje en el resumen, sin recalcular)', () => {
    const result = analyzer.analyze(buildContext({ compliance: 75 }));
    assert.ok(result.summary.includes('75%'));
  });

  it('5. NO_DATA: narrativa de ausencia de acciones', () => {
    const result = analyzer.analyze(
      buildContext({
        compliance: 0,
        status: 'NO_DATA',
        metadata: { formula: 'dimensions:v1', noDataReason: 'no-actions', counters: {}, dimensions: {} },
        findings: [
          {
            id: 'corrective-preventive-actions-no-data',
            module: 'corrective-preventive-actions',
            title: 'Sin acciones preventivas/correctivas registradas',
            description: 'No existe gestión registrada de acciones.',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );
    assert.ok(result.summary.toLowerCase().includes('no existe gestión'));
    assert.deepEqual(result.keyIssues, []);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.nextSteps.length > 0);
  });

  it('6. findings oficiales → keyIssues con recomendación', () => {
    const result = analyzer.analyze(buildContext());
    assert.equal(result.keyIssues.length, 2);
    const overdue = result.keyIssues.find((k) => k.id === 'corrective-preventive-actions-overdue');
    assert.ok(overdue);
    assert.equal(overdue.priority, 'HIGH');
    assert.ok(overdue.recommendation.length > 0);
  });

  it('7. narrativa menciona vencidas y eficacia pendiente desde metadata oficial', () => {
    const result = analyzer.analyze(buildContext());
    assert.ok(result.summary.includes('1 acción(es) vencida(s)'));
    assert.ok(result.summary.includes('verificación de eficacia'));
  });

  it('8. quickWins y nextSteps derivados de findings (no inventados)', () => {
    const result = analyzer.analyze(buildContext());
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.nextSteps.length > 0);
    // Todos los quickWins provienen de recomendaciones de keyIssues conocidas.
    for (const qw of result.quickWins) {
      assert.ok(
        result.keyIssues.some((k) => k.recommendation === qw) ||
          qw.includes('eficacia') ||
          qw.includes('continuidad'),
      );
    }
  });

  it('9. métricas desde metadata oficial (sin recalcular)', () => {
    const metrics = analyzer.getMetrics(buildContext({ compliance: 75 })) as Record<string, unknown>;
    assert.equal(metrics.compliancePercentage, 75);
    assert.equal(metrics.totalActions, 6);
    assert.equal(metrics.overdueActions, 1);
    assert.equal(metrics.effectiveActions, 3);
    assert.equal(metrics.effectivenessRatio, 0.75);
    assert.equal(metrics.continuityRatio === undefined, true); // null → ausente
  });

  it('10. metadata corrupta/ausente no rompe el analyzer (lectura defensiva)', () => {
    const result = analyzer.analyze(buildContext({ metadata: { formula: 'other' } }));
    assert.ok(typeof result.summary === 'string' && result.summary.length > 0);
    const result2 = analyzer.analyze(buildContext({ metadata: null }));
    assert.ok(typeof result2.summary === 'string');
  });

  it('11. el analyzer legacy corrective-preventive NO está registrado (código fuente)', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const source = readFileSync(
      join(__dirname, '..', '..', '..', '..', '..', 'src', 'modules', 'compliance-ai', 'standard-analysis', 'standard-analysis.service.ts'),
      'utf8',
    );
    assert.ok(
      !source.includes('new CorrectivePreventiveStandardAnalyzer()'),
      'el analyzer legacy NO debe estar registrado (first-wins: el oficial es corrective-preventive-actions)',
    );
    assert.ok(
      source.includes('new CorrectivePreventiveActionsStandardAnalyzer()'),
      'el analyzer oficial debe estar registrado',
    );
  });
});
