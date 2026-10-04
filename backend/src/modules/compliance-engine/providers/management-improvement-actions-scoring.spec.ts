import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MiaActionLike,
  MIA_ACTIONS_FORMULA,
  MIA_ACTIONS_MODULE,
  MIA_ACTIONS_SCORE_WEIGHTS,
  MIA_ACTIONS_STANDARD_CODE,
  MIA_ACTIONS_STANDARD_TITLE,
  MIA_ACTIONS_COMPLIANCE_TARGET,
  computeMiaActionsScore,
  isEvaluableManagementImprovementAction,
  isOverdueManagementImprovementAction,
  redistributeWeightedScore,
} from './management-improvement-actions-scoring';

/**
 * E2 (7.1.2) — Tests del SCORER PURO de las acciones de mejora de la alta
 * dirección. Deterministas (now inyectable). SIN Mongo/NestJS.
 */

const NOW = new Date('2026-09-25T12:00:00Z');
const USER_A = '507f1f77bcf86cd799439011';

function buildAction(overrides: Partial<MiaActionLike> = {}): MiaActionLike {
  return {
    _id: 'aaa000000000000000000001',
    title: 'Mejora aprobada por la alta dirección',
    description: 'Fortalecer la gestión de recursos del SG-SST según decisión de la dirección',
    origin: 'MEETING',
    priority: 'MEDIUM',
    responsibleUserId: USER_A,
    responsibleSnapshot: 'Ana Gómez',
    dueDate: '2026-12-31',
    status: 'PENDING',
    decisionReference: 'Acta 2026-01: aprobar el plan de recursos del SG-SST',
    ...overrides,
  };
}

/** Acción "perfecta": asignada, con seguimiento, evidencia y trazabilidad. */
function buildPerfectAction(overrides: Partial<MiaActionLike> = {}): MiaActionLike {
  return buildAction({
    followUp: {
      lastFollowUpDate: '2026-09-01',
      implementationStatus: 'ON_TRACK',
      perceivedEffectiveness: 'EFECTIVA',
      requiresContinuedFollowUp: false,
    },
    evidence: { evidenceUrl: 'https://empresa.com/soporte-mejora.pdf' },
    ...overrides,
  });
}

describe('MIA SCORER: contrato y constantes', () => {
  it('20. pesos suman exactamente 100 (20/25/20/25/10)', () => {
    const sum =
      MIA_ACTIONS_SCORE_WEIGHTS.programming +
      MIA_ACTIONS_SCORE_WEIGHTS.execution +
      MIA_ACTIONS_SCORE_WEIGHTS.followUp +
      MIA_ACTIONS_SCORE_WEIGHTS.evidence +
      MIA_ACTIONS_SCORE_WEIGHTS.continuity;
    assert.equal(sum, 100);
  });

  it('contrato oficial: module/code/title/formula/target', () => {
    assert.equal(MIA_ACTIONS_MODULE, 'management-improvement-actions');
    assert.equal(MIA_ACTIONS_STANDARD_CODE, '7.1.2');
    assert.equal(MIA_ACTIONS_STANDARD_TITLE, 'Acciones mejora alta dirección');
    assert.equal(MIA_ACTIONS_FORMULA, 'dimensions:v1');
    assert.equal(MIA_ACTIONS_COMPLIANCE_TARGET, 90);
  });
});

describe('MIA SCORER: NO_DATA y evaluabilidad', () => {
  it('1. sin acciones → NO_DATA (no-actions) con finding no-data', () => {
    const b = computeMiaActionsScore({ actions: [], now: NOW });
    assert.equal(b.noData, true);
    assert.equal(b.noDataReason, 'no-actions');
    assert.equal(b.percentage, 0);
    assert.ok(b.findings.some((f) => f.id === 'management-improvement-actions-no-data'));
  });

  it('2. acciones deficientes → score real, NO NO_DATA (10 acciones sin responsable → 0%, noData=false)', () => {
    const actions = Array.from({ length: 10 }, (_, i) =>
      buildAction({ _id: `def0000000000000000000${i}`, responsibleUserId: undefined, responsibleSnapshot: undefined }),
    );
    const b = computeMiaActionsScore({ actions, now: NOW });
    assert.equal(b.noData, false);
    assert.equal(b.noDataReason, null);
    assert.equal(b.percentage, 0);
    assert.ok(b.findings.some((f) => f.id === 'management-improvement-actions-incomplete-assignment'));
  });

  it('3. acción totalmente asignada → programming ratio 1 (sin freebie: exige 6 condiciones)', () => {
    const b = computeMiaActionsScore({ actions: [buildAction()], now: NOW });
    assert.equal(b.dimensions.programming.ratio, 1);
    assert.equal(b.counters.evaluableActions, 1);
  });

  it('4. asignación incompleta (sin decisión de origen) → programming < 1 + finding', () => {
    const b = computeMiaActionsScore({
      actions: [buildAction({ decisionReference: undefined, originReferenceId: undefined })],
      now: NOW,
    });
    assert.ok((b.dimensions.programming.ratio as number) < 1);
    assert.ok(b.findings.some((f) => f.id === 'management-improvement-actions-incomplete-assignment'));
  });

  it('política de evaluabilidad: sin responsable/dueDate/prioridad/origen/estado → NO evaluable', () => {
    assert.equal(isEvaluableManagementImprovementAction(buildAction()), true);
    assert.equal(isEvaluableManagementImprovementAction(buildAction({ responsibleUserId: undefined, responsibleSnapshot: undefined })), false);
    assert.equal(isEvaluableManagementImprovementAction(buildAction({ dueDate: undefined })), false);
    assert.equal(isEvaluableManagementImprovementAction(buildAction({ priority: 'URGENTE' as never })), false);
    assert.equal(isEvaluableManagementImprovementAction(buildAction({ origin: 'AUDIT_6_1_2' as never })), false);
    assert.equal(isEvaluableManagementImprovementAction(buildAction({ status: 'UNKNOWN' as never })), false);
  });
});

