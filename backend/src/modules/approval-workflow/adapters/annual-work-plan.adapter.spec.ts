import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Model, Types } from 'mongoose';

import { AnnualWorkPlanAdapter } from './annual-work-plan.adapter';
import { ApprovalWorkflowService } from '../approval-workflow.service';
import { ApprovalActor } from '../interfaces/approval-actor.interface';
import { ApprovalDecision } from '../enums/approval-decision.enum';
import { ApprovalEntity } from '../enums/approval-entity.enum';
import { ApprovalStatus } from '../enums/approval-status.enum';
import { ApplyDecisionContext } from './approval-adapter.interface';
import { ApprovalRequestDocument } from '../schemas/approval-request.schema';
import { ApprovalEventDocument } from '../schemas/approval-event.schema';
import { AnnualWorkPlanStatus } from '../../annual-work-plan/schemas/annual-work-plan.schema';
import { AnnualWorkPlanService } from '../../annual-work-plan/services/annual-work-plan.service';
import { UserDocument } from '../../users/schemas/user.schema';
import { createAdapterContractSuite } from './approval-adapter.contract.spec';

/** ObjectId válido de MongoDB para las pruebas. */
const COMPANY_ID = '64b000000000000000000001';
const PLAN_ID = '64b000000000000000000002';
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
    entityId: new Types.ObjectId(PLAN_ID),
    decision: ApprovalDecision.APPROVED,
    actor: buildActor(),
    ...overrides,
  };
}

/**
 * Stub de AnnualWorkPlanService que captura las llamadas reales al servicio.
 */
function buildPlanService(overrides?: {
  plan?: unknown;
  approveResult?: unknown;
}): {
  service: AnnualWorkPlanService;
  approveCalls: unknown[][];
} {
  const approveCalls: unknown[][] = [];
  const service = {
    findById: async () =>
      overrides?.plan ?? {
        _id: new Types.ObjectId(PLAN_ID),
        companyId: new Types.ObjectId(COMPANY_ID),
        status: AnnualWorkPlanStatus.DRAFT,
        year: 2026,
      },
    approve: async (...args: unknown[]) => {
      approveCalls.push(args);
      return overrides?.approveResult ?? {
        _id: new Types.ObjectId(PLAN_ID),
        companyId: new Types.ObjectId(COMPANY_ID),
        status: AnnualWorkPlanStatus.ACTIVE,
        year: 2026,
        approval: { approvedBy: args[0], approvalDate: new Date() },
      };
    },
  } as unknown as AnnualWorkPlanService;
  return { service, approveCalls };
}

/** Stub del User model que resuelve firebaseUid → _id. */
function buildUserModel(found = true): Model<UserDocument> {
  return {
    findOne: () => ({
      lean: () => ({
        exec: async () =>
          found ? { _id: new Types.ObjectId(USER_ID) } : null,
      }),
    }),
  } as unknown as Model<UserDocument>;
}

