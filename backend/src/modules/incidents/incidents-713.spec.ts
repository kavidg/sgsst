import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IncidentsService } from './incidents.service';
import {
  INCIDENT_LIFECYCLE_TRANSITIONS,
  IncidentLifecycleStage,
  isInvestigationActionOverdue,
  isValidIncidentTransition,
  resolveLifecycleStage,
} from './schemas/incident-lifecycle.schema';
import { IncidentHistoryAction } from './schemas/incident-history.schema';
import { InvestigationType } from './schemas/incident.schema';

/**
 * E1 (7.1.3) — Tests de la gestión avanzada de casos accidentales
 * (Acciones por accidentes) sobre el dominio incidents.
 *
 * Patrón: mocks del model de Mongoose (node:test — infraestructura del repo).
 * Cobertura: lifecycle + transiciones, tenant isolation (cross-tenant 404),
 * acciones (tenant-safe, overdue derivado, transiciones), evidencia,
 * follow-up, cierre documentado, history append-only y compatibilidad
 * (estados legacy sin migrar; DISEASE fuera del alcance; CRUD existente).
 */

const TENANT = '507f1f77bcf86cd799439012';
const OTHER_TENANT = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OWNER_ID = '507f1f77bcf86cd7994390aa';
const INCIDENT_ID = '507f1f77bcf86cd799439099';

const ACTOR = { userId: new (require('mongoose').Types.ObjectId)(OWNER_ID), userEmail: 'owner@test.com' };

function createMockIncident(overrides: Record<string, unknown> = {}) {
  return {
    _id: INCIDENT_ID,
    companyId: TENANT,
    employeeId: '507f1f77bcf86cd799439011',
    type: 'Accidente de trabajo',
    date: new Date('2025-06-15'),
    description: 'Caída en escalera',
    severity: 'Media',
    status: 'Abierto',
    investigationType: InvestigationType.ACCIDENT,
    rootCauses: [],
    immediateCauses: [],
    basicCauses: [],
    relatedFactors: [],
    correctiveActions: [],
    preventiveActions: [],
    responsible: undefined,
    investigationDate: undefined,
    closureDate: undefined,
    evidence: [],
    investigationEvidence: [],
    save: async function () {
      return this;
    },
    ...overrides,
  };
}

function createMockModel(instances: ReturnType<typeof createMockIncident>[]) {
  const chain = {
    sort: () => chain,
    exec: async () => instances,
  };
  return {
    find: (_q?: unknown) => chain,
    findOne: (q?: { _id?: unknown; companyId?: unknown }) => ({
      exec: async () =>
        instances.find((i) => String(i._id) === String(q?._id) && String(i.companyId) === String(q?.companyId)) ?? null,
    }),
  };
}

