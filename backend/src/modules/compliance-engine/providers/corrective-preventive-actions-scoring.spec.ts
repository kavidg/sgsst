import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CpaActionLike,
  CPA_ACTIONS_SCORE_WEIGHTS,
  CPA_ACTIONS_STANDARD_CODE,
  CPA_ACTIONS_FORMULA,
  CPA_ACTIONS_COMPLIANCE_TARGET,
  computeCpaActionsScore,
  isEvaluableAction,
  isOverdueAction,
  redistributeWeightedScore,
} from './corrective-preventive-actions-scoring';

/**
 * E2 (7.1.1) — Tests del scorer PURO de las Acciones preventivas y
 * correctivas (sin Mongo, sin NestJS, determinista).
 */

const NOW = new Date('2026-09-15T12:00:00.000Z');
const YEAR = 2026;

function baseAction(overrides: Partial<CpaActionLike> = {}): CpaActionLike {
  return {
    _id: 'a1',
    type: 'CORRECTIVE',
    title: 'Acción correctiva',
    description: 'Cerrar la no conformidad',
    origin: 'AUDIT_6_1_2',
    priority: 'HIGH',
    responsibleUserId: 'u1',
    responsibleSnapshot: 'Ana Gómez',
    dueDate: '2026-06-30',
    status: 'COMPLETED',
    executionDate: '2026-06-01',
    ...overrides,
  };
}

/** Acción completamente bien gestionada (todas las dimensiones en verde). */
function perfectAction(overrides: Partial<CpaActionLike> = {}): CpaActionLike {
  return baseAction({
    rootCause: 'Falta de capacitación',
    actionPlan: 'Plan de capacitación Q3',
    evidence: { documentId: 'doc1', documentSnapshot: 'DOC-01 — Acta', evidenceUrl: 'https://x.com/e.pdf' },
    effectivenessVerification: {
      verified: true,
      result: 'EFECTIVA',
      verifiedByUserId: 'u2',
      verifiedBySnapshot: 'Beto Ruiz',
      verificationDate: '2026-07-15',
    },
    ...overrides,
  });
}

// ─── Pesos / contrato ────────────────────────────────────────────────────────

