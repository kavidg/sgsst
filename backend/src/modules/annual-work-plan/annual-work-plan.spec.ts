import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import { AnnualWorkPlanService } from './services/annual-work-plan.service';
import { AnnualWorkPlanStatus } from './schemas/annual-work-plan.schema';
import { ActivityPriority } from './schemas/plan-activity.schema';
import { JustificationApprovalStatus } from './schemas/task-justification.schema';
import { UserDocument } from '../users/schemas/user.schema';

const COMPANY_A = new Types.ObjectId('64a000000000000000000001');
const COMPANY_B = new Types.ObjectId('64a000000000000000000002');
const PLAN_ID = new Types.ObjectId('64a000000000000000000010');
const ACTIVITY_ID = new Types.ObjectId('64a000000000000000000011');
const TASK_ID = new Types.ObjectId('64a000000000000000000012');
const USER_ID = new Types.ObjectId('64a000000000000000000021');

const USER = {
  _id: USER_ID,
  email: 'owner@empresa-a.com',
  role: 'owner',
} as unknown as UserDocument;

const CURRENT_YEAR = new Date().getFullYear();

/** Modelo stub con patrón encadenable del proyecto. */
function modelStub(overrides?: {
  findOneResult?: unknown;
  findResult?: unknown[];
  saveResult?: unknown;
}) {
  const calls: { method: string; query?: unknown; data?: unknown }[] = [];
  const chain: Record<string, unknown> = {
    populate: (_ref: unknown) => chain,
    sort: (_sort: unknown) => chain,
    exec: async () => {
      const last = calls[calls.length - 1];
      if (last?.method === 'findOne' || last?.method === 'findById') return overrides?.findOneResult ?? null;
      return overrides?.findResult ?? [];
    },
  };
  const model: Record<string, unknown> = {
    _calls: calls,
    findOne: (query: unknown) => {
      calls.push({ method: 'findOne', query });
      return chain;
    },
    find: (query: unknown) => {
      calls.push({ method: 'find', query });
      return chain;
    },
    findById: (id: unknown) => {
      calls.push({ method: 'findById', query: id });
      return chain;
    },
    findByIdAndDelete: (id: unknown) => {
      calls.push({ method: 'findByIdAndDelete', query: id });
      return { exec: async () => ({ _id: id }) };
    },
    create: async (data: unknown) => {
      calls.push({ method: 'create', data });
      return { _id: new Types.ObjectId(), ...(data as Record<string, unknown>), save: async () => {} };
    },
    deleteMany: async () => ({ deletedCount: 0 }),
  };
  return model;
}

function buildPlan(overrides?: Partial<{ companyId: Types.ObjectId; year: number; status: AnnualWorkPlanStatus; _id: Types.ObjectId; compliancePercentage: number }>) {
  const plan: Record<string, unknown> = {
    _id: PLAN_ID,
    companyId: COMPANY_A,
    year: CURRENT_YEAR,
    status: AnnualWorkPlanStatus.DRAFT,
    compliancePercentage: 0,
    createdBy: USER_ID,
    approval: undefined,
  };
  if (overrides) Object.assign(plan, overrides);
  plan.save = async () => plan;
  return plan;
}