describe('MIA SCORER: OVERDUE (derivado, nunca persistido)', () => {
  it('5. activa con dueDate pasada → vencida (finding + subcheck ejecución falla)', () => {
    const b = computeMiaActionsScore({
      actions: [buildAction({ status: 'IN_PROGRESS', dueDate: '2026-02-01' })],
      now: NOW,
    });
    assert.equal(b.counters.overdueActions, 1);
    assert.ok(b.findings.some((f) => f.id === 'management-improvement-actions-overdue'));
    // (a) sin ejecución registrada Y (b) overdue>0 fallan; (c)/(d) pasan.
    assert.equal(b.dimensions.execution.subchecks?.satisfied, 2);
  });

  it('6. COMPLETED con dueDate pasada → NO vencida (ejecutada a tiempo o tardía pero cerrada)', () => {
    const a = buildAction({
      status: 'COMPLETED',
      dueDate: '2026-02-01',
      executionDate: '2026-03-15',
      followUp: { lastFollowUpDate: '2026-03-20', implementationStatus: 'IMPLEMENTED', perceivedEffectiveness: 'EFECTIVA' },
      evidence: { evidenceUrl: 'https://x.com/e.pdf' },
    });
    assert.equal(isOverdueManagementImprovementAction(a, NOW), false);
    const b = computeMiaActionsScore({ actions: [a], now: NOW });
    assert.equal(b.counters.overdueActions, 0);
  });

  it('7. CANCELLED con dueDate pasada → NO vencida y EXCLUIDA del portafolio evaluable', () => {
    const cancelled = buildAction({ status: 'CANCELLED', dueDate: '2026-02-01' });
    assert.equal(isOverdueManagementImprovementAction(cancelled, NOW), false);
    const b = computeMiaActionsScore({ actions: [cancelled], now: NOW });
    assert.equal(b.counters.overdueActions, 0);
    assert.equal(b.counters.evaluableActions, 0);
  });
});

describe('MIA SCORER: seguimiento (follow-up real, no mera existencia)', () => {
  it('8. follow-up con fecha + estado de implementación → actividad real registrada', () => {
    const b = computeMiaActionsScore({
      actions: [buildPerfectAction({ status: 'IN_PROGRESS' })],
      now: NOW,
    });
    assert.equal(b.counters.actionsWithFollowUp, 1);
    assert.equal(b.dimensions.followUp.subchecks?.satisfied, 4);
  });

  it('9. sin follow-up → counter + finding no-follow-up', () => {
    const b = computeMiaActionsScore({ actions: [buildAction()], now: NOW });
    assert.equal(b.counters.actionsWithoutFollowUp, 1);
    assert.ok(b.findings.some((f) => f.id === 'management-improvement-actions-no-follow-up'));
  });

  it('followUp vacío (solo objeto sin datos) NO cuenta como seguimiento real', () => {
    const b = computeMiaActionsScore({
      actions: [buildAction({ followUp: { observations: 'nota sin fecha/estado' } })],
      now: NOW,
    });
    assert.equal(b.counters.actionsWithFollowUp, 0);
  });
});

