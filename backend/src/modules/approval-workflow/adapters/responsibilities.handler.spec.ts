import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Model, Types } from 'mongoose';

import { ResponsibilitiesHandler } from './handlers/responsibilities.handler';
import { ApprovalWorkflowService } from '../approval-workflow.service';
import { ApprovalActor } from '../interfaces/approval-actor.interface';
import { ApprovalDecision } from '../enums/approval-decision.enum';
import { ApprovalEntity } from '../enums/approval-entity.enum';
import { ApprovalStatus } from '../enums/approval-status.enum';
import {
  ApplyDecisionContext,
  ApprovalAdapter,
} from './approval-adapter.interface';
import { ApprovalRequestDocument } from '../schemas/approval-request.schema';
import { ApprovalEventDocument } from '../schemas/approval-event.schema';
import { PhvaAdvancedService } from '../../phva-advanced/phva-advanced.service';
import { UserDocument } from '../../users/schemas/user.schema';
import { createAdapterContractSuite } from './approval-adapter.contract.spec';

/** ObjectId válido de MongoDB para las pruebas. */
const COMPANY_ID = '64b000000000000000000001';
const RECORD_ID = '64b000000000000000000002';
const USER_ID = '64b000000000000000000004';
const FIREBASE_UID = 'firebase-uid-123';

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
    entityId: new Types.ObjectId(RECORD_ID),
    decision: ApprovalDecision.APPROVED,
    actor: buildActor(),
    ...overrides,
  };
}

/** Registro por defecto devuelto por el stub del servicio. */
function buildRecord(overrides?: Record<string, unknown>) {
  return {
    _id: new Types.ObjectId(RECORD_ID),
    companyId: new Types.ObjectId(COMPANY_ID),
    itemCode: '1.1.2',
    responsibilities: [
      {
        title: '__META__',
        category: JSON.stringify({
          currentVersion: '1.1',
          approvalStatus: 'PENDING_APPROVAL',
          locked: true,
          versions: [],
          auditHistory: [],
        }),
      },
    ],
    auditHistory: [],
    ...overrides,
  };
}

/** Usuario por defecto devuelto por el stub del modelo User. */
function buildUser(overrides?: Record<string, unknown>) {
  return {
    _id: new Types.ObjectId(USER_ID),
    email: 'manager@test.com',
    role: 'manager',
    firebaseUid: FIREBASE_UID,
    ...overrides,
  };
}

/**
 * Stub de PhvaAdvancedService que captura las llamadas reales al servicio.
 */
function buildPhvaAdvancedService(overrides?: {
  record?: Record<string, unknown>;
  approveResult?: unknown;
  rejectResult?: unknown;
}): {
  service: PhvaAdvancedService;
  approveCalls: unknown[][];
  rejectCalls: unknown[][];
} {
  const approveCalls: unknown[][] = [];
  const rejectCalls: unknown[][] = [];
  const record = buildRecord(overrides?.record);
  const service = {
    findResponsibilitiesById: async () => record,
    findResponsibilitiesByCompany: async () => record,
    getResponsibilitiesApprovalStatus: () => {
      const metaIndex = record.responsibilities.findIndex(
        (entry: { title: string }) => entry.title === '__META__',
      );
      if (metaIndex < 0) return 'DRAFT';
      try {
        const meta = JSON.parse(record.responsibilities[metaIndex].category) as {
          approvalStatus?: string;
        };
        return meta.approvalStatus ?? 'DRAFT';
      } catch {
        return 'DRAFT';
      }
    },
    approveResponsibilities: async (...args: unknown[]) => {
      approveCalls.push(args);
      return overrides?.approveResult ?? {
        ...record,
        responsibilities: [
          {
            title: '__META__',
            category: JSON.stringify({ currentVersion: '1.1', approvalStatus: 'APPROVED_AND_SIGNED', locked: true }),
          },
        ],
      };
    },
    rejectResponsibilities: async (...args: unknown[]) => {
      rejectCalls.push(args);
      return overrides?.rejectResult ?? {
        ...record,
        responsibilities: [
          {
            title: '__META__',
            category: JSON.stringify({ currentVersion: '1.1', approvalStatus: 'REJECTED', locked: false }),
          },
        ],
      };
    },
  } as unknown as PhvaAdvancedService;
  return { service, approveCalls, rejectCalls };
}

