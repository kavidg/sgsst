import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import { AnnualWorkPlanProvider } from './annual-work-plan.provider.js';
import { AnnualWorkPlanService } from '../../annual-work-plan/services/annual-work-plan.service.js';
import { AWP_CONSOLIDATED_SOURCES } from '../utils/compliance-weights.js';

// ─── Stubs ──────────────────────────────────────────────────────────────────

const COMPANY_A = new Types.ObjectId('64a00000000000000000000a');
const COMPANY_B = new Types.ObjectId('64a00000000000000000000b');
const PLAN_ID_A = new Types.ObjectId('64a000000000000000000001');
const PLAN_ID_B = new Types.ObjectId('64a000000000000000000002');

/**
 * Build a mock AnnualWorkPlanService that returns controlled results
 * for findCurrent, getComplianceReport, and hasActivitiesFromSourceModules.
 */
function buildMockService(overrides: {
  findCurrentResult?: { _id: Types.ObjectId; companyId: Types.ObjectId } | null;
  complianceReport?: {
    overallPercentage: number;
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
  };
  hasActivitiesFromSourceModules?: (planId: Types.ObjectId, sourceModules: string[]) => Promise<boolean>;
}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  const service = {
    findCurrent: async (companyId: Types.ObjectId) => {
      calls.push({ method: 'findCurrent', args: [companyId] });
      if (overrides.findCurrentResult === null) {
        throw new Error('No annual work plan found');
      }
      return overrides.findCurrentResult ?? { _id: PLAN_ID_A, companyId };
    },
    getComplianceReport: async (planId: Types.ObjectId) => {
      calls.push({ method: 'getComplianceReport', args: [planId] });
      return overrides.complianceReport ?? {
        overallPercentage: 75,
        totalTasks: 10,
        completedTasks: 7,
        overdueTasks: 2,
      };
    },
    hasActivitiesFromSourceModules: overrides.hasActivitiesFromSourceModules
      ? (overrides.hasActivitiesFromSourceModules as (planId: Types.ObjectId, sourceModules: string[]) => Promise<boolean>)
      : async (_planId: Types.ObjectId, _sourceModules: string[]) => false,
  } as unknown as AnnualWorkPlanService;

  return { service, calls };
}

// ═══════════════════════════════════════════════════════════════════════════
// AWP-HARDEN-01: Solo actividades manuales → NO consolidated
// ═══════════════════════════════════════════════════════════════════════════