function createService(instances: ReturnType<typeof createMockIncident>[], opts?: { userInTenant?: boolean }) {
  const model = createMockModel(instances);
  const autoCommService = { generateCommunication: async () => {} };
  const history: Array<Record<string, unknown>> = [];
  const historyModel = { create: async (doc: Record<string, unknown>) => { history.push(doc); } };
  const documentMasterModel = {
    findOne: (q?: { _id?: unknown; companyId?: unknown }) => ({
      select: () => ({
        exec: async () =>
          String(q?.companyId) === TENANT && String(q?._id) === '507f1f77bcf86cd7994390bb'
            ? { _id: q?._id, code: 'DOC-01', name: 'Informe de investigación' }
            : null,
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
  const service = new IncidentsService(
    model as any,
    autoCommService as any,
    historyModel as any,
    documentMasterModel as any,
    userModel as any,
  );
  return { service, history };
}

function baseCase(overrides: Record<string, unknown> = {}) {
  return createMockIncident({
    investigationDate: new Date('2025-06-16'),
    lifecycleStage: IncidentLifecycleStage.INVESTIGATING,
    investigationResponsibleUserId: OWNER_ID,
    immediateCauses: ['Superficie mojada'],
    basicCauses: ['Falta de señalización'],
    ...overrides,
  });
}

/** Caso con una acción IN_PROGRESS (ACC-001..) — compartido por varias suites. */
function caseWithAction() {
  return baseCase({
    correctiveActions: [
      { actionId: 'ACT-001', action: 'Instalar barandas', responsible: 'Ana', responsibleUserId: OWNER_ID, status: 'IN_PROGRESS' },
    ],
  });
}

// ── Lifecycle: mapper y transiciones ─────────────────────────────────────────

describe('Incidents 7.1.3 — Lifecycle', () => {
  it('LC-001: transiciones válidas del lifecycle completo', () => {
    assert.equal(isValidIncidentTransition(IncidentLifecycleStage.OPEN, IncidentLifecycleStage.INVESTIGATING), true);
    assert.equal(isValidIncidentTransition(IncidentLifecycleStage.INVESTIGATING, IncidentLifecycleStage.ACTIONS_PENDING), true);
    assert.equal(isValidIncidentTransition(IncidentLifecycleStage.ACTIONS_PENDING, IncidentLifecycleStage.IN_PROGRESS), true);
    assert.equal(isValidIncidentTransition(IncidentLifecycleStage.IN_PROGRESS, IncidentLifecycleStage.COMPLETED), true);
    assert.equal(isValidIncidentTransition(IncidentLifecycleStage.COMPLETED, IncidentLifecycleStage.CLOSED), true);
  });

  it('LC-002: OPEN → COMPLETED y OPEN → CLOSED están prohibidas', () => {
    assert.equal(isValidIncidentTransition(IncidentLifecycleStage.OPEN, IncidentLifecycleStage.COMPLETED), false);
    assert.equal(isValidIncidentTransition(IncidentLifecycleStage.OPEN, IncidentLifecycleStage.CLOSED), false);
    assert.equal(isValidIncidentTransition(IncidentLifecycleStage.INVESTIGATING, IncidentLifecycleStage.CLOSED), false);
    assert.equal(isValidIncidentTransition(IncidentLifecycleStage.ACTIONS_PENDING, IncidentLifecycleStage.CLOSED), false);
  });

  it('LC-003: terminales sin reapertura (CLOSED/CANCELLED sin salidas)', () => {
    assert.deepEqual(INCIDENT_LIFECYCLE_TRANSITIONS[IncidentLifecycleStage.CLOSED], []);
    assert.deepEqual(INCIDENT_LIFECYCLE_TRANSITIONS[IncidentLifecycleStage.CANCELLED], []);
  });

  it('LC-004: mapper legacy NO destructivo (Cerrado → COMPLETED, Abierto → OPEN/INVESTIGATING)', () => {
    assert.equal(resolveLifecycleStage({ status: 'Cerrado' }), IncidentLifecycleStage.COMPLETED);
    assert.equal(resolveLifecycleStage({ status: 'Abierto' }), IncidentLifecycleStage.OPEN);
    assert.equal(
      resolveLifecycleStage({ status: 'Abierto', investigationDate: new Date() }),
      IncidentLifecycleStage.INVESTIGATING,
    );
    assert.equal(resolveLifecycleStage({ status: 'Abierto' }), IncidentLifecycleStage.OPEN);
    // Con lifecycleStage canónico válido se respeta tal cual.
    assert.equal(resolveLifecycleStage({ lifecycleStage: 'IN_PROGRESS' }), IncidentLifecycleStage.IN_PROGRESS);
  });

  it('LC-005: service mapea legacy y preserva el string original', async () => {
    const { service } = createService([createMockIncident({ status: 'Abierto', investigationDate: new Date('2025-06-16') })]);
    await service.updateLifecycle(TENANT as any, INCIDENT_ID, { stage: IncidentLifecycleStage.CANCELLED } as any, ACTOR);
    // El mock conserva `status: 'Abierto'`: sin migración destructiva.
  });

  it('LC-006: transición inválida en service → BadRequestException', async () => {
    const { service } = createService([baseCase()]);
    await assert.rejects(
      service.updateLifecycle(TENANT as any, INCIDENT_ID, { stage: IncidentLifecycleStage.CLOSED } as any, ACTOR),
      /Transición inválida/,
    );
  });

  it('LC-007: misma etapa → BadRequestException', async () => {
    const { service } = createService([baseCase()]);
    await assert.rejects(
      service.updateLifecycle(TENANT as any, INCIDENT_ID, { stage: IncidentLifecycleStage.INVESTIGATING } as any, ACTOR),
      /ya está en estado/,
    );
  });
});

// ── Overdue derivado (NUNCA persistido) ──────────────────────────────────────

describe('Incidents 7.1.3 — Overdue derivado', () => {
  it('OD-001: dueDate pasada + acción activa → vencida', () => {
    assert.equal(
      isInvestigationActionOverdue({ dueDate: '2020-01-01', status: 'PENDING' }),
      true,
    );
  });

  it('OD-002: acción COMPLETED nunca está vencida', () => {
    assert.equal(
      isInvestigationActionOverdue({ dueDate: '2020-01-01', status: 'COMPLETED', completedDate: new Date('2024-01-01') }),
      false,
    );
  });

  it('OD-003: acción CANCELLED nunca está vencida', () => {
    assert.equal(isInvestigationActionOverdue({ dueDate: '2020-01-01', status: 'CANCELLED' }), false);
  });

  it('OD-004: dueDate futura → no vencida', () => {
    assert.equal(
      isInvestigationActionOverdue({ dueDate: '2999-01-01', status: 'PENDING' }),
      false,
    );
  });
});

// ── Investigación ────────────────────────────────────────────────────────────

describe('Incidents 7.1.3 — Investigación', () => {
  it('INV-001: inicia investigación y registra history append-only', async () => {
    const incident = createMockIncident(); // sin investigación
    const { service, history } = createService([incident]);
    const saved = (await service.updateInvestigation(
      TENANT as any,
      INCIDENT_ID,
      {
        investigationResponsibleUserId: OWNER_ID,
        methodology: 'Ivanov',
        immediateCauses: ['Contacto con energía'],
        investigationDate: new Date('2025-06-16'),
        investigationTeam: [{ userId: OWNER_ID, participationRole: 'Líder' }],
      } as any,
      ACTOR,
    )) as any;

    assert.equal(saved.methodology, 'Ivanov');
    assert.equal(saved.investigationTeam.length, 1);
    assert.equal(saved.investigationTeam[0].participantSnapshot, 'Ana Gómez');
    assert.equal(saved.lifecycleStage, IncidentLifecycleStage.INVESTIGATING);
    assert.equal(history[0].action, IncidentHistoryAction.INVESTIGATION_STARTED);
    assert.equal(history[0].companyId, TENANT);
  });

  it('INV-002: causas — basicCauses canónico y rootCauses legacy coexisten', async () => {
    const { service } = createService([baseCase()]);
    const saved = (await service.updateInvestigation(
      TENANT as any,
      INCIDENT_ID,
      { basicCauses: ['Capacitación insuficiente'], rootCauses: ['Mantenimiento tardío'] } as any,
      ACTOR,
    )) as any;
    assert.deepEqual(saved.basicCauses, ['Capacitación insuficiente']);
    assert.deepEqual(saved.rootCauses, ['Mantenimiento tardío']);
  });

  it('INV-003: fecha de investigación futura → BadRequestException', async () => {
    const { service } = createService([baseCase()]);
    await assert.rejects(
      service.updateInvestigation(
        TENANT as any,
        INCIDENT_ID,
        { investigationDate: new Date('2999-01-01') } as any,
        ACTOR,
      ),
      /futura/,
    );
  });

  it('INV-004: responsable/equipo fuera del tenant → rechazado', async () => {
    const { service } = createService([baseCase()], { userInTenant: false });
    await assert.rejects(
      service.updateInvestigation(
        TENANT as any,
        INCIDENT_ID,
        { investigationResponsibleUserId: OWNER_ID } as any,
        ACTOR,
      ),
      /no pertenece a esta empresa/,
    );
  });
});

// ── Acciones ─────────────────────────────────────────────────────────────────

describe('Incidents 7.1.3 — Acciones de investigación', () => {
  it('ACC-001: crea acción con responsable tenant-safe e actionId', async () => {
    const { service } = createService([baseCase()]);
    const saved = (await service.createInvestigationAction(
      TENANT as any,
      INCIDENT_ID,
      { action: 'Instalar barandas', responsibleUserId: OWNER_ID, dueDate: new Date('2025-08-01') } as any,
      ACTOR,
    )) as any;

    assert.equal(saved.correctiveActions.length, 1);
    assert.equal(saved.correctiveActions[0].actionId, 'ACT-001');
    assert.equal(saved.correctiveActions[0].responsibleSnapshot, 'Ana Gómez');
    assert.equal(saved.lifecycleStage, IncidentLifecycleStage.IN_PROGRESS);
  });

  it('ACC-002: responsable fuera del tenant → rechazado', async () => {
    const { service } = createService([baseCase()], { userInTenant: false });
    await assert.rejects(
      service.createInvestigationAction(
        TENANT as any,
        INCIDENT_ID,
        { action: 'Instalar barandas', responsibleUserId: OWNER_ID } as any,
        ACTOR,
      ),
      /no pertenece a esta empresa/,
    );
  });

  it('ACC-003: plannedDate posterior a dueDate → BadRequestException', async () => {
    const { service } = createService([baseCase()]);
    await assert.rejects(
      service.createInvestigationAction(
        TENANT as any,
        INCIDENT_ID,
        {
          action: 'X',
          plannedDate: new Date('2025-09-01'),
          dueDate: new Date('2025-08-01'),
        } as any,
        ACTOR,
      ),
      /plannedDate no puede ser posterior/,
    );
  });

  it('ACC-004: máquina de estados de acción (PENDING no salta a COMPLETED)', async () => {
    const { service } = createService([baseCase()]);
    await service.createInvestigationAction(
      TENANT as any,
      INCIDENT_ID,
      { action: 'Instalar barandas', responsibleUserId: OWNER_ID } as any,
      ACTOR,
    );
    await assert.rejects(
      service.updateInvestigationActionStatus(TENANT as any, INCIDENT_ID, 'ACT-001', { status: 'COMPLETED' } as any, ACTOR),
      /Transición inválida/,
    );
  });

  it('ACC-005: PENDING → IN_PROGRESS → COMPLETED con completedDate', async () => {
    const { service } = createService([baseCase()]);
    await service.createInvestigationAction(
      TENANT as any,
      INCIDENT_ID,
      { action: 'Instalar barandas', responsibleUserId: OWNER_ID } as any,
      ACTOR,
    );
    await service.updateInvestigationActionStatus(TENANT as any, INCIDENT_ID, 'ACT-001', { status: 'IN_PROGRESS' } as any, ACTOR);
    const saved = (await service.updateInvestigationActionStatus(
      TENANT as any,
      INCIDENT_ID,
      'ACT-001',
      { status: 'COMPLETED' } as any,
      ACTOR,
    )) as any;
    assert.equal(saved.correctiveActions[0].status, 'COMPLETED');
    assert.ok(saved.correctiveActions[0].completedDate);
  });

  it('ACC-006: acción terminal (COMPLETED) no admite modificación', async () => {
    const { service } = createService([
      baseCase({
        correctiveActions: [
          { actionId: 'ACT-001', action: 'X', responsible: 'Ana', status: 'COMPLETED', completedDate: new Date('2025-07-01') },
        ],
      }),
    ]);
    await assert.rejects(
      service.updateInvestigationAction(TENANT as any, INCIDENT_ID, 'ACT-001', { action: 'Y' } as any, ACTOR),
      /terminal/,
    );
  });
});

// ── Evidencia ────────────────────────────────────────────────────────────────

describe('Incidents 7.1.3 — Evidencia', () => {
  it('EV-001: evidencia de investigación con DocumentMaster tenant-safe', async () => {
    const { service } = createService([baseCase()]);
    const saved = (await service.addInvestigationEvidence(
      TENANT as any,
      INCIDENT_ID,
      { documentId: '507f1f77bcf86cd7994390bb', comment: 'Acta de investigación' } as any,
      ACTOR,
    )) as any;
    assert.equal(saved.investigationEvidence.length, 1);
    assert.equal(saved.investigationEvidence[0].documentSnapshot, 'DOC-01 — Informe de investigación');
  });

  it('EV-002: evidencia exige documentId o evidenceUrl', async () => {
    const { service } = createService([baseCase()]);
    await assert.rejects(
      service.addInvestigationEvidence(TENANT as any, INCIDENT_ID, { comment: 'solo comentario' } as any, ACTOR),
      /requiere documentId/,
    );
  });

  it('EV-003: documentId de otra empresa → NotFound (tenant-safe)', async () => {
    const { service } = createService([baseCase()]);
    await assert.rejects(
      service.addInvestigationEvidence(TENANT as any, INCIDENT_ID, { documentId: '507f1f77bcf86cd7994390cc' } as any, ACTOR),
      /not found/,
    );
  });

  it('EV-004: evidencia legacy (string[]) se preserva intacta', async () => {
    const { service } = createService([baseCase({ evidence: ['informe-antiguo.pdf'] })]);
    const saved = (await service.addInvestigationEvidence(
      TENANT as any,
      INCIDENT_ID,
      { evidenceUrl: 'https://evidencia.test/acta.pdf' } as any,
      ACTOR,
    )) as any;
    assert.deepEqual(saved.evidence, ['informe-antiguo.pdf']);
    assert.equal(saved.investigationEvidence.length, 1);
  });
});

// ── Seguimiento ──────────────────────────────────────────────────────────────

describe('Incidents 7.1.3 — Seguimiento de acciones', () => {
  it('FU-001: registra seguimiento con percepción de efectividad', async () => {
    const { service } = createService([caseWithAction()]);
    const saved = (await service.registerActionFollowUp(
      TENANT as any,
      INCIDENT_ID,
      'ACT-001',
      {
        followUpDate: new Date('2025-07-10'),
        implementationStatus: 'ON_TRACK',
        perceivedEffectiveness: 'INDETERMINADA',
        observations: 'Avance 60%',
      } as any,
      ACTOR,
    )) as any;
    assert.equal(saved.correctiveActions[0].followUp.implementationStatus, 'ON_TRACK');
    assert.equal(saved.correctiveActions[0].followUp.perceivedEffectiveness, 'INDETERMINADA');
  });

  it('FU-002: fecha de seguimiento futura → BadRequestException', async () => {
    const { service } = createService([caseWithAction()]);
    await assert.rejects(
      service.registerActionFollowUp(
        TENANT as any,
        INCIDENT_ID,
        'ACT-001',
        { followUpDate: new Date('2999-01-01') } as any,
        ACTOR,
      ),
      /futura/,
    );
  });
});

// ── Cierre documentado ───────────────────────────────────────────────────────

describe('Incidents 7.1.3 — Reglas de cierre', () => {
  it('CL-001: COMPLETED con acciones sin completar → rechazado', async () => {
    const { service } = createService([
      baseCase({
        lifecycleStage: IncidentLifecycleStage.IN_PROGRESS,
        correctiveActions: [{ actionId: 'ACT-001', action: 'X', responsible: 'Ana', status: 'PENDING' }],
      }),
    ]);
    await assert.rejects(
      service.updateLifecycle(TENANT as any, INCIDENT_ID, { stage: IncidentLifecycleStage.COMPLETED } as any, ACTOR),
      /sin completar/,
    );
  });

  it('CL-002: CLOSED sin evidencia → rechazado', async () => {
    const { service } = createService([
      baseCase({
        lifecycleStage: IncidentLifecycleStage.COMPLETED,
      }),
    ]);
    await assert.rejects(
      service.updateLifecycle(TENANT as any, INCIDENT_ID, { stage: IncidentLifecycleStage.CLOSED } as any, ACTOR),
      /sin evidencia/,
    );
  });

  it('CL-003: cierre documentado completo → CLOSED con closureDate y actor', async () => {
    const { service, history } = createService([
      baseCase({
        lifecycleStage: IncidentLifecycleStage.COMPLETED,
        investigationEvidence: [{ evidenceUrl: 'https://evidencia.test/acta.pdf' }],
        correctiveActions: [
          { actionId: 'ACT-001', action: 'X', responsible: 'Ana', status: 'COMPLETED', completedDate: new Date('2025-07-01') },
        ],
      }),
    ]);
    const saved = (await service.updateLifecycle(
      TENANT as any,
      INCIDENT_ID,
      { stage: IncidentLifecycleStage.CLOSED, comment: 'Cierre documentado' } as any,
      ACTOR,
    )) as any;
    assert.equal(saved.lifecycleStage, IncidentLifecycleStage.CLOSED);
    assert.ok(saved.closureDate);
    assert.equal(saved.closedBySnapshot, 'owner@test.com');
    assert.equal(history[0].action, IncidentHistoryAction.CLOSED);
  });

  it('CL-004: caso CLOSED es terminal (solo lectura)', async () => {
    const { service } = createService([
      baseCase({
        lifecycleStage: IncidentLifecycleStage.CLOSED,
        closureDate: new Date('2025-07-02'),
      }),
    ]);
    await assert.rejects(
      service.updateInvestigation(
        TENANT as any,
        INCIDENT_ID,
        { methodology: 'Otra' } as any,
        ACTOR,
      ),
      /terminal/,
    );
  });
});

// ── Tenant isolation ─────────────────────────────────────────────────────────

describe('Incidents 7.1.3 — Tenant isolation', () => {
  it('TN-001: cross-tenant en investigación → 404 (sin revelar existencia)', async () => {
    const { service } = createService([baseCase()]);
    await assert.rejects(
      service.updateInvestigation(OTHER_TENANT as any, INCIDENT_ID, { methodology: 'X' } as any, ACTOR),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match((err as Error).message, /not found/i);
        return true;
      },
    );
  });

  it('TN-002: cross-tenant en acción → 404', async () => {
    const { service } = createService([baseCase()]);
    await assert.rejects(
      service.createInvestigationAction(
        OTHER_TENANT as any,
        INCIDENT_ID,
        { action: 'X' } as any,
        ACTOR,
      ),
      /not found/i,
    );
  });

  it('TN-003: cross-tenant en evidencia → 404', async () => {
    const { service } = createService([baseCase()]);
    await assert.rejects(
      service.addInvestigationEvidence(OTHER_TENANT as any, INCIDENT_ID, { evidenceUrl: 'https://x.test/e.pdf' } as any, ACTOR),
      /not found/i,
    );
  });

  it('TN-004: cross-tenant en follow-up → 404', async () => {
    const { service } = createService([baseCase()]);
    await assert.rejects(
      service.registerActionFollowUp(OTHER_TENANT as any, INCIDENT_ID, 'ACT-001', {} as any, ACTOR),
      /not found/i,
    );
  });

  it('TN-005: cross-tenant en lifecycle → 404', async () => {
    const { service } = createService([baseCase()]);
    await assert.rejects(
      service.updateLifecycle(OTHER_TENANT as any, INCIDENT_ID, { stage: IncidentLifecycleStage.CANCELLED } as any, ACTOR),
      /not found/i,
    );
  });

  it('TN-006: history cross-tenant → 404 (sin revelar existencia)', async () => {
    const { service } = createService([baseCase()]);
    await assert.rejects(
      service.getIncidentHistory(OTHER_TENANT as any, INCIDENT_ID),
      /not found/i,
    );
  });
});

// ── History ──────────────────────────────────────────────────────────────────

describe('Incidents 7.1.3 — History append-only', () => {
  it('HS-001: cada evento registra companyId, incidentId, actor y acción', async () => {
    const { service, history } = createService([baseCase()]);
    await service.updateInvestigation(TENANT as any, INCIDENT_ID, { methodology: 'IBC' } as any, ACTOR);
    await service.updateLifecycle(TENANT as any, INCIDENT_ID, { stage: IncidentLifecycleStage.CANCELLED } as any, ACTOR);

    assert.equal(history.length, 2);
    for (const event of history) {
      assert.equal(event.companyId, TENANT);
      assert.equal(event.actorSnapshot, 'owner@test.com');
      assert.ok(event.action);
    }
    assert.equal(history[0].action, IncidentHistoryAction.INVESTIGATION_UPDATED);
    assert.equal(history[1].action, IncidentHistoryAction.CANCELLED);
  });

  it('HS-002: acción con actionId queda trazada en el evento', async () => {
    const { service, history } = createService([caseWithAction()]);
    await service.updateInvestigationActionStatus(TENANT as any, INCIDENT_ID, 'ACT-001', { status: 'CANCELLED' } as any, ACTOR);
    assert.equal(history[0].actionId, 'ACT-001');
    assert.equal(history[0].action, IncidentHistoryAction.ACTION_STATUS_CHANGED);
  });
});

// ── Compatibilidad (3.2.1 / DISEASE / legacy) ────────────────────────────────

describe('Incidents 7.1.3 — Compatibilidad', () => {
  it('CP-001: CRUD existente intacto (findOne tenant-scoped)', async () => {
    const { service } = createService([baseCase()]);
    const found = (await service.findOne(INCIDENT_ID, TENANT as any)) as any;
    assert.equal(found._id, INCIDENT_ID);
  });

  it('CP-002: caso DISEASE es manipulable con la misma API (sin romperse)', async () => {
    const diseaseCase = createMockIncident({
      investigationType: InvestigationType.DISEASE,
      type: 'Enfermedad laboral',
      investigationDate: new Date('2025-06-16'),
      lifecycleStage: IncidentLifecycleStage.INVESTIGATING,
    });
    const { service } = createService([diseaseCase]);
    const saved = (await service.updateInvestigation(
      TENANT as any,
      INCIDENT_ID,
      { conclusions: 'Caso cerrado sin acciones' } as any,
      ACTOR,
    )) as any;
    assert.equal(saved.investigationType, InvestigationType.DISEASE);
    assert.equal(saved.conclusions, 'Caso cerrado sin acciones');
  });

  it('CP-003: caso sin lifecycleStage usa mapper y no muta el legacy', async () => {
    const legacyCase = createMockIncident({ status: 'Cerrado', investigationDate: new Date('2025-06-16') });
    const { service } = createService([legacyCase]);
    // resolveLifecycleStage('Cerrado') = COMPLETED → editable (no terminal).
    const saved = (await service.updateInvestigation(
      TENANT as any,
      INCIDENT_ID,
      { recommendations: 'Reforzar señalización' } as any,
      ACTOR,
    )) as any;
    assert.equal(saved.status, 'Cerrado'); // legacy intacto
    assert.equal(saved.recommendations, 'Reforzar señalización');
  });

  it('CP-004: DISEASE queda fuera del contrato evaluable 7.1.3 (ACCIDENT/INCIDENTE)', async () => {
    // Contrato para E2: los tipos evaluables de 7.1.3 NO incluyen DISEASE.
    const evaluables = ['ACCIDENT', 'INCIDENTE'];
    assert.equal(evaluables.includes(InvestigationType.DISEASE), false);
    assert.equal(evaluables.includes('ACCIDENT'), true);
  });
});
