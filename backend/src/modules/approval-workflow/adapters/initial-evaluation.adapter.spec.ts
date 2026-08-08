import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Model, Types } from 'mongoose';

import { InitialEvaluationAdapter } from './initial-evaluation.adapter';
import { ApprovalWorkflowService } from '../approval-workflow.service';
import { ApprovalActor } from '../interfaces/approval-actor.interface';
import { ApprovalDecision } from '../enums/approval-decision.enum';
import { ApprovalEntity } from '../enums/approval-entity.enum';
import { ApprovalStatus } from '../enums/approval-status.enum';
import { ApplyDecisionContext } from './approval-adapter.interface';
import { ApprovalRequestDocument } from '../schemas/approval-request.schema';
import { ApprovalEventDocument } from '../schemas/approval-event.schema';
import { InitialEvaluationStatus } from '../../initial-evaluation/schemas/initial-evaluation.schema';
import { InitialEvaluationService } from '../../initial-evaluation/initial-evaluation.service';
import { UserDocument } from '../../users/schemas/user.schema';
import { createAdapterContractSuite } from './approval-adapter.contract.spec';

/** ObjectId válido de MongoDB para las pruebas. */
const COMPANY_ID = '64b000000000000000000001';
const EVALUATION_ID = '64b000000000000000000002';
const USER_ID = '64b000000000000000000004';

