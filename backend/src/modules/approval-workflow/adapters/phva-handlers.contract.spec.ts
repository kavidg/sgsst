import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Model, Types } from 'mongoose';

import { ApprovalAdapter, ApplyDecisionContext } from './approval-adapter.interface';
import { createAdapterContractSuite } from './approval-adapter.contract.spec';
import { ApprovalWorkflowService } from '../approval-workflow.service';
import { ApprovalActor } from '../interfaces/approval-actor.interface';
import { ApprovalDecision } from '../enums/approval-decision.enum';
import { ApprovalEntity } from '../enums/approval-entity.enum';
import { ApprovalStatus } from '../enums/approval-status.enum';
import { ApprovalRequestDocument } from '../schemas/approval-request.schema';
import { ApprovalEventDocument } from '../schemas/approval-event.schema';
import { PhvaAdvancedService } from '../../phva-advanced/phva-advanced.service';
import { UserDocument } from '../../users/schemas/user.schema';
import { mapPhvaAdvancedStatus } from '../utils/phva-status-map';
import { ResourceAssignmentHandler } from './handlers/resource-assignment.handler';
import { TrainingManagementHandler } from './handlers/training-management.handler';
import { SstPolicyHandler } from './handlers/sst-policy.handler';
import { ResponsibilitiesHandler } from './handlers/responsibilities.handler';
import { ResponsibleSgsstHandler } from './handlers/responsible-sgsst.handler';

/** ObjectIds válidos de MongoDB para las pruebas. */
const COMPANY_ID = '64b000000000000000000001';
const RECORD_ID = '64b000000000000000000002';
const USER_ID = '64b000000000000000000004';
const FIREBASE_UID = 'firebase-uid-123';

/** Contrato estructural mínimo que todos los handlers PHVA Advanced cumplen. */
interface PhvaHandlerLike {
  getEntity(companyId: string, entityId?: string): Promise<unknown>;
  applyDecision(ctx: ApplyDecisionContext): Promise<unknown>;
  mapStatus(localStatus: string): ApprovalStatus;
  allowedRoles(): string[];
}

/** Fixture completo de un handler bajo contrato global. */
export type PhvaHandlerFixture = {
  adapter: ApprovalAdapter;
  approveCalls: unknown[][];
  rejectCalls: unknown[][];
};

/** Factory de un handler bajo contrato global. */
export interface PhvaHandlerContractFactory {
  name: string;
  entityType: string;
  /** true si el handler soporta rechazo real (SST Policy no). */
  supportsRejection: boolean;
  build: () => PhvaHandlerFixture;
}

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

function buildUser(overrides?: Record<string, unknown>) {
  return {
    _id: new Types.ObjectId(USER_ID),
    email: 'manager@test.com',
    role: 'manager',
    firebaseUid: FIREBASE_UID,
    ...overrides,
  };
}

/** Stub del modelo User usado por los handlers para resolver al actor. */
function buildUserModel(user: unknown = buildUser()): Model<UserDocument> {
  return {
    findById: () => ({ exec: async () => user }),
    findOne: () => ({ exec: async () => user }),
  } as unknown as Model<UserDocument>;
}

/**
 * Envuelve un handler como ApprovalAdapter (module PHVA_ADVANCED) para poder
 * ejecutar la contract suite y las integraciones con ApprovalWorkflowService.
 */
function buildAdapterLike(handler: PhvaHandlerLike): ApprovalAdapter {
  return {
    module: ApprovalEntity.PHVA_ADVANCED,
    getEntity: (companyId: string, entityId?: string) =>
      handler.getEntity(companyId, entityId),
    applyDecision: (ctx: ApplyDecisionContext) => handler.applyDecision(ctx),
    mapStatus: (localStatus: string) => handler.mapStatus(localStatus),
    allowedRoles: () => handler.allowedRoles(),
  };
}

/** Workflow con modelos en memoria; legacy=true simula ausencia de ApprovalRequest. */
function buildMemoryWorkflow(
  adapter: ApprovalAdapter,
  options: { legacy?: boolean } = {},
): { workflow: ApprovalWorkflowService; events: unknown[] } {
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
      if (!options.legacy) {
        latestRequest = doc as ApprovalRequestDocument;
      }
      return doc;
    },
    findOne: () => ({
      sort: () => ({ exec: async () => (options.legacy ? null : latestRequest) }),
    }),
    findById: () => ({ exec: async () => latestRequest }),
  } as unknown as Model<ApprovalRequestDocument>;
  const eventModel = {
    create: async (data: unknown) => {
      events.push(data);
      return { _id: new Types.ObjectId(), ...(data as object) };
    },
  } as unknown as Model<ApprovalEventDocument>;
  const workflow = new ApprovalWorkflowService(requestModel, eventModel, [adapter]);
  return { workflow, events };
}

