import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ManagementImprovementActionsStandardAnalyzer,
} from './management-improvement-actions-standard.analyzer';
import type { StandardAnalysisContext } from '../../dto/standard-analysis.dto';

/**
 * E2 (7.1.2) — Tests del analyzer IA OFICIAL: consume el resultado oficial
 * del ComplianceEngine (moduleCompliance + metadata dimensions:v1), NO
 * consulta Mongo, NO recalcula el score y NO interpreta la percepción de
 * efectividad como verificación formal de eficacia.
 */

const OFFICIAL_FINDINGS = [
  {
    id: 'management-improvement-actions-overdue',
    module: 'management-improvement-actions',
    title: '1 acción(es) vencida(s) sin cierre',
    description: 'Existen acciones de mejora cuya fecha compromiso ya pasó sin estado terminal.',
    priority: 'HIGH',
  },
  {
    id: 'management-improvement-actions-no-evidence',
    module: 'management-improvement-actions',
    title: 'Evidencia de implementación insuficiente',
    description: '3 acción(es) sin evidencia registrada.',
    priority: 'MEDIUM',
  },
  {
    id: 'management-improvement-actions-ineffective',
    module: 'management-improvement-actions',
    title: 'Acciones con efectividad percibida negativa',
    description: '1 acción(es) con percepción NO_EFECTIVA.',
    priority: 'MEDIUM',
  },
] as unknown as StandardAnalysisContext['findings'];

const OFFICIAL_70 = {
  module: 'management-improvement-actions',
  compliance: 70,
  status: 'TARGET_NOT_MET',
  metadata: {
    semantic: 'EXACT',
    standardCode: '7.1.2',
    standardTitle: 'Acciones mejora alta dirección',
    formula: 'dimensions:v1',
    target: 90,
    evaluatedPeriod: '2026',
    noDataReason: null,
    weights: { programming: 20, execution: 25, followUp: 20, evidence: 25, continuity: 10 },
    dimensions: {
      programming: { ratio: 1, numerator: 2, denominator: 2, weight: 20 },
      execution: { ratio: 0.75, numerator: 3, denominator: 4, weight: 25, subchecks: { satisfied: 3, total: 4 } },
      followUp: { ratio: 0.5, numerator: 2, denominator: 4, weight: 20, subchecks: { satisfied: 2, total: 4 } },
      evidence: { ratio: 0.5, numerator: 2, denominator: 4, weight: 25, subchecks: { satisfied: 2, total: 4 } },
      continuity: { ratio: null, numerator: null, denominator: null, weight: 10 },
    },
    counters: {
      totalActions: 5,
      evaluableActions: 4,
      pendingActions: 1,
      inProgressActions: 2,
      completedActions: 1,
      cancelledActions: 1,
      overdueActions: 1,
      actionsWithEvidence: 2,
      actionsWithoutEvidence: 3,
      actionsWithFollowUp: 2,
      actionsWithoutFollowUp: 3,
      effectiveActions: 2,
      ineffectiveActions: 1,
      indeterminateEffectivenessActions: 1,
      actionsRequiringContinuedFollowUp: 1,
    },
    latestAction: { title: 'Mejora aprobada', actionCode: null, status: 'IN_PROGRESS' },
  },
} as unknown as StandardAnalysisContext['moduleCompliance'];

function buildCtx(overrides: Partial<StandardAnalysisContext> = {}): StandardAnalysisContext {
  return {
    moduleCompliance: OFFICIAL_70,
    findings: OFFICIAL_FINDINGS,
    ...overrides,
  } as StandardAnalysisContext;
}

describe('MIA AI: identidad del estándar', () => {
  it('1. STANDARD_CODE 7.1.2 / MODULE management-improvement-actions (título normativo del catálogo)', () => {
    const analyzer = new ManagementImprovementActionsStandardAnalyzer();
    assert.equal(analyzer.supports('7.1.2'), true);
    assert.equal(analyzer.supports('7.1.1'), false);
    assert.equal(analyzer.getModule(), 'management-improvement-actions');
  });

  it('2. el título normativo del catálogo está documentado en la clase', () => {
    const src = readFileSync(
      join(__dirname, '..', '..', '..', '..', '..', 'src', 'modules', 'compliance-ai', 'standard-analysis', 'analyzers', 'management-improvement-actions-standard.analyzer.ts'),
      'utf8',
    );
    assert.ok(src.includes("STANDARD_TITLE = 'Acciones mejora alta dirección'"));
  });
});

