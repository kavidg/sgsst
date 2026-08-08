import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Model, Types } from 'mongoose';

import { ResponsibilityMatrixAdapter } from './responsibility-matrix.adapter';
import { ApprovalWorkflowService } from '../approval-workflow.service';
import { ApprovalActor } from '../interfaces/approval-actor.interface';
import { ApprovalDecision } from '../enums/approval-decision.enum';
import { ApprovalEntity } from '../enums/approval-entity.enum';
import { ApprovalStatus } from '../enums/approval-status.enum';
import { ApplyDecisionContext } from './approval-adapter.interface';
import { ApprovalRequestDocument } from '../schemas/approval-request.schema';
import { ApprovalEventDocument } from '../schemas/approval-event.schema';
import { MatrixApprovalStatus } from '../../responsibility-matrix/schemas/responsibility-matrix.schema';
import { ResponsibilityMatrixService } from '../../responsibility-matrix/responsibility-matrix.service';
import { createAdapterContractSuite } from './approval-adapter.contract.spec';

/** ObjectId válido de MongoDB para las pruebas. */
const COMPANY_ID = '64b000000000000000000001';
const MATRIX_ID = '64b000000000000000000002';
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
    entityId: new Types.ObjectId(MATRIX_ID),
    decision: ApprovalDecision.APPROVED,
    actor: buildActor(),
    ...overrides,
  };
}

/** Matriz por defecto devuelta por el stub del servicio. */
function buildMatrix(overrides?: Record<string, unknown>) {
  return {
    _id: new Types.ObjectId(MATRIX_ID),
    companyId: new Types.ObjectId(COMPANY_ID),
    approvalStatus: MatrixApprovalStatus.PENDING_APPROVAL,
    currentVersionNumber: 2,
    items: [],
    ...overrides,
  };
}

/**
 * Stub de ResponsibilityMatrixService que captura las llamadas reales al
 * servicio de aprobación.
 */
function buildMatrixService(overrides?: {
  matrix?: Record<string, unknown>;
  approveResult?: unknown;
}): { service: ResponsibilityMatrixService; approveCalls: unknown[][] } {
  const approveCalls: unknown[][] = [];
  const matrix = buildMatrix(overrides?.matrix);
  const service = {
    findById: async () => matrix,
    findByCompany: async () => matrix,
    approve: async (...args: unknown[]) => {
      approveCalls.push(args);
      return overrides?.approveResult ?? { ...matrix, approvalStatus: MatrixApprovalStatus.APPROVED };
    },
  } as unknown as ResponsibilityMatrixService;
  return { service, approveCalls };
}