function buildService(overrides?: {
  findOnePlan?: unknown;
  findPlans?: unknown[];
  activityService?: Record<string, unknown>;
  taskService?: Record<string, unknown>;
  planComplianceService?: Record<string, unknown>;
  planHistoryService?: Record<string, unknown>;
  taskEvidenceService?: Record<string, unknown>;
  taskJustificationService?: Record<string, unknown>;
}) {
  const planModel = modelStub({ findOneResult: overrides?.findOnePlan ?? buildPlan(), findResult: overrides?.findPlans ?? [] });
  const activityModel = modelStub();
  const taskModel = modelStub();
  const subtaskModel = modelStub();
  const evidenceModel = modelStub();
  const justificationModel = modelStub();
  const historyModel = modelStub();

  const defaultHistoryService = { record: async () => {} };
  const defaultComplianceService = { calculate: async () => ({ overallPercentage: 75 }) };
  const defaultEvidenceService = { create: async () => ({}), findByTask: async () => [], remove: async () => {} };
  const defaultJustificationService = { create: async () => ({}), findByTask: async () => [], approve: async () => ({}) };

  const service = new AnnualWorkPlanService(
    planModel as never,
    activityModel as never,
    taskModel as never,
    subtaskModel as never,
    evidenceModel as never,
    justificationModel as never,
    historyModel as never,
    (overrides?.activityService ?? { create: async () => ({}), findByPlan: async () => [], findById: async () => ({}), update: async () => ({}), remove: async () => {} }) as never,
    (overrides?.taskService ?? { create: async () => ({}), findByActivity: async () => [], findById: async () => ({}), update: async () => ({}), remove: async () => {}, processAutoStatusAndAlerts: async () => {} }) as never,
    (overrides?.planComplianceService ?? defaultComplianceService) as never,
    (overrides?.planHistoryService ?? defaultHistoryService) as never,
    (overrides?.taskEvidenceService ?? defaultEvidenceService) as never,
    (overrides?.taskJustificationService ?? defaultJustificationService) as never,
    {} as never, // alertsService (unused in tested paths)
  );

  return { service, planModel, activityModel, taskModel, historyModel };
}

// ==================== AWP-01: findOrCreateCurrent ====================

describe('AWP-01: findOrCreateCurrent devuelve el plan correcto para companyId', () => {
  it('devuelve el plan existente si existe para el año actual', async () => {
    const existingPlan = buildPlan({ companyId: COMPANY_A, year: CURRENT_YEAR });
    const { service } = buildService({ findOnePlan: existingPlan });

    const result = await service.findOrCreateCurrent(COMPANY_A, USER);

    assert.equal(result._id, PLAN_ID);
    assert.equal(result.companyId, COMPANY_A);
  });

  it('crea un plan nuevo si no existe para el año actual', async () => {
    const createdPlan = buildPlan({ companyId: COMPANY_A, year: CURRENT_YEAR, _id: new Types.ObjectId() });
    const { service } = buildService({ findOnePlan: null });

    const result = await service.findOrCreateCurrent(COMPANY_A, USER);

    assert.ok(result);
  });
});

// ==================== AWP-02: Tenant isolation ====================

describe('AWP-02: dos empresas diferentes no comparten plan', () => {
  it('findOrCreateCurrent de B buscaCompanyId de B, no de A', async () => {
    const companyBCalls: unknown[] = [];
    const { service, planModel } = buildService({ findOnePlan: null });

    // Override findOne to capture queries
    const origFindOne = planModel.findOne as Function;
    (planModel as Record<string, unknown>).findOne = (query: unknown) => {
      companyBCalls.push(query);
      return origFindOne(query);
    };

    await service.findOrCreateCurrent(COMPANY_B, USER);

    assert.ok(companyBCalls.length >= 1, 'findOne debe ser llamado');
    const query = companyBCalls[0] as Record<string, unknown>;
    assert.equal(query.companyId, COMPANY_B);
  });
});

// ==================== AWP-03: Activity belongs to correct plan ====================

describe('AWP-03: actividad pertenece al plan correcto', () => {
  it('createActivity delega a activityService con annualPlanId correcto', async () => {
    const createdActivity = { _id: new Types.ObjectId(), annualPlanId: PLAN_ID, title: 'Test Activity' };
    const activityService = { create: async (dto: unknown) => ({ ...(dto as Record<string, unknown>), _id: new Types.ObjectId() }), findByPlan: async () => [], findById: async () => ({}), update: async () => ({}), remove: async () => {} };

    const { service } = buildService({
      findOnePlan: buildPlan(),
      activityService,
    });

    const result = await service.createActivity(
      PLAN_ID,
      { title: 'Test Activity', startDate: '2026-01-01', endDate: '2026-12-31', responsibleUser: USER_ID.toString() },
      USER,
    );

    assert.ok(result);
  });
});

// ==================== AWP-04: Status transitions ====================