/** Stub del modelo User usado por el handler para resolver al actor. */
function buildUserModel(user: unknown = buildUser()): Model<UserDocument> {
  return {
    findById: () => ({ exec: async () => user }),
    findOne: () => ({ exec: async () => user }),
  } as unknown as Model<UserDocument>;
}

/**
 * Envuelve el handler como ApprovalAdapter (module PHVA_ADVANCED) para poder
 * ejecutar la contract suite y las integraciones con ApprovalWorkflowService.
 * La contract suite requiere `module`, que el handler (sub-entidad) no expone.
 */
function buildAdapterLike(handler: ResponsibilitiesHandler): ApprovalAdapter {
  return {
    module: ApprovalEntity.PHVA_ADVANCED,
    getEntity: (companyId: string, entityId?: string) =>
      handler.getEntity(companyId, entityId),
    applyDecision: (ctx: ApplyDecisionContext) => handler.applyDecision(ctx),
    mapStatus: (localStatus: string) => handler.mapStatus(localStatus),
    allowedRoles: () => handler.allowedRoles(),
  };
}

/** Construye el handler completo (servicio + modelo User). */
function buildHandler(overrides?: {
  service?: PhvaAdvancedService;
  userModel?: Model<UserDocument>;
}): {
  handler: ResponsibilitiesHandler;
  approveCalls: unknown[][];
  rejectCalls: unknown[][];
} {
  const { service, approveCalls, rejectCalls } = overrides?.service
    ? { service: overrides.service, approveCalls: [], rejectCalls: [] }
    : buildPhvaAdvancedService();
  const handler = new ResponsibilitiesHandler(
    service,
    overrides?.userModel ?? buildUserModel(),
  );
  return { handler, approveCalls, rejectCalls };
}