// ---------------------------------------------------------------------------
// Fixtures por handler (stubs de PhvaAdvancedService + modelo User)
// ---------------------------------------------------------------------------

function buildResourceFixture(): PhvaHandlerFixture {
  const approveCalls: unknown[][] = [];
  const rejectCalls: unknown[][] = [];
  const record = {
    _id: new Types.ObjectId(RECORD_ID),
    companyId: new Types.ObjectId(COMPANY_ID),
    itemCode: '1.1.3',
    approvalStatus: 'PENDING_APPROVAL',
  };
  const service = {
    findResourceAssignmentById: async () => record,
    findResourceAssignmentByCompany: async () => record,
    approveResourceAssignment: async (...args: unknown[]) => {
      approveCalls.push(args);
      return { ...record, approvalStatus: 'APPROVED_AND_SIGNED' };
    },
    rejectResourceAssignment: async (...args: unknown[]) => {
      rejectCalls.push(args);
      return { ...record, approvalStatus: 'REJECTED' };
    },
  } as unknown as PhvaAdvancedService;
  const handler = new ResourceAssignmentHandler(service, buildUserModel());
  return { adapter: buildAdapterLike(handler), approveCalls, rejectCalls };
}

function buildTrainingFixture(): PhvaHandlerFixture {
  const approveCalls: unknown[][] = [];
  const record = {
    _id: new Types.ObjectId(RECORD_ID),
    companyId: new Types.ObjectId(COMPANY_ID),
    itemCode: '1.2.1',
    approval: { status: 'PENDING', version: 1 },
    history: [],
  };
  const service = {
    findTrainingManagementById: async () => record,
    findTrainingManagementByCompany: async () => record,
    approveTrainingManagement: async (...args: unknown[]) => {
      approveCalls.push(args);
      const status = (args[2] as { status: string }).status;
      return { ...record, approval: { status, version: 2 } };
    },
  } as unknown as PhvaAdvancedService;
  const handler = new TrainingManagementHandler(service, buildUserModel());
  return { adapter: buildAdapterLike(handler), approveCalls, rejectCalls: [] };
}

function buildSstPolicyFixture(): PhvaHandlerFixture {
  const approveCalls: unknown[][] = [];
  const record = {
    _id: new Types.ObjectId(RECORD_ID),
    companyId: new Types.ObjectId(COMPANY_ID),
    itemCode: '2.1.1',
    status: 'Borrador',
    currentVersion: '1.0',
  };
  const service = {
    findSstPolicyById: async () => record,
    findSstPolicyByCompany: async () => record,
    approveSstPolicy: async (...args: unknown[]) => {
      approveCalls.push(args);
      return { ...record, status: 'Aprobado' };
    },
  } as unknown as PhvaAdvancedService;
  const handler = new SstPolicyHandler(service, buildUserModel());
  return { adapter: buildAdapterLike(handler), approveCalls, rejectCalls: [] };
}

function buildResponsibilitiesFixture(): PhvaHandlerFixture {
  const approveCalls: unknown[][] = [];
  const rejectCalls: unknown[][] = [];
  const record = {
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
        }),
      },
    ],
    auditHistory: [],
  };
  const service = {
    findResponsibilitiesById: async () => record,
    findResponsibilitiesByCompany: async () => record,
    getResponsibilitiesApprovalStatus: () => 'PENDING_APPROVAL',
    approveResponsibilities: async (...args: unknown[]) => {
      approveCalls.push(args);
      return record;
    },
    rejectResponsibilities: async (...args: unknown[]) => {
      rejectCalls.push(args);
      return record;
    },
  } as unknown as PhvaAdvancedService;
  const handler = new ResponsibilitiesHandler(service, buildUserModel());
  return { adapter: buildAdapterLike(handler), approveCalls, rejectCalls };
}

