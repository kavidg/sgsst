import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Model, Types } from 'mongoose';

import { DocumentAdapter } from './document.adapter';
import { ApprovalWorkflowService } from '../approval-workflow.service';
import { ApprovalActor } from '../interfaces/approval-actor.interface';
import { ApprovalDecision } from '../enums/approval-decision.enum';
import { ApprovalEntity } from '../enums/approval-entity.enum';
import { ApprovalStatus } from '../enums/approval-status.enum';
import { ApplyDecisionContext } from './approval-adapter.interface';
import {
  ApprovalRequestDocument,
} from '../schemas/approval-request.schema';
import { ApprovalEventDocument } from '../schemas/approval-event.schema';
import { DocumentMasterService } from '../../document-management/services/document-master.service';
import { DocumentStatus } from '../../document-management/schemas/document-master.schema';
import { UserDocument } from '../../users/schemas/user.schema';
import { createAdapterContractSuite } from './approval-adapter.contract.spec';

/** ObjectId válido de MongoDB para las pruebas. */
const COMPANY_ID = '64b000000000000000000001';
const DOCUMENT_ID = '64b000000000000000000002';
const APPROVAL_ID = '64b000000000000000000003';
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
    entityId: new Types.ObjectId(DOCUMENT_ID),
    decision: ApprovalDecision.APPROVED,
    actor: buildActor(),
    ...overrides,
  };
}

/**
 * Stub de DocumentMasterService que captura las llamadas reales al servicio.
 */
