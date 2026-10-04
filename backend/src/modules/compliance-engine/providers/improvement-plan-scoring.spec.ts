import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  IpActivityLike,
  IpPlanLike,
  IP_PLAN_FORMULA,
  IP_PLAN_MODULE,
  IP_PLAN_SCORE_WEIGHTS,
  IP_PLAN_STANDARD_CODE,
  IP_PLAN_STANDARD_TITLE,
  IP_PLAN_COMPLIANCE_TARGET,
  computeImprovementPlanScore,
  derivePlanYear,
  isEvaluableImprovementPlan,
  isImprovementPlanActivityOverdue,
  isImprovementPlanOverdue,
  redistributeWeightedScore,
} from './improvement-plan-scoring';

/**
 * E2 (7.1.4) — Tests del SCORER PURO del Plan de mejoramiento.
 * Cubre los 34 escenarios del prompt (basic/structure/planning/execution/
 * monitoring/evidence-closure/continuity/time/stability/boundaries).
 */

const NOW = new Date('2026-09-26T12:00:00Z');

let seq = 0;
function activity(overrides: Partial<IpActivityLike> = {}): IpActivityLike {
  seq += 1;
  return {
    activityId: `ACT-${String(seq).padStart(3, '0')}`,
    description: `Actividad ${seq}`,
    responsibleUserId: '507f1f77bcf86cd7994390aa',
    plannedDate: '2026-03-01',
    dueDate: '2026-06-30',
    status: 'IN_PROGRESS',
    progress: 40,
    ...overrides,
  };
}

function plan(overrides: Partial<IpPlanLike> = {}): IpPlanLike {
  seq += 1;
  return {
    _id: `507f1f77bcf86cd79943${String(seq).padStart(4, '0')}`,
    companyId: '507f1f77bcf86cd799439012',
    code: 'PM-2026-001',
    title: 'Plan de mejoramiento 2026',
    description: 'Plan consolidado del SG-SST',
    period: '2026',
    year: 2026,
    responsibleUserId: '507f1f77bcf86cd7994390aa',
    responsibleUserSnapshot: 'Ana Gómez',
    origin: 'AUDIT',
    originDescription: 'Hallazgos de auditoría interna',
    priority: 'HIGH',
    prioritizationCriteria: 'Riesgo y cumplimiento legal',
    objectives: [
      { objectiveId: 'OBJ-001', description: 'Reducir accidentalidad', target: '-20%', indicator: 'Índice de accidentalidad' },
    ],
    activities: [activity()],
    resources: [{ type: 'FINANCIAL', description: 'Presupuesto capacitaciones' }],
    monitoring: [{ monitoringId: 'MON-001', date: '2026-06-01', progress: 45, deviations: 'Ninguna' }],
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    status: 'IN_PROGRESS',
    createdAt: '2026-01-05T10:00:00Z',
    ...overrides,
  };
}

/** Plan completo (2026) — línea base de cumplimiento alto. */
function completePlan(overrides: Partial<IpPlanLike> = {}): IpPlanLike {
  return plan({
    status: 'CLOSED',
    closureDate: '2026-12-15',
    closedByUserId: '507f1f77bcf86cd7994390bb',
    closedByUserSnapshot: 'Owner',
    activities: [
      activity({ status: 'COMPLETED', executionDate: '2026-05-20', dueDate: '2026-06-30', evidence: { evidenceUrl: 'https://evidencia/1' }, followUp: { implementationStatus: 'IMPLEMENTED', perceivedEffectiveness: 'EFECTIVA' } }),
      activity({ status: 'CANCELLED', observations: 'Cancelada por cambio de prioridad documentado' }),
    ],
    monitoring: [
      { monitoringId: 'MON-001', date: '2026-06-01', progress: 50 },
      { monitoringId: 'MON-002', date: '2026-09-01', progress: 100, adjustmentActions: 'Ajuste documentado' },
    ],
    ...overrides,
  });
}

