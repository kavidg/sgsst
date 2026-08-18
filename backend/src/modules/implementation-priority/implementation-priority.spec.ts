import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  WizardOverviewDto,
  WizardOverviewStepDto,
} from '../implementation-wizard/dto/wizard-overview.dto';
import { ALL_STEPS } from '../implementation-wizard/implementation-wizard.constants';
import { ImplementationWizardService } from '../implementation-wizard/implementation-wizard.service';
import { StepId, StepStatus } from '../implementation-wizard/schemas/implementation-wizard.schema';
import { RolesGuard } from '../questions/roles.guard';
import { STEP_PRIORITY_CONFIG } from './constants/step-priority.config';
import { ImplementationPriorityController } from './implementation-priority.controller';
import { ImplementationPriorityModule } from './implementation-priority.module';
import { ImplementationPriorityService } from './implementation-priority.service';
import { StepPriorityConfig } from './interfaces/priority-config.interface';
import {
  buildDependencyGraph,
  DependencyResolution,
  DEPENDENCY_COMPLETE_THRESHOLD,
} from './utils/dependency-graph';
import { buildPriorityOverview } from './utils/priority-dto.builder';
import { computeImpactMetrics } from './utils/impact-metrics';
import { computePriorityScore } from './utils/priority-score';

const VALID_CRITICALITY = ['ALTA', 'MEDIA', 'BAJA'];
const VALID_EFFORT = ['BAJO', 'MEDIO', 'ALTO'];

/** Stub del overview del wizard para los tests del motor. */
function makeOverview(
  overrides: Partial<Record<StepId, { percentage: number; status: StepStatus; pendingCriteria?: string[]; criteria?: string[] }>>,
): WizardOverviewDto {
  const steps: WizardOverviewStepDto[] = ALL_STEPS.map((stepId) => {
    const o = overrides[stepId];
    const percentage = o?.percentage ?? 0;
    const status = o?.status ?? 'PENDING';
    return {
      stepId,
      title: stepId,
      moduleRoute: `/module/${stepId}`,
      percentage,
      status,
      completed: status === 'COMPLETED',
      criteria: o?.criteria ?? [],
      pendingCriteria: o?.pendingCriteria ?? [],
      estimatedImpact: null,
    };
  });

  return {
    overallPercentage: 42,
    overallScore: 40,
    level: 'FAIR',
    completedSteps: steps.filter((s) => s.completed).length,
    totalSteps: steps.length,
    isImplementationComplete: false,
    lastValidatedAt: '2026-01-01T00:00:00.000Z',
    steps,
  };
}

/** Detección de ciclos DFS para validar que la config real es acíclica. */
function hasCycle(config: Record<StepId, StepPriorityConfig>): boolean {
  const state = new Map<string, number>(); // 0 sin visitar, 1 en pila, 2 visitado
  const visit = (node: string): boolean => {
    if (state.get(node) === 1) return true;
    if (state.get(node) === 2) return false;
    state.set(node, 1);
    for (const dep of config[node as StepId]?.dependencies ?? []) {
      if (visit(dep)) return true;
    }
    state.set(node, 2);
    return false;
  };
  for (const stepId of Object.keys(config)) {
    if (visit(stepId)) return true;
  }
  return false;
}

describe('ImplementationPriorityModule', () => {
  it('se construye con controller, service y RolesGuard (sin forwardRef)', () => {
    const controllers = Reflect.getMetadata('controllers', ImplementationPriorityModule) ?? [];
    const providers = Reflect.getMetadata('providers', ImplementationPriorityModule) ?? [];
    assert.ok(controllers.includes(ImplementationPriorityController), 'controller registrado');
    assert.ok(providers.includes(ImplementationPriorityService), 'service registrado');
    assert.ok(providers.includes(RolesGuard), 'RolesGuard registrado');
  });
});