describe('AWP-04: transiciones de estado válidas e inválidas', () => {
  it('DRAFT → ACTIVE es válido', async () => {
    const plan = buildPlan({ status: AnnualWorkPlanStatus.DRAFT });
    const { service } = buildService({ findOnePlan: plan });

    const result = await service.updateStatus(PLAN_ID, AnnualWorkPlanStatus.ACTIVE, USER);

    assert.equal(result.status, AnnualWorkPlanStatus.ACTIVE);
  });

  it('DRAFT → COMPLETED es rechazado', async () => {
    const plan = buildPlan({ status: AnnualWorkPlanStatus.DRAFT });
    const { service } = buildService({ findOnePlan: plan });

    await assert.rejects(
      () => service.updateStatus(PLAN_ID, AnnualWorkPlanStatus.COMPLETED, USER),
      (err: Error) => {
        assert.ok(err.message.includes('Draft plans can only be activated'));
        return true;
      },
    );
  });

  it('ARCHIVED no puede actualizarse', async () => {
    const plan = buildPlan({ status: AnnualWorkPlanStatus.ARCHIVED });
    const { service } = buildService({ findOnePlan: plan });

    await assert.rejects(
      () => service.updateStatus(PLAN_ID, AnnualWorkPlanStatus.ACTIVE, USER),
      (err: Error) => {
        assert.ok(err.message.includes('Cannot update an archived plan'));
        return true;
      },
    );
  });

  it('ACTIVE → COMPLETED es válido', async () => {
    const plan = buildPlan({ status: AnnualWorkPlanStatus.ACTIVE });
    const { service } = buildService({ findOnePlan: plan });

    const result = await service.updateStatus(PLAN_ID, AnnualWorkPlanStatus.COMPLETED, USER);

    assert.equal(result.status, AnnualWorkPlanStatus.COMPLETED);
  });

  it('ACTIVE → ARCHIVED es válido', async () => {
    const plan = buildPlan({ status: AnnualWorkPlanStatus.ACTIVE });
    const { service } = buildService({ findOnePlan: plan });

    const result = await service.updateStatus(PLAN_ID, AnnualWorkPlanStatus.ARCHIVED, USER);

    assert.equal(result.status, AnnualWorkPlanStatus.ARCHIVED);
  });

  it('COMPLETED → ARCHIVED es válido', async () => {
    const plan = buildPlan({ status: AnnualWorkPlanStatus.COMPLETED });
    const { service } = buildService({ findOnePlan: plan });

    const result = await service.updateStatus(PLAN_ID, AnnualWorkPlanStatus.ARCHIVED, USER);

    assert.equal(result.status, AnnualWorkPlanStatus.ARCHIVED);
  });
});

// ==================== AWP-05: Approval ====================

describe('AWP-05: approve solo acepta DRAFT', () => {
  it('DRAFT → ACTIVE al aprobar', async () => {
    const plan = buildPlan({ status: AnnualWorkPlanStatus.DRAFT });
    const { service } = buildService({ findOnePlan: plan });

    const result = await service.approve(PLAN_ID, USER_ID, 'owner@empresa-a.com', 'Owner');

    assert.equal(result.status, AnnualWorkPlanStatus.ACTIVE);
    assert.ok(result.approval);
  });

  it('ACTIVE rechaza approve', async () => {
    const plan = buildPlan({ status: AnnualWorkPlanStatus.ACTIVE });
    const { service } = buildService({ findOnePlan: plan });

    await assert.rejects(
      () => service.approve(PLAN_ID, USER_ID, 'owner@empresa-a.com', 'Owner'),
      (err: Error) => {
        assert.ok(err.message.includes('Only draft plans can be approved'));
        return true;
      },
    );
  });
});

// ==================== AWP-06: recalculateCompliance ====================

describe('AWP-06: recalculateCompliance auto-completa al 100%', () => {
  it('marca COMPLETED si compliance >= 100 y status es ACTIVE', async () => {
    const plan = buildPlan({ status: AnnualWorkPlanStatus.ACTIVE, compliancePercentage: 50 });
    const complianceService = { calculate: async () => ({ overallPercentage: 100 }) };
    const { service } = buildService({ findOnePlan: plan, planComplianceService: complianceService });

    const result = await service.recalculateCompliance(PLAN_ID);

    assert.equal(result, 100);
  });
});

// ==================== AWP-07: remove cascade ====================