// ── Basic ───────────────────────────────────────────────────────────────────

describe('IP714-SCORING — Basic', () => {
  it('B-01: sin planes → NO_DATA (no-evaluable-plans)', () => {
    const r = computeImprovementPlanScore({ plans: [], now: NOW });
    assert.equal(r.noData, true);
    assert.equal(r.noDataReason, 'no-evaluable-plans');
    assert.equal(r.percentage, 0);
    assert.equal(r.findings[0].id, 'improvement-plan-no-data');
  });

  it('B-02: plan evaluable completo → score alto, todas las dimensiones evaluadas', () => {
    const r = computeImprovementPlanScore({ plans: [completePlan()], now: NOW });
    assert.equal(r.noData, false);
    assert.ok(r.percentage >= 80, `percentage=${r.percentage}`);
    // Continuity no evaluable (1 año) → null; el resto ≥ 0.
    assert.equal(r.dimensions.continuity.ratio, null);
    for (const d of ['structure', 'planning', 'execution', 'monitoring', 'evidenceAndClosure'] as const) {
      assert.equal(r.dimensions[d].ratio, 1, `dim ${d} completa`);
    }
  });

  it('B-03: plan incompleto → score REAL, nunca NO_DATA', () => {
    const r = computeImprovementPlanScore({ plans: [plan({ objectives: [], monitoring: [], resources: [] })], now: NOW });
    assert.equal(r.noData, false);
    assert.ok(r.percentage < 100);
    assert.ok(r.findings.length >= 2);
  });

  it('B-04: múltiples planes — promedio de ratios por plan', () => {
    const r = computeImprovementPlanScore({ plans: [completePlan(), plan({ monitoring: [] })], now: NOW });
    assert.equal(r.counters.evaluablePlans, 2);
    assert.ok(r.dimensions.monitoring.ratio !== null && r.dimensions.monitoring.ratio < 1);
  });
});

// ── Structure ───────────────────────────────────────────────────────────────

describe('IP714-SCORING — Structure', () => {
  it('S-05: plan sin responsable → NO evaluable', () => {
    assert.equal(isEvaluableImprovementPlan(plan({ responsibleUserId: undefined, responsibleUserSnapshot: undefined })), false);
  });

  it('S-06: plan sin origen válido → NO evaluable', () => {
    assert.equal(isEvaluableImprovementPlan(plan({ origin: 'UNKNOWN_ORIGIN' })), false);
    assert.equal(isEvaluableImprovementPlan(plan({ origin: '' })), false);
  });

  it('S-07: plan sin priorización documentada → evaluable pero subcheck structure<1 + finding', () => {
    const p = plan({ prioritizationCriteria: undefined });
    assert.equal(isEvaluableImprovementPlan(p), true);
    const r = computeImprovementPlanScore({ plans: [p], now: NOW });
    assert.ok(r.dimensions.structure.ratio !== null && r.dimensions.structure.ratio < 1);
  });
});

// ── Planning ────────────────────────────────────────────────────────────────

