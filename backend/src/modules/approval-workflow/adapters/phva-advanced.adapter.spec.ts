import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { Model, Types } from 'mongoose';

import { PhvaAdvancedAdapter } from './phva-advanced.adapter';
import { ResourceAssignmentHandler } from './handlers/resource-assignment.handler';
import { TrainingManagementHandler } from './handlers/training-management.handler';
import { SstPolicyHandler } from './handlers/sst-policy.handler';
import { ResponsibilitiesHandler } from './handlers/responsibilities.handler';
import { ResponsibleSgsstHandler } from './handlers/responsible-sgsst.handler';
import { CopasstTrainingHandler } from './handlers/copasst-training.handler';
import { PhvaAdvancedCopasstTrainingService } from '../../phva-advanced/phva-advanced-copasst-training.service';
import { ApprovalWorkflowService } from '../approval-workflow.service';
import { ApprovalActor } from '../interfaces/approval-actor.interface';
import { ApprovalDecision } from '../enums/approval-decision.enum';
import { ApprovalEntity } from '../enums/approval-entity.enum';
import { ApprovalStatus } from '../enums/approval-status.enum';
import { ApplyDecisionContext } from './approval-adapter.interface';
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

/** Forma del resultado de getEntity del adapter (dispatcher tipa Promise<unknown>). */
type GetEntityResult = { entity: unknown; status: string; version: number };

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
    itemCode: '1.1.3',
    approvalStatus: 'PENDING_APPROVAL',
    currentVersion: '1.0',
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
    findResourceAssignmentById: async () => record,
    findResourceAssignmentByCompany: async () => record,
    approveResourceAssignment: async (...args: unknown[]) => {
      approveCalls.push(args);
      return overrides?.approveResult ?? {
        ...record,
        approvalStatus: 'APPROVED_AND_SIGNED',
      };
    },
    rejectResourceAssignment: async (...args: unknown[]) => {
      rejectCalls.push(args);
      return overrides?.rejectResult ?? {
        ...record,
        approvalStatus: 'REJECTED',
        rejectionReason: args[2],
      };
    },
    // Stub del TrainingManagementHandler (no utilizado por estas pruebas, pero
    // requerido por el dispatcher del adapter).
    findTrainingManagementById: async () => {
      throw new NotFoundException('Training management not found');
    },
    findTrainingManagementByCompany: async () => {
      throw new NotFoundException('Training management not found');
    },
    // Stub del SstPolicyHandler (no utilizado por estas pruebas, pero
    // requerido por el dispatcher del adapter).
    findSstPolicyById: async () => {
      throw new NotFoundException('SST Policy not found');
    },
    findSstPolicyByCompany: async () => {
      throw new NotFoundException('SST Policy not found');
    },
    // Stub del ResponsibilitiesHandler (no utilizado por estas pruebas, pero
    // requerido por el dispatcher del adapter).
    findResponsibilitiesById: async () => {
      throw new NotFoundException('Responsibilities not found');
    },
    findResponsibilitiesByCompany: async () => {
      throw new NotFoundException('Responsibilities not found');
    },
    // Stub del ResponsibleSgsstHandler (no utilizado por estas pruebas, pero
    // requerido por el dispatcher del adapter).
    findResponsableSstById: async () => {
      throw new NotFoundException('Responsable SST not found');
    },
    findResponsableSstByCompany: async () => {
      throw new NotFoundException('Responsable SST not found');
    },
    // Stub del CopasstTrainingHandler (no utilizado por estas pruebas, pero
    // requerido por el dispatcher del adapter).
    findCopasstTrainingById: async () => {
      throw new NotFoundException('Capacitación COPASST not found');
    },
    findCopasstTrainingByCompany: async () => {
      throw new NotFoundException('Capacitación COPASST not found');
    },
  } as unknown as PhvaAdvancedService;
  return { service, approveCalls, rejectCalls };
}

/**
 * Service stub del CopasstTrainingHandler que siempre lanza NotFound (para que
 * el dispatcher del adapter no caiga en él durante las pruebas de otros
 * handlers).
 */
function buildNotFoundCopasstService(): PhvaAdvancedCopasstTrainingService {
  return {
    findById: async () => {
      throw new NotFoundException('Capacitación COPASST not found');
    },
    findByCompany: async () => {
      throw new NotFoundException('Capacitación COPASST not found');
    },
  } as unknown as PhvaAdvancedCopasstTrainingService;
}

