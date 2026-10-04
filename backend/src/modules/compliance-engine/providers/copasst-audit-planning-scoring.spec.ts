import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  COPASST_AUDIT_PLANNING_MODULE,
  COPASST_AUDIT_PLANNING_STANDARD_CODE,
  COPASST_AUDIT_PLANNING_SCORE_WEIGHTS,
  computeCopasstAuditPlanningScore,
  isEvaluablePlanning,
  redistributeWeightedScore,
  type CopasstAuditPlanningLike,
} from './copasst-audit-planning-scoring';

/**
 * E2 (6.1.4) — Tests del scorer puro de la Planificación de auditorías
 * COPASST. Función PURA: determinista, sin Mongo (patrón
 * management-review-direction-scoring.spec / annual-audit-scoring).
 */

const NOW = new Date('2026-06-15T12:00:00.000Z');

const FULL_ITEM = {
  _id: 'item-1',
  title: 'Auditoría interna Q3 con COPASST',
  plannedDate: '2026-09-01',
  auditorUserId: '64a0000000000000000000f1',
  auditorUserSnapshot: 'Auditor Uno',
  responsibleUserId: '64a0000000000000000000f2',
  responsibleUserSnapshot: 'Responsable SST',
  objective: 'Verificar implementación del plan anual',
  scope: 'Todas las sedes',
  criteria: 'Resolución 0312 y plan anual',
  methodology: 'Lista de verificación y entrevistas',
  copasstParticipation: {
    required: true,
    participated: true,
    participationDate: '2026-09-01',
    participants: [{ nameSnapshot: 'Presidente COPASST', role: 'PRESIDENTE' }],
    observations: 'El comité acompañó la verificación.',
  },
  status: 'PLANNED',
};

function buildPlanning(overrides: Partial<CopasstAuditPlanningLike> = {}): CopasstAuditPlanningLike {
  return {
    _id: 'plan-1',
    planningCode: 'PAC-2026-01',
    title: 'Planificación de auditorías COPASST 2026',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    scope: 'SG-SST completo',
    objectives: 'Verificar el cumplimiento del plan anual',
    criteria: 'Resolución 0312 de 2019',
    methodology: 'Auditorías internas con apoyo del COPASST',
    responsibleUserId: '64a0000000000000000000f2',
    responsibleUserSnapshot: 'Responsable SST',
    copasstPeriodId: '64a0000000000000000000c9',
    copasstPeriodSnapshot: 'Vigencia 2026-2027',
    status: 'PLANNED',
    items: [{ ...FULL_ITEM }],
    createdBy: '64a0000000000000000000f2',
    createdBySnapshot: 'owner@test.com',
    createdAt: '2026-01-10T00:00:00.000Z',
    ...overrides,
  } as CopasstAuditPlanningLike;
}

// ── Contrato ────────────────────────────────────────────────────────────────

