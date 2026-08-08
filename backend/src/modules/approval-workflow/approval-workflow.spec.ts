import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Model, Types } from 'mongoose';

import { ApprovalWorkflowService } from './approval-workflow.service';
import { ApprovalActor } from './interfaces/approval-actor.interface';
import { ApprovalDecision } from './enums/approval-decision.enum';
import { ApprovalEntity } from './enums/approval-entity.enum';
import { ApprovalStatus } from './enums/approval-status.enum';
import {
  ApprovalRequest,
  ApprovalRequestDocument,
} from './schemas/approval-request.schema';
import { ApprovalEvent, ApprovalEventDocument } from './schemas/approval-event.schema';
import { ApprovalAdapter } from './adapters/approval-adapter.interface';
import { ApprovalDocumentGenerationListener } from './document-generation/approval-document-generation.listener';

/** ObjectId válido de MongoDB para las pruebas. */
const COMPANY_ID = '64b000000000000000000001';
const ENTITY_ID = '64b000000000000000000002';

function buildActor(overrides?: Partial<ApprovalActor>): ApprovalActor {
  return {
    userId: 'uid-test',
    email: 'manager@test.com',
    role: 'manager',
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

/** Adapter stub que registra el applyDecision para validar la delegación. */
function buildStubAdapter(): ApprovalAdapter {
  return {
    module: ApprovalEntity.DOCUMENT,
    getEntity: async () => ({ _id: new Types.ObjectId(ENTITY_ID), status: 'PENDING_APPROVAL' }),
    applyDecision: async () => ({ applied: true }),
    mapStatus: () => ApprovalStatus.DRAFT,
    allowedRoles: () => ['owner', 'manager'],
  };
}

function buildService(overrides?: {
  findById?: unknown;
  findOne?: unknown;
  findEvents?: unknown;
  findPending?: unknown;
  adapters?: ApprovalAdapter[];
  listener?: Partial<ApprovalDocumentGenerationListener>;
}): {
  service: ApprovalWorkflowService;
  created: unknown[];
  events: unknown[];
  notified: Array<Record<string, unknown>>;
} {
  const created: unknown[] = [];
  const events: unknown[] = [];
  const notified: Array<Record<string, unknown>> = [];

  const requestModel = {
    create: async (data: unknown) => {
      const doc = { _id: new Types.ObjectId(), ...(data as object) };
      created.push(doc);
      return doc;
    },
    findById: () => ({ exec: async () => overrides?.findById ?? null }),
    findOne: () => ({
      sort: () => ({ exec: async () => overrides?.findOne ?? null }),
    }),
    find: () => ({
      sort: () => ({
        skip: () => ({
          limit: () => ({ exec: async () => overrides?.findPending ?? [] }),
        }),
      }),
    }),
  } as unknown as Model<ApprovalRequestDocument>;
  const eventModel = {
    create: async (data: unknown) => {
      events.push(data);
      return { _id: new Types.ObjectId(), ...(data as object) };
    },
    find: () => ({ sort: () => ({ exec: async () => overrides?.findEvents ?? [] }) }),
  } as unknown as Model<ApprovalEventDocument>;

  const listener = {
    onDecisionApplied: async (context: Record<string, unknown>) => {
      notified.push(context);
      return null;
    },
    ...overrides?.listener,
  } as unknown as ApprovalDocumentGenerationListener;

  return {
    service: new ApprovalWorkflowService(
      requestModel,
      eventModel,
      overrides?.adapters ?? [buildStubAdapter()],
      listener,
    ),
    created,
    events,
    notified,
  };
}

function buildPendingRequest(status: ApprovalStatus): ApprovalRequestDocument {
  return {
    _id: new Types.ObjectId('64b00000000000000000000a'),
    companyId: new Types.ObjectId(COMPANY_ID),
    module: ApprovalEntity.DOCUMENT,
    entityType: 'DocumentMaster',
    entityId: new Types.ObjectId(ENTITY_ID),
    status,
    currentStep: 1,
    requestedBy: buildActor(),
    assignedRoles: ['owner', 'manager'],
    save: async function () {
      return this as unknown as ApprovalRequestDocument;
    },
  } as unknown as ApprovalRequestDocument;
}

describe('ApprovalWorkflowService.createRequest', () => {
  it('crea una solicitud en PENDING_APPROVAL y registra evento CREATED', async () => {
    const { service, created, events } = buildService();

    const result = await service.createRequest(
      COMPANY_ID,
      {
        module: ApprovalEntity.DOCUMENT,
        entityType: 'DocumentMaster',
        entityId: ENTITY_ID,
        comments: 'Revisión de política SST',
      },
      buildActor(),
    );

    assert.equal(result.status, ApprovalStatus.PENDING_APPROVAL);
    assert.equal(result.currentStep, 1);
    assert.equal(result.module, ApprovalEntity.DOCUMENT);
    assert.deepEqual(result.assignedRoles, ['owner', 'manager']);
    assert.equal(created.length, 1);

    // Evento append-only registrado.
    assert.equal(events.length, 1);
    const event = events[0] as { action: string; previousStatus: ApprovalStatus; newStatus: ApprovalStatus };
    assert.equal(event.action, 'CREATED');
    assert.equal(event.previousStatus, ApprovalStatus.DRAFT);
    assert.equal(event.newStatus, ApprovalStatus.PENDING_APPROVAL);
  });

  it('respeta los roles asignados personalizados', async () => {
    const { service } = buildService();

    const result = await service.createRequest(
      COMPANY_ID,
      {
        module: ApprovalEntity.COPASST,
        entityType: 'CopasstPeriod',
        entityId: ENTITY_ID,
        assignedRoles: ['owner', 'admin'],
      },
      buildActor(),
    );

    assert.deepEqual(result.assignedRoles, ['owner', 'admin']);
  });

  it('lanza error cuando el entityId no es un ObjectId válido', async () => {
    const { service } = buildService();

    await assert.rejects(
      () =>
        service.createRequest(
          COMPANY_ID,
          { module: ApprovalEntity.DOCUMENT, entityType: 'X', entityId: 'not-an-object-id' },
          buildActor(),
        ),
      /Invalid ObjectId/,
    );
  });
});

describe('ApprovalWorkflowService.decideRequest', () => {
  it('aprueba una solicitud pendiente y registra el evento', async () => {
    const { service, events } = buildService({
      findById: buildPendingRequest(ApprovalStatus.PENDING_APPROVAL),
      findOne: buildPendingRequest(ApprovalStatus.PENDING_APPROVAL),
    });

    const result = await service.decideRequest(
      COMPANY_ID,
      '64b00000000000000000000a',
      { decision: ApprovalDecision.APPROVED, comments: 'Se aprueba' },
      buildActor(),
    );

    assert.equal(result.status, ApprovalStatus.APPROVED);
    assert.equal(result.decision, ApprovalDecision.APPROVED);
    assert.equal((result.decidedBy as ApprovalActor).email, 'manager@test.com');

    assert.equal(events.length, 1);
    const event = events[0] as { action: string; previousStatus: ApprovalStatus; newStatus: ApprovalStatus };
    assert.equal(event.action, ApprovalDecision.APPROVED);
    assert.equal(event.previousStatus, ApprovalStatus.PENDING_APPROVAL);
    assert.equal(event.newStatus, ApprovalStatus.APPROVED);
  });

  it('rechaza una solicitud con motivo', async () => {
    const { service } = buildService({
      findById: buildPendingRequest(ApprovalStatus.PENDING_APPROVAL),
      findOne: buildPendingRequest(ApprovalStatus.PENDING_APPROVAL),
    });

    const result = await service.decideRequest(
      COMPANY_ID,
      '64b00000000000000000000a',
      { decision: ApprovalDecision.REJECTED, reason: 'Falta evidencia' },
      buildActor(),
    );

    assert.equal(result.status, ApprovalStatus.REJECTED);
    assert.equal(result.rejectionReason, 'Falta evidencia');
  });

  it('lanza error si la solicitud no está pendiente', async () => {
    const { service } = buildService({
      findById: buildPendingRequest(ApprovalStatus.APPROVED),
    });

    await assert.rejects(
      () =>
        service.decideRequest(
          COMPANY_ID,
          '64b00000000000000000000a',
          { decision: ApprovalDecision.APPROVED },
          buildActor(),
        ),
      /not pending approval/,
    );
  });

  it('lanza NotFound si la solicitud no existe', async () => {
    const { service } = buildService({ findById: null });

    await assert.rejects(
      () =>
        service.decideRequest(
          COMPANY_ID,
          '64b00000000000000000000a',
          { decision: ApprovalDecision.APPROVED },
          buildActor(),
        ),
      /not found/,
    );
  });

  it('delega la decisión al adapter del módulo (entidad real actualizada)', async () => {
    let applied = false;
    const adapter: ApprovalAdapter = {
      module: ApprovalEntity.DOCUMENT,
      getEntity: async () => ({ _id: new Types.ObjectId(ENTITY_ID) }),
      applyDecision: async () => {
        applied = true;
        return { applied: true };
      },
      mapStatus: () => ApprovalStatus.DRAFT,
      allowedRoles: () => ['owner', 'manager'],
    };
    const { service } = buildService({
      findById: buildPendingRequest(ApprovalStatus.PENDING_APPROVAL),
      findOne: buildPendingRequest(ApprovalStatus.PENDING_APPROVAL),
      adapters: [adapter],
    });

    const result = await service.decideRequest(
      COMPANY_ID,
      '64b00000000000000000000a',
      { decision: ApprovalDecision.APPROVED },
      buildActor(),
    );

    assert.equal(applied, true);
    assert.equal(result.status, ApprovalStatus.APPROVED);
  });
});

describe('ApprovalWorkflowService legacy con auditoría', () => {
  it('crea ApprovalRequest histórico con legacy:true y evento migrated (APPROVED)', async () => {
    const { service, created, events } = buildService({ findOne: null });

    const result = await service.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.DOCUMENT,
      ENTITY_ID,
      { decision: ApprovalDecision.APPROVED, comments: 'Legacy' },
      buildActor(),
    );

    assert.ok(result.request, 'debe crear la solicitud histórica');
    assert.equal(result.request.legacy, true);
    assert.equal((created[0] as { legacy?: boolean }).legacy, true);
    assert.equal(events.length, 1);
    const event = events[0] as {
      action: string;
      metadata?: Record<string, unknown>;
      newStatus: ApprovalStatus;
    };
    assert.equal(event.action, ApprovalDecision.APPROVED);
    assert.equal(event.newStatus, ApprovalStatus.APPROVED);
    assert.deepEqual(event.metadata, { migrated: true, source: 'legacy' });
  });

  it('legacy REJECTED registra evento con metadata migrated', async () => {
    const { service, events } = buildService({ findOne: null });

    const result = await service.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.DOCUMENT,
      ENTITY_ID,
      { decision: ApprovalDecision.REJECTED, reason: 'Falta evidencia' },
      buildActor(),
    );

    assert.ok(result.request, 'debe crear la solicitud histórica');
    assert.equal(result.request.status, ApprovalStatus.REJECTED);
    assert.equal(events.length, 1);
    const event = events[0] as {
      action: string;
      metadata?: Record<string, unknown>;
      newStatus: ApprovalStatus;
    };
    assert.equal(event.action, ApprovalDecision.REJECTED);
    assert.equal(event.newStatus, ApprovalStatus.REJECTED);
    assert.deepEqual(event.metadata, { migrated: true, source: 'legacy' });
  });
});