describe('MIA SCORER: percepción de efectividad (declarativa — NO eficacia formal)', () => {
  it('10. EFECTIVA → counter efectivas (contribuye a seguimiento)', () => {
    const b = computeMiaActionsScore({
      actions: [buildPerfectAction()],
      now: NOW,
    });
    assert.equal(b.counters.effectiveActions, 1);
  });

  it('11. NO_EFECTIVA → counter + finding ineffective', () => {
    const b = computeMiaActionsScore({
      actions: [buildPerfectAction({ followUp: { lastFollowUpDate: '2026-09-01', implementationStatus: 'IMPLEMENTED', perceivedEffectiveness: 'NO_EFECTIVA' } })],
      now: NOW,
    });
    assert.equal(b.counters.ineffectiveActions, 1);
    assert.ok(b.findings.some((f) => f.id === 'management-improvement-actions-ineffective'));
  });

  it('12. INDETERMINADA → counter + finding effectiveness-uncertain', () => {
    const b = computeMiaActionsScore({
      actions: [buildPerfectAction({ followUp: { lastFollowUpDate: '2026-09-01', implementationStatus: 'ON_TRACK', perceivedEffectiveness: 'INDETERMINADA' } })],
      now: NOW,
    });
    assert.equal(b.counters.indeterminateEffectivenessActions, 1);
    assert.ok(b.findings.some((f) => f.id === 'management-improvement-actions-effectiveness-uncertain'));
  });

  it('13. requiresContinuedFollowUp=true → counter + finding continued-follow-up (NO cerrada desde seguimiento)', () => {
    const b = computeMiaActionsScore({
      actions: [buildPerfectAction({ followUp: { lastFollowUpDate: '2026-09-01', implementationStatus: 'ON_TRACK', perceivedEffectiveness: 'EFECTIVA', requiresContinuedFollowUp: true } })],
      now: NOW,
    });
    assert.equal(b.counters.actionsRequiringContinuedFollowUp, 1);
    assert.ok(b.findings.some((f) => f.id === 'management-improvement-actions-continued-follow-up'));
  });
});

describe('MIA SCORER: evidencia y trazabilidad', () => {
  it('14. evidencia presente (URL) → counter', () => {
    const b = computeMiaActionsScore({ actions: [buildPerfectAction()], now: NOW });
    assert.equal(b.counters.actionsWithEvidence, 1);
  });

  it('15. sin evidencia → counter + finding no-evidence', () => {
    const b = computeMiaActionsScore({ actions: [buildAction()], now: NOW });
    assert.equal(b.counters.actionsWithoutEvidence, 1);
    assert.ok(b.findings.some((f) => f.id === 'management-improvement-actions-no-evidence'));
  });

  it('16. sin decisión de origen trazable → finding traceability-incomplete', () => {
    const b = computeMiaActionsScore({
      actions: [buildAction({ decisionReference: undefined, originReferenceId: undefined })],
      now: NOW,
    });
    assert.ok(b.findings.some((f) => f.id === 'management-improvement-actions-traceability-incomplete'));
  });

  it('originReferenceId (ObjectId-like) cuenta como trazabilidad del origen', () => {
    // Emula un ObjectId real de Mongoose: prototype NO es Object.prototype.
    const objectIdLike = Object.create({ toString: () => '65a1bcd00000000000000001' });
    const b = computeMiaActionsScore({
      actions: [buildAction({ decisionReference: undefined, originReferenceId: objectIdLike as unknown as string })],
      now: NOW,
    });
    assert.equal(b.dimensions.programming.ratio, 1);
    assert.equal(b.dimensions.evidence.subchecks?.satisfied, 3); // falta evidencia
  });
});

describe('MIA SCORER: continuidad (política 0/null/≥2)', () => {
  it('17. 0 vigencias evaluables (solo CANCELLED) → continuidad ratio 0', () => {
    const b = computeMiaActionsScore({
      actions: [buildAction({ status: 'CANCELLED' })],
      now: NOW,
    });
    assert.equal(b.dimensions.continuity.ratio, 0);
    assert.equal(b.dimensions.continuity.distinctDueYears, 0);
  });

  it('18. 1 vigencia → continuidad null y se REDISTRIBUYE (D1-D3-D4 al 100; D2 3/4)', () => {
    const b = computeMiaActionsScore({ actions: [buildPerfectAction()], now: NOW });
    assert.equal(b.dimensions.continuity.ratio, null);
    // D1 20 + D3 20 + D4 25 al 100%; D2 25 al 75% (sin ejecución aún: acción PENDING).
    // (20 + 18.75 + 20 + 25) / 90 * 100 = 93.06 → 93.
    assert.equal(Math.round(b.percentage), 93);
    assert.equal(b.findings.length, 0); // sin brechas demostrables
  });

  it('19. ≥2 vigencias → continuidad ratio 1 (evaluada normalmente, sin redistribución)', () => {
    const b = computeMiaActionsScore({
      actions: [
        buildPerfectAction({ dueDate: '2026-12-31' }),
        buildPerfectAction({ _id: 'aaa000000000000000000002', dueDate: '2027-01-31' }),
      ],
      now: NOW,
    });
    assert.equal(b.dimensions.continuity.ratio, 1);
    assert.equal(b.dimensions.continuity.distinctDueYears, 2);
    // La continuidad ya no se redistribuye: participa con su peso (10).
    assert.ok(b.percentage > 0 && b.percentage <= 100);
  });
});

