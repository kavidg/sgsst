import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ImprovementPlansService } from './improvement-plans.service';
import {
  IMPROVEMENT_PLAN_ACTIVITY_TRANSITIONS,
  IMPROVEMENT_PLAN_TRANSITIONS,
  ImprovementPlanActivityStatus,
  ImprovementPlanStatus,
  isActivityTransitionValid,
  isImprovementPlanActivityOverdue,
  isImprovementPlanOverdue,
  isImprovementPlanTransitionValid,
} from './schemas/improvement-plan-lifecycle.schema';
import { ImprovementPlanHistoryAction } from './schemas/improvement-plan-history.schema';
import { ImprovementPlanStatus as PlanStatusEnum } from './schemas/improvement-plan.schema';

/**
 * E1 (7.1.4) — Tests del dominio IMPROVEMENT-PLANS (Plan de mejoramiento).
 *
 * Patrón: mocks del model de Mongoose (node:test — infraestructura del repo).
 * Cobertura: CRUD, tenant isolation (cross-tenant 404, responsables/documentos
 * de otra empresa), lifecycle del plan y actividades (transiciones válidas/
 * inválidas/terminalidad), reglas de cierre, evidencia, follow-up, monitoring,
 * history append-only y compatibilidad (programs intacto; sin scoring).
 */

const TENANT = '507f1f77bcf86cd799439012';
const OTHER_TENANT = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OWNER_ID = '507f1f77bcf86cd7994390aa';
const PLAN_ID = '507f1f77bcf86cd799439099';

const ACTOR = { userId: new (require('mongoose').Types.ObjectId)(OWNER_ID), userEmail: 'owner@test.com' };

function createMockPlan(overrides: Record<string, unknown> = {}) {
  return {
    _id: PLAN_ID,
    companyId: TENANT,
    code: 'PM-2026-001',
    title: 'Plan de mejoramiento 2026',
    description: 'Plan consolidado del SG-SST',
    period: '2026',
    year: 2026,
    origin: 'AUDIT',
    priority: 'HIGH',
    objectives: [],
    activities: [],
    resources: [],
    monitoring: [],
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    status: ImprovementPlanStatus.DRAFT,
    save: async function () {
      return this;
    },
    ...overrides,
  };
}

function createMockModel(instances: ReturnType<typeof createMockPlan>[]) {
  const chain = {
    sort: () => chain,
    exec: async () => instances,
  };
  return {
    find: (_q?: unknown) => chain,
    findOne: (q?: { _id?: unknown; companyId?: unknown }) => ({
      exec: async () =>
        instances.find((p) => String(p._id) === String(q?._id) && String(p.companyId) === String(q?.companyId)) ?? null,
    }),
    create: async (doc: Record<string, unknown>) => ({ _id: PLAN_ID, ...doc }),
    deleteMany: async () => ({}),
    deleteOne: async () => ({}),
  };
}

function createService(instances: ReturnType<typeof createMockPlan>[], opts?: { userInTenant?: boolean; docFound?: boolean }) {
  const model = createMockModel(instances);
  const history: Array<Record<string, unknown>> = [];
  const historyModel = { create: async (doc: Record<string, unknown>) => { history.push(doc); } };
  const documentMasterModel = {
    findOne: (q?: { _id?: unknown; companyId?: unknown }) => ({
      select: () => ({
        exec: async () =>
          opts?.docFound === false || String(q?.companyId) !== TENANT
            ? null
            : { _id: q?._id, code: 'DOC-01', name: 'Plan de mejoramiento' },
      }),
    }),
  };
  const userModel = {
    countDocuments: (_q?: unknown) => ({
      exec: async () => (opts?.userInTenant === false ? 0 : 1),
    }),
    findOne: () => ({
      select: () => ({
        exec: async () => ({ firstName: 'Ana', lastName: 'Gómez', email: 'ana@test.com' }),
      }),
    }),
  };
  const service = new ImprovementPlansService(
    model as any,
    historyModel as any,
    userModel as any,
    documentMasterModel as any,
  );
  return { service, history };
}