describe('CPA-SCORING: contrato', () => {
  it('pesos suman exactamente 100 (20/25/20/25/10)', () => {
    const sum = Object.values(CPA_ACTIONS_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.equal(sum, 100);
    assert.deepEqual(Object.values(CPA_ACTIONS_SCORE_WEIGHTS), [20, 25, 20, 25, 10]);
  });

  it('constantes del contrato: código/módulo/fórmula/target', () => {
    assert.equal(CPA_ACTIONS_STANDARD_CODE, '7.1.1');
    assert.equal(CPA_ACTIONS_FORMULA, 'dimensions:v1');
    assert.equal(CPA_ACTIONS_COMPLIANCE_TARGET, 90);
  });

  it('redistributeWeightedScore: null se redistribuye (no cuenta como 0)', () => {
    const score = redistributeWeightedScore([
      { ratio: 1, weight: 20 },
      { ratio: null, weight: 25 },
      { ratio: 1, weight: 20 },
      { ratio: 1, weight: 25 },
      { ratio: 1, weight: 10 },
    ]);
    assert.equal(score, 100);
  });
});

// ─── NO_DATA ─────────────────────────────────────────────────────────────────

describe('CPA-SCORING: NO_DATA', () => {
  it('1. sin acciones → NO_DATA con razón no-actions', () => {
    const b = computeCpaActionsScore({ actions: [], now: NOW });
    assert.equal(b.noData, true);
    assert.equal(b.noDataReason, 'no-actions');
    assert.equal(b.percentage, 0);
    assert.equal(b.findings[0]?.id, 'corrective-preventive-actions-no-data');
  });

  it('acciones existentes pero incompletas → NO es NO_DATA (score bajo real)', () => {
    // 10 acciones con brechas (sin responsable/evidencia/eficacia).
    const actions = Array.from({ length: 10 }, (_, i) =>
      baseAction({
        _id: `a${i}`,
        responsibleUserId: undefined,
        responsibleSnapshot: undefined,
        status: 'PENDING',
        executionDate: undefined,
      }),
    );
    const b = computeCpaActionsScore({ actions, now: NOW });
    assert.equal(b.noData, false);
    assert.equal(b.noDataReason, null);
    assert.ok(b.percentage < 50);
    assert.ok(b.findings.length > 0);
  });
});

// ─── Score alto / brechas ────────────────────────────────────────────────────

describe('CPA-SCORING: evaluación', () => {
  it('2. acciones completas y eficaces en 2 vigencias → score 100', () => {
    const actions = [
      perfectAction({ _id: 'a1', dueDate: '2026-06-30' }),
      perfectAction({ _id: 'a2', dueDate: '2025-11-30' }),
    ];
    const b = computeCpaActionsScore({ actions, now: NOW });
    assert.equal(b.percentage, 100);
    assert.deepEqual(b.findings, []);
  });

  it('3. acciones sin responsable → D1 penaliza + finding de asignación', () => {
    const b = computeCpaActionsScore({
      actions: [
        perfectAction({ responsibleUserId: undefined, responsibleSnapshot: undefined }),
        perfectAction({ _id: 'a2' }),
      ],
      now: NOW,
    });
    assert.ok(b.dimensions.programming.ratio !== null && b.dimensions.programming.ratio < 1);
    assert.ok(b.findings.some((f) => f.id === 'corrective-preventive-actions-incomplete-assignment'));
  });

  it('4. acciones sin evidencia → D3 penaliza + finding no-evidence', () => {
    const b = computeCpaActionsScore({
      actions: [perfectAction({ evidence: undefined }), perfectAction({ _id: 'a2' })],
      now: NOW,
    });
    assert.ok(b.dimensions.evidence.ratio !== null && b.dimensions.evidence.ratio < 1);
    assert.ok(b.findings.some((f) => f.id === 'corrective-preventive-actions-no-evidence'));
  });

  it('5. acciones vencidas → OVERDUE derivado + finding overdue + D2 penaliza', () => {
    const actions = [
      perfectAction({ status: 'IN_PROGRESS', dueDate: '2026-01-01', executionDate: undefined }),
      perfectAction({ _id: 'a2' }),
    ];
    const b = computeCpaActionsScore({ actions, now: NOW });
    assert.equal(b.counters.overdueActions, 1);
    assert.ok(isOverdueAction(actions[0], NOW));
    assert.ok(!isOverdueAction(actions[1], NOW));
    assert.ok(b.findings.some((f) => f.id === 'corrective-preventive-actions-overdue'));
    assert.ok(b.dimensions.execution.ratio !== null && b.dimensions.execution.ratio < 1);
  });

  it('6. completada sin verificación → D4 penaliza + finding effectiveness-unverified', () => {
    const b = computeCpaActionsScore({
      actions: [perfectAction({ effectivenessVerification: undefined })],
      now: NOW,
    });
    assert.ok(b.dimensions.effectiveness.ratio !== null && b.dimensions.effectiveness.ratio < 1);
    assert.ok(b.findings.some((f) => f.id === 'corrective-preventive-actions-effectiveness-unverified'));
    assert.equal(b.counters.actionsWithoutEffectiveness, 1);
  });

  it('7. eficacia NO_EFECTIVA → contadores + finding ineffective', () => {
    const b = computeCpaActionsScore({
      actions: [
        perfectAction({
          effectivenessVerification: {
            verified: true,
            result: 'NO_EFECTIVA',
            verifiedByUserId: 'u2',
            verificationDate: '2026-07-15',
          },
        }),
      ],
      now: NOW,
    });
    assert.equal(b.counters.ineffectiveActions, 1);
    assert.equal(b.counters.effectiveActions, 0);
    assert.ok(b.findings.some((f) => f.id === 'corrective-preventive-actions-ineffective'));
  });

  it('8. REQUIERE_NUEVA_ACCION → contador específico (trazabilidad)', () => {
    const b = computeCpaActionsScore({
      actions: [
        perfectAction({
          effectivenessVerification: {
            verified: true,
            result: 'REQUIERE_NUEVA_ACCION',
            verifiedByUserId: 'u2',
            verificationDate: '2026-07-15',
          },
        }),
      ],
      now: NOW,
    });
    assert.equal(b.counters.actionsRequiringNewAction, 1);
  });

  it('9. CANCELLED excluida del portafolio evaluable (pero contada en counters)', () => {
    const b = computeCpaActionsScore({
      actions: [
        perfectAction({ status: 'CANCELLED', _id: 'x1' }),
        perfectAction({ _id: 'a2' }),
        perfectAction({ _id: 'a3', dueDate: '2025-11-30' }),
      ],
      now: NOW,
    });
    assert.equal(b.counters.cancelledActions, 1);
    assert.equal(b.counters.evaluableActions, 2);
    // La cancelada no penaliza D1/D3/D4 (no está en evaluable).
    assert.equal(b.dimensions.programming.ratio, 1);
  });

  it('action sin evaluar (incomplete) no es evaluable → 0 acciones evaluables', () => {
    const broken = { _id: 'b1' } as CpaActionLike;
    assert.equal(isEvaluableAction(broken), false);
    const b = computeCpaActionsScore({ actions: [broken], now: NOW });
    assert.equal(b.counters.evaluableActions, 0);
    // Acción existente NO evaluable → no NO_DATA; finding de asignación.
    assert.equal(b.noData, false);
    assert.ok(b.findings.some((f) => f.id === 'corrective-preventive-actions-incomplete-assignment'));
  });
});

// ─── Continuidad / redistribución ────────────────────────────────────────────

describe('CPA-SCORING: continuidad y redistribución', () => {
  it('10. una sola vigencia → continuity null → redistribuida (no penaliza)', () => {
    const b = computeCpaActionsScore({ actions: [perfectAction()], now: NOW });
    assert.equal(b.dimensions.continuity.ratio, null);
    assert.equal(b.counters.evaluableActions, 1);
    assert.equal(b.percentage, 100); // D1-D4 al 100; D5 redistribuida.
  });

  it('12. múltiples vigencias → continuity 1 (sin redistribución)', () => {
    const b = computeCpaActionsScore({
      actions: [perfectAction(), perfectAction({ _id: 'a2', dueDate: '2025-11-30' })],
      now: NOW,
    });
    assert.equal(b.dimensions.continuity.ratio, 1);
    assert.equal(b.dimensions.continuity.distinctDueYears, 2);
  });

  it('sin fechas de compromiso válidas → continuity 0 (no evaluable en absoluto)', () => {
    const b = computeCpaActionsScore({ actions: [], now: NOW });
    assert.equal(b.dimensions.continuity.ratio, 0); // noData: 0 directo.
  });
});

// ─── Findings deterministas / counters / no doble conteo ─────────────────────

describe('CPA-SCORING: findings y counters', () => {
  it('13. findings deterministas con ids estables', () => {
    const b1 = computeCpaActionsScore({
      actions: [perfectAction({ effectivenessVerification: undefined, evidence: undefined })],
      now: NOW,
    });
    const ids1 = b1.findings.map((f) => f.id).sort();
    const b2 = computeCpaActionsScore({
      actions: [perfectAction({ effectivenessVerification: undefined, evidence: undefined })],
      now: NOW,
    });
    const ids2 = b2.findings.map((f) => f.id).sort();
    assert.deepEqual(ids1, ids2);
    for (const id of ids1) {
      assert.ok(id.startsWith('corrective-preventive-actions-'), `id inesperado: ${id}`);
    }
  });

  it('14. counters correctos para el portafolio mixto', () => {
    const b = computeCpaActionsScore({
      actions: [
        perfectAction(), // COMPLETED + eficacia
        perfectAction({ _id: 'a2', status: 'IN_PROGRESS', executionDate: undefined, effectivenessVerification: undefined, evidence: undefined }),
        perfectAction({ _id: 'a3', status: 'PENDING', executionDate: undefined, effectivenessVerification: undefined, evidence: undefined }),
        perfectAction({ _id: 'a4', status: 'CANCELLED' }),
        perfectAction({ _id: 'a5', status: 'IN_PROGRESS', dueDate: '2026-01-01', executionDate: undefined, effectivenessVerification: undefined }),
      ],
      now: NOW,
    });
    assert.equal(b.counters.totalActions, 5);
    assert.equal(b.counters.pendingActions, 1);
    assert.equal(b.counters.inProgressActions, 2);
    assert.equal(b.counters.completedActions, 1);
    assert.equal(b.counters.cancelledActions, 1);
    assert.equal(b.counters.overdueActions, 3); // a2, a3, a5 (dueDate < NOW, no terminales)
    assert.equal(b.counters.actionsWithEvidence, 3); // a1, a4, a5
    assert.equal(b.counters.actionsWithEffectiveness, 2); // a1, a4 (a5 sin verificación)
    assert.equal(b.counters.effectiveActions, 2);
    assert.equal(b.counters.actionsWithoutEffectiveness, 0); // completed(1) - withEff(1)
  });

  it('15. sin doble conteo: cada acción cuenta una sola vez por contador', () => {
    const actions = [perfectAction(), perfectAction({ _id: 'a2', status: 'PENDING' })];
    const b = computeCpaActionsScore({ actions, now: NOW });
    // La suma de contadores de estado == total (cada acción en exactamente uno).
    const statusSum =
      b.counters.pendingActions +
      b.counters.inProgressActions +
      b.counters.completedActions +
      b.counters.cancelledActions;
    assert.equal(statusSum, b.counters.totalActions);
    // evaluable = total - canceladas.
    assert.equal(b.counters.evaluableActions, b.counters.totalActions - b.counters.cancelledActions);
  });

  it('metadata: latestAction y evaluatedPeriod provienen de la dueDate más reciente', () => {
    const b = computeCpaActionsScore({
      actions: [perfectAction({ actionCode: 'AC-01' }), perfectAction({ _id: 'a2', dueDate: '2026-12-31', actionCode: 'AC-02' })],
      now: NOW,
    });
    assert.equal(b.evaluatedPeriod, String(YEAR));
    assert.equal(b.latestAction?.actionCode, 'AC-02');
  });
});