describe('AWP-HARDEN-01: Solo actividades manuales → no consolidated', () => {
  it('AWP sin actividades de sourceModule known → phases.plan NO se asigna, phases.do SÍ', async () => {
    const { service } = buildMockService({
      hasActivitiesFromSourceModules: async () => false,
      complianceReport: { overallPercentage: 80, totalTasks: 5, completedTasks: 4, overdueTasks: 0 },
    });

    const provider = new AnnualWorkPlanProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 80);
    assert.ok(result.phases, 'phases debe existir');
    assert.equal(result.phases!.plan, undefined, 'AWP manual NO debe tener phases.plan');
    assert.equal(result.phases!.do, 80, 'AWP siempre contribuye a phases.do');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AWP-HARDEN-02: Actividad sourceModule=sst-objectives → consolidated
// ═══════════════════════════════════════════════════════════════════════════

describe('AWP-HARDEN-02: Actividad sourceModule=sst-objectives → consolidated', () => {
  it('AWP con actividades de SST Objectives → phases.plan SÍ se asigna', async () => {
    const { service } = buildMockService({
      hasActivitiesFromSourceModules: async (_planId, sourceModules) => {
        return sourceModules.includes('sst-objectives');
      },
      complianceReport: { overallPercentage: 70, totalTasks: 10, completedTasks: 7, overdueTasks: 1 },
    });

    const provider = new AnnualWorkPlanProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 70);
    assert.ok(result.phases, 'AWP consolidado de SST debe tener phases.plan');
    assert.equal(result.phases!.plan, 70);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AWP-HARDEN-03: Actividad sourceModule=initial-evaluation → consolidated
// ═══════════════════════════════════════════════════════════════════════════

describe('AWP-HARDEN-03: Actividad sourceModule=initial-evaluation → consolidated', () => {
  it('AWP con actividades de IE → phases.plan SÍ se asigna', async () => {
    const { service } = buildMockService({
      hasActivitiesFromSourceModules: async (_planId, sourceModules) => {
        return sourceModules.includes('initial-evaluation');
      },
      complianceReport: { overallPercentage: 65, totalTasks: 8, completedTasks: 5, overdueTasks: 2 },
    });

    const provider = new AnnualWorkPlanProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 65);
    assert.ok(result.phases, 'AWP consolidado de IE debe tener phases.plan');
    assert.equal(result.phases!.plan, 65);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AWP-HARDEN-04: Ambas fuentes → consolidated
// ═══════════════════════════════════════════════════════════════════════════

describe('AWP-HARDEN-04: Ambas fuentes → consolidated', () => {
  it('AWP con actividades de SST + IE → phases.plan SÍ se asigna', async () => {
    const { service } = buildMockService({
      hasActivitiesFromSourceModules: async () => true,
      complianceReport: { overallPercentage: 90, totalTasks: 12, completedTasks: 11, overdueTasks: 0 },
    });

    const provider = new AnnualWorkPlanProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 90);
    assert.ok(result.phases, 'AWP consolidado ambas fuentes debe tener phases.plan');
    assert.equal(result.phases!.plan, 90);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AWP-HARDEN-05: Fuente desconocida → no activa deduplicación
// ═══════════════════════════════════════════════════════════════════════════

describe('AWP-HARDEN-05: Fuente desconocida → no activa deduplicación', () => {
  it('AWP con sourceModule="training" pero NO de SST/IE → phases.plan NO, phases.do SÍ', async () => {
    const { service } = buildMockService({
      hasActivitiesFromSourceModules: async () => false,
      complianceReport: { overallPercentage: 60, totalTasks: 4, completedTasks: 2, overdueTasks: 1 },
    });

    const provider = new AnnualWorkPlanProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 60);
    assert.ok(result.phases, 'phases debe existir');
    assert.equal(result.phases!.plan, undefined, 'Fuente desconocida NO debe activar phases.plan');
    assert.equal(result.phases!.do, 60, 'phases.do siempre está presente');
  });

  it('hasActivitiesFromSourceModules recibe AWP_CONSOLIDATED_SOURCES exacto', async () => {
    let receivedSourceModules: string[] = [];
    const { service } = buildMockService({
      hasActivitiesFromSourceModules: async (_planId, sourceModules) => {
        receivedSourceModules = sourceModules;
        return false;
      },
    });

    const provider = new AnnualWorkPlanProvider(service);
    await provider.getCompliance(COMPANY_A.toString());

    assert.deepEqual(receivedSourceModules, AWP_CONSOLIDATED_SOURCES);
    assert.deepEqual(receivedSourceModules, ['sst-objectives', 'initial-evaluation']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AWP-HARDEN-06: Tenant isolation — Empresa A no ve actividades de B
// ═══════════════════════════════════════════════════════════════════════════

describe('AWP-HARDEN-06: Tenant isolation — Empresa A no detecta actividades de B', () => {
  it('hasActivitiesFromSourceModules se llama con el planId correcto', async () => {
    let receivedPlanId: Types.ObjectId | null = null;
    const { service } = buildMockService({
      findCurrentResult: { _id: PLAN_ID_A, companyId: COMPANY_A },
      hasActivitiesFromSourceModules: async (planId, _sourceModules) => {
        receivedPlanId = planId;
        return true;
      },
    });

    const provider = new AnnualWorkPlanProvider(service);
    await provider.getCompliance(COMPANY_A.toString());

    assert.deepEqual(receivedPlanId, PLAN_ID_A);
  });

  it('Empresa B recibe su propio plan con su propio resultado', async () => {
    const { service: serviceB } = buildMockService({
      findCurrentResult: { _id: PLAN_ID_B, companyId: COMPANY_B },
      complianceReport: { overallPercentage: 40, totalTasks: 3, completedTasks: 1, overdueTasks: 2 },
      hasActivitiesFromSourceModules: async () => false,
    });

    const providerB = new AnnualWorkPlanProvider(serviceB);
    const resultB = await providerB.getCompliance(COMPANY_B.toString());

    assert.equal(resultB.percentage, 40);
    assert.ok(resultB.phases, 'phases debe existir');
    assert.equal(resultB.phases!.do, 40, 'phases.do siempre está presente');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AWP-HARDEN-07: AWP vacío → no phases.plan
// ═══════════════════════════════════════════════════════════════════════════

describe('AWP-HARDEN-07: AWP vacío → phases.do=0, phases.plan=undefined', () => {
  it('Plan sin actividades → percentage=0, phases.do=0', async () => {
    const { service } = buildMockService({
      complianceReport: { overallPercentage: 0, totalTasks: 0, completedTasks: 0, overdueTasks: 0 },
      hasActivitiesFromSourceModules: async () => false,
    });

    const provider = new AnnualWorkPlanProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 0);
    assert.ok(result.phases, 'phases debe existir');
    assert.equal(result.phases!.do, 0, 'phases.do = 0 para plan vacío');
    assert.equal(result.phases!.plan, undefined, 'phases.plan no asignado sin consolidación');
  });

  it('findCurrent lanza NotFoundException → resultado NO_DATA controlado', async () => {
    const { service } = buildMockService({
      findCurrentResult: null,
    });

    const provider = new AnnualWorkPlanProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.phases, undefined);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AWP-HARDEN-08: AWP manual con porcentaje válido → sin falso consolidation
// ═══════════════════════════════════════════════════════════════════════════

describe('AWP-HARDEN-08: AWP manual con porcentaje válido → sin falso consolidation', () => {
  it('AWP 100% con solo actividades manuales → phases.plan NO, phases.do SÍ', async () => {
    const { service } = buildMockService({
      complianceReport: { overallPercentage: 100, totalTasks: 20, completedTasks: 20, overdueTasks: 0 },
      hasActivitiesFromSourceModules: async () => false,
    });

    const provider = new AnnualWorkPlanProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 100);
    assert.ok(result.phases, 'phases debe existir');
    assert.equal(result.phases!.plan, undefined, 'AWP 100% manual NO debe tener phases.plan');
    assert.equal(result.phases!.do, 100, 'phases.do siempre está presente');
  });

  it('AWP 50% con mixto manual+sincronizado → SÍ consolidado con 50%', async () => {
    const { service } = buildMockService({
      complianceReport: { overallPercentage: 50, totalTasks: 10, completedTasks: 5, overdueTasks: 3 },
      hasActivitiesFromSourceModules: async () => true,
    });

    const provider = new AnnualWorkPlanProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 50);
    assert.ok(result.phases, 'AWP mixto consolidado SÍ debe tener phases.plan');
    assert.equal(result.phases!.plan, 50);
  });

  it('El porcentaje de phases.plan coincide con percentage del módulo', async () => {
    const { service } = buildMockService({
      complianceReport: { overallPercentage: 73, totalTasks: 7, completedTasks: 5, overdueTasks: 1 },
      hasActivitiesFromSourceModules: async () => true,
    });

    const provider = new AnnualWorkPlanProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.phases!.plan, result.percentage);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Validez de AWP_CONSOLIDATED_SOURCES
// ═══════════════════════════════════════════════════════════════════════════

describe('AWP_CONSOLIDATED_SOURCES: constante correcta', () => {
  it('contiene exactamente sst-objectives e initial-evaluation', () => {
    assert.deepEqual(AWP_CONSOLIDATED_SOURCES, [
      'sst-objectives',
      'initial-evaluation',
    ]);
  });

  it('NO contiene evaluations (fuente legacy)', () => {
    assert.ok(!AWP_CONSOLIDATED_SOURCES.includes('evaluations'));
  });

  it('NO contiene annual-work-plan (no se auto-referencia)', () => {
    assert.ok(!AWP_CONSOLIDATED_SOURCES.includes('annual-work-plan'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AWP semántica: findings, pending, completed, overdue
// ═══════════════════════════════════════════════════════════════════════════

describe('AWP semántica: campos del resultado', () => {
  it('overdueTasks > 0 genera finding', async () => {
    const { service } = buildMockService({
      complianceReport: { overallPercentage: 50, totalTasks: 10, completedTasks: 5, overdueTasks: 3 },
      hasActivitiesFromSourceModules: async () => false,
    });

    const provider = new AnnualWorkPlanProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.ok(result.findings.length > 0);
    assert.equal(result.findings[0].id, 'awp-overdue');
    assert.equal(result.overdue, 3);
  });

  it('overdueTasks = 0 genera findings vacío', async () => {
    const { service } = buildMockService({
      complianceReport: { overallPercentage: 100, totalTasks: 5, completedTasks: 5, overdueTasks: 0 },
      hasActivitiesFromSourceModules: async () => false,
    });

    const provider = new AnnualWorkPlanProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.findings.length, 0);
  });

  it('pending = totalTasks - completedTasks', async () => {
    const { service } = buildMockService({
      complianceReport: { overallPercentage: 60, totalTasks: 10, completedTasks: 6, overdueTasks: 2 },
      hasActivitiesFromSourceModules: async () => false,
    });

    const provider = new AnnualWorkPlanProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.pending, 4);
    assert.equal(result.completed, 6);
  });
});