describe('CAP614-SCORER: contrato y pesos', () => {
  it('módulo, código de estándar y fórmula oficiales', () => {
    assert.equal(COPASST_AUDIT_PLANNING_MODULE, 'copasst-audit-planning');
    assert.equal(COPASST_AUDIT_PLANNING_STANDARD_CODE, '6.1.4');
  });

  it('las 5 dimensiones oficiales suman exactamente 100 (25/20/25/15/15)', () => {
    const w = COPASST_AUDIT_PLANNING_SCORE_WEIGHTS;
    assert.deepEqual(w, { completeness: 25, schedule: 20, copasstParticipation: 25, traceability: 15, recommendations: 15 });
    assert.equal(Object.values(w).reduce((a, b) => a + b, 0), 100);
  });

  it('sin planificaciones → NO_DATA con porcentaje 0 y razón no-plannings', () => {
    const r = computeCopasstAuditPlanningScore({ plannings: [], now: NOW });
    assert.equal(r.noData, true);
    assert.equal(r.noDataReason, 'no-plannings');
    assert.equal(r.percentage, 0);
    assert.ok(r.findings.some((f) => f.id === 'copasst-audit-planning-no-data'));
  });

  it('planificación DRAFT vacía (sin items significativos) → NO_DATA, no cumplimiento artificial', () => {
    const r = computeCopasstAuditPlanningScore({
      plannings: [buildPlanning({ status: 'DRAFT', items: [], planningCode: undefined })],
      now: NOW,
    });
    assert.equal(r.noData, true);
    assert.equal(r.noDataReason, 'no-evaluable-plannings');
    assert.equal(r.percentage, 0);
    assert.ok(r.findings.some((f) => f.id === 'copasst-audit-planning-no-evaluable-plannings'));
  });

  it('planificación completa y evaluable → score alto (≥90) con metadata de vigencia', () => {
    const r = computeCopasstAuditPlanningScore({ plannings: [buildPlanning()], now: NOW });
    assert.equal(r.noData, false);
    assert.ok(r.percentage >= 90, `esperado ≥90, obtenido ${r.percentage}`);
    assert.equal(r.evaluatedPeriod, '2026');
    assert.ok(r.latestPlanning?.title?.includes('COPASST'));
  });

  it('planificación existente pero incompleta → score parcial (ni NO_DATA ni 100)', () => {
    const incomplete = buildPlanning({
      scope: undefined,
      criteria: undefined,
      methodology: undefined,
      copasstPeriodId: undefined,
      copasstPeriodSnapshot: undefined,
      items: [
        {
          ...FULL_ITEM,
          copasstParticipation: { required: true, participated: false },
        },
      ],
    });
    const r = computeCopasstAuditPlanningScore({ plannings: [incomplete], now: NOW });
    assert.equal(r.noData, false);
    assert.ok(r.percentage > 0 && r.percentage < 90, `esperado parcial, obtenido ${r.percentage}`);
  });

  it('isEvaluablePlanning: período inválido o sin items con sentido NO es evaluable', () => {
    assert.equal(isEvaluablePlanning(buildPlanning()), true);
    // startDate > endDate
    assert.equal(isEvaluablePlanning(buildPlanning({ startDate: '2026-12-31', endDate: '2026-01-01' })), false);
    // Sin título
    assert.equal(isEvaluablePlanning(buildPlanning({ title: undefined })), false);
    // Item sin fecha
    assert.equal(isEvaluablePlanning(buildPlanning({ items: [{ ...FULL_ITEM, plannedDate: undefined }] })), false);
    // Único item cancelado
    assert.equal(isEvaluablePlanning(buildPlanning({ items: [{ ...FULL_ITEM, status: 'CANCELLED' }] })), false);
    // Item fuera del período
    assert.equal(isEvaluablePlanning(buildPlanning({ items: [{ ...FULL_ITEM, plannedDate: '2027-06-01' }] })), false);
  });
});

// ── Dimensiones ─────────────────────────────────────────────────────────────