/** Stub del modelo User usado por el handler para resolver al actor. */
function buildUserModel(user: unknown = buildUser()): Model<UserDocument> {
  return {
    findById: () => ({ exec: async () => user }),
    findOne: () => ({ exec: async () => user }),
  } as unknown as Model<UserDocument>;
}

/** Construye el adapter completo (handler + servicio + modelo User). */
function buildAdapter(overrides?: {
  service?: PhvaAdvancedService;
  userModel?: Model<UserDocument>;
}): {
  adapter: PhvaAdvancedAdapter;
  approveCalls: unknown[][];
  rejectCalls: unknown[][];
} {
  const { service, approveCalls, rejectCalls } = overrides?.service
    ? {
        service: overrides.service,
        approveCalls: [],
        rejectCalls: [],
      }
    : buildPhvaAdvancedService();
  const resourceHandler = new ResourceAssignmentHandler(
    service,
    overrides?.userModel ?? buildUserModel(),
  );
  const trainingHandler = new TrainingManagementHandler(
    service,
    overrides?.userModel ?? buildUserModel(),
  );
  const sstPolicyHandler = new SstPolicyHandler(
    service,
    overrides?.userModel ?? buildUserModel(),
  );
  const responsibilitiesHandler = new ResponsibilitiesHandler(
    service,
    overrides?.userModel ?? buildUserModel(),
  );
  const responsibleSgsstHandler = new ResponsibleSgsstHandler(
    service,
    overrides?.userModel ?? buildUserModel(),
  );
  // El CopasstTrainingHandler solo se alcanza cuando TODOS los demás handlers
  // lanzan NotFound (p.ej. pruebas de empresa incorrecta): su service stub debe
  // lanzar NotFound (findById/findByCompany), nunca fallar con TypeError.
  const copasstTrainingHandler = new CopasstTrainingHandler(
    buildNotFoundCopasstService(),
    overrides?.userModel ?? buildUserModel(),
  );
  return {
    adapter: new PhvaAdvancedAdapter(
      resourceHandler,
      trainingHandler,
      sstPolicyHandler,
      responsibilitiesHandler,
      responsibleSgsstHandler,
      copasstTrainingHandler,
    ),
    approveCalls,
    rejectCalls,
  };
}