describe('STEP_PRIORITY_CONFIG', () => {
  it('cubre exactamente los 14 pasos canónicos', () => {
    assert.deepEqual(
      Object.keys(STEP_PRIORITY_CONFIG).sort(),
      [...ALL_STEPS].sort(),
    );
  });

  it('solo define las 6 dependencias verificadas (sin especulativas)', () => {
    const expected: Partial<Record<StepId, string[]>> = {
      course_50_hours: ['responsible_sst'],
      sst_policy: ['responsible_sst'],
      sst_objectives: ['sst_policy'],
      annual_plan: ['initial_evaluation'],
      training: ['annual_plan'],
      document_management: ['legal_matrix'],
    };
    for (const stepId of ALL_STEPS) {
      assert.deepEqual(
        [...STEP_PRIORITY_CONFIG[stepId].dependencies].sort(),
        [...(expected[stepId] ?? [])].sort(),
        `dependencias de ${stepId}`,
      );
    }
  });

  it('cada dependencia referencia un StepId válido y distinto de sí mismo', () => {
    for (const [stepId, entry] of Object.entries(STEP_PRIORITY_CONFIG)) {
      for (const dep of entry.dependencies) {
        assert.ok(ALL_STEPS.includes(dep as never), `dependencia inválida ${dep} en ${stepId}`);
        assert.notEqual(dep, stepId, `auto-dependencia en ${stepId}`);
      }
    }
  });

  it('la configuración real es acíclica', () => {
    assert.equal(hasCycle(STEP_PRIORITY_CONFIG), false);
  });

  it('usa valores válidos de criticality/estimatedEffort y templates no vacíos', () => {
    for (const entry of Object.values(STEP_PRIORITY_CONFIG)) {
      assert.ok(VALID_CRITICALITY.includes(entry.criticality), `criticality ${entry.criticality}`);
      assert.ok(VALID_EFFORT.includes(entry.estimatedEffort), `effort ${entry.estimatedEffort}`);
      assert.ok(entry.actionTemplate.trim().length > 0, 'template vacío');
    }
  });
});

describe('buildDependencyGraph', () => {
  it('dependencia bloqueada: responsible_sst < 80 bloquea course_50_hours', () => {
    const graph = buildDependencyGraph(
      [{ stepId: 'responsible_sst', percentage: 0 }],
      STEP_PRIORITY_CONFIG,
    );
    assert.deepEqual(graph.course_50_hours?.blockedBy, ['responsible_sst']);
    assert.equal(graph.course_50_hours?.ready, false);
  });

  it('dependencia cumplida: responsible_sst >= 80 desbloquea course_50_hours', () => {
    const graph = buildDependencyGraph(
      [{ stepId: 'responsible_sst', percentage: 100 }],
      STEP_PRIORITY_CONFIG,
    );
    assert.deepEqual(graph.course_50_hours?.blockedBy, []);
    assert.equal(graph.course_50_hours?.ready, true);
  });

  it('umbral exacto: umbral−1 bloquea, umbral no', () => {
    const blocked = buildDependencyGraph(
      [{ stepId: 'responsible_sst', percentage: DEPENDENCY_COMPLETE_THRESHOLD - 1 }],
      STEP_PRIORITY_CONFIG,
    );
    assert.equal(blocked.course_50_hours?.ready, false);

    const satisfied = buildDependencyGraph(
      [{ stepId: 'responsible_sst', percentage: DEPENDENCY_COMPLETE_THRESHOLD }],
      STEP_PRIORITY_CONFIG,
    );
    assert.equal(satisfied.course_50_hours?.ready, true);
  });

  it('unlock correcto: responsible_sst (2 dependientes) = 1.0, resto 0.5, sin dependientes = 0', () => {
    const allZero = buildDependencyGraph(
      ALL_STEPS.map((stepId) => ({ stepId, percentage: 0 })),
      STEP_PRIORITY_CONFIG,
    );
    // responsible_sst → course_50_hours, sst_policy (2 = max) → 1.0
    assert.deepEqual(allZero.responsible_sst?.unlocks, ['course_50_hours', 'sst_policy']);
    assert.equal(allZero.responsible_sst?.unlockPotential, 1);
    // initial_evaluation → annual_plan (1/2) → 0.5
    assert.equal(allZero.initial_evaluation?.unlockPotential, 0.5);
    // training sin dependientes → 0
    assert.equal(allZero.training?.unlockPotential, 0);
  });

  it('dependencia inexistente en el input bloquea de forma defensiva sin romper', () => {
    const config = {
      a: { dependencies: ['ghost'] },
    } as unknown as Record<StepId, StepPriorityConfig>;
    const graph = buildDependencyGraph(
      [{ stepId: 'a', percentage: 0 } as never],
      config,
    ) as Record<string, DependencyResolution>;
    assert.deepEqual(graph['a'].blockedBy, ['ghost']);
    assert.equal(graph['a'].ready, false);
  });

  it('ciclo de dependencias no cuelga y bloquea ambos nodos', () => {
    const cyclic = {
      a: { dependencies: ['b'] },
      b: { dependencies: ['a'] },
    } as unknown as Record<StepId, StepPriorityConfig>;
    const graph = buildDependencyGraph(
      [{ stepId: 'a', percentage: 0 } as never, { stepId: 'b', percentage: 0 } as never],
      cyclic,
    ) as Record<string, DependencyResolution>;
    assert.deepEqual(graph['a'].blockedBy, ['b']);
    assert.deepEqual(graph['b'].blockedBy, ['a']);
    assert.equal(graph['a'].ready, false);
    assert.equal(graph['b'].ready, false);
  });

  it('empresa completa: sin bloqueos y sin dependientes pendientes', () => {
    const graph = buildDependencyGraph(
      ALL_STEPS.map((stepId) => ({ stepId, percentage: 100 })),
      STEP_PRIORITY_CONFIG,
    );
    for (const stepId of ALL_STEPS) {
      assert.deepEqual(graph[stepId]?.blockedBy, [], `${stepId} sin bloqueos`);
      assert.equal(graph[stepId]?.ready, true, `${stepId} ready`);
    }
  });
});