describe('ResponsibilityMatrixAdapter', () => {
  it('implementa el contrato del ApprovalAdapter (module RESPONSIBILITY_MATRIX)', () => {
    const { service } = buildMatrixService();
    const adapter = new ResponsibilityMatrixAdapter(service);

    assert.equal(adapter.module, ApprovalEntity.RESPONSIBILITY_MATRIX);
    assert.deepEqual(adapter.allowedRoles(), ['owner', 'admin', 'manager']);
  });

  it('traduce MatrixApprovalStatus al ApprovalStatus canónico', () => {
    const { service } = buildMatrixService();
    const adapter = new ResponsibilityMatrixAdapter(service);

    assert.equal(adapter.mapStatus(MatrixApprovalStatus.DRAFT), ApprovalStatus.DRAFT);
    assert.equal(adapter.mapStatus(MatrixApprovalStatus.PENDING_APPROVAL), ApprovalStatus.PENDING_APPROVAL);
    assert.equal(adapter.mapStatus(MatrixApprovalStatus.APPROVED), ApprovalStatus.APPROVED);
    assert.equal(adapter.mapStatus(MatrixApprovalStatus.ARCHIVED), ApprovalStatus.ARCHIVED);
    assert.equal(adapter.mapStatus('estado-desconocido'), ApprovalStatus.DRAFT);
  });

  it('getEntity por entityId retorna { entity, status, version } validando companyId', async () => {
    const { service } = buildMatrixService();
    const adapter = new ResponsibilityMatrixAdapter(service);

    const result = await adapter.getEntity(COMPANY_ID, MATRIX_ID);

    assert.ok(result.entity);
    assert.equal(result.status, MatrixApprovalStatus.PENDING_APPROVAL);
    assert.equal(result.version, 2);
  });

  it('getEntity por companyId sin entityId resuelve la matriz de la empresa', async () => {
    const { service } = buildMatrixService();
    const adapter = new ResponsibilityMatrixAdapter(service);

    const result = await adapter.getEntity(COMPANY_ID, undefined);

    assert.ok(result.entity);
    assert.equal(result.status, MatrixApprovalStatus.PENDING_APPROVAL);
    assert.equal(result.version, 2);
  });

  it('getEntity lanza NotFound si la matriz pertenece a otra empresa', async () => {
    const { service } = buildMatrixService();
    const adapter = new ResponsibilityMatrixAdapter(service);

    await assert.rejects(
      () => adapter.getEntity('64b0000000000000000000ff', MATRIX_ID),
      /not found/,
    );
  });

  it('aprueba la matriz reutilizando ResponsibilityMatrixService.approve', async () => {
    const { service, approveCalls } = buildMatrixService();
    const adapter = new ResponsibilityMatrixAdapter(service);

    const result = await adapter.applyDecision(
      buildContext({
        decision: ApprovalDecision.APPROVED,
        comments: 'Matriz aprobada',
        metadata: {
          approvedByEmail: 'owner@test.com',
        },
      }),
    );

    assert.equal(approveCalls.length, 1);
    const args = approveCalls[0];
    assert.equal((args[0] as Types.ObjectId).toString(), COMPANY_ID);
    assert.equal((args[1] as { approvedByEmail: string }).approvedByEmail, 'owner@test.com');
    assert.equal((args[1] as { comments: string }).comments, 'Matriz aprobada');
    assert.equal(args[2], 'manager@test.com');
    assert.equal((result as { approvalStatus: string }).approvalStatus, MatrixApprovalStatus.APPROVED);
  });

  it('usa el email del actor cuando no llega approvedByEmail en metadata', async () => {
    const { service, approveCalls } = buildMatrixService();
    const adapter = new ResponsibilityMatrixAdapter(service);

    await adapter.applyDecision(buildContext({ decision: ApprovalDecision.APPROVED }));

    assert.equal(approveCalls.length, 1);
    assert.equal((approveCalls[0][1] as { approvedByEmail: string }).approvedByEmail, 'manager@test.com');
  });

  it('lanza NotFound si la matriz pertenece a otra empresa en applyDecision', async () => {
    const { service } = buildMatrixService();
    const adapter = new ResponsibilityMatrixAdapter(service);

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

  it('rechaza REJECTED (no soportado por la Matriz de Responsabilidades)', async () => {
    const { service } = buildMatrixService();
    const adapter = new ResponsibilityMatrixAdapter(service);

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
    const { service } = buildMatrixService();
    const adapter = new ResponsibilityMatrixAdapter(service);

    await assert.rejects(
      () =>
        adapter.applyDecision(
          buildContext({ decision: ApprovalDecision.ADJUSTMENTS_REQUESTED }),
        ),
      /not supported/,
    );
  });
});

describe('Integración ApprovalWorkflowService + ResponsibilityMatrixAdapter', () => {
  it('crea la solicitud, aprueba y registra los eventos CREATED + APPROVED', async () => {
    const { service: matrixService, approveCalls } = buildMatrixService();
    const adapter = new ResponsibilityMatrixAdapter(matrixService);
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
        module: ApprovalEntity.RESPONSIBILITY_MATRIX,
        entityType: 'ResponsibilityMatrix',
        entityId: MATRIX_ID,
        comments: 'Aprobación de la matriz',
      },
      buildActor(),
    );
    assert.equal(created.status, ApprovalStatus.PENDING_APPROVAL);
    assert.equal(events.length, 1);
    assert.equal((events[0] as { action: string }).action, 'CREATED');

    // 2. Aprobación delegada al adapter.
    const result = await workflow.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.RESPONSIBILITY_MATRIX,
      MATRIX_ID,
      { decision: ApprovalDecision.APPROVED, comments: 'OK' },
      buildActor(),
    );

    assert.equal(approveCalls.length, 1);
    assert.equal(result.request?.status, ApprovalStatus.APPROVED);
    assert.equal(events.length, 2);
    assert.equal((events[1] as { action: string }).action, ApprovalDecision.APPROVED);
  });

  it('aplica decisiones legacy sin ApprovalRequest creando solicitud histórica y evento', async () => {
    const { service: matrixService, approveCalls } = buildMatrixService();
    const adapter = new ResponsibilityMatrixAdapter(matrixService);
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
      ApprovalEntity.RESPONSIBILITY_MATRIX,
      MATRIX_ID,
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

describe('ResponsibilityMatrixAdapter Contract', () => {
  // Suite de contrato reutilizable: valida la interfaz y los comportamientos
  // mínimos del ApprovalAdapter. `getEntityWithoutEntityId: 'resolve'` porque
  // la matriz se resuelve por companyId (una por empresa). `failingEntityId`
  // no es un ObjectId válido: getEntity debe rechazar.
  createAdapterContractSuite(
    () => {
      const { service } = buildMatrixService();
      return new ResponsibilityMatrixAdapter(service);
    },
    {
      getEntityWithoutEntityId: 'resolve',
      failingEntityId: 'not-an-object-id',
    },
  );
});