describe('AnnualWorkPlanAdapter', () => {
  it('implementa el contrato del ApprovalAdapter (module ANNUAL_WORK_PLAN)', () => {
    const { service } = buildPlanService();
    const adapter = new AnnualWorkPlanAdapter(service, buildUserModel());

    assert.equal(adapter.module, ApprovalEntity.ANNUAL_WORK_PLAN);
    assert.deepEqual(adapter.allowedRoles(), ['owner', 'manager']);
  });

  it('traduce AnnualWorkPlanStatus al ApprovalStatus canónico', () => {
    const { service } = buildPlanService();
    const adapter = new AnnualWorkPlanAdapter(service, buildUserModel());

    assert.equal(adapter.mapStatus('Draft'), ApprovalStatus.DRAFT);
    assert.equal(adapter.mapStatus('PendingApproval'), ApprovalStatus.PENDING_APPROVAL);
    assert.equal(adapter.mapStatus('PENDING_APPROVAL'), ApprovalStatus.PENDING_APPROVAL);
    assert.equal(adapter.mapStatus('Active'), ApprovalStatus.APPROVED);
    assert.equal(adapter.mapStatus('Completed'), ApprovalStatus.APPROVED);
    assert.equal(adapter.mapStatus('Archived'), ApprovalStatus.ARCHIVED);
    assert.equal(adapter.mapStatus('estado-desconocido'), ApprovalStatus.DRAFT);
  });

  it('getEntity retorna { entity, status, version } validando companyId', async () => {
    const { service } = buildPlanService();
    const adapter = new AnnualWorkPlanAdapter(service, buildUserModel());

    const result = await adapter.getEntity(COMPANY_ID, PLAN_ID);

    assert.ok(result.entity);
    assert.equal(result.status, AnnualWorkPlanStatus.DRAFT);
    assert.equal(result.version, 1);
  });

  it('getEntity lanza NotFound si el plan pertenece a otra empresa', async () => {
    const { service } = buildPlanService();
    const adapter = new AnnualWorkPlanAdapter(service, buildUserModel());

    await assert.rejects(
      () => adapter.getEntity('64b0000000000000000000ff', PLAN_ID),
      /not found/,
    );
  });

  it('aprueba el plan reutilizando AnnualWorkPlanService.approve', async () => {
    const { service, approveCalls } = buildPlanService();
    const adapter = new AnnualWorkPlanAdapter(service, buildUserModel());

    const result = await adapter.applyDecision(
      buildContext({
        decision: ApprovalDecision.APPROVED,
        comments: 'Plan aprobado',
        metadata: {
          approvedById: USER_ID,
          signerName: 'Maria',
          signerEmail: 'maria@test.com',
          signatureHash: 'hash-1',
          signatureUrl: 'https://firma.test/1',
        },
      }),
    );

    assert.equal(approveCalls.length, 1);
    const args = approveCalls[0];
    assert.equal((args[0] as Types.ObjectId).toString(), PLAN_ID);
    assert.equal((args[1] as Types.ObjectId).toString(), USER_ID);
    assert.equal(args[2], 'maria@test.com');
    assert.equal(args[3], 'Maria');
    assert.equal(args[4], 'hash-1');
    assert.equal(args[5], 'https://firma.test/1');
    assert.equal(args[6], 'Plan aprobado');
    assert.equal((result as { status: AnnualWorkPlanStatus }).status, AnnualWorkPlanStatus.ACTIVE);
  });

  it('resuelve approvedBy desde el actor cuando es un ObjectId válido', async () => {
    const { service, approveCalls } = buildPlanService();
    const adapter = new AnnualWorkPlanAdapter(service, buildUserModel());

    await adapter.applyDecision(buildContext({ decision: ApprovalDecision.APPROVED }));

    assert.equal(approveCalls.length, 1);
    assert.equal((approveCalls[0][1] as Types.ObjectId).toString(), USER_ID);
  });

  it('resuelve approvedBy buscando el usuario por firebaseUid', async () => {
    const { service, approveCalls } = buildPlanService();
    const adapter = new AnnualWorkPlanAdapter(service, buildUserModel());

    await adapter.applyDecision(
      buildContext({
        decision: ApprovalDecision.APPROVED,
        actor: buildActor({ userId: 'firebase-uid-123' }),
      }),
    );

    assert.equal(approveCalls.length, 1);
    assert.equal((approveCalls[0][1] as Types.ObjectId).toString(), USER_ID);
  });

  it('lanza NotFound si el usuario por firebaseUid no existe', async () => {
    const { service } = buildPlanService();
    const adapter = new AnnualWorkPlanAdapter(service, buildUserModel(false));

    await assert.rejects(
      () =>
        adapter.applyDecision(
          buildContext({
            decision: ApprovalDecision.APPROVED,
            actor: buildActor({ userId: 'firebase-uid-unknown' }),
          }),
        ),
      /not found/,
    );
  });

  it('lanza BadRequest si el plan pertenece a otra empresa en applyDecision', async () => {
    const { service } = buildPlanService();
    const adapter = new AnnualWorkPlanAdapter(service, buildUserModel());

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

  it('rechaza REJECTED (no soportado por el Plan Anual)', async () => {
    const { service } = buildPlanService();
    const adapter = new AnnualWorkPlanAdapter(service, buildUserModel());

    await assert.rejects(
      () =>
        adapter.applyDecision(
          buildContext({
            decision: ApprovalDecision.REJECTED,
            reason: 'Falta evidencia',
          }),
        ),
      /not supported/,
    );
  });

  it('rechaza ADJUSTMENTS_REQUESTED (no soportado)', async () => {
    const { service } = buildPlanService();
    const adapter = new AnnualWorkPlanAdapter(service, buildUserModel());

    await assert.rejects(
      () =>
        adapter.applyDecision(
          buildContext({ decision: ApprovalDecision.ADJUSTMENTS_REQUESTED }),
        ),
      /not supported/,
    );
  });
});

describe('Integración ApprovalWorkflowService + AnnualWorkPlanAdapter', () => {
  it('crea la solicitud, aprueba y registra los eventos CREATED + APPROVED', async () => {
    const { service: planService, approveCalls } = buildPlanService();
    const adapter = new AnnualWorkPlanAdapter(planService, buildUserModel());
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
        module: ApprovalEntity.ANNUAL_WORK_PLAN,
        entityType: 'AnnualWorkPlan',
        entityId: PLAN_ID,
        comments: 'Aprobación del plan anual',
      },
      buildActor(),
    );
    assert.equal(created.status, ApprovalStatus.PENDING_APPROVAL);
    assert.equal(events.length, 1);
    assert.equal((events[0] as { action: string }).action, 'CREATED');

    // 2. Aprobación delegada al adapter.
    const result = await workflow.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.ANNUAL_WORK_PLAN,
      PLAN_ID,
      { decision: ApprovalDecision.APPROVED, comments: 'OK' },
      buildActor(),
    );

    assert.equal(approveCalls.length, 1);
    assert.equal(result.request?.status, ApprovalStatus.APPROVED);
    assert.equal(events.length, 2);
    assert.equal((events[1] as { action: string }).action, ApprovalDecision.APPROVED);
  });

  it('aplica decisiones legacy sin ApprovalRequest creando solicitud histórica y evento', async () => {
    const { service: planService, approveCalls } = buildPlanService();
    const adapter = new AnnualWorkPlanAdapter(planService, buildUserModel());
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
      ApprovalEntity.ANNUAL_WORK_PLAN,
      PLAN_ID,
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

describe('AnnualWorkPlanAdapter Contract', () => {
  // Suite de contrato reutilizable: valida la interfaz y los comportamientos
  // mínimos del ApprovalAdapter. `failingEntityId` no es un ObjectId válido:
  // getEntity debe rechazar (no silenciar el error del mapeo de la entidad).
  createAdapterContractSuite(
    () => {
      const { service } = buildPlanService();
      return new AnnualWorkPlanAdapter(service, buildUserModel());
    },
    { failingEntityId: 'not-an-object-id' },
  );
});
