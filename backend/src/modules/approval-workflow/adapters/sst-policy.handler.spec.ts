import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Model, Types } from 'mongoose';

import { SstPolicyHandler } from './handlers/sst-policy.handler';
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
    itemCode: '2.1.1',
    status: 'Borrador',
    currentVersion: '1.0',
    signatures: [],
    versions: [],
    history: [],
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
}): {
  service: PhvaAdvancedService;
  approveCalls: unknown[][];
} {
  const approveCalls: unknown[][] = [];
  const record = buildRecord(overrides?.record);
  const service = {
    findSstPolicyById: async () => record,
    findSstPolicyByCompany: async () => record,
    approveSstPolicy: async (...args: unknown[]) => {
      approveCalls.push(args);
      return overrides?.approveResult ?? {
        ...record,
        status: 'Aprobado',
      };
    },
  } as unknown as PhvaAdvancedService;
  return { service, approveCalls };
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
function buildAdapterLike(handler: SstPolicyHandler): ApprovalAdapter {
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
  handler: SstPolicyHandler;
  approveCalls: unknown[][];
} {
  const { service, approveCalls } = overrides?.service
    ? { service: overrides.service, approveCalls: [] }
    : buildPhvaAdvancedService();
  const handler = new SstPolicyHandler(
    service,
    overrides?.userModel ?? buildUserModel(),
  );
  return { handler, approveCalls };
}

describe('SstPolicyHandler', () => {
  it('implementa el contrato del ApprovalAdapter (module PHVA_ADVANCED vía adapter)', () => {
    const { handler } = buildHandler();
    assert.deepEqual(handler.allowedRoles(), ['owner', 'manager']);
  });

  it('traduce los estados en español del schema al ApprovalStatus canónico', () => {
    const { handler } = buildHandler();

    assert.equal(handler.mapStatus('Borrador'), ApprovalStatus.DRAFT);
    assert.equal(handler.mapStatus('Pendiente aprobación'), ApprovalStatus.PENDING_APPROVAL);
    assert.equal(handler.mapStatus('Aprobado'), ApprovalStatus.APPROVED);
    // 'Vencido' es un ciclo cerrado: misma equivalencia que 'Archivado'.
    assert.equal(handler.mapStatus('Vencido'), ApprovalStatus.ARCHIVED);
    assert.equal(handler.mapStatus('Archivado'), ApprovalStatus.ARCHIVED);
    // Estado desconocido → DRAFT (equivalencia explícita).
    assert.equal(handler.mapStatus('estado-desconocido'), ApprovalStatus.DRAFT);
  });

  it('getEntity por entityId retorna { entity, status, version } validando companyId', async () => {
    const { handler } = buildHandler();

    const result = await handler.getEntity(COMPANY_ID, RECORD_ID);

    assert.ok(result.entity);
    assert.equal(result.status, 'Borrador');
    assert.equal(result.version, 1);
  });

  it('getEntity por companyId sin entityId resuelve la política vigente', async () => {
    const { handler } = buildHandler();

    const result = await handler.getEntity(COMPANY_ID, undefined);

    assert.ok(result.entity);
    assert.equal(result.status, 'Borrador');
    assert.equal(result.version, 1);
  });

  it('getEntity lanza NotFound si la política pertenece a otra empresa', async () => {
    const { handler } = buildHandler();

    await assert.rejects(
      () => handler.getEntity('64b0000000000000000000ff', RECORD_ID),
      /not found/,
    );
  });

  it('aprueba reutilizando approveSstPolicy con la empresa y el usuario resuelto', async () => {
    const { handler, approveCalls } = buildHandler();

    const result = await handler.applyDecision(
      buildContext({
        decision: ApprovalDecision.APPROVED,
        metadata: {
          approvedByEmail: 'owner@test.com',
          approvedByName: 'Owner',
          signatureUrl: 'https://storage/…/firma.png',
          comments: 'Política aprobada',
        },
      }),
    );

    assert.equal(approveCalls.length, 1);
    const args = approveCalls[0];
    assert.equal((args[0] as Types.ObjectId).toString(), COMPANY_ID);
    assert.equal((args[1] as { email: string }).email, 'manager@test.com');
    assert.equal((result as { status: string }).status, 'Aprobado');
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

  it('rechaza REJECTED con BadRequest controlado (no existe rechazo real)', async () => {
    const { handler, approveCalls } = buildHandler();

    await assert.rejects(
      () =>
        handler.applyDecision(
          buildContext({
            decision: ApprovalDecision.REJECTED,
            reason: 'Falta firma del representante legal',
          }),
        ),
      /does not support rejection/,
    );

    // No debe delegar a approveSstPolicy ni inventar transiciones.
    assert.equal(approveCalls.length, 0);
  });

  it('rechaza ADJUSTMENTS_REQUESTED con BadRequest controlado (no existe flujo real)', async () => {
    const { handler, approveCalls } = buildHandler();

    await assert.rejects(
      () =>
        handler.applyDecision(
          buildContext({
            decision: ApprovalDecision.ADJUSTMENTS_REQUESTED,
            comments: 'Ajustar redacción',
          }),
        ),
      /does not support adjustments/,
    );

    assert.equal(approveCalls.length, 0);
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

  it('lanza NotFound si la política pertenece a otra empresa en applyDecision', async () => {
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

describe('Integración ApprovalWorkflowService + SstPolicyHandler', () => {
  it('crea la solicitud, aprueba y registra los eventos CREATED + APPROVED', async () => {
    const { service: phvaService, approveCalls } = buildPhvaAdvancedService();
    const handler = new SstPolicyHandler(phvaService, buildUserModel());
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
        entityType: 'PhvaAdvancedSstPolicy',
        entityId: RECORD_ID,
        comments: 'Aprobación de la Política de Seguridad y Salud en el Trabajo (2.1.1)',
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

  it('aplica decisiones legacy sin ApprovalRequest creando solicitud histórica y evento', async () => {
    const { service: phvaService, approveCalls } = buildPhvaAdvancedService();
    const handler = new SstPolicyHandler(phvaService, buildUserModel());
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

describe('SstPolicyHandler Contract', () => {
  // Suite de contrato reutilizable: valida la interfaz y los comportamientos
  // mínimos del ApprovalAdapter. Se ejecuta contra el handler envuelto como
  // ApprovalAdapter (module PHVA_ADVANCED). `getEntityWithoutEntityId:
  // 'resolve'` porque la política vigente se resuelve por companyId.
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