describe('MIA SCORER: agregación y determinismo', () => {
  it('portafolio mixto realista → score parcial con redistribución aplicada', () => {
    const b = computeMiaActionsScore({
      actions: [
        buildPerfectAction({ status: 'IN_PROGRESS' }),
        buildAction({ dueDate: '2027-01-31' }), // sin seguimiento ni evidencia
      ],
      now: NOW,
    });
    // D1: 1/2 asignadas completas (la 2ª sin decisionReference→ no; buildAction SÍ tiene decisionReference → 2/2)
    assert.equal(b.dimensions.programming.ratio, 1);
    // D2: executedAny=0 → subcheck (a) falla; overdue=0 ✓; activas con due ✓
    assert.equal(b.dimensions.execution.subchecks?.satisfied, 3);
    assert.ok(b.percentage > 0 && b.percentage < 100);
    assert.ok(b.findings.some((f) => f.id === 'management-improvement-actions-no-evidence'));
    assert.ok(b.findings.some((f) => f.id === 'management-improvement-actions-no-follow-up'));
  });

  it('21. determinista: misma entrada → misma salida', () => {
    const actions = [buildPerfectAction(), buildAction({ dueDate: '2027-02-28' })];
    const b1 = computeMiaActionsScore({ actions, now: NOW });
    const b2 = computeMiaActionsScore({ actions, now: NOW });
    assert.deepEqual(b1, b2);
  });

  it('redistributeWeightedScore: redistribuye entre dimensiones activas y acota 0-100', () => {
    // D1 100%, D2 null (redistribuida), D3 50% → (20*1 + 20*0.5)/(20+20) = 75%
    const score = redistributeWeightedScore([
      { ratio: 1, weight: 20 },
      { ratio: null, weight: 20 },
      { ratio: 0.5, weight: 20 },
    ]);
    assert.equal(score, 75);
    assert.equal(redistributeWeightedScore([{ ratio: null, weight: 20 }]), 0);
  });

  it('portafolio 100%: asignación + ejecución + seguimiento + evidencia + ≥2 vigencias', () => {
    const b = computeMiaActionsScore({
      actions: [
        buildPerfectAction({ status: 'PENDING', dueDate: '2026-12-31' }),
        buildPerfectAction({
          _id: 'aaa000000000000000000002',
          status: 'COMPLETED',
          dueDate: '2027-01-31',
          executionDate: '2026-08-15',
          followUp: {
            lastFollowUpDate: '2026-08-20',
            implementationStatus: 'IMPLEMENTED',
            perceivedEffectiveness: 'EFECTIVA',
            requiresContinuedFollowUp: false,
          },
        }),
      ],
      now: NOW,
    });
    assert.equal(b.percentage, 100);
    assert.deepEqual(b.findings, []);
  });

  it('counters completos y coherentes en portafolio mixto', () => {
    const b = computeMiaActionsScore({
      actions: [
        buildPerfectAction({ status: 'PENDING' }),
        buildAction({ status: 'IN_PROGRESS' }),
        buildAction({ status: 'COMPLETED', dueDate: '2026-03-01', executionDate: '2026-02-15', followUp: { lastFollowUpDate: '2026-03-10', implementationStatus: 'IMPLEMENTED', perceivedEffectiveness: 'EFECTIVA' }, evidence: { evidenceUrl: 'https://x.com/e.pdf' } }),
        buildAction({ status: 'CANCELLED', dueDate: '2026-01-01' }),
        buildAction({ status: 'IN_PROGRESS', dueDate: '2026-02-01' }), // vencida
      ],
      now: NOW,
    });
    assert.equal(b.counters.totalActions, 5);
    assert.equal(b.counters.pendingActions, 1);
    assert.equal(b.counters.inProgressActions, 2);
    assert.equal(b.counters.completedActions, 1);
    assert.equal(b.counters.cancelledActions, 1);
    assert.equal(b.counters.overdueActions, 1);
    assert.equal(b.counters.evaluableActions, 4); // CANCELLED excluida
    assert.equal(b.counters.effectiveActions, 2); // perfect + completed
    assert.equal(b.latestAction !== null, true);
    assert.equal(b.evaluatedPeriod, '2026');
  });
});