describe('IP714-SCORING — Planning', () => {
  it('P-08: sin objetivos → planning<1 + finding no-objectives', () => {
    const p = plan({ objectives: [] });
    const r = computeImprovementPlanScore({ plans: [p], now: NOW });
    assert.ok(r.dimensions.planning.ratio !== null && r.dimensions.planning.ratio < 1);
    assert.ok(r.findings.some((f) => f.id === 'improvement-plan-no-objectives'));
  });

  it('P-09: objetivos sin metas → subcheck planning<1', () => {
    const p = plan({ objectives: [{ objectiveId: 'OBJ-001', description: 'X' }] });
    const r = computeImprovementPlanScore({ plans: [p], now: NOW });
    assert.ok(r.dimensions.planning.ratio !== null && r.dimensions.planning.ratio < 1);
  });

  it('P-10: objetivos sin indicadores → planning<1 + finding no-indicators', () => {
    const p = plan({ objectives: [{ objectiveId: 'OBJ-001', description: 'X', target: '-20%' }] });
    const r = computeImprovementPlanScore({ plans: [p], now: NOW });
    assert.ok(r.dimensions.planning.ratio !== null && r.dimensions.planning.ratio < 1);
    assert.ok(r.findings.some((f) => f.id === 'improvement-plan-no-indicators'));
  });

  it('P-11: actividades sin responsable → planning<1 + finding no-responsibles', () => {
    const p = plan({ activities: [activity({ responsibleUserId: undefined, responsibleUserSnapshot: undefined })] });
    const r = computeImprovementPlanScore({ plans: [p], now: NOW });
    assert.ok(r.dimensions.planning.ratio !== null && r.dimensions.planning.ratio < 1);
    assert.ok(r.findings.some((f) => f.id === 'improvement-plan-no-responsibles'));
  });

  it('P-12: actividades sin cronograma → planning<1 + finding no-schedule', () => {
    const p = plan({ activities: [activity({ plannedDate: undefined, dueDate: undefined })] });
    const r = computeImprovementPlanScore({ plans: [p], now: NOW });
    assert.ok(r.dimensions.planning.ratio !== null && r.dimensions.planning.ratio < 1);
    assert.ok(r.findings.some((f) => f.id === 'improvement-plan-no-schedule'));
  });

  it('P-13: sin recursos → planning<1', () => {
    const p = plan({ resources: [] });
    const r = computeImprovementPlanScore({ plans: [p], now: NOW });
    assert.ok(r.dimensions.planning.ratio !== null && r.dimensions.planning.ratio < 1);
  });
});

// ── Execution ───────────────────────────────────────────────────────────────

describe('IP714-SCORING — Execution', () => {
  it('E-14: actividades completadas (sin más brechas) → sin vencidas ni hallazgo de ejecución', () => {
    const p = plan({ activities: [activity({ status: 'COMPLETED', executionDate: '2026-05-01' })], endDate: '2027-12-31' });
    const r = computeImprovementPlanScore({ plans: [p], now: NOW });
    assert.equal(r.counters.overdueActivities, 0);
  });

  it('E-15: actividades pendientes con dueDate futura → ejecución sin subcheck vencidas', () => {
    const p = plan({ activities: [activity({ status: 'PENDING', dueDate: '2027-01-31' })], endDate: '2027-12-31' });
    const r = computeImprovementPlanScore({ plans: [p], now: NOW });
    assert.ok(r.dimensions.execution.ratio !== null && r.dimensions.execution.ratio >= 0.4);
  });

  it('E-16: actividad vencida → overdue + finding improvement-plan-overdue', () => {
    const p = plan({ activities: [activity({ status: 'IN_PROGRESS', dueDate: '2026-01-31' })] });
    const r = computeImprovementPlanScore({ plans: [p], now: NOW });
    assert.equal(r.counters.overdueActivities, 1);
    assert.ok(r.findings.some((f) => f.id === 'improvement-plan-overdue'));
    assert.ok(r.dimensions.execution.ratio !== null && r.dimensions.execution.ratio < 1);
  });

  it('E-17: cancelación documentada no penaliza; cancelación sin documentar penaliza', () => {
    const documented = plan({
      activities: [
        activity({ status: 'COMPLETED', executionDate: '2026-05-01' }),
        activity({ status: 'CANCELLED', observations: 'Justificación registrada' }),
      ],
      endDate: '2027-12-31',
    });
    const rDoc = computeImprovementPlanScore({ plans: [documented], now: NOW });
    assert.equal(rDoc.dimensions.execution.ratio, 1);

    const undocumented = plan({
      activities: [
        activity({ status: 'COMPLETED', executionDate: '2026-05-01' }),
        activity({ status: 'CANCELLED' }),
      ],
      endDate: '2027-12-31',
    });
    const rUndoc = computeImprovementPlanScore({ plans: [undocumented], now: NOW });
    assert.ok(rUndoc.dimensions.execution.ratio !== null && rUndoc.dimensions.execution.ratio < 1);
  });

  it('E-18: COMPLETED sin executionDate → subcheck de ejecución falla (counters)', () => {
    const p = plan({ activities: [activity({ status: 'COMPLETED' })] });
    const r = computeImprovementPlanScore({ plans: [p], now: NOW });
    const detail = r.dimensions.execution;
    assert.ok(detail.subchecks);
    assert.ok(detail.subchecks!.satisfied < detail.subchecks!.total);
  });
});