describe('computePriorityScore (fórmula PS(s))', () => {
  const weights = { impact: 0.45, criticality: 0.3, unlock: 0.15, block: 0.1 };

  it('paso ALTA al 0% → 75 (impacto 1.0 + criticidad 1.0)', () => {
    assert.equal(
      computePriorityScore({ impact: 1, criticality: 1, unlockPotential: 0, blocked: false, weights }),
      75,
    );
  });

  it('paso MEDIA al 0% → 60', () => {
    assert.equal(
      computePriorityScore({ impact: 1, criticality: 0.5, unlockPotential: 0, blocked: false, weights }),
      60,
    );
  });

  it('paso BAJA al 0% → 53 (redondeo de 52.5)', () => {
    assert.equal(
      computePriorityScore({ impact: 1, criticality: 0.25, unlockPotential: 0, blocked: false, weights }),
      53,
    );
  });

  it('score con desbloqueo: Û=1.0 → 90 (75 + 15)', () => {
    assert.equal(
      computePriorityScore({ impact: 1, criticality: 1, unlockPotential: 1, blocked: false, weights }),
      90,
    );
  });

  it('score bloqueado: B=1 resta w_block (75 → 65)', () => {
    assert.equal(
      computePriorityScore({ impact: 1, criticality: 1, unlockPotential: 0, blocked: true, weights }),
      65,
    );
  });

  it('el potencial de desbloqueo aporta (Û=0.5 → 83)', () => {
    assert.equal(
      computePriorityScore({ impact: 1, criticality: 1, unlockPotential: 0.5, blocked: false, weights }),
      83,
    );
  });

  it('acota el resultado a [0, 100]', () => {
    assert.equal(
      computePriorityScore({ impact: 2, criticality: 2, unlockPotential: 2, blocked: false, weights }),
      100,
    );
    assert.equal(
      computePriorityScore({ impact: -1, criticality: -1, unlockPotential: 0, blocked: false, weights }),
      0,
    );
  });
});

describe('computeImpactMetrics', () => {
  it('sst_policy (peso 0.10) al 0% → 10 puntos y "+10% implementación"', () => {
    const metrics = computeImpactMetrics('sst_policy', 0);
    assert.equal(metrics.impactPoints, 10);
    assert.equal(metrics.estimatedImpact, '+10% implementación');
  });

  it('sst_policy al 40% → 6 puntos y "+6% implementación"', () => {
    const metrics = computeImpactMetrics('sst_policy', 40);
    assert.equal(metrics.impactPoints, 6);
    assert.equal(metrics.estimatedImpact, '+6% implementación');
  });

  it('sst_policy al 100% → 0 puntos y sin impacto', () => {
    const metrics = computeImpactMetrics('sst_policy', 100);
    assert.equal(metrics.impactPoints, 0);
    assert.equal(metrics.estimatedImpact, null);
  });
});

describe('buildPriorityOverview', () => {
  it('construye un DTO tipado a partir de input e items', () => {
    const dto = buildPriorityOverview(
      {
        companyId: 'c1',
        overallPercentage: 0,
        overallScore: 0,
        level: 'NO_DATA',
        completedSteps: 0,
        totalSteps: 14,
        steps: [],
      },
      [],
    );

    assert.equal(dto.companyId, 'c1');
    assert.equal(dto.priorities.length, 0);
    assert.equal(dto.readyCount, 0);
    assert.equal(dto.blockedCount, 0);
    assert.ok(!Number.isNaN(Date.parse(dto.generatedAt)), 'generatedAt ISO válido');
  });
});