function buildActor(overrides?: Partial<ApprovalActor>): ApprovalActor {
  return {
    userId: USER_ID,
    email: 'manager@test.com',
    name: 'Maria Guzman',
    role: 'manager',
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildContext(overrides?: Partial<ApplyDecisionContext>): ApplyDecisionContext {
  return {
    companyId: new Types.ObjectId(COMPANY_ID),
    entityId: new Types.ObjectId(EVALUATION_ID),
    decision: ApprovalDecision.APPROVED,
    actor: buildActor(),
    ...overrides,
  };
}

/** Evaluación por defecto del stub (empresa correcta, pendiente de aprobación). */
function defaultEvaluation() {
  return {
    _id: new Types.ObjectId(EVALUATION_ID),
    companyId: new Types.ObjectId(COMPANY_ID),
    status: InitialEvaluationStatus.PENDING_APPROVAL,
    overallCompliance: 82,
    save: async function () {
      return this as unknown as { _id: Types.ObjectId; status: string };
    },
  };
}

/**
 * Stub de InitialEvaluationService que captura las llamadas reales al servicio.
 */
function buildEvaluationService(overrides?: {
  evaluation?: unknown;
  managerSignResult?: unknown;
}): {
  service: InitialEvaluationService;
  managerSignCalls: unknown[][];
} {
  const managerSignCalls: unknown[][] = [];
  const service = {
    findById: async () => overrides?.evaluation ?? defaultEvaluation(),
    findCurrent: async () => overrides?.evaluation ?? defaultEvaluation(),
    managerSign: async (...args: unknown[]) => {
      managerSignCalls.push(args);
      return (
        overrides?.managerSignResult ?? {
          ...defaultEvaluation(),
          status: InitialEvaluationStatus.APPROVED,
        }
      );
    },
  } as unknown as InitialEvaluationService;
  return { service, managerSignCalls };
}

/** Stub del User model que resuelve _id / firebaseUid. */
function buildUserModel(found = true): Model<UserDocument> {
  return {
    findById: () => ({ exec: async () => (found ? { _id: new Types.ObjectId(USER_ID), email: 'manager@test.com' } : null) }),
    findOne: () => ({ exec: async () => (found ? { _id: new Types.ObjectId(USER_ID), email: 'manager@test.com' } : null) }),
  } as unknown as Model<UserDocument>;
}

describe('InitialEvaluationAdapter', () => {
  it('implementa el contrato del ApprovalAdapter (module INITIAL_EVALUATION)', () => {
    const { service } = buildEvaluationService();
    const adapter = new InitialEvaluationAdapter(service, buildUserModel());

    assert.equal(adapter.module, ApprovalEntity.INITIAL_EVALUATION);
    assert.deepEqual(adapter.allowedRoles(), ['owner', 'manager']);
  });

  it('traduce InitialEvaluationStatus al ApprovalStatus canónico', () => {
    const { service } = buildEvaluationService();
    const adapter = new InitialEvaluationAdapter(service, buildUserModel());

    assert.equal(adapter.mapStatus(InitialEvaluationStatus.DRAFT), ApprovalStatus.DRAFT);
    assert.equal(adapter.mapStatus(InitialEvaluationStatus.IN_PROGRESS), ApprovalStatus.DRAFT);
    assert.equal(
      adapter.mapStatus(InitialEvaluationStatus.PENDING_APPROVAL),
      ApprovalStatus.PENDING_APPROVAL,
    );
    assert.equal(adapter.mapStatus(InitialEvaluationStatus.APPROVED), ApprovalStatus.APPROVED);
    assert.equal(adapter.mapStatus(InitialEvaluationStatus.ARCHIVED), ApprovalStatus.ARCHIVED);
    assert.equal(adapter.mapStatus('estado-desconocido'), ApprovalStatus.DRAFT);
  });

  it('getEntity por entityId retorna { entity, status, version } validando companyId', async () => {
    const { service } = buildEvaluationService();
    const adapter = new InitialEvaluationAdapter(service, buildUserModel());

    const result = await adapter.getEntity(COMPANY_ID, EVALUATION_ID);

    assert.ok(result.entity);
    assert.equal(result.status, InitialEvaluationStatus.PENDING_APPROVAL);
    assert.equal(result.version, 1);
  });

  it('getEntity sin entityId resuelve la evaluación vigente por companyId', async () => {
    const { service } = buildEvaluationService();
    const adapter = new InitialEvaluationAdapter(service, buildUserModel());

    const result = await adapter.getEntity(COMPANY_ID, undefined);

    assert.ok(result.entity);
    assert.equal(result.status, InitialEvaluationStatus.PENDING_APPROVAL);
    assert.equal(result.version, 1);
  });

  it('getEntity lanza NotFound si la evaluación pertenece a otra empresa', async () => {
    const { service } = buildEvaluationService();
    const adapter = new InitialEvaluationAdapter(service, buildUserModel());

    await assert.rejects(
      () => adapter.getEntity('64b0000000000000000000ff', EVALUATION_ID),
      /not found/,
    );
  });

  it('aprueba la evaluación reutilizando InitialEvaluationService.managerSign', async () => {
    const { service, managerSignCalls } = buildEvaluationService();
    const adapter = new InitialEvaluationAdapter(service, buildUserModel());

    const result = await adapter.applyDecision(
      buildContext({
        decision: ApprovalDecision.APPROVED,
        comments: 'Aprobada por gerencia',
        metadata: {
          signerName: 'Maria',
          signerEmail: 'maria@test.com',
          signatureUrl: 'https://firma.test/1',
        },
      }),
    );

    assert.equal(managerSignCalls.length, 1);
    const args = managerSignCalls[0];
    assert.equal((args[0] as Types.ObjectId).toString(), COMPANY_ID);
    const signer = args[1] as {
      signerName: string;
      signerEmail: string;
      signatureUrl: string;
      comments: string;
    };
    assert.equal(signer.signerName, 'Maria');
    assert.equal(signer.signerEmail, 'maria@test.com');
    assert.equal(signer.signatureUrl, 'https://firma.test/1');
    assert.equal(signer.comments, 'Aprobada por gerencia');
    assert.equal((args[2] as UserDocument)._id.toString(), USER_ID);
    assert.equal(
      (result as { status: InitialEvaluationStatus }).status,
      InitialEvaluationStatus.APPROVED,
    );
  });

  it('usa el nombre del actor cuando no llega signerName en metadata', async () => {
    const { service, managerSignCalls } = buildEvaluationService();
    const adapter = new InitialEvaluationAdapter(service, buildUserModel());

    await adapter.applyDecision(buildContext({ decision: ApprovalDecision.APPROVED }));

    assert.equal(managerSignCalls.length, 1);
    const signer = managerSignCalls[0][1] as { signerName: string; signerEmail: string };
    assert.equal(signer.signerName, 'Maria Guzman');
    assert.equal(signer.signerEmail, 'manager@test.com');
  });

  it('resuelve el usuario aprobador por firebaseUid', async () => {
    const { service, managerSignCalls } = buildEvaluationService();
    const adapter = new InitialEvaluationAdapter(service, buildUserModel());

    await adapter.applyDecision(
      buildContext({
        decision: ApprovalDecision.APPROVED,
        actor: buildActor({ userId: 'firebase-uid-123' }),
      }),
    );

    assert.equal(managerSignCalls.length, 1);
    assert.equal((managerSignCalls[0][2] as UserDocument)._id.toString(), USER_ID);
  });

  it('lanza NotFound si el usuario por firebaseUid no existe', async () => {
    const { service } = buildEvaluationService();
    const adapter = new InitialEvaluationAdapter(service, buildUserModel(false));

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

  it('rechaza REJECTED (no soportado por la Evaluación Inicial)', async () => {
    const { service } = buildEvaluationService();
    const adapter = new InitialEvaluationAdapter(service, buildUserModel());

    await assert.rejects(
      () =>
        adapter.applyDecision(
          buildContext({ decision: ApprovalDecision.REJECTED, reason: 'Falta evidencia' }),
        ),
      /does not support rejection/,
    );
  });

  it('rechaza ADJUSTMENTS_REQUESTED (no soportado)', async () => {
    const { service } = buildEvaluationService();
    const adapter = new InitialEvaluationAdapter(service, buildUserModel());

    await assert.rejects(
      () =>
        adapter.applyDecision(
          buildContext({ decision: ApprovalDecision.ADJUSTMENTS_REQUESTED }),
        ),
      /not supported/,
    );
  });
});

describe('Integración ApprovalWorkflowService + InitialEvaluationAdapter', () => {
  it('crea la solicitud, aprueba y registra los eventos CREATED + APPROVED', async () => {
    const { service: evaluationService, managerSignCalls } = buildEvaluationService();
    const adapter = new InitialEvaluationAdapter(evaluationService, buildUserModel());
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

    // 1. Creación de solicitud (submit-approval).
    const created = await workflow.createRequest(
      COMPANY_ID,
      {
        module: ApprovalEntity.INITIAL_EVALUATION,
        entityType: 'InitialEvaluation',
        entityId: EVALUATION_ID,
        comments: 'Envío a firma gerencial',
      },
      buildActor(),
    );
    assert.equal(created.status, ApprovalStatus.PENDING_APPROVAL);
    assert.equal(events.length, 1);
    assert.equal((events[0] as { action: string }).action, 'CREATED');

    // 2. Aprobación delegada al adapter (manager-sign).
    const result = await workflow.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.INITIAL_EVALUATION,
      EVALUATION_ID,
      { decision: ApprovalDecision.APPROVED, comments: 'OK' },
      buildActor(),
    );

    assert.equal(managerSignCalls.length, 1);
    assert.equal(result.request?.status, ApprovalStatus.APPROVED);
    assert.equal(events.length, 2);
    assert.equal((events[1] as { action: string }).action, ApprovalDecision.APPROVED);
  });

  it('aplica decisiones legacy sin ApprovalRequest creando solicitud histórica y evento', async () => {
    const { service: evaluationService, managerSignCalls } = buildEvaluationService();
    const adapter = new InitialEvaluationAdapter(evaluationService, buildUserModel());
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
      ApprovalEntity.INITIAL_EVALUATION,
      EVALUATION_ID,
      { decision: ApprovalDecision.APPROVED },
      buildActor(),
    );

    assert.equal(managerSignCalls.length, 1);
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

describe('InitialEvaluationAdapter Contract', () => {
  // Suite de contrato reutilizable: valida la interfaz y los comportamientos
  // mínimos del ApprovalAdapter. `failingEntityId` no es un ObjectId válido
  // (getEntity debe rechazar) y `getEntityWithoutEntityId: 'resolve'` valida el
  // caso por companyId (una evaluación por empresa).
  createAdapterContractSuite(
    () => {
      const { service } = buildEvaluationService();
      return new InitialEvaluationAdapter(service, buildUserModel());
    },
    { failingEntityId: 'not-an-object-id', getEntityWithoutEntityId: 'resolve' },
  );
});