describe('MIA AI: análisis sobre el resultado oficial', () => {
  it('3. consume el compliance oficial (70%) y genera keyIssues desde los findings oficiales', () => {
    const analyzer = new ManagementImprovementActionsStandardAnalyzer();
    const result = analyzer.analyze(buildCtx());
    assert.ok(result.summary.includes('70%'));
    assert.equal(result.keyIssues.length, 3);
    assert.ok(result.keyIssues.some((k) => k.id === 'management-improvement-actions-overdue'));
    assert.ok(result.keyIssues.some((k) => k.id === 'management-improvement-actions-no-evidence'));
    assert.ok(result.keyIssues.some((k) => k.id === 'management-improvement-actions-ineffective'));
    // Cada keyIssue trae recomendación accionable del mapa oficial de labels.
    assert.ok(result.keyIssues.every((k) => k.recommendation.length > 0));
  });

  it('4. narrativa usa counters oficiales (vencidas, sin seguimiento, percepciones) sin recalcular', () => {
    const analyzer = new ManagementImprovementActionsStandardAnalyzer();
    const result = analyzer.analyze(buildCtx());
    assert.ok(result.summary.includes('1 acción(es) vencida(s)'));
    assert.ok(result.summary.includes('3 acción(es) sin seguimiento real'));
    assert.ok(result.summary.includes('2 efectiva(s), 1 no efectiva(s), 1 sin concluir'));
    assert.ok(result.summary.includes('1 acción(es) requieren continuar en seguimiento'));
  });

  it('5. NO_DATA (no-actions) → narrativa de arranque con quick wins, sin keyIssues', () => {
    const analyzer = new ManagementImprovementActionsStandardAnalyzer();
    const ctx = buildCtx({
      moduleCompliance: {
        module: 'management-improvement-actions',
        compliance: 0,
        status: 'NO_DATA',
        metadata: { formula: 'dimensions:v1', noDataReason: 'no-actions' },
        findings: [],
      },
      findings: [],
    } as unknown as StandardAnalysisContext);
    const result = analyzer.analyze(ctx);
    assert.ok(result.summary.includes('no es evaluable'));
    assert.equal(result.keyIssues.length, 0);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.nextSteps.length > 0);
  });

  it('6. metadata no-dimensions:v1 → lectura defensiva (sin crash, narrativa general)', () => {
    const analyzer = new ManagementImprovementActionsStandardAnalyzer();
    const ctx = buildCtx({
      moduleCompliance: {
        module: 'management-improvement-actions',
        compliance: 55,
        status: 'TARGET_NOT_MET',
        metadata: { formula: 'legacy' },
        findings: [],
      },
      findings: [],
    } as unknown as StandardAnalysisContext);
    const result = analyzer.analyze(ctx);
    assert.ok(result.summary.includes('55%'));
  });

  it('7. hallazgos sin label conocido no generan keyIssues fantasma', () => {
    const analyzer = new ManagementImprovementActionsStandardAnalyzer();
    const ctx = buildCtx({
      findings: [{ id: 'otro-modulo-x', title: 'X', description: 'X', priority: 'HIGH' }],
    } as unknown as StandardAnalysisContext);
    const result = analyzer.analyze(ctx);
    assert.equal(result.keyIssues.length, 0);
  });
});

describe('MIA AI: métricas', () => {
  it('8. getMetrics expone counters y ratios de dimensiones desde metadata oficial', () => {
    const analyzer = new ManagementImprovementActionsStandardAnalyzer();
    const metrics = analyzer.getMetrics(buildCtx()) as unknown as Record<string, unknown>;
    assert.equal(metrics.compliancePercentage, 70);
    assert.equal(metrics.totalActions, 5);
    assert.equal(metrics.overdueActions, 1);
    assert.equal(metrics.actionsWithEvidence, 2);
    assert.equal(metrics.actionsWithFollowUp, 2);
    assert.equal(metrics.effectiveActions, 2);
    assert.equal(metrics.programmingRatio, 1);
    assert.equal(metrics.executionRatio, 0.75);
    assert.equal(metrics.followUpRatio, 0.5);
  });

  it('9. métricas defensivas con metadata ausente', () => {
    const analyzer = new ManagementImprovementActionsStandardAnalyzer();
    const metrics = analyzer.getMetrics({
      moduleCompliance: { module: 'management-improvement-actions', compliance: 0, findings: [] },
    } as unknown as StandardAnalysisContext) as unknown as Record<string, unknown>;
    assert.equal(metrics.compliancePercentage, 0);
    assert.equal(metrics.programmingRatio, undefined);
  });
});

describe('MIA AI: fronteras (no Mongo, no legacy, registro first-wins)', () => {
  it('10. NO consulta Mongo ni dominios prohibidos (solo consume ctx)', () => {
    const src = readFileSync(
      join(__dirname, '..', '..', '..', '..', '..', 'src', 'modules', 'compliance-ai', 'standard-analysis', 'analyzers', 'management-improvement-actions-standard.analyzer.ts'),
      'utf8',
    );
    assert.ok(!src.includes('@InjectModel'));
    assert.ok(!src.includes("from 'mongoose'"));
    // Sin queries: la única fuente de datos es ctx (moduleCompliance/findings).
    assert.ok(!src.includes('.find('));
    // Las menciones a Accountability* solo existen como comentario de frontera,
    // no como import/uso (verificado: sin @InjectModel ni imports de mongoose).
    // Frontera con 7.1.1: la efectividad aquí es percepción del seguimiento.
    assert.ok(src.includes('percepción'));
  });

  it('11. registro: oficial registrado, legacy sin registro (first-wins protegido)', () => {
    const src = readFileSync(
      join(__dirname, '..', '..', '..', '..', '..', 'src', 'modules', 'compliance-ai', 'standard-analysis', 'standard-analysis.service.ts'),
      'utf8',
    );
    assert.ok(src.includes('new ManagementImprovementActionsStandardAnalyzer()'));
    assert.ok(!src.includes('new ManagementImprovementStandardAnalyzer()'));
    // El oficial debe aparecer DESPUÉS del comentario de retiro (orden documentado).
    assert.ok(src.indexOf('ManagementImprovementActionsStandardAnalyzer') > src.indexOf('ManagementImprovementStandard'));
  });
});
