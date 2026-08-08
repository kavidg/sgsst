import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Model, Types } from 'mongoose';

import { CopasstAdapter } from './copasst.adapter';
import { ApprovalWorkflowService } from '../approval-workflow.service';
import { ApprovalActor } from '../interfaces/approval-actor.interface';
import { ApprovalDecision } from '../enums/approval-decision.enum';
import { ApprovalEntity } from '../enums/approval-entity.enum';
import { ApprovalStatus } from '../enums/approval-status.enum';
import { ApplyDecisionContext } from './approval-adapter.interface';
import { ApprovalRequestDocument } from '../schemas/approval-request.schema';
import { ApprovalEventDocument } from '../schemas/approval-event.schema';
import { CopasstService } from '../../copasst/copasst.service';
import { createAdapterContractSuite } from './approval-adapter.contract.spec';

/** ObjectId válido de MongoDB para las pruebas. */
const COMPANY_ID = '64b000000000000000000001';
const PERIOD_ID = '64b000000000000000000002';
const USER_ID = '64b000000000000000000004';

function buildActor(overrides?: Partial<ApprovalActor>): ApprovalActor {
  return {
    userId: USER_ID,
    email: 'manager@test.com',
    role: 'manager',
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildContext(overrides?: Partial<ApplyDecisionContext>): ApplyDecisionContext {
  return {
    companyId: new Types.ObjectId(COMPANY_ID),
    entityId: new Types.ObjectId(PERIOD_ID),
    decision: ApprovalDecision.APPROVED,
    actor: buildActor(),
    ...overrides,
  };
}

/** Periodo por defecto devuelto por el stub del servicio. */
function buildPeriod(overrides?: Record<string, unknown>) {
  return {
    _id: new Types.ObjectId(PERIOD_ID),
    companyId: new Types.ObjectId(COMPANY_ID),
    approvalStatus: 'PENDING_APPROVAL',
    periodName: 'COPASST 2026',
    ...overrides,
  };
}

/**
 * Stub de CopasstService que captura las llamadas reales al servicio.
 */
function buildCopasstService(overrides?: {
  period?: Record<string, unknown>;
  approveResult?: unknown;
  rejectResult?: unknown;
}): {
  service: CopasstService;
  approveCalls: unknown[][];
  rejectCalls: unknown[][];
} {
  const approveCalls: unknown[][] = [];
  const rejectCalls: unknown[][] = [];
  const period = buildPeriod(overrides?.period);
  const service = {
    findById: async () => period,
    findCurrent: async () => period,
    approve: async (...args: unknown[]) => {
      approveCalls.push(args);
      return overrides?.approveResult ?? {
        ...period,
        approvalStatus: 'APPROVED_AND_SIGNED',
        constitutionMinutesPdfUrl: 'https://app.sgsst.com/copasst/minutes.pdf',
      };
    },
    reject: async (...args: unknown[]) => {
      rejectCalls.push(args);
      return overrides?.rejectResult ?? {
        ...period,
        approvalStatus: 'REJECTED',
        rejectionReason: args[1],
      };
    },
  } as unknown as CopasstService;
  return { service, approveCalls, rejectCalls };
}

describe('CopasstAdapter', () => {
  it('implementa el contrato del ApprovalAdapter (module COPASST)', () => {
    const { service } = buildCopasstService();
    const adapter = new CopasstAdapter(service);

    assert.equal(adapter.module, ApprovalEntity.COPASST);
    assert.deepEqual(adapter.allowedRoles(), ['owner', 'manager']);
  });

  it('traduce estados locales al ApprovalStatus canónico incluyendo APPROVED_AND_SIGNED', () => {
    const { service } = buildCopasstService();
    const adapter = new CopasstAdapter(service);

    assert.equal(adapter.mapStatus('DRAFT'), ApprovalStatus.DRAFT);
    assert.equal(adapter.mapStatus('PENDING_APPROVAL'), ApprovalStatus.PENDING_APPROVAL);
    assert.equal(adapter.mapStatus('APPROVED'), ApprovalStatus.APPROVED);
    assert.equal(adapter.mapStatus('APPROVED_AND_SIGNED'), ApprovalStatus.APPROVED);
    assert.equal(adapter.mapStatus('REJECTED'), ApprovalStatus.REJECTED);
    assert.equal(adapter.mapStatus('ARCHIVED'), ApprovalStatus.ARCHIVED);
    assert.equal(adapter.mapStatus('estado-desconocido'), ApprovalStatus.DRAFT);
  });

  it('getEntity por periodId retorna { entity, status, version } validando companyId', async () => {
    const { service } = buildCopasstService();
    const adapter = new CopasstAdapter(service);

    const result = await adapter.getEntity(COMPANY_ID, PERIOD_ID);

    assert.ok(result.entity);
    assert.equal(result.status, 'PENDING_APPROVAL');
    assert.equal(result.version, 1);
  });

  it('getEntity por companyId sin periodId resuelve el periodo activo', async () => {
    const { service } = buildCopasstService();
    const adapter = new CopasstAdapter(service);

    const result = await adapter.getEntity(COMPANY_ID, undefined);

    assert.ok(result.entity);
    assert.equal(result.status, 'PENDING_APPROVAL');
    assert.equal(result.version, 1);
  });

  it('getEntity lanza NotFound si el periodo pertenece a otra empresa', async () => {
    const { service } = buildCopasstService();
    const adapter = new CopasstAdapter(service);

    await assert.rejects(
      () => adapter.getEntity('64b0000000000000000000ff', PERIOD_ID),
      /not found/,
    );
  });

  it('aprueba el periodo reutilizando CopasstService.approve', async () => {
    const { service, approveCalls } = buildCopasstService();
    const adapter = new CopasstAdapter(service);

    const result = await adapter.applyDecision(
      buildContext({
        decision: ApprovalDecision.APPROVED,
        metadata: {
          signerEmail: 'owner@test.com',
          signerRole: 'owner',
        },
      }),
    );

    assert.equal(approveCalls.length, 1);
    const args = approveCalls[0];
    assert.equal(args[0], PERIOD_ID);
    assert.equal(args[1], 'owner@test.com');
    assert.equal(args[2], 'owner');
    assert.equal(
      (result as { approvalStatus: string }).approvalStatus,
      'APPROVED_AND_SIGNED',
    );
  });

  it('usa el email y rol del actor cuando no llega metadata de firma', async () => {
    const { service, approveCalls } = buildCopasstService();
    const adapter = new CopasstAdapter(service);

    await adapter.applyDecision(buildContext({ decision: ApprovalDecision.APPROVED }));

    assert.equal(approveCalls.length, 1);
    assert.equal(approveCalls[0][1], 'manager@test.com');
    assert.equal(approveCalls[0][2], 'manager');
  });

  it('funciona con actor identificado solo por firebaseUid (sin ObjectId)', async () => {
    const { service, approveCalls } = buildCopasstService();
    const adapter = new CopasstAdapter(service);

    await adapter.applyDecision(
      buildContext({
        decision: ApprovalDecision.APPROVED,
        actor: buildActor({
          userId: 'firebase-uid-123',
          firebaseUid: 'firebase-uid-123',
        }),
      }),
    );

    assert.equal(approveCalls.length, 1);
    assert.equal(approveCalls[0][1], 'manager@test.com');
    assert.equal(approveCalls[0][2], 'manager');
  });

  it('rechaza el periodo reutilizando CopasstService.reject', async () => {
    const { service, rejectCalls } = buildCopasstService();
    const adapter = new CopasstAdapter(service);

    const result = await adapter.applyDecision(
      buildContext({
        decision: ApprovalDecision.REJECTED,
        reason: 'Falta acta de constitución',
      }),
    );

    assert.equal(rejectCalls.length, 1);
    const args = rejectCalls[0];
    assert.equal(args[0], PERIOD_ID);
    assert.equal(args[1], 'Falta acta de constitución');
    assert.equal(args[2], 'manager@test.com');
    assert.equal((result as { approvalStatus: string }).approvalStatus, 'REJECTED');
  });

  it('lanza NotFound si el periodo pertenece a otra empresa en applyDecision', async () => {
    const { service } = buildCopasstService();
    const adapter = new CopasstAdapter(service);

    await assert.rejects(
      () =>
        adapter.applyDecision(
          buildContext({
            companyId: new Types.ObjectId('64b0000000000000000000ff'),
            decision: ApprovalDecision.APPROVED,
          }),
        ),
      /not found/,
    );
  });

  it('rechaza ADJUSTMENTS_REQUESTED (no soportado)', async () => {
    const { service } = buildCopasstService();
    const adapter = new CopasstAdapter(service);

    await assert.rejects(
      () =>
        adapter.applyDecision(
          buildContext({ decision: ApprovalDecision.ADJUSTMENTS_REQUESTED }),
        ),
      /not supported/,
    );
  });
});

describe('Integración ApprovalWorkflowService + CopasstAdapter', () => {
  it('crea la solicitud, aprueba y registra los eventos CREATED + APPROVED', async () => {
    const { service: copasstService, approveCalls } = buildCopasstService();
    const adapter = new CopasstAdapter(copasstService);
    const events: unknown[] = [];
    let latestRequest: ApprovalRequestDocument | null = null;

    const requestModel = {
      create: async (data: unknown) => {
        const doc = {
          _id: new Types.ObjectId('64b00000000000000000000a'),
          ...(data as object),
          save: async function () {
            return this as unknown as ApprovalRequestDocument;
          },
        };
        latestRequest = doc as ApprovalRequestDocument;
        return doc;
      },
      findOne: () => ({ sort: () => ({ exec: async () => latestRequest }) }),
      findById: () => ({ exec: async () => latestRequest }),
    } as unknown as Model<ApprovalRequestDocument>;
    const eventModel = {
      create: async (data: unknown) => {
        events.push(data);
        return { _id: new Types.ObjectId(), ...(data as object) };
      },
    } as unknown as Model<ApprovalEventDocument>;

    const workflow = new ApprovalWorkflowService(requestModel, eventModel, [adapter]);

    // 1. Creación de solicitud.
    const created = await workflow.createRequest(
      COMPANY_ID,
      {
        module: ApprovalEntity.COPASST,
        entityType: 'CopasstPeriod',
        entityId: PERIOD_ID,
        comments: 'Aprobación del periodo COPASST',
      },
      buildActor(),
    );
    assert.equal(created.status, ApprovalStatus.PENDING_APPROVAL);
    assert.equal(events.length, 1);
    assert.equal((events[0] as { action: string }).action, 'CREATED');

    // 2. Aprobación delegada al adapter.
    const result = await workflow.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.COPASST,
      PERIOD_ID,
      { decision: ApprovalDecision.APPROVED, comments: 'OK' },
      buildActor(),
    );

    assert.equal(approveCalls.length, 1);
    assert.equal(result.request?.status, ApprovalStatus.APPROVED);
    assert.equal(events.length, 2);
    assert.equal((events[1] as { action: string }).action, ApprovalDecision.APPROVED);
  });

  it('aplica decisiones legacy sin ApprovalRequest creando solicitud histórica y evento', async () => {
    const { service: copasstService, approveCalls } = buildCopasstService();
    const adapter = new CopasstAdapter(copasstService);
    const events: unknown[] = [];
    const createdRequests: ApprovalRequestDocument[] = [];

    const requestModel = {
      create: async (data: unknown) => {
        const doc = { _id: new Types.ObjectId(), ...(data as object) };
        createdRequests.push(doc as ApprovalRequestDocument);
        return doc;
      },
      findOne: () => ({ sort: () => ({ exec: async () => null }) }),
    } as unknown as Model<ApprovalRequestDocument>;
    const eventModel = {
      create: async (data: unknown) => {
        events.push(data);
        return { _id: new Types.ObjectId(), ...(data as object) };
      },
    } as unknown as Model<ApprovalEventDocument>;

    const workflow = new ApprovalWorkflowService(requestModel, eventModel, [adapter]);

    const result = await workflow.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.COPASST,
      PERIOD_ID,
      { decision: ApprovalDecision.APPROVED },
      buildActor(),
    );

    assert.equal(approveCalls.length, 1);
    assert.ok(result.request, 'debe crear la solicitud histórica legacy');
    assert.equal(result.request.legacy, true);
    assert.equal(createdRequests.length, 1);
    assert.equal(createdRequests[0].legacy, true);
    assert.equal(events.length, 1);
    const event = events[0] as { action: string; metadata?: Record<string, unknown> };
    assert.equal(event.action, ApprovalDecision.APPROVED);
    assert.deepEqual(event.metadata, { migrated: true, source: 'legacy' });
  });
});

describe('CopasstAdapter Contract', () => {
  // Suite de contrato reutilizable: valida la interfaz y los comportamientos
  // mínimos del ApprovalAdapter. `getEntityWithoutEntityId: 'resolve'` porque
  // el periodo activo se resuelve por companyId. `failingEntityId` no es un
  // ObjectId válido: getEntity debe rechazar.
  createAdapterContractSuite(
    () => {
      const { service } = buildCopasstService();
      return new CopasstAdapter(service);
    },
    {
      getEntityWithoutEntityId: 'resolve',
      failingEntityId: 'not-an-object-id',
    },
  );
});