// ── Monitoring ──────────────────────────────────────────────────────────────

describe('IP714-SCORING — Monitoring', () => {
  it('M-19: sin monitoring → dimensión 0 + finding no-monitoring', () => {
    const p = plan({ monitoring: [] });
    const r = computeImprovementPlanScore({ plans: [p], now: NOW });
    assert.equal(r.dimensions.monitoring.ratio, 0);
    assert.ok(r.findings.some((f) => f.id === 'improvement-plan-no-monitoring'));
  });

  it('M-20: monitoring válido → dimensión 1 (entidad INDEPENDIENTE de actividades)', () => {
    const p = plan({ activities: [] }); // sin actividades, pero monitoring presente
    const r = computeImprovementPlanScore({ plans: [p], now: NOW });
    assert.equal(r.dimensions.monitoring.ratio, 1);
  });

  it('M-21: monitoring con desviaciones y ajustes cuenta como seguimiento válido', () => {
    const p = plan({ monitoring: [{ monitoringId: 'MON-001', date: '2026-06-01', deviations: 'Retraso', adjustmentActions: 'Reasignación' }] });
    const r = computeImprovementPlanScore({ plans: [p], now: NOW });
    assert.equal(r.dimensions.monitoring.ratio, 1);
    assert.equal(r.counters.plansWithMonitoring, 1);
  });
});

// ── Evidence / closure ──────────────────────────────────────────────────────

describe('IP714-SCORING — Evidence & closure', () => {
  it('EC-22: sin evidencia → finding no-evidence (activitiesWithEvidence=0)', () => {
    const p = plan({ activities: [activity()] });
    const r = computeImprovementPlanScore({ plans: [p], now: NOW });
    assert.ok(r.findings.some((f) => f.id === 'improvement-plan-no-evidence'));
  });

  it('EC-23: evidencia válida (URL o documentId) → counter actividades con evidencia', () => {
    const r = computeImprovementPlanScore({
      plans: [
        plan({ activities: [activity({ evidence: { documentId: '507f1f77bcf86cd7994390cc' } })] }),
      ],
      now: NOW,
    });
    assert.equal(r.counters.activitiesWithEvidence, 1);
  });

  it('EC-24: plan sin cierre (IN_PROGRESS) → finding no-closure; COMPLETED sin cierre documentado → subchecks de cierre incompletos', () => {
    const inProgress = plan();
    const r = computeImprovementPlanScore({ plans: [inProgress], now: NOW });
    assert.ok(r.findings.some((f) => f.id === 'improvement-plan-no-closure'));

    const completedNoClosureDoc = plan({ status: 'COMPLETED' });
    const r2 = computeImprovementPlanScore({ plans: [completedNoClosureDoc], now: NOW });
    const ec = r2.dimensions.evidenceAndClosure;
    assert.ok(ec.subchecks);
    assert.ok(ec.subchecks!.satisfied < ec.subchecks!.total);
    // El plan COMPLETED ya alcanzó la fase de cierre — el lifecycle sella
    // closureDate/closedBy solo al pasar a CLOSED (regla E1), por lo que NO
    // genera el finding "sin cierre" (no es deficiencia, es etapa pendiente).
    assert.ok(!r2.findings.some((f) => f.id === 'improvement-plan-no-closure'));
  });

  it('EC-25: plan CLOSED correctamente → subchecks de cierre completos', () => {
    const p = plan({
      status: 'CLOSED',
      closureDate: '2026-12-15',
      closedByUserId: '507f1f77bcf86cd7994390bb',
      activities: [activity({ status: 'COMPLETED', executionDate: '2026-05-01', evidence: { evidenceUrl: 'https://e' } })],
      endDate: '2026-12-31',
    });
    const r = computeImprovementPlanScore({ plans: [p], now: NOW });
    const ec = r.dimensions.evidenceAndClosure;
    assert.ok(ec.subchecks);
    assert.equal(ec.subchecks!.satisfied, ec.subchecks!.total);
  });
});