describe('ImplementationPriorityService', () => {
  it('empresa nueva: prioriza responsable_sst (desbloquea 2 pasos, score 90)', async () => {
    const wizardStub = { getOverview: async () => makeOverview({}) } as unknown as ImplementationWizardService;
    const service = new ImplementationPriorityService(wizardStub);

    const dto = await service.getPriorities('a'.repeat(24));

    assert.equal(dto.totalSteps, 14);
    assert.equal(dto.priorities.length, 5);
    assert.ok(dto.priorities.every((p) => p.status === 'PENDING'));
    // responsable_sst: impacto 1.0 + criticidad 1.0 + Û=1.0 → 90.
    assert.equal(dto.priorities[0].stepId, 'responsible_sst');
    assert.equal(dto.priorities[0].priorityScore, 90);
    assert.deepEqual(dto.priorities[0].unlocks, ['course_50_hours', 'sst_policy']);
    assert.equal(dto.priorities[0].unlockPotential, 1);
    for (let i = 1; i < dto.priorities.length; i++) {
      assert.ok(dto.priorities[i - 1].priorityScore >= dto.priorities[i].priorityScore);
    }
  });

  it('empresa parcial: pasos bloqueados bajan y exponen blockedBy', async () => {
    const wizardStub = {
      getOverview: async () =>
        makeOverview({
          company_info: { percentage: 100, status: 'COMPLETED', criteria: ['Datos'], pendingCriteria: [] },
          sst_policy: { percentage: 0, status: 'PENDING' },
          training: { percentage: 40, status: 'IN_PROGRESS', pendingCriteria: ['Programa anual'] },
        }),
    } as unknown as ImplementationWizardService;
    const service = new ImplementationPriorityService(wizardStub);

    const dto = await service.getPriorities('a'.repeat(24));

    assert.ok(!dto.priorities.some((p) => p.stepId === 'company_info'), 'completado excluido');

    // sst_policy: bloqueado por responsible_sst (−10) pero con Û=0.5
    // (desbloquea sst_objectives) → 100×(0.45+0.30+0.075−0.10)=72.5 → 73.
    const sstPolicy = dto.priorities.find((p) => p.stepId === 'sst_policy');
    assert.equal(sstPolicy?.priorityScore, 73);
    assert.deepEqual(sstPolicy?.blockedBy, ['responsible_sst']);
    assert.equal(sstPolicy?.ready, false);
    assert.equal(sstPolicy?.unlockPotential, 0.5); // sst_policy → sst_objectives (1/2)
    assert.equal(sstPolicy?.impactPoints, 10);
    assert.equal(sstPolicy?.estimatedImpact, '+10% implementación');
    assert.equal(sstPolicy?.criticality, 'ALTA');
    assert.equal(sstPolicy?.riskLevel, 'ALTO');
    assert.equal(sstPolicy?.estimatedEffort, 'MEDIO');
    assert.equal(sstPolicy?.recommendedAction, 'Completar y aprobar la Política SST');

    // training (40%, bloqueado por annual_plan → score 32) no alcanza el top 5.
    assert.ok(
      !dto.priorities.some((p) => p.stepId === 'training'),
      'training (32) no entra al top 5',
    );
  });

  it('empresa completa: sin prioridades (todo hecho) y sin bloqueos', async () => {
    const allComplete = Object.fromEntries(
      ALL_STEPS.map((stepId) => [stepId, { percentage: 100, status: 'COMPLETED' as StepStatus }]),
    ) as Parameters<typeof makeOverview>[0];
    const wizardStub = { getOverview: async () => makeOverview(allComplete) } as unknown as ImplementationWizardService;
    const service = new ImplementationPriorityService(wizardStub);

    const dto = await service.getPriorities('a'.repeat(24));

    assert.equal(dto.completedSteps, 14);
    assert.equal(dto.priorities.length, 0);
  });

  it('tolerancia: si getOverview falla, devuelve DTO vacío sin romper', async () => {
    const wizardStub = {
      getOverview: async () => {
        throw new Error('overview caído');
      },
    } as unknown as ImplementationWizardService;
    const service = new ImplementationPriorityService(wizardStub);

    const dto = await service.getPriorities('a'.repeat(24));

    assert.equal(dto.companyId, 'a'.repeat(24));
    assert.equal(dto.totalSteps, 14);
    assert.equal(dto.level, 'NO_DATA');
    assert.equal(dto.priorities.length, 0);
  });
});

describe('ImplementationPriorityController', () => {
  it('responde con el DTO del service', async () => {
    const serviceStub = {
      getPriorities: async (companyId: string) => ({
        companyId,
        generatedAt: new Date().toISOString(),
        overallPercentage: 0,
        overallScore: 0,
        level: 'NO_DATA',
        completedSteps: 0,
        totalSteps: 14,
        readyCount: 0,
        blockedCount: 0,
        priorities: [],
      }),
    } as unknown as ImplementationPriorityService;

    const controller = new ImplementationPriorityController(serviceStub);
    const mockRequest = { companyId: new (require('mongoose').Types.ObjectId)('a'.repeat(24)) } as any;
    const result = await controller.getPriorities(mockRequest);

    assert.equal(result.companyId, 'a'.repeat(24));
    assert.ok(Array.isArray(result.priorities));
  });
});
