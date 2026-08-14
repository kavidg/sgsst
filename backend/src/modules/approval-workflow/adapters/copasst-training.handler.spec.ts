import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { Model, Types } from 'mongoose';

import { CopasstTrainingHandler } from './handlers/copasst-training.handler';
import { ApprovalWorkflowService } from '../approval-workflow.service';
import { ApprovalDocumentRegistryService } from '../document-generation/approval-document-registry.service';
import { ApprovalDocumentGenerationListener } from '../document-generation/approval-document-generation.listener';
import { CopasstTrainingDocumentGenerator } from '../../phva-advanced/copasst-training-document.generator';
import { CopasstTrainingDocumentService } from '../../phva-advanced/copasst-training-document.service';
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
import { PhvaAdvancedCopasstTrainingService } from '../../phva-advanced/phva-advanced-copasst-training.service';
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
    itemCode: '1.1.7',
    approval: { status: 'PENDING', version: 1 },
    history: [],
    locked: false,
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
 * Stub de PhvaAdvancedCopasstTrainingService que captura las llamadas reales
 * al servicio (findById/findByCompany/approveCopasstTraining).
 */
function buildCopasstTrainingService(overrides?: {
  record?: Record<string, unknown>;
  approveResult?: unknown;
}): {
  service: PhvaAdvancedCopasstTrainingService;
  approveCalls: unknown[][];
} {
  const approveCalls: unknown[][] = [];
  const record = buildRecord(overrides?.record);
  const service = {
    findById: async (companyId: Types.ObjectId) => {
      if (companyId.toString() !== COMPANY_ID) {
        throw new NotFoundException('Capacitación COPASST not found');
      }
      return record;
    },
    findByCompany: async (companyId: Types.ObjectId) => {
      if (companyId.toString() !== COMPANY_ID) return null;
      return record;
    },
    approveCopasstTraining: async (...args: unknown[]) => {
      approveCalls.push(args);
      return overrides?.approveResult ?? {
        ...record,
        approval: {
          ...record.approval,
          status: (args[2] as { status: string }).status,
          version: 2,
        },
        locked: (args[2] as { status: string }).status === 'APPROVED',
      };
    },
  } as unknown as PhvaAdvancedCopasstTrainingService;
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
function buildAdapterLike(handler: CopasstTrainingHandler): ApprovalAdapter {
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
  service?: PhvaAdvancedCopasstTrainingService;
  userModel?: Model<UserDocument>;
}): {
  handler: CopasstTrainingHandler;
  approveCalls: unknown[][];
} {
  const { service, approveCalls } = overrides?.service
    ? { service: overrides.service, approveCalls: [] }
    : buildCopasstTrainingService();
  const handler = new CopasstTrainingHandler(
    service,
    overrides?.userModel ?? buildUserModel(),
  );
  return { handler, approveCalls };
}