// ── Continuity ──────────────────────────────────────────────────────────────

describe('IP714-SCORING — Continuity', () => {
  it('C-26: un solo año → continuity null + redistribución (NO castiga)', () => {
    const single = computeImprovementPlanScore({ plans: [completePlan()], now: NOW });
    assert.equal(single.dimensions.continuity.ratio, null);

    // Con redistribución: comparar contra continuity=0 manual no aplica —
    // verificamos que el score del plan sea idéntico con y sin continuity.
    const manual = redistributeWeightedScore([
      { ratio: single.dimensions.structure.ratio, weight: IP_PLAN_SCORE_WEIGHTS.structure },
      { ratio: single.dimensions.planning.ratio, weight: IP_PLAN_SCORE_WEIGHTS.planning },
      { ratio: single.dimensions.execution.ratio, weight: IP_PLAN_SCORE_WEIGHTS.execution },
      { ratio: single.dimensions.monitoring.ratio, weight: IP_PLAN_SCORE_WEIGHTS.monitoring },
      { ratio: single.dimensions.evidenceAndClosure.ratio, weight: IP_PLAN_SCORE_WEIGHTS.evidenceAndClosure },
      { ratio: null, weight: IP_PLAN_SCORE_WEIGHTS.continuity },
    ]);
    assert.equal(single.percentage, Math.round(manual));
    assert.ok(single.findings.some((f) => f.id === 'improvement-plan-insufficient-continuity'));
  });

  it('C-27: dos años → continuity evaluable = 1', () => {
    const r = computeImprovementPlanScore({
      plans: [completePlan(), completePlan({ year: 2025, period: '2025', startDate: '2025-01-01', endDate: '2025-12-31' })],
      now: NOW,
    });
    assert.equal(r.dimensions.continuity.ratio, 1);
    assert.equal(r.evaluatedPeriod, '2025–2026');
    assert.ok(!r.findings.some((f) => f.id === 'improvement-plan-insufficient-continuity'));
  });

  it('C-28: año derivable de startDate cuando no hay year/period', () => {
    assert.equal(derivePlanYear({ _id: 'x', startDate: '2025-03-10' }), 2025);
    const r = computeImprovementPlanScore({
      plans: [completePlan({ year: undefined, period: undefined, startDate: '2026-01-01' }), completePlan({ year: 2025, period: '2025', startDate: '2025-01-01' })],
      now: NOW,
    });
    assert.equal(r.dimensions.continuity.ratio, 1);
  });
});

// ── Time ────────────────────────────────────────────────────────────────────

describe('IP714-SCORING — Time (now inyectado)', () => {
  it('T-29: overdue de actividad cambia con now (determinístico)', () => {
    const a = activity({ status: 'IN_PROGRESS', dueDate: '2026-06-30' });
    assert.equal(isImprovementPlanActivityOverdue(a, new Date('2026-06-01')), false);
    assert.equal(isImprovementPlanActivityOverdue(a, new Date('2026-07-01')), true);
    const p = plan({ activities: [a] });
    assert.equal(isImprovementPlanOverdue(p, new Date('2026-06-01')), false);
    assert.equal(isImprovementPlanOverdue(p, new Date('2027-01-01')), true);
  });

  it('T-30: COMPLETED/CANCELLED nunca vencidas aunque dueDate haya pasado', () => {
    const now = new Date('2027-01-01');
    assert.equal(isImprovementPlanActivityOverdue(activity({ status: 'COMPLETED', dueDate: '2026-01-01' }), now), false);
    assert.equal(isImprovementPlanActivityOverdue(activity({ status: 'CANCELLED', dueDate: '2026-01-01' }), now), false);
    assert.equal(isImprovementPlanOverdue(plan({ status: 'CLOSED', endDate: '2026-01-01' }), now), false);
    assert.equal(isImprovementPlanOverdue(plan({ status: 'CANCELLED', endDate: '2026-01-01' }), now), false);
  });
});