describe('PhvaAdvancedAdapter (Resource Assignment)', () => {
  it('implementa el contrato del ApprovalAdapter (module PHVA_ADVANCED)', () => {
    const { adapter } = buildAdapter();

    assert.equal(adapter.module, ApprovalEntity.PHVA_ADVANCED);
    assert.deepEqual(adapter.allowedRoles(), ['owner', 'manager']);
  });

  it('traduce estados locales al ApprovalStatus canónico incluyendo APPROVED_AND_SIGNED', () => {
    const { adapter } = buildAdapter();

    assert.equal(adapter.mapStatus('DRAFT'), ApprovalStatus.DRAFT);
    assert.equal(adapter.mapStatus('PENDING_APPROVAL'), ApprovalStatus.PENDING_APPROVAL);
    assert.equal(adapter.mapStatus('APPROVED'), ApprovalStatus.APPROVED);
    assert.equal(adapter.mapStatus('APPROVED_AND_SIGNED'), ApprovalStatus.APPROVED);
    assert.equal(adapter.mapStatus('REJECTED'), ApprovalStatus.REJECTED);
    assert.equal(adapter.mapStatus('ARCHIVED'), ApprovalStatus.ARCHIVED);
    assert.equal(adapter.mapStatus('estado-desconocido'), ApprovalStatus.DRAFT);
  });

  it('getEntity por entityId retorna { entity, status, version } validando companyId', async () => {
    const { adapter } = buildAdapter();

    const result = (await adapter.getEntity(COMPANY_ID, RECORD_ID)) as GetEntityResult;

    assert.ok(result.entity);
    assert.equal(result.status, 'PENDING_APPROVAL');
    assert.equal(result.version, 1);
  });

  it('getEntity por companyId sin entityId resuelve el registro vigente', async () => {
    const { adapter } = buildAdapter();

    const result = (await adapter.getEntity(COMPANY_ID, undefined)) as GetEntityResult;

    assert.ok(result.entity);
    assert.equal(result.status, 'PENDING_APPROVAL');
    assert.equal(result.version, 1);
  });

  it('getEntity lanza NotFound si el registro pertenece a otra empresa', async () => {
    const { adapter } = buildAdapter();

    await assert.rejects(
      () => adapter.getEntity('64b0000000000000000000ff', RECORD_ID),
      /not found/,
    );
  });

  it('aprueba el registro reutilizando PhvaAdvancedService.approveResourceAssignment', async () => {
    const { adapter, approveCalls } = buildAdapter();

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
    // companyId (ObjectId) + usuario resuelto desde el actor.
    assert.equal((args[0] as Types.ObjectId).toString(), COMPANY_ID);
    assert.equal((args[1] as { email: string }).email, 'manager@test.com');
    assert.equal(
      (result as { approvalStatus: string }).approvalStatus,
      'APPROVED_AND_SIGNED',
    );
  });

  it('rechaza el registro reutilizando PhvaAdvancedService.rejectResourceAssignment', async () => {
    const { adapter, rejectCalls } = buildAdapter();

    const result = await adapter.applyDecision(
      buildContext({
        decision: ApprovalDecision.REJECTED,
        reason: 'Falta evidencia de recursos',
      }),
    );

    assert.equal(rejectCalls.length, 1);
    const args = rejectCalls[0];
    assert.equal((args[0] as Types.ObjectId).toString(), COMPANY_ID);
    assert.equal(args[2], 'Falta evidencia de recursos');
    assert.equal((result as { approvalStatus: string }).approvalStatus, 'REJECTED');
  });

  it('resuelve el usuario por ObjectId cuando el actor trae uno válido', async () => {
    const { adapter, approveCalls } = buildAdapter();

    await adapter.applyDecision(buildContext({ decision: ApprovalDecision.APPROVED }));

    assert.equal(approveCalls.length, 1);
    assert.equal((approveCalls[0][1] as { _id: Types.ObjectId })._id.toString(), USER_ID);
  });

  it('resuelve el usuario por firebaseUid cuando el actor no trae ObjectId', async () => {
    const { adapter, approveCalls } = buildAdapter();

    await adapter.applyDecision(
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
    const { adapter } = buildAdapter();

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
    const { adapter } = buildAdapter();

    await assert.rejects(
      () =>
        adapter.applyDecision(
          buildContext({ decision: ApprovalDecision.ADJUSTMENTS_REQUESTED }),
        ),
      /not supported/,
    );
  });

  it('despacha hacia TrainingManagementHandler cuando el registro no es de Resource Assignment', async () => {
    // El stub de Resource lanza NotFound para que el dispatcher caiga en el
    // handler de Training Management.
    const resourceService = {
      findResourceAssignmentById: async () => {
        throw new NotFoundException('Resource assignment not found');
      },
      findResourceAssignmentByCompany: async () => {
        throw new NotFoundException('Resource assignment not found');
      },
    } as unknown as PhvaAdvancedService;
    const trainingRecord = {
      _id: new Types.ObjectId(RECORD_ID),
      companyId: new Types.ObjectId(COMPANY_ID),
      itemCode: '1.2.1',
      approval: { status: 'PENDING', version: 1 },
    };
    const trainingService = {
      findTrainingManagementById: async () => trainingRecord,
      findTrainingManagementByCompany: async () => trainingRecord,
      approveTrainingManagement: async () => trainingRecord,
    } as unknown as PhvaAdvancedService;

    const sstService = {
      findSstPolicyById: async () => {
        throw new NotFoundException('SST Policy not found');
      },
      findSstPolicyByCompany: async () => {
        throw new NotFoundException('SST Policy not found');
      },
    } as unknown as PhvaAdvancedService;
    const responsibilitiesService = {
      findResponsibilitiesById: async () => {
        throw new NotFoundException('Responsibilities not found');
      },
      findResponsibilitiesByCompany: async () => {
        throw new NotFoundException('Responsibilities not found');
      },
    } as unknown as PhvaAdvancedService;
    const resourceHandler = new ResourceAssignmentHandler(resourceService, buildUserModel());
    const trainingHandler = new TrainingManagementHandler(trainingService, buildUserModel());
    const sstPolicyHandler = new SstPolicyHandler(sstService, buildUserModel());
    const responsibilitiesHandler = new ResponsibilitiesHandler(
      responsibilitiesService,
      buildUserModel(),
    );
    const responsibleSgsstHandler = new ResponsibleSgsstHandler(
      {
        findResponsableSstById: async () => {
          throw new NotFoundException('Responsable SST not found');
        },
        findResponsableSstByCompany: async () => {
          throw new NotFoundException('Responsable SST not found');
        },
      } as unknown as PhvaAdvancedService,
      buildUserModel(),
    );
    const copasstTrainingHandler = new CopasstTrainingHandler(
      buildNotFoundCopasstService(),
      buildUserModel(),
    );
    const adapter = new PhvaAdvancedAdapter(
      resourceHandler,
      trainingHandler,
      sstPolicyHandler,
      responsibilitiesHandler,
      responsibleSgsstHandler,
      copasstTrainingHandler,
    );

    const result = (await adapter.getEntity(COMPANY_ID, RECORD_ID)) as GetEntityResult;

    assert.ok(result.entity);
    assert.equal((result.entity as { itemCode: string }).itemCode, '1.2.1');
    assert.equal(result.status, 'PENDING');
  });

  it('despacha hacia SstPolicyHandler cuando el registro no es de Resource ni Training', async () => {
    // Los stubs de Resource y Training lanzan NotFound para que el dispatcher
    // caiga en el handler de SST Policy.
    const resourceService = {
      findResourceAssignmentById: async () => {
        throw new NotFoundException('Resource assignment not found');
      },
      findResourceAssignmentByCompany: async () => {
        throw new NotFoundException('Resource assignment not found');
      },
    } as unknown as PhvaAdvancedService;
    const trainingService = {
      findTrainingManagementById: async () => {
        throw new NotFoundException('Training management not found');
      },
      findTrainingManagementByCompany: async () => {
        throw new NotFoundException('Training management not found');
      },
    } as unknown as PhvaAdvancedService;
    const sstRecord = {
      _id: new Types.ObjectId(RECORD_ID),
      companyId: new Types.ObjectId(COMPANY_ID),
      itemCode: '2.1.1',
      status: 'Borrador',
    };
    const sstService = {
      findSstPolicyById: async () => sstRecord,
      findSstPolicyByCompany: async () => sstRecord,
      approveSstPolicy: async () => sstRecord,
    } as unknown as PhvaAdvancedService;
    const responsibilitiesService = {
      findResponsibilitiesById: async () => {
        throw new NotFoundException('Responsibilities not found');
      },
      findResponsibilitiesByCompany: async () => {
        throw new NotFoundException('Responsibilities not found');
      },
    } as unknown as PhvaAdvancedService;

    const resourceHandler = new ResourceAssignmentHandler(resourceService, buildUserModel());
    const trainingHandler = new TrainingManagementHandler(trainingService, buildUserModel());
    const sstPolicyHandler = new SstPolicyHandler(sstService, buildUserModel());
    const responsibilitiesHandler = new ResponsibilitiesHandler(
      responsibilitiesService,
      buildUserModel(),
    );
    const responsibleSgsstHandler = new ResponsibleSgsstHandler(
      {
        findResponsableSstById: async () => {
          throw new NotFoundException('Responsable SST not found');
        },
        findResponsableSstByCompany: async () => {
          throw new NotFoundException('Responsable SST not found');
        },
      } as unknown as PhvaAdvancedService,
      buildUserModel(),
    );
    const copasstTrainingHandler = new CopasstTrainingHandler(
      buildNotFoundCopasstService(),
      buildUserModel(),
    );
    const adapter = new PhvaAdvancedAdapter(
      resourceHandler,
      trainingHandler,
      sstPolicyHandler,
      responsibilitiesHandler,
      responsibleSgsstHandler,
      copasstTrainingHandler,
    );

    const result = (await adapter.getEntity(COMPANY_ID, RECORD_ID)) as GetEntityResult;

    assert.ok(result.entity);
    assert.equal((result.entity as { itemCode: string }).itemCode, '2.1.1');
    assert.equal(result.status, 'Borrador');
  });

  it('despacha hacia ResponsibilitiesHandler cuando el registro no es de Resource, Training ni SST Policy', async () => {
    // Los stubs de Resource, Training y SST lanzan NotFound para que el
    // dispatcher caiga en el handler de Responsibilities.
    const resourceService = {
      findResourceAssignmentById: async () => {
        throw new NotFoundException('Resource assignment not found');
      },
      findResourceAssignmentByCompany: async () => {
        throw new NotFoundException('Resource assignment not found');
      },
    } as unknown as PhvaAdvancedService;
    const trainingService = {
      findTrainingManagementById: async () => {
        throw new NotFoundException('Training management not found');
      },
      findTrainingManagementByCompany: async () => {
        throw new NotFoundException('Training management not found');
      },
    } as unknown as PhvaAdvancedService;
    const sstService = {
      findSstPolicyById: async () => {
        throw new NotFoundException('SST Policy not found');
      },
      findSstPolicyByCompany: async () => {
        throw new NotFoundException('SST Policy not found');
      },
    } as unknown as PhvaAdvancedService;
    const responsibilitiesRecord = {
      _id: new Types.ObjectId(RECORD_ID),
      companyId: new Types.ObjectId(COMPANY_ID),
      itemCode: '1.1.2',
      responsibilities: [
        {
          title: '__META__',
          category: JSON.stringify({ currentVersion: '1.1', approvalStatus: 'PENDING_APPROVAL', locked: true }),
        },
      ],
    };
    const responsibilitiesService = {
      findResponsibilitiesById: async () => responsibilitiesRecord,
      findResponsibilitiesByCompany: async () => responsibilitiesRecord,
      getResponsibilitiesApprovalStatus: () => 'PENDING_APPROVAL',
      approveResponsibilities: async () => responsibilitiesRecord,
      rejectResponsibilities: async () => responsibilitiesRecord,
    } as unknown as PhvaAdvancedService;

    const resourceHandler = new ResourceAssignmentHandler(resourceService, buildUserModel());
    const trainingHandler = new TrainingManagementHandler(trainingService, buildUserModel());
    const sstPolicyHandler = new SstPolicyHandler(sstService, buildUserModel());
    const responsibilitiesHandler = new ResponsibilitiesHandler(
      responsibilitiesService,
      buildUserModel(),
    );
    const responsibleSgsstHandler = new ResponsibleSgsstHandler(
      {
        findResponsableSstById: async () => {
          throw new NotFoundException('Responsable SST not found');
        },
        findResponsableSstByCompany: async () => {
          throw new NotFoundException('Responsable SST not found');
        },
      } as unknown as PhvaAdvancedService,
      buildUserModel(),
    );
    const copasstTrainingHandler = new CopasstTrainingHandler(
      buildNotFoundCopasstService(),
      buildUserModel(),
    );
    const adapter = new PhvaAdvancedAdapter(
      resourceHandler,
      trainingHandler,
      sstPolicyHandler,
      responsibilitiesHandler,
      responsibleSgsstHandler,
      copasstTrainingHandler,
    );

    const result = (await adapter.getEntity(COMPANY_ID, RECORD_ID)) as GetEntityResult;

    assert.ok(result.entity);
    assert.equal((result.entity as { itemCode: string }).itemCode, '1.1.2');
    assert.equal(result.status, 'PENDING_APPROVAL');
  });
});

  it('despacha hacia ResponsibleSgsstHandler cuando el registro es del Responsable SG-SST (1.1.1)', async () => {
    // Los stubs de Resource, Training, SST Policy y Responsibilities lanzan
    // NotFound para que el dispatcher caiga en el handler del Responsable SST.
    const notFound = async () => {
      throw new NotFoundException('not found');
    };
    const otherService = {
      findResourceAssignmentById: notFound,
      findResourceAssignmentByCompany: notFound,
      findTrainingManagementById: notFound,
      findTrainingManagementByCompany: notFound,
      findSstPolicyById: notFound,
      findSstPolicyByCompany: notFound,
      findResponsibilitiesById: notFound,
      findResponsibilitiesByCompany: notFound,
    } as unknown as PhvaAdvancedService;
    const responsibleRecord = {
      _id: new Types.ObjectId(RECORD_ID),
      companyId: new Types.ObjectId(COMPANY_ID),
      itemCode: '1.1.1',
      approvalStatus: 'PENDING_APPROVAL',
      currentVersion: '1.0',
    };
    const responsibleService = {
      ...otherService,
      findResponsableSstById: async () => responsibleRecord,
      findResponsableSstByCompany: async () => responsibleRecord,
      approveResponsableSst: async () => responsibleRecord,
    } as unknown as PhvaAdvancedService;

    const resourceHandler = new ResourceAssignmentHandler(otherService, buildUserModel());
    const trainingHandler = new TrainingManagementHandler(otherService, buildUserModel());
    const sstPolicyHandler = new SstPolicyHandler(otherService, buildUserModel());
    const responsibilitiesHandler = new ResponsibilitiesHandler(otherService, buildUserModel());
    const responsibleSgsstHandler = new ResponsibleSgsstHandler(
      responsibleService,
      buildUserModel(),
    );
    const copasstTrainingHandler = new CopasstTrainingHandler(
      buildNotFoundCopasstService(),
      buildUserModel(),
    );
    const adapter = new PhvaAdvancedAdapter(
      resourceHandler,
      trainingHandler,
      sstPolicyHandler,
      responsibilitiesHandler,
      responsibleSgsstHandler,
      copasstTrainingHandler,
    );

    const result = (await adapter.getEntity(COMPANY_ID, RECORD_ID)) as GetEntityResult;

    assert.ok(result.entity);
    assert.equal((result.entity as { itemCode: string }).itemCode, '1.1.1');
    assert.equal(result.status, 'PENDING_APPROVAL');
  });

  it('despacha hacia CopasstTrainingHandler cuando el registro es de Capacitación COPASST (1.1.7)', async () => {
    // Los stubs de Resource, Training, SST Policy, Responsibilities y
    // Responsible SST lanzan NotFound para que el dispatcher caiga en el
    // handler de la Capacitación COPASST.
    const notFound = async () => {
      throw new NotFoundException('not found');
    };
    const otherService = {
      findResourceAssignmentById: notFound,
      findResourceAssignmentByCompany: notFound,
      findTrainingManagementById: notFound,
      findTrainingManagementByCompany: notFound,
      findSstPolicyById: notFound,
      findSstPolicyByCompany: notFound,
      findResponsibilitiesById: notFound,
      findResponsibilitiesByCompany: notFound,
      findResponsableSstById: notFound,
      findResponsableSstByCompany: notFound,
    } as unknown as PhvaAdvancedService;
    const copasstRecord = {
      _id: new Types.ObjectId(RECORD_ID),
      companyId: new Types.ObjectId(COMPANY_ID),
      itemCode: '1.1.7',
      approval: { status: 'PENDING', version: 1 },
      locked: false,
    };
    const copasstService = {
      findById: async () => copasstRecord,
      findByCompany: async () => copasstRecord,
      approveCopasstTraining: async () => copasstRecord,
    } as unknown as PhvaAdvancedCopasstTrainingService;

    const resourceHandler = new ResourceAssignmentHandler(otherService, buildUserModel());
    const trainingHandler = new TrainingManagementHandler(otherService, buildUserModel());
    const sstPolicyHandler = new SstPolicyHandler(otherService, buildUserModel());
    const responsibilitiesHandler = new ResponsibilitiesHandler(otherService, buildUserModel());
    const responsibleSgsstHandler = new ResponsibleSgsstHandler(otherService, buildUserModel());
    const copasstTrainingHandler = new CopasstTrainingHandler(
      copasstService,
      buildUserModel(),
    );
    const adapter = new PhvaAdvancedAdapter(
      resourceHandler,
      trainingHandler,
      sstPolicyHandler,
      responsibilitiesHandler,
      responsibleSgsstHandler,
      copasstTrainingHandler,
    );

    const result = (await adapter.getEntity(COMPANY_ID, RECORD_ID)) as GetEntityResult;

    assert.ok(result.entity);
    assert.equal((result.entity as { itemCode: string }).itemCode, '1.1.7');
    assert.equal(result.status, 'PENDING');
    assert.equal(result.version, 1);
  });

  it('aprueba el Responsable SG-SST delegando en PhvaAdvancedService.approveResponsableSst', async () => {
    const responsibleRecord = {
      _id: new Types.ObjectId(RECORD_ID),
      companyId: new Types.ObjectId(COMPANY_ID),
      itemCode: '1.1.1',
      approvalStatus: 'PENDING_APPROVAL',
    };
    const approveCalls: unknown[][] = [];
    const responsibleService = {
      findResourceAssignmentById: async () => {
        throw new NotFoundException('not found');
      },
      findResourceAssignmentByCompany: async () => {
        throw new NotFoundException('not found');
      },
      findTrainingManagementById: async () => {
        throw new NotFoundException('not found');
      },
      findTrainingManagementByCompany: async () => {
        throw new NotFoundException('not found');
      },
      findSstPolicyById: async () => {
        throw new NotFoundException('not found');
      },
      findSstPolicyByCompany: async () => {
        throw new NotFoundException('not found');
      },
      findResponsibilitiesById: async () => {
        throw new NotFoundException('not found');
      },
      findResponsibilitiesByCompany: async () => {
        throw new NotFoundException('not found');
      },
      findResponsableSstById: async () => responsibleRecord,
      findResponsableSstByCompany: async () => responsibleRecord,
      approveResponsableSst: async (...args: unknown[]) => {
        approveCalls.push(args);
        return { ...responsibleRecord, approvalStatus: 'APPROVED_AND_SIGNED' };
      },
    } as unknown as PhvaAdvancedService;

    const resourceHandler = new ResourceAssignmentHandler(responsibleService, buildUserModel());
    const trainingHandler = new TrainingManagementHandler(responsibleService, buildUserModel());
    const sstPolicyHandler = new SstPolicyHandler(responsibleService, buildUserModel());
    const responsibilitiesHandler = new ResponsibilitiesHandler(responsibleService, buildUserModel());
    const responsibleSgsstHandler = new ResponsibleSgsstHandler(responsibleService, buildUserModel());
    const copasstTrainingHandler = new CopasstTrainingHandler(
      buildNotFoundCopasstService(),
      buildUserModel(),
    );
    const adapter = new PhvaAdvancedAdapter(
      resourceHandler,
      trainingHandler,
      sstPolicyHandler,
      responsibilitiesHandler,
      responsibleSgsstHandler,
      copasstTrainingHandler,
    );

    const result = await adapter.applyDecision(
      buildContext({ decision: ApprovalDecision.APPROVED }),
    );

    assert.equal(approveCalls.length, 1);
    assert.equal(
      (result as { approvalStatus: string }).approvalStatus,
      'APPROVED_AND_SIGNED',
    );
  });

describe('Integración ApprovalWorkflowService + PhvaAdvancedAdapter', () => {
  it('crea la solicitud, aprueba y registra los eventos CREATED + APPROVED', async () => {
    const { service: phvaService, approveCalls } = buildPhvaAdvancedService();
    const resourceHandler = new ResourceAssignmentHandler(phvaService, buildUserModel());
    const trainingHandler = new TrainingManagementHandler(phvaService, buildUserModel());
    const sstPolicyHandler = new SstPolicyHandler(phvaService, buildUserModel());
    const responsibilitiesHandler = new ResponsibilitiesHandler(phvaService, buildUserModel());
    const responsibleSgsstHandler = new ResponsibleSgsstHandler(phvaService, buildUserModel());
    const copasstTrainingHandler = new CopasstTrainingHandler(
      buildNotFoundCopasstService(),
      buildUserModel(),
    );
    const adapter = new PhvaAdvancedAdapter(
      resourceHandler,
      trainingHandler,
      sstPolicyHandler,
      responsibilitiesHandler,
      responsibleSgsstHandler,
      copasstTrainingHandler,
    );
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
        module: ApprovalEntity.PHVA_ADVANCED,
        entityType: 'PhvaAdvancedResourceAssignment',
        entityId: RECORD_ID,
        comments: 'Aprobación del módulo Asignación de Recursos SG-SST (1.1.3)',
      },
      buildActor(),
    );
    assert.equal(created.status, ApprovalStatus.PENDING_APPROVAL);
    assert.equal(events.length, 1);
    assert.equal((events[0] as { action: string }).action, 'CREATED');

    // 2. Aprobación delegada al adapter.
    const result = await workflow.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.PHVA_ADVANCED,
      RECORD_ID,
      { decision: ApprovalDecision.APPROVED, comments: 'OK' },
      buildActor(),
    );

    assert.equal(approveCalls.length, 1);
    assert.equal(result.request?.status, ApprovalStatus.APPROVED);
    assert.equal(events.length, 2);
    assert.equal((events[1] as { action: string }).action, ApprovalDecision.APPROVED);
  });

  it('registra el evento REJECTED al decidir el rechazo sobre la solicitud', async () => {
    const { service: phvaService, rejectCalls } = buildPhvaAdvancedService();
    const resourceHandler = new ResourceAssignmentHandler(phvaService, buildUserModel());
    const trainingHandler = new TrainingManagementHandler(phvaService, buildUserModel());
    const sstPolicyHandler = new SstPolicyHandler(phvaService, buildUserModel());
    const responsibilitiesHandler = new ResponsibilitiesHandler(phvaService, buildUserModel());
    const responsibleSgsstHandler = new ResponsibleSgsstHandler(phvaService, buildUserModel());
    const copasstTrainingHandler = new CopasstTrainingHandler(
      buildNotFoundCopasstService(),
      buildUserModel(),
    );
    const adapter = new PhvaAdvancedAdapter(
      resourceHandler,
      trainingHandler,
      sstPolicyHandler,
      responsibilitiesHandler,
      responsibleSgsstHandler,
      copasstTrainingHandler,
    );
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

    // 1. Creación de solicitud.
    const created = await workflow.createRequest(
      COMPANY_ID,
      {
        module: ApprovalEntity.PHVA_ADVANCED,
        entityType: 'PhvaAdvancedResourceAssignment',
        entityId: RECORD_ID,
      },
      buildActor(),
    );
    assert.equal(created.status, ApprovalStatus.PENDING_APPROVAL);

    // 2. Rechazo delegado al adapter.
    const result = await workflow.decideAndApply(
      COMPANY_ID,
      ApprovalEntity.PHVA_ADVANCED,
      RECORD_ID,
      { decision: ApprovalDecision.REJECTED, reason: 'Falta evidencia de recursos' },
      buildActor(),
    );

    assert.equal(rejectCalls.length, 1);
    assert.equal(rejectCalls[0][2], 'Falta evidencia de recursos');
    assert.equal(result.request?.status, ApprovalStatus.REJECTED);
    assert.equal(events.length, 2);
    assert.equal((events[0] as { action: string }).action, 'CREATED');
    assert.equal((events[1] as { action: string }).action, ApprovalDecision.REJECTED);
  });

  it('aplica decisiones legacy sin ApprovalRequest creando solicitud histórica y evento', async () => {
    const { service: phvaService, approveCalls } = buildPhvaAdvancedService();
    const resourceHandler = new ResourceAssignmentHandler(phvaService, buildUserModel());
    const trainingHandler = new TrainingManagementHandler(phvaService, buildUserModel());
    const sstPolicyHandler = new SstPolicyHandler(phvaService, buildUserModel());
    const responsibilitiesHandler = new ResponsibilitiesHandler(phvaService, buildUserModel());
    const responsibleSgsstHandler = new ResponsibleSgsstHandler(phvaService, buildUserModel());
    const copasstTrainingHandler = new CopasstTrainingHandler(
      buildNotFoundCopasstService(),
      buildUserModel(),
    );
    const adapter = new PhvaAdvancedAdapter(
      resourceHandler,
      trainingHandler,
      sstPolicyHandler,
      responsibilitiesHandler,
      responsibleSgsstHandler,
      copasstTrainingHandler,
    );
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

describe('PhvaAdvancedAdapter Contract', () => {
  // Suite de contrato reutilizable: valida la interfaz y los comportamientos
  // mínimos del ApprovalAdapter. `getEntityWithoutEntityId: 'resolve'` porque
  // el registro vigente se resuelve por companyId. `failingEntityId` no es un
  // ObjectId válido: getEntity debe rechazar.
  createAdapterContractSuite(
    () => {
      const { adapter } = buildAdapter();
      return adapter;
    },
    {
      getEntityWithoutEntityId: 'resolve',
      failingEntityId: 'not-an-object-id',
    },
  );
});