/** Fuente del service sin comentarios (para source-checks a nivel de código). */
function serviceSourceWithoutComments(): string {
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path') as typeof import('node:path');
  const raw = readFileSync(
    join(__dirname, 'improvement-plans.service.ts').replace('/dist-test/', '/src/'),
    'utf8',
  );
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

// ── Lifecycle: transiciones ─────────────────────────────────────────────────

describe('IP714 — Lifecycle del plan', () => {
  it('LC-001: transiciones válidas DRAFT→SUBMITTED→IN_PROGRESS→COMPLETED→CLOSED', () => {
    assert.equal(isImprovementPlanTransitionValid(ImprovementPlanStatus.DRAFT, ImprovementPlanStatus.SUBMITTED), true);
    assert.equal(isImprovementPlanTransitionValid(ImprovementPlanStatus.SUBMITTED, ImprovementPlanStatus.IN_PROGRESS), true);
    assert.equal(isImprovementPlanTransitionValid(ImprovementPlanStatus.IN_PROGRESS, ImprovementPlanStatus.COMPLETED), true);
    assert.equal(isImprovementPlanTransitionValid(ImprovementPlanStatus.COMPLETED, ImprovementPlanStatus.CLOSED), true);
  });

  it('LC-002: cancelación válida desde DRAFT/SUBMITTED/IN_PROGRESS', () => {
    assert.equal(isImprovementPlanTransitionValid(ImprovementPlanStatus.DRAFT, ImprovementPlanStatus.CANCELLED), true);
    assert.equal(isImprovementPlanTransitionValid(ImprovementPlanStatus.SUBMITTED, ImprovementPlanStatus.CANCELLED), true);
    assert.equal(isImprovementPlanTransitionValid(ImprovementPlanStatus.IN_PROGRESS, ImprovementPlanStatus.CANCELLED), true);
  });

  it('LC-003: transiciones inválidas (saltos y CLOSED solo desde COMPLETED)', () => {
    assert.equal(isImprovementPlanTransitionValid(ImprovementPlanStatus.DRAFT, ImprovementPlanStatus.COMPLETED), false);
    assert.equal(isImprovementPlanTransitionValid(ImprovementPlanStatus.DRAFT, ImprovementPlanStatus.CLOSED), false);
    assert.equal(isImprovementPlanTransitionValid(ImprovementPlanStatus.SUBMITTED, ImprovementPlanStatus.COMPLETED), false);
    assert.equal(isImprovementPlanTransitionValid(ImprovementPlanStatus.IN_PROGRESS, ImprovementPlanStatus.CLOSED), false);
  });

  it('LC-004: terminales sin reapertura', () => {
    assert.deepEqual(IMPROVEMENT_PLAN_TRANSITIONS[ImprovementPlanStatus.CLOSED], []);
    assert.deepEqual(IMPROVEMENT_PLAN_TRANSITIONS[ImprovementPlanStatus.CANCELLED], []);
  });

  it('LC-005: transición inválida en service → BadRequestException', async () => {
    const { service } = createService([createMockPlan()]);
    await assert.rejects(
      service.changeStatus(TENANT as any, PLAN_ID, { status: ImprovementPlanStatus.CLOSED } as any, ACTOR),
      /Transición inválida/,
    );
  });

  it('LC-006: misma etapa → BadRequestException', async () => {
    const { service } = createService([createMockPlan()]);
    await assert.rejects(
      service.changeStatus(TENANT as any, PLAN_ID, { status: ImprovementPlanStatus.DRAFT } as any, ACTOR),
      /ya está en estado/,
    );
  });

  it('LC-007: estado inexistente → BadRequestException', async () => {
    const { service } = createService([createMockPlan()]);
    await assert.rejects(
      service.changeStatus(TENANT as any, PLAN_ID, { status: 'FLYING' } as any, ACTOR),
      /Estado inválido/,
    );
  });
});

// ── Lifecycle de actividades ────────────────────────────────────────────────

describe('IP714 — Lifecycle de actividades', () => {
  it('AC-001: transiciones válidas de actividad', () => {
    assert.equal(isActivityTransitionValid(ImprovementPlanActivityStatus.PENDING, ImprovementPlanActivityStatus.IN_PROGRESS), true);
    assert.equal(isActivityTransitionValid(ImprovementPlanActivityStatus.PENDING, ImprovementPlanActivityStatus.CANCELLED), true);
    assert.equal(isActivityTransitionValid(ImprovementPlanActivityStatus.IN_PROGRESS, ImprovementPlanActivityStatus.COMPLETED), true);
    assert.equal(isActivityTransitionValid(ImprovementPlanActivityStatus.IN_PROGRESS, ImprovementPlanActivityStatus.CANCELLED), true);
  });

  it('AC-002: transiciones inválidas (COMPLETED/CANCELLED terminales)', () => {
    assert.deepEqual(IMPROVEMENT_PLAN_ACTIVITY_TRANSITIONS[ImprovementPlanActivityStatus.COMPLETED], []);
    assert.deepEqual(IMPROVEMENT_PLAN_ACTIVITY_TRANSITIONS[ImprovementPlanActivityStatus.CANCELLED], []);
    assert.equal(isActivityTransitionValid(ImprovementPlanActivityStatus.PENDING, ImprovementPlanActivityStatus.COMPLETED), false);
  });

  it('AC-003: COMPLETED exige executionDate', async () => {
    const { service } = createService([
      createMockPlan({
        status: ImprovementPlanStatus.IN_PROGRESS,
        activities: [{ activityId: 'ACT-001', description: 'X', status: 'IN_PROGRESS' }],
      }),
    ]);
    await assert.rejects(
      service.changeActivityStatus(TENANT as any, PLAN_ID, 'ACT-001', { status: 'COMPLETED' } as any, ACTOR),
      /executionDate/,
    );
  });

  it('AC-004: COMPLETED con executionDate (progreso=100)', async () => {
    const { service } = createService([
      createMockPlan({
        status: ImprovementPlanStatus.IN_PROGRESS,
        activities: [{ activityId: 'ACT-001', description: 'X', status: 'IN_PROGRESS' }],
      }),
    ]);
    const saved = (await service.changeActivityStatus(
      TENANT as any,
      PLAN_ID,
      'ACT-001',
      { status: 'COMPLETED', executionDate: '2026-08-01' } as any,
      ACTOR,
    )) as any;
    assert.equal(saved.activities[0].status, 'COMPLETED');
    assert.equal(saved.activities[0].progress, 100);
    assert.ok(saved.activities[0].executionDate);
  });

  it('AC-005: actividad terminal no admite modificación', async () => {
    const { service } = createService([
      createMockPlan({
        status: ImprovementPlanStatus.IN_PROGRESS,
        activities: [{ activityId: 'ACT-001', description: 'X', status: 'COMPLETED', executionDate: new Date('2026-08-01') }],
      }),
    ]);
    await assert.rejects(
      service.updateActivity(TENANT as any, PLAN_ID, 'ACT-001', { description: 'Y' } as any, ACTOR),
      /terminal/,
    );
  });

  it('AC-006: dueDate anterior a plannedDate → rechazado', async () => {
    const { service } = createService([createMockPlan({ status: ImprovementPlanStatus.IN_PROGRESS })]);
    await assert.rejects(
      service.createActivity(
        TENANT as any,
        PLAN_ID,
        { description: 'X', plannedDate: '2026-09-01', dueDate: '2026-08-01' } as any,
        ACTOR,
      ),
      /no puede ser anterior/,
    );
  });
});

// ── Overdue derivado ────────────────────────────────────────────────────────

describe('IP714 — Overdue derivado (NUNCA persistido)', () => {
  it('OD-001: actividad con dueDate pasada y activa → vencida', () => {
    assert.equal(isImprovementPlanActivityOverdue({ dueDate: '2026-01-01', status: 'PENDING' }, new Date('2026-09-26T12:00:00Z')), true);
  });

  it('OD-002: actividad COMPLETED/CANCELLED nunca vencida', () => {
    assert.equal(isImprovementPlanActivityOverdue({ dueDate: '2026-01-01', status: 'COMPLETED' }, new Date('2026-09-26T12:00:00Z')), false);
    assert.equal(isImprovementPlanActivityOverdue({ dueDate: '2026-01-01', status: 'CANCELLED' }, new Date('2026-09-26T12:00:00Z')), false);
  });

  it('OD-003: plan con endDate pasada y no terminal → vencido (derivado)', () => {
    assert.equal(isImprovementPlanOverdue({ endDate: '2026-06-30', status: 'IN_PROGRESS' }, new Date('2026-09-26T12:00:00Z')), true);
    assert.equal(isImprovementPlanOverdue({ endDate: '2026-06-30', status: 'COMPLETED' }, new Date('2026-09-26T12:00:00Z')), false);
    assert.equal(isImprovementPlanOverdue({ endDate: '2026-06-30', status: 'CLOSED' }, new Date('2026-09-26T12:00:00Z')), false);
  });
});

// ── CRUD + tenant isolation ─────────────────────────────────────────────────

describe('IP714 — CRUD y tenant isolation', () => {
  it('TN-009: create genera plan en DRAFT con snapshot server-side', async () => {
    const { service, history } = createService([]);
    const created = (await service.create(
      TENANT as any,
      {
        code: 'PM-2026-001',
        title: 'Plan 2026',
        origin: 'AUDIT',
        responsibleUserId: OWNER_ID,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      } as any,
      ACTOR,
    )) as any;
    assert.equal(created.status, PlanStatusEnum.DRAFT);
    assert.equal(created.responsibleUserSnapshot, 'Ana Gómez');
    assert.equal(history[0].action, ImprovementPlanHistoryAction.CREATE);
  });

  it('TN-002: code duplicado en el tenant → BadRequestException', async () => {
    const { service } = createService([]);
    // Simula E11000 del índice único {companyId, code}.
    (service as any).planModel.create = async () => {
      const err = new Error('E11000') as { code?: number };
      err.code = 11000;
      throw err;
    };
    await assert.rejects(
      service.create(
        TENANT as any,
        { code: 'PM-2026-001', title: 'Plan', origin: 'OTHER', startDate: '2026-01-01', endDate: '2026-12-31' } as any,
        ACTOR,
      ),
      /ya existe en esta empresa/,
    );
  });

  it('TN-003: cross-tenant read → 404', async () => {
    const { service } = createService([createMockPlan()]);
    await assert.rejects(service.findById(OTHER_TENANT as any, PLAN_ID), /not found/);
  });

  it('TN-004: cross-tenant update → 404', async () => {
    const { service } = createService([createMockPlan()]);
    await assert.rejects(
      service.update(OTHER_TENANT as any, PLAN_ID, { title: 'Hack' } as any, ACTOR),
      /not found/,
    );
  });

  it('TN-005: cross-tenant delete → 404', async () => {
    const { service } = createService([createMockPlan()]);
    await assert.rejects(service.remove(OTHER_TENANT as any, PLAN_ID, ACTOR), /not found/);
  });

  it('TN-006: responsable de otra empresa → rechazado (plan y actividad)', async () => {
    const { service } = createService([createMockPlan({ status: ImprovementPlanStatus.IN_PROGRESS })], { userInTenant: false });
    await assert.rejects(
      service.create(TENANT as any, { code: 'PM-2', title: 'T', origin: 'OTHER', responsibleUserId: OWNER_ID, startDate: '2026-01-01', endDate: '2026-12-31' } as any, ACTOR),
      /no pertenece a esta empresa/,
    );
    await assert.rejects(
      service.createActivity(TENANT as any, PLAN_ID, { description: 'X', responsibleUserId: OWNER_ID } as any, ACTOR),
      /no pertenece a esta empresa/,
    );
  });

  it('TN-007: documento de otra empresa → NotFound (tenant-safe)', async () => {
    const { service } = createService(
      [createMockPlan({ status: ImprovementPlanStatus.IN_PROGRESS, activities: [{ activityId: 'ACT-001', description: 'X', status: 'PENDING' }] })],
      { docFound: false },
    );
    await assert.rejects(
      service.addActivityEvidence(TENANT as any, PLAN_ID, 'ACT-001', { documentId: '507f1f77bcf86cd7994390bb' } as any, ACTOR),
      /not found/,
    );
  });

  it('TN-008: history cross-tenant → 404', async () => {
    const { service } = createService([createMockPlan()]);
    await assert.rejects(service.getHistory(OTHER_TENANT as any, PLAN_ID), /not found/);
  });
});

// ── Objetivos / recursos / monitoring / follow-up / cierre ──────────────────

describe('IP714 — Estructura del plan', () => {
  it('ES-001: objetivos con objectiveId server-side (OBJ-001…)', async () => {
    const { service } = createService([createMockPlan()]);
    const saved = (await service.update(
      TENANT as any,
      PLAN_ID,
      {
        objectives: [
          { description: 'Reducir accidentalidad', target: '-20%', indicator: 'IL' },
          { description: 'Cumplir legal', indicator: 'Índice legal' },
        ],
      } as any,
      ACTOR,
    )) as any;
    assert.deepEqual(saved.objectives.map((o: any) => o.objectiveId), ['OBJ-001', 'OBJ-002']);
  });

  it('ES-002: monitoring con MON-001 y fecha futura rechazada', async () => {
    const { service } = createService([createMockPlan()]);
    const saved = (await service.addMonitoring(TENANT as any, PLAN_ID, { date: '2026-03-01', progress: 40 } as any, ACTOR)) as any;
    assert.equal(saved.monitoring[0].monitoringId, 'MON-001');
    await assert.rejects(
      service.addMonitoring(TENANT as any, PLAN_ID, { date: '2999-01-01' } as any, ACTOR),
      /futura/,
    );
  });

  it('ES-003: follow-up con percepción de efectividad (fecha futura rechazada)', async () => {
    const { service } = createService([
      createMockPlan({ status: ImprovementPlanStatus.IN_PROGRESS, activities: [{ activityId: 'ACT-001', description: 'X', status: 'IN_PROGRESS' }] }),
    ]);
    const saved = (await service.registerActivityFollowUp(
      TENANT as any,
      PLAN_ID,
      'ACT-001',
      { implementationStatus: 'ON_TRACK', perceivedEffectiveness: 'INDETERMINADA' } as any,
      ACTOR,
    )) as any;
    assert.equal(saved.activities[0].followUp.perceivedEffectiveness, 'INDETERMINADA');
    await assert.rejects(
      service.registerActivityFollowUp(TENANT as any, PLAN_ID, 'ACT-001', { followUpDate: '2999-01-01' } as any, ACTOR),
      /futura/,
    );
  });

  it('ES-004: evidencia exige documentId o evidenceUrl', async () => {
    const { service } = createService([
      createMockPlan({ status: ImprovementPlanStatus.IN_PROGRESS, activities: [{ activityId: 'ACT-001', description: 'X', status: 'PENDING' }] }),
    ]);
    await assert.rejects(
      service.addActivityEvidence(TENANT as any, PLAN_ID, 'ACT-001', { comment: 'solo comentario' } as any, ACTOR),
      /requiere documentId/,
    );
  });
});

// ── Reglas de cierre ────────────────────────────────────────────────────────

describe('IP714 — Reglas de cierre', () => {
  it('CL-001: COMPLETED con actividades pendientes → rechazado', async () => {
    const { service } = createService([
      createMockPlan({
        status: ImprovementPlanStatus.IN_PROGRESS,
        monitoring: [{ monitoringId: 'MON-001', date: new Date('2026-06-01') }],
        activities: [{ activityId: 'ACT-001', description: 'X', status: 'PENDING' }],
      }),
    ]);
    await assert.rejects(
      service.changeStatus(TENANT as any, PLAN_ID, { status: ImprovementPlanStatus.COMPLETED } as any, ACTOR),
      /pendiente\(s\)|en ejecución/,
    );
  });

  it('CL-002: COMPLETED sin seguimiento del plan → rechazado', async () => {
    const { service } = createService([
      createMockPlan({
        status: ImprovementPlanStatus.IN_PROGRESS,
        activities: [{ activityId: 'ACT-001', description: 'X', status: 'CANCELLED' }],
      }),
    ]);
    await assert.rejects(
      service.changeStatus(TENANT as any, PLAN_ID, { status: ImprovementPlanStatus.COMPLETED } as any, ACTOR),
      /seguimiento del plan/,
    );
  });

  it('CL-003: COMPLETED con actividad completada sin executionDate → rechazado', async () => {
    const { service } = createService([
      createMockPlan({
        status: ImprovementPlanStatus.IN_PROGRESS,
        monitoring: [{ monitoringId: 'MON-001', date: new Date('2026-06-01') }],
        activities: [{ activityId: 'ACT-001', description: 'X', status: 'COMPLETED' }],
      }),
    ]);
    await assert.rejects(
      service.changeStatus(TENANT as any, PLAN_ID, { status: ImprovementPlanStatus.COMPLETED } as any, ACTOR),
      /executionDate/,
    );
  });

  it('CL-004: COMPLETED válido sella closureDate; CLOSED desde COMPLETED con actor', async () => {
    const { service, history } = createService([
      createMockPlan({
        status: ImprovementPlanStatus.IN_PROGRESS,
        monitoring: [{ monitoringId: 'MON-001', date: new Date('2026-06-01') }],
        activities: [{ activityId: 'ACT-001', description: 'X', status: 'CANCELLED' }],
      }),
    ]);
    const completed = (await service.changeStatus(
      TENANT as any, PLAN_ID, { status: ImprovementPlanStatus.COMPLETED } as any, ACTOR,
    )) as any;
    assert.ok(completed.closureDate);
    assert.equal(history[0].action, ImprovementPlanHistoryAction.COMPLETED);

    const closed = (await service.changeStatus(
      TENANT as any, PLAN_ID, { status: ImprovementPlanStatus.CLOSED, closureObservations: 'Cierre' } as any, ACTOR,
    )) as any;
    assert.equal(closed.status, ImprovementPlanStatus.CLOSED);
    assert.equal(closed.closedByUserSnapshot, 'owner@test.com');
    assert.equal(history[1].action, ImprovementPlanHistoryAction.CLOSED);
  });

  it('CL-005: plan terminal (CLOSED) es solo lectura; DELETE solo DRAFT', async () => {
    const { service } = createService([
      createMockPlan({ status: ImprovementPlanStatus.CLOSED, closureDate: new Date('2026-09-01') }),
    ]);
    await assert.rejects(
      service.update(TENANT as any, PLAN_ID, { title: 'X' } as any, ACTOR),
      /terminal/,
    );
    await assert.rejects(
      service.remove(TENANT as any, PLAN_ID, ACTOR),
      /Solo un plan en estado DRAFT/,
    );
  });

  it('CL-006: plan COMPLETED no admite edición de contenido', async () => {
    const { service } = createService([createMockPlan({ status: ImprovementPlanStatus.COMPLETED })]);
    await assert.rejects(
      service.update(TENANT as any, PLAN_ID, { title: 'X' } as any, ACTOR),
      /COMPLETED/,
    );
  });
});

// ── History append-only ─────────────────────────────────────────────────────

describe('IP714 — History append-only', () => {
  it('HS-001: eventos con actor/tenant/planCode y acciones correctas', async () => {
    const { service, history } = createService([createMockPlan()]);
    await service.update(TENANT as any, PLAN_ID, { title: 'Nuevo título' } as any, ACTOR);
    await service.createActivity(TENANT as any, PLAN_ID, { description: 'Actividad 1' } as any, ACTOR);

    assert.equal(history.length, 2);
    assert.equal(history[0].action, ImprovementPlanHistoryAction.UPDATE);
    assert.equal(history[1].action, ImprovementPlanHistoryAction.ACTIVITY_CREATED);
    assert.equal(history[1].activityId, 'ACT-001');
    for (const e of history) {
      assert.equal(e.companyId, TENANT);
      assert.equal(e.actorSnapshot, 'owner@test.com');
      assert.equal(e.planCode, 'PM-2026-001');
    }
  });

  it('HS-002: monitoring y follow-up quedan trazados con sus ids', async () => {
    const { service, history } = createService([
      createMockPlan({
        status: ImprovementPlanStatus.IN_PROGRESS,
        activities: [{ activityId: 'ACT-001', description: 'X', status: 'IN_PROGRESS' }],
      }),
    ]);
    await service.addMonitoring(TENANT as any, PLAN_ID, { date: '2026-06-01', progress: 50 } as any, ACTOR);
    await service.registerActivityFollowUp(TENANT as any, PLAN_ID, 'ACT-001', { implementationStatus: 'ON_TRACK' } as any, ACTOR);

    assert.equal(history[0].action, ImprovementPlanHistoryAction.MONITORING_ADDED);
    assert.equal(history[0].monitoringId, 'MON-001');
    assert.equal(history[1].action, ImprovementPlanHistoryAction.FOLLOW_UP);
    assert.equal(history[1].activityId, 'ACT-001');
  });
});

// ── Compatibilidad (programs intacto; sin scoring) ──────────────────────────

describe('IP714 — Compatibilidad y alcance', () => {
  it('CP-001: el dominio NO importa SgstProgram ni dominios de otros estándares (source-check)', () => {
    const source = serviceSourceWithoutComments();
    assert.ok(!source.includes('SgstProgram'), 'sin acoplamiento con programs');
    assert.ok(!source.includes('CorrectivePreventiveAction'), 'sin acoplamiento con 7.1.1');
    assert.ok(!source.includes('ManagementImprovementAction'), 'sin acoplamiento con 7.1.2');
    assert.ok(!/\bIncident\b/.test(source), 'sin acoplamiento con 7.1.3');
    assert.ok(!source.includes('AnnualAudit'), 'sin acoplamiento con 6.1.2');
  });

  it('CP-002: el service NO calcula score ni compliance (sin scoring en E1)', () => {
    const source = serviceSourceWithoutComments();
    assert.ok(!/\bpercentage\b/.test(source), 'sin cálculo de porcentaje');
    assert.ok(!source.includes('computeScore'), 'sin scorer');
    assert.ok(!source.includes('ComplianceProvider'), 'sin provider');
  });
});