function buildDocumentService(overrides?: {
  pendingApproval?: unknown;
  approveResult?: unknown;
  rejectResult?: unknown;
}): {
  service: DocumentMasterService;
  approveCalls: unknown[][];
  rejectCalls: unknown[][];
} {
  const approveCalls: unknown[][] = [];
  const rejectCalls: unknown[][] = [];
  const service = {
    findById: async () => ({
      _id: new Types.ObjectId(DOCUMENT_ID),
      status: DocumentStatus.DRAFT,
    }),
    findPendingApprovalByDocument: async () =>
      overrides?.pendingApproval === undefined
        ? { _id: new Types.ObjectId(APPROVAL_ID) }
        : overrides.pendingApproval,
    findApprovalById: async () => ({
      documentId: new Types.ObjectId(DOCUMENT_ID),
    }),
    approve: async (...args: unknown[]) => {
      approveCalls.push(args);
      return overrides?.approveResult ?? { approval: { _id: APPROVAL_ID }, document: { _id: DOCUMENT_ID } };
    },
    reject: async (...args: unknown[]) => {
      rejectCalls.push(args);
      return overrides?.rejectResult ?? { _id: APPROVAL_ID, status: 'REJECTED' };
    },
  } as unknown as DocumentMasterService;
  return { service, approveCalls, rejectCalls };
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

describe('DocumentAdapter', () => {
  it('implementa el contrato del ApprovalAdapter (module DOCUMENT)', () => {
    const { service } = buildDocumentService();
    const adapter = new DocumentAdapter(service, buildUserModel());

    assert.equal(adapter.module, ApprovalEntity.DOCUMENT);
    assert.deepEqual(adapter.allowedRoles(), ['owner', 'manager']);
  });

  it('traduce DocumentStatus al ApprovalStatus canónico', () => {
    const { service } = buildDocumentService();
    const adapter = new DocumentAdapter(service, buildUserModel());

    assert.equal(
      adapter.mapStatus(DocumentStatus.PENDING_APPROVAL),
      ApprovalStatus.PENDING_APPROVAL,
    );
    assert.equal(adapter.mapStatus(DocumentStatus.APPROVED), ApprovalStatus.APPROVED);
    assert.equal(adapter.mapStatus(DocumentStatus.ACTIVE), ApprovalStatus.APPROVED);
    assert.equal(adapter.mapStatus(DocumentStatus.DRAFT), ApprovalStatus.DRAFT);
    assert.equal(adapter.mapStatus(DocumentStatus.UNDER_REVIEW), ApprovalStatus.DRAFT);
  });

  it('aprueba el documento reutilizando DocumentMasterService.approve', async () => {
    const { service, approveCalls } = buildDocumentService();
    const adapter = new DocumentAdapter(service, buildUserModel());

    const result = await adapter.applyDecision(
      buildContext({
        decision: ApprovalDecision.APPROVED,
        comments: 'Se aprueba',
        metadata: {
          approvedById: USER_ID,
          signatureHash: 'hash-1',
          signerName: 'Maria',
          signerEmail: 'maria@test.com',
        },
      }),
    );

    assert.equal(approveCalls.length, 1);
    const args = approveCalls[0];
    assert.equal((args[0] as Types.ObjectId).toString(), APPROVAL_ID);
    assert.equal((args[1] as Types.ObjectId).toString(), COMPANY_ID);
    assert.equal((args[2] as Types.ObjectId).toString(), USER_ID);
    assert.equal(args[3], 'Se aprueba');
    assert.equal(args[4], 'hash-1');
    assert.equal(args[6], 'Maria');
    assert.equal(args[7], 'maria@test.com');
    assert.deepEqual(result, { approval: { _id: APPROVAL_ID }, document: { _id: DOCUMENT_ID } });
  });

  it('resuelve approvedBy desde el actor cuando es un ObjectId válido', async () => {
    const { service, approveCalls } = buildDocumentService();
    const adapter = new DocumentAdapter(service, buildUserModel());

    await adapter.applyDecision(buildContext({ decision: ApprovalDecision.APPROVED }));

    assert.equal(approveCalls.length, 1);
    assert.equal((approveCalls[0][2] as Types.ObjectId).toString(), USER_ID);
  });

  it('resuelve approvedBy buscando el usuario por firebaseUid', async () => {
    const { service, approveCalls } = buildDocumentService();
    const adapter = new DocumentAdapter(service, buildUserModel());

    await adapter.applyDecision(
      buildContext({
        decision: ApprovalDecision.APPROVED,
        actor: buildActor({ userId: 'firebase-uid-123' }),
      }),
    );

    assert.equal(approveCalls.length, 1);
    assert.equal((approveCalls[0][2] as Types.ObjectId).toString(), USER_ID);
  });

  it('lanza NotFound si el usuario por firebaseUid no existe', async () => {
    const { service } = buildDocumentService();
    const adapter = new DocumentAdapter(service, buildUserModel(false));

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

  it('rechaza el documento reutilizando DocumentMasterService.reject', async () => {
    const { service, rejectCalls } = buildDocumentService();
    const adapter = new DocumentAdapter(service, buildUserModel());

    const result = await adapter.applyDecision(
      buildContext({ decision: ApprovalDecision.REJECTED, reason: 'Falta evidencia' }),
    );

    assert.equal(rejectCalls.length, 1);
    assert.equal((rejectCalls[0][0] as Types.ObjectId).toString(), APPROVAL_ID);
    assert.equal(rejectCalls[0][1], 'Falta evidencia');
    assert.deepEqual(result, { _id: APPROVAL_ID, status: 'REJECTED' });
  });

  it('lanza NotFound si no hay aprobación documental pendiente', async () => {
    const { service } = buildDocumentService({ pendingApproval: null });
    const adapter = new DocumentAdapter(service, buildUserModel());

    await assert.rejects(
      () => adapter.applyDecision(buildContext({ decision: ApprovalDecision.APPROVED })),
      /No pending document approval/,
    );
  });

  it('rechaza ADJUSTMENTS_REQUESTED (no soportado por documentos)', async () => {
    const { service } = buildDocumentService();
    const adapter = new DocumentAdapter(service, buildUserModel());

    await assert.rejects(
      () =>
        adapter.applyDecision(
          buildContext({ decision: ApprovalDecision.ADJUSTMENTS_REQUESTED }),
        ),
      /not supported/,
    );
  });
});

describe('Integración ApprovalWorkflowService + DocumentAdapter', () => {
  it('crea la solicitud, aprueba y registra los eventos CREATED + APPROVED', async () => {
    const { service: documentService, approveCalls } = buildDocumentService();
    const adapter = new DocumentAdapter(documentService, buildUserModel());
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

    // 1. Creación de solicitud (submit).
    const created = await workflow.createRequest(
      COMPANY_ID,
      {
        module: ApprovalEntity.DOCUMENT,
        entityType: 'DocumentMaster',
        entityId: DOCUMENT_ID,
        comments: 'Revisión de política',
      },
      buildActor(),
    );
    assert.equal(created.status, ApprovalStatus.PENDING_APPROVAL);
    assert.equal(events.length, 1);
    assert.equal((events[0] as { action: string }).action, 'CREATED');

    // 2. Aprobación delegada al adapter.
    const result = await workflow.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.DOCUMENT,
      DOCUMENT_ID,
      { decision: ApprovalDecision.APPROVED, comments: 'OK' },
      buildActor(),
    );

    assert.equal(approveCalls.length, 1);
    assert.equal(result.request?.status, ApprovalStatus.APPROVED);
    assert.equal(events.length, 2);
    assert.equal((events[1] as { action: string }).action, ApprovalDecision.APPROVED);
  });

  it('rechaza y registra el evento REJECTED', async () => {
    const { service: documentService, rejectCalls } = buildDocumentService();
    const adapter = new DocumentAdapter(documentService, buildUserModel());
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

    const workflow = new ApprovalWorkflowService(requestModel, eventModel, [adapter]);

    await workflow.createRequest(
      COMPANY_ID,
      {
        module: ApprovalEntity.DOCUMENT,
        entityType: 'DocumentMaster',
        entityId: DOCUMENT_ID,
      },
      buildActor(),
    );

    const result = await workflow.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.DOCUMENT,
      DOCUMENT_ID,
      { decision: ApprovalDecision.REJECTED, reason: 'Falta evidencia' },
      buildActor(),
    );

    assert.equal(rejectCalls.length, 1);
    assert.equal(result.request?.status, ApprovalStatus.REJECTED);
    assert.equal(events.length, 2);
    assert.equal((events[1] as { action: string }).action, ApprovalDecision.REJECTED);
  });

  it('aplica decisiones legacy sin ApprovalRequest creando solicitud histórica y evento', async () => {
    const { service: documentService, approveCalls } = buildDocumentService();
    const adapter = new DocumentAdapter(documentService, buildUserModel());
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
      ApprovalEntity.DOCUMENT,
      DOCUMENT_ID,
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

describe('DocumentAdapter Contract', () => {
  // Suite de contrato reutilizable: valida que DocumentAdapter cumple la
  // interfaz y los comportamientos mínimos del ApprovalAdapter.
  // `failingEntityId` no es un ObjectId válido: getEntity debe rechazar
  // (no silenciar el error del mapeo de la entidad).
  createAdapterContractSuite(
    () => {
      const { service } = buildDocumentService();
      return new DocumentAdapter(service, buildUserModel());
    },
    { failingEntityId: 'not-an-object-id' },
  );
});