// ── Stability ───────────────────────────────────────────────────────────────

describe('IP714-SCORING — Stability', () => {
  it('ST-31: mismo input + mismo now → mismo resultado (deepEqual)', () => {
    const plans = [completePlan(), plan()];
    const r1 = computeImprovementPlanScore({ plans: JSON.parse(JSON.stringify(plans)), now: NOW });
    const r2 = computeImprovementPlanScore({ plans: JSON.parse(JSON.stringify(plans)), now: NOW });
    assert.deepEqual(r1, r2);
  });

  it('ST: arrays vacíos y datos incompletos no lanzan excepciones', () => {
    assert.doesNotThrow(() => computeImprovementPlanScore({ plans: [], now: NOW }));
    assert.doesNotThrow(() => computeImprovementPlanScore({ plans: [{} as IpPlanLike], now: NOW }));
    assert.doesNotThrow(() => computeImprovementPlanScore({ plans: [{ _id: 'x', activities: [{}] }], now: NOW }));
  });
});

// ── Boundaries (fronteras inter-estándares) ─────────────────────────────────

describe('IP714-SCORING — Boundaries', () => {
  it('BD-32: origin ACCIDENT/AUDIT/MANAGEMENT_REVIEW producen EXACTAMENTE el mismo score (el origen es trazabilidad, no insumo)', () => {
    const accident = computeImprovementPlanScore({ plans: [plan({ origin: 'ACCIDENT' })], now: NOW });
    const audit = computeImprovementPlanScore({ plans: [plan({ origin: 'AUDIT' })], now: NOW });
    const review = computeImprovementPlanScore({ plans: [plan({ origin: 'MANAGEMENT_REVIEW' })], now: NOW });
    assert.equal(accident.percentage, audit.percentage);
    assert.equal(accident.percentage, review.percentage);
  });

  it('BD-33: origin MANAGEMENT_REVIEW con referencia a la revisión NO altera el score (no se puntúa 6.1.3)', () => {
    const withRef = computeImprovementPlanScore({ plans: [plan({ origin: 'MANAGEMENT_REVIEW', originReferenceId: '507f1f77bcf86cd7994390dd' })], now: NOW });
    const withoutRef = computeImprovementPlanScore({ plans: [plan({ origin: 'MANAGEMENT_REVIEW' })], now: NOW });
    assert.equal(withRef.percentage, withoutRef.percentage);
  });

  it('BD-34: origin AUDIT con referencia al hallazgo NO altera el score (no se puntúa 6.1.2)', () => {
    const withRef = computeImprovementPlanScore({ plans: [plan({ origin: 'AUDIT', originReferenceId: '507f1f77bcf86cd7994390ee' })], now: NOW });
    const withoutRef = computeImprovementPlanScore({ plans: [plan({ origin: 'AUDIT' })], now: NOW });
    assert.equal(withRef.percentage, withoutRef.percentage);
  });

  it('ST: identidad oficial del scorer', () => {
    assert.equal(IP_PLAN_MODULE, 'improvement-plan');
    assert.equal(IP_PLAN_STANDARD_CODE, '7.1.4');
    assert.equal(IP_PLAN_STANDARD_TITLE, 'Plan de mejoramiento');
    assert.equal(IP_PLAN_FORMULA, 'dimensions:v1');
    assert.equal(IP_PLAN_COMPLIANCE_TARGET, 90);
    assert.deepEqual(Object.values(IP_PLAN_SCORE_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  });
});