describe('ApprovalWorkflowService notifyDocumentGeneration (Fase 2.1)', () => {
  it('notifica al listener de generación documental cuando se aprueba (endpoint PHVA)', async () => {
    const pending = buildPendingRequest(ApprovalStatus.PENDING_APPROVAL);
    const { service, notified } = buildService({
      findOne: pending,
      adapters: [
        {
          ...buildStubAdapter(),
          module: ApprovalEntity.PHVA_ADVANCED,
        },
      ],
    });

    await service.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.PHVA_ADVANCED,
      ENTITY_ID,
      { decision: ApprovalDecision.APPROVED },
      buildActor(),
    );

    assert.equal(notified.length, 1);
    const context = notified[0];
    assert.equal(context.module, ApprovalEntity.PHVA_ADVANCED);
    assert.equal(context.decision, ApprovalDecision.APPROVED);
    assert.equal(context.entityType, pending.entityType);
    assert.equal(context.entityId, ENTITY_ID);
    assert.ok(context.requestId);
    assert.ok(context.approvalEventId);
  });

  it('notifica al listener desde el endpoint genérico /decide', async () => {
    const { service, notified } = buildService({
      findById: buildPendingRequest(ApprovalStatus.PENDING_APPROVAL),
      findOne: buildPendingRequest(ApprovalStatus.PENDING_APPROVAL),
    });

    await service.decideRequest(
      COMPANY_ID,
      '64b00000000000000000000a',
      { decision: ApprovalDecision.APPROVED },
      buildActor(),
    );

    assert.equal(notified.length, 1);
    assert.equal(notified[0].decision, ApprovalDecision.APPROVED);
    assert.ok(notified[0].approvalEventId);
  });

  it('no notifica para decisiones REJECTED', async () => {
    const { service, notified } = buildService({
      findById: buildPendingRequest(ApprovalStatus.PENDING_APPROVAL),
      findOne: buildPendingRequest(ApprovalStatus.PENDING_APPROVAL),
    });

    await service.decideRequest(
      COMPANY_ID,
      '64b00000000000000000000a',
      { decision: ApprovalDecision.REJECTED, reason: 'Falta evidencia' },
      buildActor(),
    );

    assert.equal(notified.length, 0);
  });

  it('notifica en el camino legacy (sin ApprovalRequest previa) sin romper la decisión', async () => {
    const { service, notified } = buildService({
      findOne: null,
      adapters: [
        {
          ...buildStubAdapter(),
          module: ApprovalEntity.PHVA_ADVANCED,
        },
      ],
    });

    const result = await service.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.PHVA_ADVANCED,
      ENTITY_ID,
      { decision: ApprovalDecision.APPROVED },
      buildActor(),
    );

    assert.ok(result.request, 'debe crear la solicitud histórica');
    assert.equal(notified.length, 1);
    assert.equal(notified[0].entityType, 'legacy');
    assert.equal(notified[0].decision, ApprovalDecision.APPROVED);
  });

  it('no notifica ni genera si el ApprovalEvent APPROVED no tiene documento registrado (no falla)', async () => {
    // Listener stub sin generador: la decisión APPROVED se aplica y el listener
    // no encuentra generador para la entidad → no genera y no falla.
    let listenerCalls = 0;
    const { service, events } = buildService({
      findOne: buildPendingRequest(ApprovalStatus.PENDING_APPROVAL),
      adapters: [
        {
          ...buildStubAdapter(),
          module: ApprovalEntity.DOCUMENT,
        },
      ],
      listener: {
        onDecisionApplied: async () => {
          listenerCalls += 1;
          return null;
        },
      },
    });

    const result = await service.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.DOCUMENT,
      ENTITY_ID,
      { decision: ApprovalDecision.APPROVED },
      buildActor(),
    );

    assert.ok(result.request);
    assert.equal(result.request.status, ApprovalStatus.APPROVED);
    assert.equal(events.length, 1, 'la decisión se registra aunque no haya documento');
    assert.equal(listenerCalls, 1);
  });
});