function buildResponsibleSgsstFixture(): PhvaHandlerFixture {
  const approveCalls: unknown[][] = [];
  const rejectCalls: unknown[][] = [];
  const record = {
    _id: new Types.ObjectId(RECORD_ID),
    companyId: new Types.ObjectId(COMPANY_ID),
    itemCode: '1.1.1',
    approvalStatus: 'PENDING_APPROVAL',
    currentVersion: '1.0',
    auditHistory: [],
  };
  const service = {
    findResponsableSstById: async () => record,
    findResponsableSstByCompany: async () => record,
    approveResponsableSst: async (...args: unknown[]) => {
      approveCalls.push(args);
      return { ...record, approvalStatus: 'APPROVED_AND_SIGNED' };
    },
    rejectResponsableSst: async (...args: unknown[]) => {
      rejectCalls.push(args);
      return { ...record, approvalStatus: 'REJECTED' };
    },
  } as unknown as PhvaAdvancedService;
  const handler = new ResponsibleSgsstHandler(service, buildUserModel());
  return { adapter: buildAdapterLike(handler), approveCalls, rejectCalls };
}

/**
 * Suite global (Fase 6.7) que ejecuta el MISMO contrato para TODOS los handlers
 * de PHVA Advanced, garantizando uniformidad sin duplicar la lógica de las
 * pruebas individuales (los fixtures se construyen una vez por handler).
 */