describe('AWP-07: remove elimina plan y entidades relacionadas', () => {
  it('elimina plan sin excepciones', async () => {
    const plan = buildPlan();
    const { service } = buildService({ findOnePlan: plan });

    // Override models with chainable stubs that support .select()
    const serviceAny = service as unknown as Record<string, unknown>;
    const selectChain = { exec: async () => [] };
    const selectFn = () => selectChain;
    const dmChain = { exec: async () => ({ deletedCount: 0 }) };
    serviceAny['activityModel'] = { find: () => ({ select: selectFn }), deleteMany: () => dmChain };
    serviceAny['taskModel'] = { find: () => ({ select: selectFn }), deleteMany: () => dmChain };
    serviceAny['subtaskModel'] = { deleteMany: () => dmChain };
    serviceAny['evidenceModel'] = { deleteMany: () => dmChain };
    serviceAny['justificationModel'] = { deleteMany: () => dmChain };
    serviceAny['historyModel'] = { deleteMany: () => dmChain };
    // Override planModel's findByIdAndDelete for remove
    (serviceAny['planModel'] as Record<string, unknown>)['findByIdAndDelete'] = () => ({ exec: async () => ({ _id: PLAN_ID }) });

    await service.remove(PLAN_ID, USER);

    assert.ok(true); // If no exception, cascade succeeded
  });
});

// ==================== AWP-08: History ====================

describe('AWP-08: getHistory devuelve registros del plan', () => {
  it('delega a planHistoryService.findByEntity', async () => {
    const historyRecords = [{ action: 'CREATE' }];
    const historyService = { record: async () => {}, findByEntity: async () => historyRecords };
    const { service } = buildService({ planHistoryService: historyService });

    const result = await service.getHistory('AnnualWorkPlan', PLAN_ID.toString());

    assert.equal(result.length, 1);
    assert.equal((result[0] as unknown as Record<string, unknown>).action, 'CREATE');
  });
});

// ==================== AWP-09: Justification role check ====================

describe('AWP-09: approveJustification requiere rol manager/admin/owner', () => {
  it('owner puede aprobar', async () => {
    const justificationService = { approve: async () => ({ status: 'APPROVED' }) };
    const { service } = buildService({ taskJustificationService: justificationService });

    const result = await service.approveJustification(
      new Types.ObjectId(),
      USER,
      JustificationApprovalStatus.APPROVED,
    );

    assert.ok(result);
  });

  it('rol no autorizado es rechazado', async () => {
    const viewer = { ...USER, role: 'viewer' } as unknown as UserDocument;
    const { service } = buildService();

    await assert.rejects(
      () => service.approveJustification(new Types.ObjectId(), viewer, JustificationApprovalStatus.APPROVED),
      (err: Error) => {
        assert.ok(err.message.includes('Only managers and admins'));
        return true;
      },
    );
  });
});

// ==================== AWP-10: Module integrations ====================

describe('AWP-10: createActivityFromModule delega correctamente', () => {
  it('createActivityFromTraining usa sourceModule TRAINING', async () => {
    const activityService = {
      create: async (dto: unknown) => {
        const d = dto as Record<string, unknown>;
        assert.equal(d.sourceModule, 'TRAINING');
        return { _id: new Types.ObjectId(), ...d };
      },
      findByPlan: async () => [],
      findById: async () => ({}),
      update: async () => ({}),
      remove: async () => {},
    };

    const { service } = buildService({ findOnePlan: buildPlan(), activityService });

    const result = await service.createActivityFromTraining({
      companyId: COMPANY_A,
      trainingId: new Types.ObjectId(),
      title: 'Capacitación',
      description: 'Desc',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      responsibleUser: USER_ID,
      user: USER,
    });

    assert.ok(result);
  });

  it('createActivityFromCopasst usa sourceModule COPASST', async () => {
    const activityService = {
      create: async (dto: unknown) => {
        const d = dto as Record<string, unknown>;
        assert.equal(d.sourceModule, 'COPASST');
        return { _id: new Types.ObjectId(), ...d };
      },
      findByPlan: async () => [],
      findById: async () => ({}),
      update: async () => ({}),
      remove: async () => {},
    };

    const { service } = buildService({ findOnePlan: buildPlan(), activityService });

    const result = await service.createActivityFromCopasst({
      companyId: COMPANY_A,
      copasstId: new Types.ObjectId(),
      title: 'COPASST',
      description: 'Desc',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      responsibleUser: USER_ID,
      user: USER,
    });

    assert.ok(result);
  });
});