describe('ApprovalWorkflowService.getRequest / getPending / getHistory', () => {
  it('devuelve una solicitud de la empresa indicada', async () => {
    const { service } = buildService({
      findById: buildPendingRequest(ApprovalStatus.PENDING_APPROVAL),
    });

    const result = await service.getRequest(COMPANY_ID, '64b00000000000000000000a');

    assert.equal(result.entityId.toString(), ENTITY_ID);
  });

  it('lanza NotFound si la solicitud pertenece a otra empresa', async () => {
    const otherCompany = {
      ...buildPendingRequest(ApprovalStatus.PENDING_APPROVAL),
      companyId: new Types.ObjectId('64b0000000000000000000ff'),
    } as unknown as ApprovalRequestDocument;
    const { service } = buildService({ findById: otherCompany });

    await assert.rejects(
      () => service.getRequest(COMPANY_ID, '64b00000000000000000000a'),
      /not found/,
    );
  });

  it('devuelve solo solicitudes pendientes con filtro por módulo', async () => {
    let capturedFilter: Record<string, unknown> = {};
    let capturedLimit = 0;
    const requestModel = {
      find: (filter: Record<string, unknown>) => {
        capturedFilter = filter;
        return {
          sort: () => ({
            skip: () => ({
              limit: (limit: number) => {
                capturedLimit = limit;
                return { exec: async () => [{ _id: 'r1' }] };
              },
            }),
          }),
        };
      },
    } as unknown as Model<ApprovalRequestDocument>;
    const eventModel = {} as unknown as Model<ApprovalEventDocument>;
    const service = new ApprovalWorkflowService(
      requestModel,
      eventModel,
      [],
      {} as unknown as ApprovalDocumentGenerationListener,
    );

    const result = await service.getPending(COMPANY_ID, { module: ApprovalEntity.DOCUMENT });

    assert.equal(result.length, 1);
    assert.equal(capturedFilter.status, ApprovalStatus.PENDING_APPROVAL);
    assert.equal(capturedFilter.module, ApprovalEntity.DOCUMENT);
    assert.equal((capturedFilter.companyId as Types.ObjectId).toString(), COMPANY_ID);
    assert.equal(capturedLimit, 50);
  });

  it('devuelve el historial append-only de una solicitud de la empresa', async () => {
    const { service } = buildService({
      findById: buildPendingRequest(ApprovalStatus.PENDING_APPROVAL),
      findEvents: [
        { requestId: '64b00000000000000000000a', action: 'CREATED' },
        { requestId: '64b00000000000000000000a', action: 'APPROVED' },
      ],
    });

    const result = await service.getHistory(COMPANY_ID, '64b00000000000000000000a');

    assert.equal(result.length, 2);
    assert.equal((result[1] as { action: string }).action, 'APPROVED');
  });

  it('lanza NotFound en getHistory si la solicitud pertenece a otra empresa', async () => {
    const otherCompany = {
      ...buildPendingRequest(ApprovalStatus.PENDING_APPROVAL),
      companyId: new Types.ObjectId('64b0000000000000000000ff'),
    } as unknown as ApprovalRequestDocument;
    const { service } = buildService({ findById: otherCompany });

    await assert.rejects(
      () => service.getHistory(COMPANY_ID, '64b00000000000000000000a'),
      /not found/,
    );
  });
});