export function createPhvaHandlersContractSuite(
  factories: PhvaHandlerContractFactory[],
): void {
  describe('Contract Suite Global — Handlers PHVA Advanced', () => {
    // 1. mapStatus global: fuente única de conversión (utils/phva-status-map).
    describe('mapStatus global (mapPhvaAdvancedStatus)', () => {
      it('mapea todas las conversiones canónicas desde una única fuente', () => {
        assert.equal(mapPhvaAdvancedStatus('APPROVED_AND_SIGNED'), ApprovalStatus.APPROVED);
        assert.equal(mapPhvaAdvancedStatus('Borrador'), ApprovalStatus.DRAFT);
        assert.equal(mapPhvaAdvancedStatus('Pendiente aprobación'), ApprovalStatus.PENDING_APPROVAL);
        assert.equal(mapPhvaAdvancedStatus('Aprobado'), ApprovalStatus.APPROVED);
        assert.equal(mapPhvaAdvancedStatus('Archivado'), ApprovalStatus.ARCHIVED);
        assert.equal(mapPhvaAdvancedStatus('Vencido'), ApprovalStatus.ARCHIVED);
        assert.equal(mapPhvaAdvancedStatus('ADJUSTMENTS_REQUESTED'), ApprovalStatus.ADJUSTMENTS_REQUESTED);
        assert.equal(mapPhvaAdvancedStatus('REJECTED'), ApprovalStatus.REJECTED);
        assert.equal(mapPhvaAdvancedStatus('PENDING'), ApprovalStatus.PENDING_APPROVAL);
        assert.equal(mapPhvaAdvancedStatus('DRAFT'), ApprovalStatus.DRAFT);
        assert.equal(mapPhvaAdvancedStatus('APPROVED'), ApprovalStatus.APPROVED);
        assert.equal(mapPhvaAdvancedStatus('desconocido'), ApprovalStatus.DRAFT);
      });
    });

    for (const factory of factories) {
      describe(`Handler: ${factory.name}`, () => {
        // 2. Contract suite reutilizable (getEntity por id/companyId,
        //    mapStatus, allowedRoles, applyDecision, companyId incorrecto).
        createAdapterContractSuite(() => factory.build().adapter, {
          getEntityWithoutEntityId: 'resolve',
          failingEntityId: 'not-an-object-id',
        });

        // 3. Flujo completo: ApprovalRequest PENDING + ApprovalEvent
        //    CREATED + APPROVED con actor y companyId (sin flujo silencioso).
        it('genera ApprovalRequest, ApprovalEvent CREATED + APPROVED, actor y companyId', async () => {
          const { adapter, approveCalls } = factory.build();
          const { workflow, events } = buildMemoryWorkflow(adapter);

          const created = await workflow.createRequest(
            COMPANY_ID,
            {
              module: ApprovalEntity.PHVA_ADVANCED,
              entityType: factory.entityType,
              entityId: RECORD_ID,
              comments: 'Aprobación (contract global)',
            },
            buildActor(),
          );
          assert.equal(created.status, ApprovalStatus.PENDING_APPROVAL);

          const result = await workflow.decideAndApply(
            COMPANY_ID,
            ApprovalEntity.PHVA_ADVANCED,
            RECORD_ID,
            { decision: ApprovalDecision.APPROVED, comments: 'OK' },
            buildActor(),
          );

          assert.equal(approveCalls.length, 1, 'debe delegar al servicio real');
          assert.equal(result.request?.status, ApprovalStatus.APPROVED);
          assert.equal(events.length, 2, 'ninguna decisión debe ser silenciosa');

          const createdEvent = events[0] as { action: string };
          const approvedEvent = events[1] as {
            action: string;
            actor?: ApprovalActor;
            companyId?: Types.ObjectId;
          };
          assert.equal(createdEvent.action, 'CREATED');
          assert.equal(approvedEvent.action, ApprovalDecision.APPROVED);
          assert.ok(approvedEvent.actor, 'el evento debe registrar el actor');
          assert.equal(
            approvedEvent.companyId?.toString(),
            COMPANY_ID,
            'el evento debe registrar companyId',
          );
        });

        // 4. Legacy: sin ApprovalRequest → creación legacy + ApprovalEvent
        //    con metadata { migrated: true, source: 'legacy' }.
        it('legacy: sin ApprovalRequest crea solicitud legacy y ApprovalEvent migrated', async () => {
          const { adapter, approveCalls } = factory.build();
          const { workflow, events } = buildMemoryWorkflow(adapter, { legacy: true });

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
          assert.equal(events.length, 1);
          const event = events[0] as {
            action: string;
            metadata?: Record<string, unknown>;
          };
          assert.equal(event.action, ApprovalDecision.APPROVED);
          assert.deepEqual(event.metadata, { migrated: true, source: 'legacy' });
        });

        // 5. Decisión REJECTED: también debe generar ApprovalRequest + ApprovalEvent
        //    (ningún flujo silencioso). Solo para handlers con rechazo real.
        if (factory.supportsRejection) {
          it('genera ApprovalRequest REJECTED y ApprovalEvent REJECTED (sin flujo silencioso)', async () => {
            const { adapter } = factory.build();
            const { workflow, events } = buildMemoryWorkflow(adapter);

            await workflow.createRequest(
              COMPANY_ID,
              {
                module: ApprovalEntity.PHVA_ADVANCED,
                entityType: factory.entityType,
                entityId: RECORD_ID,
              },
              buildActor(),
            );

            const result = await workflow.decideAndApply(
              COMPANY_ID,
              ApprovalEntity.PHVA_ADVANCED,
              RECORD_ID,
              { decision: ApprovalDecision.REJECTED, reason: 'Motivo de rechazo' },
              buildActor(),
            );

            assert.equal(result.request?.status, ApprovalStatus.REJECTED);
            assert.equal(events.length, 2, 'el rechazo nunca debe ser silencioso');
            assert.equal((events[0] as { action: string }).action, 'CREATED');
            const rejectedEvent = events[1] as { action: string };
            assert.equal(rejectedEvent.action, ApprovalDecision.REJECTED);
          });
        }

        // 6. Actor: resolución por ObjectId y por firebaseUid.
        it('resuelve el actor por ObjectId y por firebaseUid', async () => {
          const { adapter, approveCalls } = factory.build();
          await adapter.applyDecision(buildContext({ decision: ApprovalDecision.APPROVED }));
          assert.equal(approveCalls.length, 1);
          assert.equal(
            (approveCalls[0][1] as { _id: Types.ObjectId })._id.toString(),
            USER_ID,
            'debe resolver el usuario por ObjectId',
          );

          const { adapter: adapterFb, approveCalls: callsFb } = factory.build();
          await adapterFb.applyDecision(
            buildContext({
              decision: ApprovalDecision.APPROVED,
              actor: buildActor({ userId: FIREBASE_UID, firebaseUid: FIREBASE_UID }),
            }),
          );
          assert.equal(callsFb.length, 1);
          assert.equal(
            (callsFb[0][1] as { firebaseUid: string }).firebaseUid,
            FIREBASE_UID,
            'debe resolver el usuario por firebaseUid',
          );
        });
      });
    }
  });
}

createPhvaHandlersContractSuite([
  {
    name: 'ResourceAssignment (1.1.3)',
    entityType: 'PhvaAdvancedResourceAssignment',
    supportsRejection: true,
    build: buildResourceFixture,
  },
  {
    name: 'TrainingManagement (1.2.1)',
    entityType: 'PhvaAdvancedTrainingManagement',
    supportsRejection: true,
    build: buildTrainingFixture,
  },
  {
    name: 'SstPolicy (2.1.1)',
    entityType: 'PhvaAdvancedSstPolicy',
    supportsRejection: false,
    build: buildSstPolicyFixture,
  },
  {
    name: 'Responsibilities (1.1.2)',
    entityType: 'PhvaAdvancedResponsibilities',
    supportsRejection: true,
    build: buildResponsibilitiesFixture,
  },
  {
    name: 'ResponsibleSgsst (1.1.1)',
    entityType: 'RESPONSIBLE_SG_SST',
    supportsRejection: true,
    build: buildResponsibleSgsstFixture,
  },
]);