describe('ResponsibilitiesHandler', () => {
  it('implementa el contrato del ApprovalAdapter (module PHVA_ADVANCED vía adapter)', () => {
    const { handler } = buildHandler();
    assert.deepEqual(handler.allowedRoles(), ['owner', 'manager']);
  });

  it('traduce estados locales al ApprovalStatus canónico incluyendo APPROVED_AND_SIGNED', () => {
    const { handler } = buildHandler();

    assert.equal(handler.mapStatus('DRAFT'), ApprovalStatus.DRAFT);
    assert.equal(handler.mapStatus('PENDING_APPROVAL'), ApprovalStatus.PENDING_APPROVAL);
    assert.equal(handler.mapStatus('APPROVED'), ApprovalStatus.APPROVED);
    assert.equal(handler.mapStatus('APPROVED_AND_SIGNED'), ApprovalStatus.APPROVED);
    assert.equal(handler.mapStatus('REJECTED'), ApprovalStatus.REJECTED);
    // Estado desconocido → DRAFT (equivalencia explícita).
    assert.equal(handler.mapStatus('estado-desconocido'), ApprovalStatus.DRAFT);
  });

  it('getEntity por entityId retorna { entity, status, version } validando companyId', async () => {
    const { handler } = buildHandler();

    const result = await handler.getEntity(COMPANY_ID, RECORD_ID);

    assert.ok(result.entity);
    assert.equal(result.status, 'PENDING_APPROVAL');
    assert.equal(result.version, 1);
  });

  it('getEntity por companyId sin entityId resuelve el registro vigente', async () => {
    const { handler } = buildHandler();

    const result = await handler.getEntity(COMPANY_ID, undefined);

    assert.ok(result.entity);
    assert.equal(result.status, 'PENDING_APPROVAL');
    assert.equal(result.version, 1);
  });

  it('getEntity lanza NotFound si el registro pertenece a otra empresa', async () => {
    const { handler } = buildHandler();

    await assert.rejects(
      () => handler.getEntity('64b0000000000000000000ff', RECORD_ID),
      /not found/,
    );
  });

  it('aprueba reutilizando approveResponsibilities con la empresa y el usuario resuelto', async () => {
    const { handler, approveCalls } = buildHandler();

    const result = await handler.applyDecision(
      buildContext({
        decision: ApprovalDecision.APPROVED,
        metadata: {
          approvedByEmail: 'owner@test.com',
          approvedByName: 'Owner',
          comments: 'Matriz aprobada',
        },
      }),
    );

    assert.equal(approveCalls.length, 1);
    const args = approveCalls[0];
    assert.equal((args[0] as Types.ObjectId).toString(), COMPANY_ID);
    assert.equal((args[1] as { email: string }).email, 'manager@test.com');
    assert.equal(
      (result as { responsibilities: { category: string }[] }).responsibilities[0].category,
      JSON.stringify({ currentVersion: '1.1', approvalStatus: 'APPROVED_AND_SIGNED', locked: true }),
    );
  });

  it('rechaza reutilizando rejectResponsibilities con la empresa, usuario y motivo', async () => {
    const { handler, rejectCalls } = buildHandler();

    const result = await handler.applyDecision(
      buildContext({
        decision: ApprovalDecision.REJECTED,
        reason: 'Falta cobertura de cargos',
      }),
    );

    assert.equal(rejectCalls.length, 1);
    const args = rejectCalls[0];
    assert.equal((args[0] as Types.ObjectId).toString(), COMPANY_ID);
    assert.equal((args[1] as { email: string }).email, 'manager@test.com');
    assert.equal(args[2], 'Falta cobertura de cargos');
    assert.equal(
      (result as { responsibilities: { category: string }[] }).responsibilities[0].category,
      JSON.stringify({ currentVersion: '1.1', approvalStatus: 'REJECTED', locked: false }),
    );
  });

  it('no depende de metadata: usa el actor aunque falten approvedByEmail/Name', async () => {
    const { handler, approveCalls } = buildHandler();

    const result = await handler.applyDecision(
      buildContext({
        decision: ApprovalDecision.APPROVED,
        metadata: undefined,
      }),
    );

    assert.equal(approveCalls.length, 1);
    assert.equal((approveCalls[0][1] as { email: string }).email, 'manager@test.com');
    assert.ok(result);
  });

  it('rechaza ADJUSTMENTS_REQUESTED con BadRequest controlado (no existe flujo real)', async () => {
    const { handler, approveCalls, rejectCalls } = buildHandler();

    await assert.rejects(
      () =>
        handler.applyDecision(
          buildContext({
            decision: ApprovalDecision.ADJUSTMENTS_REQUESTED,
            comments: 'Ajustar matriz',
          }),
        ),
      /not supported/,
    );

    // No debe delegar a approve/reject ni inventar transiciones.
    assert.equal(approveCalls.length, 0);
    assert.equal(rejectCalls.length, 0);
  });

  it('resuelve el usuario por ObjectId cuando el actor trae uno válido', async () => {
    const { handler, approveCalls } = buildHandler();

    await handler.applyDecision(buildContext({ decision: ApprovalDecision.APPROVED }));

    assert.equal(approveCalls.length, 1);
    assert.equal((approveCalls[0][1] as { _id: Types.ObjectId })._id.toString(), USER_ID);
  });

  it('resuelve el usuario por firebaseUid cuando el actor no trae ObjectId', async () => {
    const { handler, approveCalls } = buildHandler();

    await handler.applyDecision(
      buildContext({
        decision: ApprovalDecision.APPROVED,
        actor: buildActor({ userId: FIREBASE_UID, firebaseUid: FIREBASE_UID }),
      }),
    );

    assert.equal(approveCalls.length, 1);
    assert.equal(
      (approveCalls[0][1] as { firebaseUid: string }).firebaseUid,
      FIREBASE_UID,
    );
  });

  it('lanza NotFound si el registro pertenece a otra empresa en applyDecision', async () => {
    const { handler } = buildHandler();

    await assert.rejects(
      () =>
        handler.applyDecision(
          buildContext({
            companyId: new Types.ObjectId('64b0000000000000000000ff'),
            decision: ApprovalDecision.APPROVED,
          }),
        ),
      /not found/,
    );
  });
});