describe('CopasstTrainingHandler (1.1.7)', () => {
  it('implementa el contrato del ApprovalAdapter (module PHVA_ADVANCED vía adapter)', () => {
    const { handler } = buildHandler();
    assert.deepEqual(handler.allowedRoles(), ['owner', 'manager']);
  });

  it('traduce estados locales al ApprovalStatus canónico', () => {
    const { handler } = buildHandler();

    assert.equal(handler.mapStatus('PENDING'), ApprovalStatus.PENDING_APPROVAL);
    assert.equal(handler.mapStatus('APPROVED'), ApprovalStatus.APPROVED);
    assert.equal(handler.mapStatus('REJECTED'), ApprovalStatus.REJECTED);
    assert.equal(
      handler.mapStatus('ADJUSTMENTS_REQUESTED'),
      ApprovalStatus.ADJUSTMENTS_REQUESTED,
    );
    assert.equal(handler.mapStatus('estado-desconocido'), ApprovalStatus.DRAFT);
  });

  it('getEntity por entityId retorna { entity, status, version } validando companyId', async () => {
    const { handler } = buildHandler();

    const result = await handler.getEntity(COMPANY_ID, RECORD_ID);

    assert.ok(result.entity);
    assert.equal(result.status, 'PENDING');
    assert.equal(result.version, 1);
  });

  it('getEntity por companyId sin entityId resuelve el registro vigente', async () => {
    const { handler } = buildHandler();

    const result = await handler.getEntity(COMPANY_ID, undefined);

    assert.ok(result.entity);
    assert.equal(result.status, 'PENDING');
    assert.equal(result.version, 1);
  });

  it('getEntity lanza NotFound si la entidad pertenece a otra empresa', async () => {
    const { handler } = buildHandler();

    await assert.rejects(
      () => handler.getEntity('64b0000000000000000000ff', RECORD_ID),
      /not found/,
    );
  });

  it('getEntity lanza NotFound si la empresa no tiene registro (findByCompany null)', async () => {
    const { service } = buildCopasstTrainingService({
      record: buildRecord({ companyId: new Types.ObjectId('64b0000000000000000000aa') }),
    });
    const handler = new CopasstTrainingHandler(service, buildUserModel());

    await assert.rejects(
      () => handler.getEntity('64b0000000000000000000aa', undefined),
      /not found/,
    );
  });

  it('aprueba reutilizando approveCopasstTraining con status APPROVED', async () => {
    const { handler, approveCalls } = buildHandler();

    const result = await handler.applyDecision(
      buildContext({
        decision: ApprovalDecision.APPROVED,
        comments: 'Programa aprobado',
      }),
    );

    assert.equal(approveCalls.length, 1);
    const args = approveCalls[0];
    assert.equal((args[0] as Types.ObjectId).toString(), COMPANY_ID);
    assert.equal((args[1] as { email: string }).email, 'manager@test.com');
    assert.equal((args[2] as { status: string }).status, 'APPROVED');
    assert.equal((args[2] as { comments?: string }).comments, 'Programa aprobado');
    assert.equal(
      (result as { approval: { status: string } }).approval.status,
      'APPROVED',
    );
    assert.equal((result as { locked: boolean }).locked, true);
  });

  it('rechaza reutilizando approveCopasstTraining con status REJECTED', async () => {
    const { handler, approveCalls } = buildHandler();

    const result = await handler.applyDecision(
      buildContext({
        decision: ApprovalDecision.REJECTED,
        reason: 'Falta programa anual',
      }),
    );

    assert.equal(approveCalls.length, 1);
    const args = approveCalls[0];
    assert.equal((args[2] as { status: string }).status, 'REJECTED');
    assert.equal((args[2] as { comments?: string }).comments, 'Falta programa anual');
    assert.equal(
      (result as { approval: { status: string } }).approval.status,
      'REJECTED',
    );
    assert.equal((result as { locked: boolean }).locked, false);
  });

  it('aplica ADJUSTMENTS_REQUESTED reutilizando approveCopasstTraining', async () => {
    const { handler, approveCalls } = buildHandler();

    const result = await handler.applyDecision(
      buildContext({
        decision: ApprovalDecision.ADJUSTMENTS_REQUESTED,
        comments: 'Ajustar cronograma',
      }),
    );

    assert.equal(approveCalls.length, 1);
    const args = approveCalls[0];
    assert.equal((args[2] as { status: string }).status, 'ADJUSTMENTS_REQUESTED');
    assert.equal(
      (result as { approval: { status: string } }).approval.status,
      'ADJUSTMENTS_REQUESTED',
    );
    assert.equal((result as { locked: boolean }).locked, false);
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

  it('lanza NotFound si la entidad pertenece a otra empresa en applyDecision', async () => {
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
});

describe('Integración ApprovalWorkflowService + CopasstTrainingHandler', () => {
  /** Workflow con modelos en memoria que conserva la última solicitud. */
  function buildMemoryWorkflow(
    adapter: ApprovalAdapter,
    listener?: ApprovalDocumentGenerationListener,
  ): {
    workflow: ApprovalWorkflowService;
    events: unknown[];
    latestRequest: ApprovalRequestDocument | null;
  } {
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
      // findOne es SCOPED por empresa (como el modelo real): una búsqueda de la
      // empresa B nunca devuelve la solicitud de la empresa A. Esto prueba el
      // aislamiento multi-tenant sin depender únicamente del handler.
      findOne: (filter: Record<string, unknown>) => {
        const filterCompany = filter.companyId as Types.ObjectId;
        return {
          sort: () => ({
            exec: async () => {
              if (filterCompany && filterCompany.toString() !== COMPANY_ID) return null;
              return latestRequest;
            },
          }),
        };
      },
      findById: () => ({ exec: async () => latestRequest }),
    } as unknown as Model<ApprovalRequestDocument>;
    const eventModel = {
      create: async (data: unknown) => {
        events.push(data);
        return { _id: new Types.ObjectId(), ...(data as object) };
      },
    } as unknown as Model<ApprovalEventDocument>;
    const workflow = new ApprovalWorkflowService(requestModel, eventModel, [adapter], listener);
    return { workflow, events, latestRequest };
  }

  it('crea la solicitud, aprueba y registra los eventos CREATED + APPROVED', async () => {
    const { service, approveCalls } = buildCopasstTrainingService();
    const handler = new CopasstTrainingHandler(service, buildUserModel());
    const { workflow, events } = buildMemoryWorkflow(buildAdapterLike(handler));

    // 1. Creación de solicitud (submit).
    const created = await workflow.createRequest(
      COMPANY_ID,
      {
        module: ApprovalEntity.PHVA_ADVANCED,
        entityType: 'PhvaAdvancedCopasstTraining',
        entityId: RECORD_ID,
        comments: 'Aprobación de la Capacitación COPASST (1.1.7)',
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
    assert.equal((approveCalls[0][2] as { status: string }).status, 'APPROVED');
    assert.equal(result.request?.status, ApprovalStatus.APPROVED);
    assert.equal(events.length, 2);
    assert.equal((events[1] as { action: string }).action, ApprovalDecision.APPROVED);
  });

  it('registra el evento REJECTED al decidir el rechazo sobre la solicitud', async () => {
    const { service, approveCalls } = buildCopasstTrainingService();
    const handler = new CopasstTrainingHandler(service, buildUserModel());
    const { workflow, events } = buildMemoryWorkflow(buildAdapterLike(handler));

    await workflow.createRequest(
      COMPANY_ID,
      {
        module: ApprovalEntity.PHVA_ADVANCED,
        entityType: 'PhvaAdvancedCopasstTraining',
        entityId: RECORD_ID,
      },
      buildActor(),
    );

    const result = await workflow.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.PHVA_ADVANCED,
      RECORD_ID,
      { decision: ApprovalDecision.REJECTED, reason: 'Falta programa anual' },
      buildActor(),
    );

    assert.equal(approveCalls.length, 1);
    assert.equal((approveCalls[0][2] as { status: string }).status, 'REJECTED');
    assert.equal(result.request?.status, ApprovalStatus.REJECTED);
    assert.equal(events.length, 2);
    assert.equal((events[0] as { action: string }).action, 'CREATED');
    assert.equal((events[1] as { action: string }).action, ApprovalDecision.REJECTED);
  });

  it('aplica ADJUSTMENTS_REQUESTED sobre la solicitud y registra el evento', async () => {
    const { service, approveCalls } = buildCopasstTrainingService();
    const handler = new CopasstTrainingHandler(service, buildUserModel());
    const { workflow, events } = buildMemoryWorkflow(buildAdapterLike(handler));

    await workflow.createRequest(
      COMPANY_ID,
      {
        module: ApprovalEntity.PHVA_ADVANCED,
        entityType: 'PhvaAdvancedCopasstTraining',
        entityId: RECORD_ID,
      },
      buildActor(),
    );

    const result = await workflow.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.PHVA_ADVANCED,
      RECORD_ID,
      { decision: ApprovalDecision.ADJUSTMENTS_REQUESTED, comments: 'Ajustar' },
      buildActor(),
    );

    assert.equal(approveCalls.length, 1);
    assert.equal((approveCalls[0][2] as { status: string }).status, 'ADJUSTMENTS_REQUESTED');
    assert.equal(result.request?.status, ApprovalStatus.ADJUSTMENTS_REQUESTED);
    assert.equal(events.length, 2);
    assert.equal((events[1] as { action: string }).action, 'ADJUSTMENTS_REQUESTED');
  });

  it('multi-tenancy: una empresa no puede decidir sobre la entidad de otra', async () => {
    const { service } = buildCopasstTrainingService();
    const handler = new CopasstTrainingHandler(service, buildUserModel());
    const { workflow } = buildMemoryWorkflow(buildAdapterLike(handler));

    await workflow.createRequest(
      COMPANY_ID,
      {
        module: ApprovalEntity.PHVA_ADVANCED,
        entityType: 'PhvaAdvancedCopasstTraining',
        entityId: RECORD_ID,
      },
      buildActor(),
    );

    // Empresa B intenta aprobar la entidad de la empresa A: el handler lanza
    // NotFound (findById valida pertenencia) y la decisión falla.
    await assert.rejects(
      () =>
        workflow.decideAndApply(
          '64b0000000000000000000ff',
          ApprovalEntity.PHVA_ADVANCED,
          RECORD_ID,
          { decision: ApprovalDecision.APPROVED },
          buildActor(),
        ),
      /not found/,
    );
  });

  it('aplica decisiones legacy sin ApprovalRequest creando solicitud histórica y evento', async () => {
    const { service, approveCalls } = buildCopasstTrainingService();
    const handler = new CopasstTrainingHandler(service, buildUserModel());
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

describe('Generación documental post-aprobación (1.1.7)', () => {
  /** Listener real + registry + CopasstTrainingDocumentGenerator con service stub. */
  function buildApprovalPipeline(overrides?: {
    reportResult?: unknown;
  }): {
    workflow: ApprovalWorkflowService;
    reportCalls: unknown[][];
    events: unknown[];
  } {
    const reportCalls: unknown[][] = [];
    const documentService = {
      generateReport: async (...args: unknown[]) => {
        reportCalls.push(args);
        return (
          overrides?.reportResult ?? {
            document: { fileUrl: 'https://storage/…', storagePath: '…', version: 1 },
            evidence: { type: 'REPORT', fileName: 'informe.docx', fileUrl: 'https://storage/…' },
            reused: false,
          }
        );
      },
    } as unknown as CopasstTrainingDocumentService;

    const generator = new CopasstTrainingDocumentGenerator(documentService);
    const registry = new ApprovalDocumentRegistryService([generator]);
    const listener = new ApprovalDocumentGenerationListener(registry);

    // Handler + adapter.
    const { service } = buildCopasstTrainingService();
    const handler = new CopasstTrainingHandler(service, buildUserModel());
    const adapter = buildAdapterLike(handler);

    // Workflow con listener conectado.
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
      // findOne es SCOPED por empresa (como el modelo real): una búsqueda de la
      // empresa B nunca devuelve la solicitud de la empresa A. Esto prueba el
      // aislamiento multi-tenant sin depender únicamente del handler.
      findOne: (filter: Record<string, unknown>) => {
        const filterCompany = filter.companyId as Types.ObjectId;
        return {
          sort: () => ({
            exec: async () => {
              if (filterCompany && filterCompany.toString() !== COMPANY_ID) return null;
              return latestRequest;
            },
          }),
        };
      },
      findById: () => ({ exec: async () => latestRequest }),
    } as unknown as Model<ApprovalRequestDocument>;
    const eventModel = {
      create: async (data: unknown) => {
        events.push(data);
        return { _id: new Types.ObjectId(), ...(data as object) };
      },
    } as unknown as Model<ApprovalEventDocument>;

    const workflow = new ApprovalWorkflowService(
      requestModel,
      eventModel,
      [adapter],
      listener,
    );
    return { workflow, reportCalls, events };
  }

  it('al APROBAR activa el generador documental (informe de capacitación)', async () => {
    const { workflow, reportCalls } = buildApprovalPipeline();

    await workflow.createRequest(
      COMPANY_ID,
      {
        module: ApprovalEntity.PHVA_ADVANCED,
        entityType: 'PhvaAdvancedCopasstTraining',
        entityId: RECORD_ID,
      },
      buildActor(),
    );

    await workflow.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.PHVA_ADVANCED,
      RECORD_ID,
      { decision: ApprovalDecision.APPROVED },
      buildActor(),
    );

    assert.equal(reportCalls.length, 1, 'APROBADO debe generar el documento');
    assert.equal(
      (reportCalls[0][0] as Types.ObjectId).toString(),
      COMPANY_ID,
      'el documento pertenece a la empresa correcta',
    );
    assert.equal(reportCalls[0][1], undefined, 'generación post-aprobación sin usuario');
  });

  it('al RECHAZAR NO genera documentos automáticos', async () => {
    const { workflow, reportCalls } = buildApprovalPipeline();

    await workflow.createRequest(
      COMPANY_ID,
      {
        module: ApprovalEntity.PHVA_ADVANCED,
        entityType: 'PhvaAdvancedCopasstTraining',
        entityId: RECORD_ID,
      },
      buildActor(),
    );

    await workflow.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.PHVA_ADVANCED,
      RECORD_ID,
      { decision: ApprovalDecision.REJECTED, reason: 'Falta programa' },
      buildActor(),
    );

    assert.equal(reportCalls.length, 0, 'RECHAZADO no debe generar documentos');
  });

  it('al SOLICITAR AJUSTES NO genera documentos automáticos', async () => {
    const { workflow, reportCalls } = buildApprovalPipeline();

    await workflow.createRequest(
      COMPANY_ID,
      {
        module: ApprovalEntity.PHVA_ADVANCED,
        entityType: 'PhvaAdvancedCopasstTraining',
        entityId: RECORD_ID,
      },
      buildActor(),
    );

    await workflow.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.PHVA_ADVANCED,
      RECORD_ID,
      { decision: ApprovalDecision.ADJUSTMENTS_REQUESTED, comments: 'Ajustar' },
      buildActor(),
    );

    assert.equal(reportCalls.length, 0, 'AJUSTES no debe generar documentos');
  });

  it('M1: decidir sobre una entidad inexistente → error, NO crea ApprovalRequest y NO genera documentos', async () => {
    const { workflow, reportCalls, events } = buildApprovalPipeline();

    // La empresa B no tiene entidad 1.1.7: el handler lanza NotFound (findById
    // valida pertenencia) ANTES de que el workflow cree la solicitud legacy y
    // antes de notificar al listener de generación documental.
    await assert.rejects(
      () =>
        workflow.decideAndApply(
          '64b0000000000000000000ff',
          ApprovalEntity.PHVA_ADVANCED,
          RECORD_ID,
          { decision: ApprovalDecision.APPROVED },
          buildActor(),
        ),
      /not found/,
    );

    assert.equal(reportCalls.length, 0, 'no debe generarse ningún documento');
    assert.equal(events.length, 0, 'no debe crearse ApprovalRequest ni eventos');
  });
});

describe('CopasstTrainingHandler Contract', () => {
  // Suite de contrato reutilizable: valida la interfaz y los comportamientos
  // mínimos del ApprovalAdapter. `getEntityWithoutEntityId: 'resolve'` porque
  // el registro vigente se resuelve por companyId. `failingEntityId` no es un
  // ObjectId válido: getEntity debe rechazar.
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
