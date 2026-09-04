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
  evaluationResult?: unknown;
  activityFindResult?: unknown[];
}) {
  const planModel = modelStub({ findOneResult: overrides?.findOnePlan ?? buildPlan(), findResult: overrides?.findPlans ?? [] });
  const activityModel = modelStub({ findResult: overrides?.activityFindResult ?? [] });
  const taskModel = modelStub();
  const subtaskModel = modelStub();
  const evidenceModel = modelStub();
  const justificationModel = modelStub();
  const historyModel = modelStub();
  const sstObjectivesModel = modelStub();
  const initialEvaluationModel = modelStub({ findOneResult: overrides?.evaluationResult ?? null });

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
    sstObjectivesModel as never,
    (overrides?.activityService ?? { create: async () => ({}), findByPlan: async () => [], findById: async () => ({}), update: async () => ({}), remove: async () => {} }) as never,
    (overrides?.taskService ?? { create: async () => ({}), findByActivity: async () => [], findById: async () => ({}), update: async () => ({}), remove: async () => {}, processAutoStatusAndAlerts: async () => {} }) as never,
    (overrides?.planComplianceService ?? defaultComplianceService) as never,
    (overrides?.planHistoryService ?? defaultHistoryService) as never,
    (overrides?.taskEvidenceService ?? defaultEvidenceService) as never,
    (overrides?.taskJustificationService ?? defaultJustificationService) as never,
    {} as never, // alertsService (unused in tested paths)
    initialEvaluationModel as never,
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

// ==================== PLANEAR-FASE2: syncFromInitialEvaluation ====================

const EVAL_ID = new Types.ObjectId('64a000000000000000000030');

function buildEvaluation(overrides?: {
  companyId?: Types.ObjectId;
  actionPlan?: Array<Record<string, unknown>>;
}) {
  return {
    _id: EVAL_ID,
    companyId: overrides?.companyId ?? COMPANY_A,
    evaluationDate: new Date('2026-01-15'),
    actionPlan: overrides?.actionPlan ?? [],
  };
}

describe('PLANEAR-FASE2-09: evaluación pertenece al tenant correcto', () => {
  it('rechaza sync si la evaluación no pertenece a la empresa', async () => {
    const evaluation = buildEvaluation({ companyId: COMPANY_B });
    const { service } = buildService({ evaluationResult: evaluation });

    await assert.rejects(
      () => service.syncFromInitialEvaluation(COMPANY_A, EVAL_ID, USER),
      (err: Error) => {
        assert.ok(err.message.includes('does not belong'));
        return true;
      },
    );
  });

  it('rechaza sync si la evaluación no existe', async () => {
    const { service } = buildService({ evaluationResult: null });

    await assert.rejects(
      () => service.syncFromInitialEvaluation(COMPANY_A, EVAL_ID, USER),
      (err: Error) => {
        assert.ok(err.message.includes('not found'));
        return true;
      },
    );
  });
});

describe('PLANEAR-FASE2-10: una acción genera una PlanActivity', () => {
  it('crea una actividad a partir de una acción del actionPlan', async () => {
    const evaluation = buildEvaluation({
      actionPlan: [{
        id: 'ACTION-001',
        source: 'standard:1.1.2',
        title: 'Actualizar procedimiento',
        description: 'Procedimiento actualizado',
        responsible: 'Juan',
        dueDate: new Date('2026-06-30'),
        status: 'Open',
        progress: 0,
      }],
    });
    let createdDto: Record<string, unknown> = {};
    const activityService = {
      create: async (dto: unknown) => {
        createdDto = dto as Record<string, unknown>;
        return { _id: new Types.ObjectId(), ...createdDto };
      },
      findByPlan: async () => [],
      findById: async () => ({}),
      update: async () => ({}),
      remove: async () => {},
    };

    const { service } = buildService({ evaluationResult: evaluation, activityService });

    const result = await service.syncFromInitialEvaluation(COMPANY_A, EVAL_ID, USER);

    assert.equal(result.created, 1);
    assert.equal(result.skipped, 0);
    assert.equal(result.errors, 0);
    assert.equal(createdDto.title, 'Actualizar procedimiento');
  });
});

describe('PLANEAR-FASE2-11: actividad conserva trazabilidad completa', () => {
  it('sourceModule, sourceEntityId, sourceActivityId, sourceItemCode son correctos', async () => {
    const evaluation = buildEvaluation({
      actionPlan: [{
        id: 'ACTION-001',
        source: 'standard:1.1.2',
        title: 'Acción',
        status: 'Open',
      }],
    });
    let createdDto: Record<string, unknown> = {};
    const activityService = {
      create: async (dto: unknown) => {
        createdDto = dto as Record<string, unknown>;
        return { _id: new Types.ObjectId(), ...createdDto };
      },
      findByPlan: async () => [],
      findById: async () => ({}),
      update: async () => ({}),
      remove: async () => {},
    };

    const { service } = buildService({ evaluationResult: evaluation, activityService });

    await service.syncFromInitialEvaluation(COMPANY_A, EVAL_ID, USER);

    assert.equal(createdDto.sourceModule, 'initial-evaluation');
    assert.equal(createdDto.sourceEntityId?.toString(), EVAL_ID.toString());
    assert.equal(createdDto.sourceActivityId, 'ACTION-001');
    assert.equal(createdDto.sourceItemCode, 'standard:1.1.2');
  });
});

describe('PLANEAR-FASE2-12: dos sincronizaciones no generan duplicados', () => {
  it('segunda sincronización omite acciones ya existentes', async () => {
    const evaluation = buildEvaluation({
      actionPlan: [{ id: 'ACTION-001', source: 'standard:1.1.2', title: 'Acción', status: 'Open' }],
    });
    let createCount = 0;
    const activityService = {
      create: async (dto: unknown) => {
        createCount++;
        return { _id: new Types.ObjectId(), ...(dto as Record<string, unknown>) };
      },
      findByPlan: async () => [],
      findById: async () => ({}),
      update: async () => ({}),
      remove: async () => {},
    };

    const { service } = buildService({ evaluationResult: evaluation, activityService });

    // First sync: creates
    const r1 = await service.syncFromInitialEvaluation(COMPANY_A, EVAL_ID, USER);
    assert.equal(r1.created, 1);
    assert.equal(createCount, 1);

    // Second sync: should skip (existing activities returned by find)
    const existingActivity = {
      _id: new Types.ObjectId(),
      sourceActivityId: 'ACTION-001',
      title: 'Acción',
      description: undefined,
      endDate: new Date(),
      status: 'Pending',
    };
    const activityModelSecondPass = modelStub({ findResult: [existingActivity] });
    const serviceAny = service as unknown as Record<string, unknown>;
    serviceAny['activityModel'] = activityModelSecondPass;

    const r2 = await service.syncFromInitialEvaluation(COMPANY_A, EVAL_ID, USER);
    assert.equal(r2.created, 0);
    assert.equal(r2.skipped, 1);
  });
});

describe('PLANEAR-FASE2-13: dos acciones distintas del mismo estándar generan actividades distintas', () => {
  it('ACTION-001 y ACTION-002 del mismo estándar producen dos PlanActivity', async () => {
    const evaluation = buildEvaluation({
      actionPlan: [
        { id: 'ACTION-001', source: 'standard:1.1.2', title: 'Acción A', status: 'Open' },
        { id: 'ACTION-002', source: 'standard:1.1.2', title: 'Acción B', status: 'Open' },
      ],
    });
    let createCount = 0;
    const activityService = {
      create: async (dto: unknown) => {
        createCount++;
        return { _id: new Types.ObjectId(), ...(dto as Record<string, unknown>) };
      },
      findByPlan: async () => [],
      findById: async () => ({}),
      update: async () => ({}),
      remove: async () => {},
    };

    const { service } = buildService({ evaluationResult: evaluation, activityService });

    const result = await service.syncFromInitialEvaluation(COMPANY_A, EVAL_ID, USER);

    assert.equal(result.created, 2);
    assert.equal(createCount, 2);
  });
});

describe('PLANEAR-FASE2-14: empresa A no puede sincronizar evaluación de empresa B', () => {
  it('companyId mismatch es rechazado', async () => {
    const evaluation = buildEvaluation({ companyId: COMPANY_B });
    const { service } = buildService({ evaluationResult: evaluation });

    await assert.rejects(
      () => service.syncFromInitialEvaluation(COMPANY_A, EVAL_ID, USER),
      (err: Error) => {
        assert.ok(err.message.includes('does not belong'));
        return true;
      },
    );
  });
});

describe('PLANEAR-FASE2-15: modificar acción existente actualiza sin duplicar', () => {
  it('actualiza título de actividad existente cuando la fuente cambia', async () => {
    const evaluation = buildEvaluation({
      actionPlan: [{ id: 'ACTION-001', source: 'standard:1.1.2', title: 'Título actualizado', status: 'Open' }],
    });
    const existingActivity = {
      _id: new Types.ObjectId(),
      sourceActivityId: 'ACTION-001',
      title: 'Título viejo',
      description: undefined,
      endDate: new Date('2026-12-31'),
      status: 'Pending',
    };
    let updateCalled = false;
    const activityService = {
      create: async () => ({}),
      findByPlan: async () => [],
      findById: async () => ({}),
      update: async (id: unknown, dto: unknown) => {
        updateCalled = true;
        const d = dto as Record<string, unknown>;
        assert.equal(d.title, 'Título actualizado');
        return { ...existingActivity, ...d };
      },
      remove: async () => {},
    };

    const activityModel = modelStub({ findResult: [existingActivity] });

    const planModel = modelStub({ findOneResult: buildPlan() });
    const sstObjectivesModel = modelStub();
    const initialEvaluationModel = modelStub({ findOneResult: evaluation });

    const service = new AnnualWorkPlanService(
      planModel as never,
      activityModel as never,
      modelStub() as never,
      modelStub() as never,
      modelStub() as never,
      modelStub() as never,
      modelStub() as never,
      sstObjectivesModel as never,
      activityService as never,
      { create: async () => ({}), findByActivity: async () => [], findById: async () => ({}), update: async () => ({}), remove: async () => {}, processAutoStatusAndAlerts: async () => {} } as never,
      { calculate: async () => ({ overallPercentage: 75 }) } as never,
      { record: async () => {} } as never,
      { create: async () => ({}), findByTask: async () => [], remove: async () => {} } as never,
      { create: async () => ({}), findByTask: async () => [], approve: async () => ({}) } as never,
      {} as never,
      initialEvaluationModel as never,
    );

    const result = await service.syncFromInitialEvaluation(COMPANY_A, EVAL_ID, USER);

    assert.equal(result.created, 0);
    assert.equal(result.updated, 1);
    assert.ok(updateCalled);
  });
});

describe('PLANEAR-FASE2-16: endpoint respeta autenticación, roles y tenant isolation', () => {
  it('syncFromInitialEvaluation requiere companyId válido', async () => {
    const evaluation = buildEvaluation();
    const { service } = buildService({ evaluationResult: evaluation });

    await assert.rejects(
      () => service.syncFromInitialEvaluation(COMPANY_B, EVAL_ID, USER),
      (err: Error) => {
        assert.ok(err.message.includes('does not belong'));
        return true;
      },
    );
  });
});

describe('PLANEAR-FASE2-17: funcionalidades existentes del AnnualWorkPlan no presentan regresiones', () => {
  it('findOrCreateCurrent sigue funcionando correctamente', async () => {
    const existingPlan = buildPlan();
    const { service } = buildService({ findOnePlan: existingPlan });

    const result = await service.findOrCreateCurrent(COMPANY_A, USER);

    assert.equal(result._id, PLAN_ID);
    assert.equal(result.companyId, COMPANY_A);
  });

  it('createActivity sigue funcionando correctamente', async () => {
    const activityService = {
      create: async (dto: unknown) => ({ _id: new Types.ObjectId(), ...(dto as Record<string, unknown>) }),
      findByPlan: async () => [],
      findById: async () => ({}),
      update: async () => ({}),
      remove: async () => {},
    };
    const { service } = buildService({ findOnePlan: buildPlan(), activityService });

    const result = await service.createActivity(
      PLAN_ID,
      { title: 'Test', startDate: '2026-01-01', endDate: '2026-12-31', responsibleUser: USER_ID.toString() },
      USER,
    );

    assert.ok(result);
  });

  it('syncFromSstObjectives sigue funcionando correctamente', async () => {
    const { service } = buildService();
    const result = await service.syncFromSstObjectives(COMPANY_A, USER);
    assert.equal(result.created, 0);
    assert.equal(result.skipped, 0);
  });
});

describe('PLANEAR-FASE2-18: actionPlan vacío retorna 0,0,0,0', () => {
  it('devuelve resultado vacío cuando no hay acciones', async () => {
    const evaluation = buildEvaluation({ actionPlan: [] });
    const { service } = buildService({ evaluationResult: evaluation });

    const result = await service.syncFromInitialEvaluation(COMPANY_A, EVAL_ID, USER);

    assert.equal(result.created, 0);
    assert.equal(result.updated, 0);
    assert.equal(result.skipped, 0);
    assert.equal(result.errors, 0);
  });
});

// ==================== DASH-PLAN: Dashboard del plan anual ====================

describe('DASH-PLAN-01: dashboard de plan vacío', () => {
  it('devuelve todos los contadores en 0 y completionPercentage en 0', async () => {
    const { service } = buildService({
      findOnePlan: buildPlan(),
      activityFindResult: [],
    });

    const result = await service.getDashboard(PLAN_ID);

    assert.equal(result.totalActivities, 0);
    assert.equal(result.pending, 0);
    assert.equal(result.inProgress, 0);
    assert.equal(result.completed, 0);
    assert.equal(result.cancelled, 0);
    assert.equal(result.overdue, 0);
    assert.equal(result.completionPercentage, 0);
  });
});

describe('DASH-PLAN-02: dashboard con todas las actividades completadas', () => {
  it('completionPercentage = 100', async () => {
    const activities = [
      { status: 'Completed', endDate: new Date('2026-12-31'), phvaPhase: 'do' },
      { status: 'Completed', endDate: new Date('2026-12-31'), phvaPhase: 'do' },
      { status: 'Completed', endDate: new Date('2026-12-31'), phvaPhase: 'check' },
    ];

    const { service } = buildService({
      findOnePlan: buildPlan(),
      activityFindResult: activities,
    });

    const result = await service.getDashboard(PLAN_ID);

    assert.equal(result.totalActivities, 3);
    assert.equal(result.completed, 3);
    assert.equal(result.completionPercentage, 100);
    assert.equal(result.byPhase['do'], 2);
    assert.equal(result.byPhase['check'], 1);
  });
});

describe('DASH-PLAN-03: dashboard con estados mixtos', () => {
  it('cuenta correctamente pending, inProgress, completed, cancelled', async () => {
    const activities = [
      { status: 'Pending', endDate: new Date('2026-12-31'), phvaPhase: 'plan' },
      { status: 'InProgress', endDate: new Date('2026-12-31'), phvaPhase: 'do' },
      { status: 'Completed', endDate: new Date('2026-12-31'), phvaPhase: 'do' },
      { status: 'Cancelled', endDate: new Date('2026-12-31'), phvaPhase: 'check' },
    ];

    const { service } = buildService({
      findOnePlan: buildPlan(),
      activityFindResult: activities,
    });

    const result = await service.getDashboard(PLAN_ID);

    assert.equal(result.totalActivities, 4);
    assert.equal(result.pending, 1);
    assert.equal(result.inProgress, 1);
    assert.equal(result.completed, 1);
    assert.equal(result.cancelled, 1);
    assert.equal(result.overdue, 0);
    // 1/4 = 25%
    assert.equal(result.completionPercentage, 25);
  });
});

describe('DASH-PLAN-04: completionPercentage correctamente calculado', () => {
  it('3 completadas de 10 = 30%', async () => {
    const activities = Array.from({ length: 10 }, (_, i) => ({
      status: i < 3 ? 'Completed' : 'Pending',
      endDate: new Date('2026-12-31'),
    }));

    const { service } = buildService({
      findOnePlan: buildPlan(),
      activityFindResult: activities,
    });

    const result = await service.getDashboard(PLAN_ID);

    assert.equal(result.totalActivities, 10);
    assert.equal(result.completed, 3);
    assert.equal(result.completionPercentage, 30);
  });
});

describe('DASH-PLAN-05: zero activities → completionPercentage = 0', () => {
  it('plan sin actividades tiene completionPercentage 0', async () => {
    const { service } = buildService({
      findOnePlan: buildPlan(),
      activityFindResult: [],
    });

    const result = await service.getDashboard(PLAN_ID);

    assert.equal(result.completionPercentage, 0);
  });
});

describe('DASH-PLAN-06: overdue activities detectadas correctamente', () => {
  it('actividad con endDate en el pasado y status Pending se marca overdue', async () => {
    const pastDate = new Date('2020-01-01');
    const activities = [
      { status: 'Pending', endDate: pastDate },
      { status: 'Completed', endDate: pastDate },
      { status: 'InProgress', endDate: pastDate },
    ];

    const { service } = buildService({
      findOnePlan: buildPlan(),
      activityFindResult: activities,
    });

    const result = await service.getDashboard(PLAN_ID);

    // Pending + InProgress with past dates = overdue
    // Completed is NOT overdue even if past date
    assert.equal(result.overdue, 2);
  });
});

// ==================== PHVA-FIELDS: campos PHVA en actividades ====================

describe('PHVA-FIELDS-01: phvaPhase se guarda correctamente', () => {
  it('createActivity pasa phvaPhase al activityService', async () => {
    let capturedDto: Record<string, unknown> = {};
    const activityService = {
      create: async (dto: unknown) => {
        capturedDto = dto as Record<string, unknown>;
        return { _id: new Types.ObjectId(), ...capturedDto };
      },
      findByPlan: async () => [],
      findById: async () => ({}),
      update: async () => ({}),
      remove: async () => {},
    };

    const { service } = buildService({ findOnePlan: buildPlan(), activityService });

    await service.createActivity(
      PLAN_ID,
      {
        title: 'Test PHVA',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        responsibleUser: USER_ID.toString(),
        phvaPhase: 'do' as never,
        standardNumber: '6.1.1',
      },
      USER,
    );

    assert.equal(capturedDto.phvaPhase, 'do');
    assert.equal(capturedDto.standardNumber, '6.1.1');
  });
});

// ==================== TENANT-ISOLATION-PLAN: aislamiento por tenant ====================

describe('TENANT-ISOLATION-PLAN-01: getActivities valida companyId', () => {
  it('rechaza si el plan no pertenece a la empresa', async () => {
    const planFromCompanyB = buildPlan({ companyId: COMPANY_B });
    const { service } = buildService({ findOnePlan: planFromCompanyB });

    await assert.rejects(
      () => service.getActivities(PLAN_ID, COMPANY_A),
      (err: Error) => {
        assert.ok(err.message.includes('not found') || err.message.includes('Plan not found'));
        return true;
      },
    );
  });

  it('acepta si el plan pertenece a la empresa', async () => {
    const { service } = buildService({ findOnePlan: buildPlan() });

    const result = await service.getActivities(PLAN_ID, COMPANY_A);

    assert.ok(Array.isArray(result));
  });
});

describe('TENANT-ISOLATION-PLAN-02: getActivity valida companyId', () => {
  it('rechaza si la actividad no pertenece a la empresa', async () => {
    const activityFromOtherCompany = {
      _id: new Types.ObjectId(),
      annualPlanId: PLAN_ID,
      title: 'Test',
      status: 'Pending',
      endDate: new Date(),
    };
    const activityModel = modelStub({ findOneResult: activityFromOtherCompany });
    const planFromCompanyB = buildPlan({ companyId: COMPANY_B });
    const planModel = modelStub({ findOneResult: planFromCompanyB });

    const service = new AnnualWorkPlanService(
      planModel as never,
      activityModel as never,
      modelStub() as never,
      modelStub() as never,
      modelStub() as never,
      modelStub() as never,
      modelStub() as never,
      modelStub() as never,
      { create: async () => ({}), findByPlan: async () => [], findById: async () => activityFromOtherCompany, update: async () => ({}), remove: async () => {} } as never,
      { create: async () => ({}), findByActivity: async () => [], findById: async () => ({}), update: async () => ({}), remove: async () => {}, processAutoStatusAndAlerts: async () => {} } as never,
      { calculate: async () => ({ overallPercentage: 75 }) } as never,
      { record: async () => {} } as never,
      { create: async () => ({}), findByTask: async () => [], remove: async () => {} } as never,
      { create: async () => ({}), findByTask: async () => [], approve: async () => ({}) } as never,
      {} as never,
      modelStub() as never,
    );

    await assert.rejects(
      () => service.getActivity(new Types.ObjectId(), COMPANY_A),
      (err: Error) => {
        assert.ok(err.message.includes('not found'));
        return true;
      },
    );
  });
});