describe('Integración ApprovalWorkflowService + ResponsibilitiesHandler', () => {
  it('crea la solicitud, aprueba y registra los eventos CREATED + APPROVED', async () => {
    const { service: phvaService, approveCalls } = buildPhvaAdvancedService();
    const handler = new ResponsibilitiesHandler(phvaService, buildUserModel());
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

    const workflow = new ApprovalWorkflowService(requestModel, eventModel, [
      buildAdapterLike(handler),
    ]);

    // 1. Creación de solicitud.
    const created = await workflow.createRequest(
      COMPANY_ID,
      {
        module: ApprovalEntity.PHVA_ADVANCED,
        entityType: 'PhvaAdvancedResponsibilities',
        entityId: RECORD_ID,
        comments: 'Aprobación de la matriz de responsabilidades (1.1.2)',
      },
      buildActor(),
    );
    assert.equal(created.status, ApprovalStatus.PENDING_APPROVAL);
    assert.equal(events.length, 1);
    assert.equal((events[0] as { action: string }).action, 'CREATED');

    // 2. Aprobación delegada al handler.
    const result = await workflow.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.PHVA_ADVANCED,
      RECORD_ID,
      { decision: ApprovalDecision.APPROVED, comments: 'OK' },
      buildActor(),
    );

    assert.equal(approveCalls.length, 1);
    assert.equal((approveCalls[0][0] as Types.ObjectId).toString(), COMPANY_ID);
    assert.equal(result.request?.status, ApprovalStatus.APPROVED);
    assert.equal(events.length, 2);
    assert.equal((events[1] as { action: string }).action, ApprovalDecision.APPROVED);
  });

  it('registra el evento REJECTED al decidir el rechazo sobre la solicitud', async () => {
    const { service: phvaService, rejectCalls } = buildPhvaAdvancedService();
    const handler = new ResponsibilitiesHandler(phvaService, buildUserModel());
    const events: unknown[] = [];
    let latestRequest: ApprovalRequestDocument | null = null;

    const requestModel = {
      create: async (data: unknown) => {
        const doc = {
          _id: new Types.ObjectId('64b00000000000000000000b'),
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

    const workflow = new ApprovalWorkflowService(requestModel, eventModel, [
      buildAdapterLike(handler),
    ]);

    // 1. Creación de solicitud.
    const created = await workflow.createRequest(
      COMPANY_ID,
      {
        module: ApprovalEntity.PHVA_ADVANCED,
        entityType: 'PhvaAdvancedResponsibilities',
        entityId: RECORD_ID,
      },
      buildActor(),
    );
    assert.equal(created.status, ApprovalStatus.PENDING_APPROVAL);

    // 2. Rechazo delegado al handler.
    const result = await workflow.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.PHVA_ADVANCED,
      RECORD_ID,
      { decision: ApprovalDecision.REJECTED, reason: 'Falta cobertura de cargos' },
      buildActor(),
    );

    assert.equal(rejectCalls.length, 1);
    assert.equal(rejectCalls[0][2], 'Falta cobertura de cargos');
    assert.equal(result.request?.status, ApprovalStatus.REJECTED);
    assert.equal(events.length, 2);
    assert.equal((events[0] as { action: string }).action, 'CREATED');
    assert.equal((events[1] as { action: string }).action, ApprovalDecision.REJECTED);
  });

  it('aplica decisiones legacy sin ApprovalRequest creando solicitud histórica y evento', async () => {
    const { service: phvaService, approveCalls } = buildPhvaAdvancedService();
    const handler = new ResponsibilitiesHandler(phvaService, buildUserModel());
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

    const workflow = new ApprovalWorkflowService(requestModel, eventModel, [
      buildAdapterLike(handler),
    ]);

    const result = await workflow.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.PHVA_ADVANCED,
      RECORD_ID,
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

describe('ResponsibilitiesHandler Contract', () => {
  // Suite de contrato reutilizable: valida la interfaz y los comportamientos
  // mínimos del ApprovalAdapter. Se ejecuta contra el handler envuelto como
  // ApprovalAdapter (module PHVA_ADVANCED). `getEntityWithoutEntityId:
  // 'resolve'` porque el registro vigente se resuelve por companyId.
  // `failingEntityId` no es un ObjectId válido: getEntity debe rechazar.
  createAdapterContractSuite(
    () => {
      const { handler } = buildHandler();
      return buildAdapterLike(handler);
    },
    {
      getEntityWithoutEntityId: 'resolve',
      failingEntityId: 'not-an-object-id',
    },
  );
});