describe('CAP614-SCORER: dimensiones', () => {
  it('D1 completitud: falta metodología/responsable baja la dimensión (25%)', () => {
    const r = computeCopasstAuditPlanningScore({
      plannings: [buildPlanning({ methodology: undefined, responsibleUserId: undefined, responsibleUserSnapshot: undefined })],
      now: NOW,
    });
    assert.equal(r.dimensions.completeness.subchecks!.satisfied, 5);
    assert.ok(r.findings.some((f) => f.id === 'copasst-audit-planning-completeness-incomplete'));
  });

  it('D2 programación: items sin fecha o sin auditor/responsable y estado DRAFT bajan la dimensión (20%)', () => {
    const r = computeCopasstAuditPlanningScore({
      plannings: [buildPlanning({ status: 'DRAFT', items: [{ ...FULL_ITEM, auditorUserId: undefined, auditorUserSnapshot: undefined, responsibleUserId: undefined, responsibleUserSnapshot: undefined }] })],
      now: NOW,
    });
    // Subcheck (c) cobertura de fechas = 1/1 ≥60% ✓; (a) ✓; (b) ✗ sin roles; (d) ✗ DRAFT.
    assert.equal(r.dimensions.schedule.subchecks!.satisfied, 2);
  });

  it('D3 participación COPASST: sin participación declarada → 0 en la dimensión (25%) + finding', () => {
    const r = computeCopasstAuditPlanningScore({
      plannings: [buildPlanning({ items: [{ ...FULL_ITEM, copasstParticipation: { required: true, participated: false } }] })],
      now: NOW,
    });
    // Solo la referencia al período COPASST (subcheck c) sigue presente.
    assert.equal(r.dimensions.copasstParticipation.subchecks!.satisfied, 1);
    assert.ok(r.findings.some((f) => f.id === 'copasst-audit-planning-copasst-participation-incomplete'));
  });

  it('D3 participación COPASST: participated=true sin fecha/participantes/observaciones NO acredita', () => {
    const r = computeCopasstAuditPlanningScore({
      plannings: [buildPlanning({ items: [{ ...FULL_ITEM, copasstParticipation: { required: true, participated: true } }] })],
      now: NOW,
    });
    assert.equal(r.dimensions.copasstParticipation.subchecks!.satisfied, 1); // solo referencia al período
  });

  it('D4 trazabilidad: items sin alcance/criterios ni metodología bajan la dimensión (15%)', () => {
    const r = computeCopasstAuditPlanningScore({
      plannings: [buildPlanning({
        planningCode: undefined,
        items: [{ ...FULL_ITEM, scope: undefined, criteria: undefined, methodology: undefined }],
      })],
      now: NOW,
    });
    assert.ok(r.dimensions.traceability.subchecks!.satisfied < 5);
    assert.ok(r.findings.some((f) => f.id === 'copasst-audit-planning-traceability-incomplete'));
  });

  it('D5 seguimiento/continuidad: una vigencia → null (se REDISTRIBUYE); dos vigencias → 1', () => {
    const one = computeCopasstAuditPlanningScore({ plannings: [buildPlanning()], now: NOW });
    assert.equal(one.dimensions.recommendations.ratio, null);

    const twoYears = computeCopasstAuditPlanningScore({
      plannings: [
        buildPlanning(),
        buildPlanning({ _id: 'plan-2025', endDate: '2025-12-31', startDate: '2025-01-01', items: [{ ...FULL_ITEM, plannedDate: '2025-09-01' }] }),
      ],
      now: NOW,
    });
    assert.equal(twoYears.dimensions.recommendations.ratio, 1);
    assert.ok(twoYears.findings.every((f) => f.id !== 'copasst-audit-planning-history-limited'));
  });

  it('redistribución: dimensiones null salen del denominador (patrón redistributeWeightedScore)', () => {
    // Caso base: con una vigencia D5 es null → las 4 restantes (85) son el denominador.
    const one = computeCopasstAuditPlanningScore({ plannings: [buildPlanning()], now: NOW });
    const manual = redistributeWeightedScore([
      { ratio: one.dimensions.completeness.ratio, weight: 25 },
      { ratio: one.dimensions.schedule.ratio, weight: 20 },
      { ratio: one.dimensions.copasstParticipation.ratio, weight: 25 },
      { ratio: one.dimensions.traceability.ratio, weight: 15 },
      { ratio: one.dimensions.recommendations.ratio, weight: 15 },
    ]);
    assert.equal(one.percentage, manual);
    // null puro → 0.
    assert.equal(redistributeWeightedScore([{ ratio: null, weight: 50 }]), 0);
    // 100% puro → 100.
    assert.equal(redistributeWeightedScore([{ ratio: 1, weight: 50 }]), 100);
  });

  it('múltiples planificaciones: solo la evaluable más reciente define D1–D4 (el volumen no infla)', () => {
    const old = buildPlanning({
      _id: 'plan-2025',
      planningCode: 'PAC-2025-01',
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      items: [{ ...FULL_ITEM, plannedDate: '2025-09-01' }],
      // Antigua deliberadamente pobre.
      scope: undefined,
      criteria: undefined,
      methodology: undefined,
      copasstPeriodId: undefined,
      copasstPeriodSnapshot: undefined,
    });
    const r = computeCopasstAuditPlanningScore({ plannings: [old, buildPlanning()], now: NOW });
    assert.equal(r.latestPlanning?.id, 'plan-1');
    assert.ok(r.dimensions.completeness.subchecks!.satisfied >= 6);
  });
});

// ── Findings accionables y counters ─────────────────────────────────────────

describe('CAP614-SCORER: findings y counters', () => {
  it('items sin fecha generan finding específico (no genérico)', () => {
    const r = computeCopasstAuditPlanningScore({
      plannings: [buildPlanning({ items: [FULL_ITEM, { ...FULL_ITEM, _id: 'item-2', plannedDate: undefined, title: 'Auditoría sin fecha' }] })],
      now: NOW,
    });
    assert.ok(r.counters.itemsWithoutDate >= 1);
    assert.ok(r.findings.some((f) => f.id === 'copasst-audit-planning-items-without-date'));
  });

  it('items con fecha vencida y sin cierre generan finding HIGH derivado', () => {
    const r = computeCopasstAuditPlanningScore({
      plannings: [buildPlanning({ items: [{ ...FULL_ITEM, plannedDate: '2026-02-01' }] })],
      now: NOW,
    });
    assert.ok(r.counters.overdueItems >= 1);
    assert.ok(r.findings.some((f) => f.id === 'copasst-audit-planning-overdue-items'));
  });

  it('sin referencia al período COPASST → finding específico', () => {
    const r = computeCopasstAuditPlanningScore({
      plannings: [buildPlanning({ copasstPeriodId: undefined, copasstPeriodSnapshot: undefined })],
      now: NOW,
    });
    assert.ok(r.findings.some((f) => f.id === 'copasst-audit-planning-copasst-period-ref-missing'));
  });

  it('todos los findings son accionables: id + título + descripción específica', () => {
    const r = computeCopasstAuditPlanningScore({
      plannings: [
        buildPlanning({
          scope: undefined,
          methodology: undefined,
          copasstPeriodId: undefined,
          copasstPeriodSnapshot: undefined,
          // Item 1 completo (mantiene la planificación evaluable) + item 2 sin fecha.
          items: [FULL_ITEM, { ...FULL_ITEM, _id: 'item-2', plannedDate: undefined, title: 'Auditoría sin fecha', copasstParticipation: { required: true, participated: false } } as never],
        }),
      ],
      now: NOW,
    });
    assert.ok(r.findings.length >= 3);
    for (const f of r.findings) {
      assert.ok(f.id.startsWith('copasst-audit-planning-'));
      assert.ok(f.title.length > 5);
      assert.ok(f.description.length > 20);
      assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(f.priority));
    }
  });

  it('counters globales: estados y cobertura de items', () => {
    const r = computeCopasstAuditPlanningScore({
      plannings: [
        buildPlanning(),
        buildPlanning({ _id: 'plan-2', status: 'COMPLETED', items: [{ ...FULL_ITEM, status: 'COMPLETED', plannedDate: '2026-03-01' }] }),
        buildPlanning({ _id: 'plan-3', status: 'CANCELLED', items: [] }),
      ],
      now: NOW,
    });
    assert.equal(r.counters.planningsTotal, 3);
    assert.equal(r.counters.planningsCompleted, 1);
    assert.equal(r.counters.planningsCancelled, 1);
    assert.equal(r.counters.itemsTotal, 2);
    assert.equal(r.counters.itemsCompleted, 1);
  });
});
