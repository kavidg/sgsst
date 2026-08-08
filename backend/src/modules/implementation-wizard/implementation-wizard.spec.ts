import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import { ImplementationValidatorService } from '../implementation-validator/implementation-validator.service';
import {
  ProviderValidationResult,
  WizardValidationProvider,
} from '../implementation-validator/interfaces/wizard-validation-provider.interface';
import { StepId } from './schemas/implementation-wizard.schema';
import { ImplementationWizardService } from './implementation-wizard.service';
import {
  AUTO_VALIDATION_TTL_MS,
  buildWizardOverview,
  shouldRunAutoValidation,
} from './wizard-overview.utils';

const ALL_STEPS: StepId[] = [
  'company_info', 'users_roles', 'responsible_sst', 'course_50_hours',
  'sst_policy', 'sst_objectives', 'initial_evaluation', 'annual_plan',
  'copasst', 'convivencia_committee', 'training', 'communication',
  'legal_matrix', 'document_management',
];

function makeProvider(
  stepId: StepId,
  result: Omit<ProviderValidationResult, 'stepId'>,
  onCall?: () => void,
): WizardValidationProvider {
  return {
    stepId,
    getValidation: async () => {
      onCall?.();
      return { stepId, ...result };
    },
  };
}

function buildValidator(
  results: Partial<Record<StepId, Omit<ProviderValidationResult, 'stepId'>>>,
  overrides?: Partial<Record<StepId, WizardValidationProvider>>,
  onCall?: () => void,
): ImplementationValidatorService {
  const providers: WizardValidationProvider[] = ALL_STEPS.map((stepId) =>
    overrides?.[stepId] ??
    makeProvider(stepId, results[stepId] ?? { percentage: 0, status: 'PENDING', details: 'sin datos' }, onCall),
  );
  return new ImplementationValidatorService(
    ...(providers as unknown as ConstructorParameters<typeof ImplementationValidatorService>),
  );
}

function makeWizardModel() {
  let stored: {
    companyId: Types.ObjectId;
    steps: ProviderValidationResult[];
    overallScore: number;
    completionPercentage: number;
    isOnboardingComplete: boolean;
    isImplementationComplete: boolean;
    history: unknown[];
    lastAutoValidationAt?: string;
    save: () => Promise<unknown>;
  } | null = null;
  return {
    model: {
      findOne: () => ({ exec: async () => stored }),
      create: async (payload: {
        companyId: Types.ObjectId;
        steps: ProviderValidationResult[];
        overallScore: number;
        completionPercentage: number;
      }) => {
        stored = {
          ...payload,
          isOnboardingComplete: false,
          isImplementationComplete: false,
          history: [],
          save: async function () {
            return this;
          },
        };
        return stored;
      },
    },
    getStored: () => stored,
  };
}

function allStepsResult(
  percentage: number,
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED',
  criteria?: string[],
  pendingCriteria?: string[],
): Partial<Record<StepId, Omit<ProviderValidationResult, 'stepId'>>> {
  return Object.fromEntries(
    ALL_STEPS.map((stepId) => [
      stepId,
      { percentage, status, details: `stub ${stepId}`, criteria, pendingCriteria },
    ]),
  ) as Partial<Record<StepId, Omit<ProviderValidationResult, 'stepId'>>>;
}

describe('shouldRunAutoValidation', () => {
  it('devuelve true cuando nunca se ha validado', () => {
    assert.equal(shouldRunAutoValidation(undefined), true);
    assert.equal(shouldRunAutoValidation(null), true);
  });

  it('devuelve false si la última validación es reciente (< 5 min)', () => {
    const recent = new Date(Date.now() - AUTO_VALIDATION_TTL_MS + 1000).toISOString();
    assert.equal(shouldRunAutoValidation(recent), false);
  });

  it('devuelve true si la última validación supera el TTL', () => {
    const old = new Date(Date.now() - AUTO_VALIDATION_TTL_MS - 1000).toISOString();
    assert.equal(shouldRunAutoValidation(old), true);
  });

  it('devuelve true ante fechas inválidas', () => {
    assert.equal(shouldRunAutoValidation('not-a-date'), true);
  });
});

describe('buildWizardOverview', () => {
  it('construye el DTO sin exponer schemas Mongo', () => {
    const wizard = {
      completionPercentage: 42,
      overallScore: 42,
      isImplementationComplete: false,
      lastAutoValidationAt: '2026-01-01T00:00:00.000Z',
      steps: ALL_STEPS.map((stepId) => ({
        stepId,
        status: stepId === 'company_info' ? 'COMPLETED' : 'PENDING',
        score: stepId === 'company_info' ? 100 : 0,
        criteria: stepId === 'company_info' ? ['Nombre empresa'] : [],
        pendingCriteria: stepId === 'company_info' ? [] : ['Pendiente'],
      })),
      save: async () => wizard,
    } as never;

    const overview = buildWizardOverview(wizard as never);

    assert.equal(overview.overallPercentage, 42);
    assert.equal(overview.totalSteps, 14);
    assert.equal(overview.completedSteps, 1);
    assert.equal(overview.steps.length, 14);
    assert.ok('title' in overview.steps[0]);
    assert.ok('moduleRoute' in overview.steps[0]);
    assert.equal(overview.steps[0].completed, true);
    assert.deepEqual(overview.steps[1].pendingCriteria, ['Pendiente']);
  });

  it('emite estimatedImpact calculado: completo → null, pendiente con peso → "+X% implementación"', () => {
    const wizard = {
      completionPercentage: 30,
      overallScore: 30,
      isImplementationComplete: false,
      lastAutoValidationAt: '2026-01-01T00:00:00.000Z',
      steps: ALL_STEPS.map((stepId) => ({
        stepId,
        status: stepId === 'sst_policy' ? 'PENDING' : 'COMPLETED',
        score: stepId === 'sst_policy' ? 0 : 100,
        criteria: [],
        pendingCriteria: [],
      })),
      save: async () => wizard,
    } as never;

    const overview = buildWizardOverview(wizard as never);

    // sst_policy pendiente (peso 0.10) → "+10% implementación".
    const sstPolicy = overview.steps.find((s) => s.stepId === 'sst_policy');
    assert.equal(sstPolicy?.estimatedImpact, '+10% implementación');
    // Pasos completos (100%) → sin impacto.
    const companyInfo = overview.steps.find((s) => s.stepId === 'company_info');
    assert.equal(companyInfo?.estimatedImpact, null);
  });
});

describe('ImplementationWizardService.getOverview', () => {
  it('CASO 1: empresa nueva sin datos → responde, porcentaje cercano a 0, sin errores', async () => {
    const { model } = makeWizardModel();
    const service = new ImplementationWizardService(model as never, buildValidator({}));

    const overview = await service.getOverview(new Types.ObjectId('a'.repeat(24)));

    assert.equal(overview.totalSteps, 14);
    assert.equal(overview.overallPercentage, 0);
    assert.equal(overview.isImplementationComplete, false);
    assert.ok(overview.steps.every((s) => s.status === 'PENDING'));
    assert.ok(overview.steps.every((s) => s.completed === false));
  });

  it('CASO 2: empresa parcialmente configurada → pasos IN_PROGRESS y porcentaje intermedio', async () => {
    const { model } = makeWizardModel();
    const partial: Partial<Record<StepId, Omit<ProviderValidationResult, 'stepId'>>> = {
      company_info: { percentage: 100, status: 'COMPLETED', details: '', criteria: ['Nombre'], pendingCriteria: [] },
      initial_evaluation: { percentage: 100, status: 'COMPLETED', details: '', criteria: ['Evaluación'], pendingCriteria: [] },
      annual_plan: { percentage: 100, status: 'COMPLETED', details: '', criteria: ['Plan'], pendingCriteria: [] },
      training: { percentage: 40, status: 'IN_PROGRESS', details: '', criteria: [], pendingCriteria: ['Programa anual'] },
    };
    const service = new ImplementationWizardService(model as never, buildValidator(partial));

    const overview = await service.getOverview(new Types.ObjectId('a'.repeat(24)));

    assert.equal(overview.totalSteps, 14);
    assert.ok(overview.overallPercentage > 0 && overview.overallPercentage < 100);
    assert.ok(overview.steps.some((s) => s.status === 'COMPLETED'));
    assert.ok(overview.steps.some((s) => s.status === 'PENDING'));
  });

  it('CASO 3: empresa completa → porcentaje 100 e isImplementationComplete true', async () => {
    const { model } = makeWizardModel();
    const service = new ImplementationWizardService(
      model as never,
      buildValidator(allStepsResult(100, 'COMPLETED', ['ok'], [])),
    );

    const overview = await service.getOverview(new Types.ObjectId('a'.repeat(24)));

    assert.equal(overview.overallPercentage, 100);
    assert.equal(overview.completedSteps, 14);
    assert.equal(overview.isImplementationComplete, true);
  });

  it('CASO 4: un provider falla → el overview responde y el paso afectado queda 0/PENDING', async () => {
    const { model } = makeWizardModel();
    const failing = makeProvider('company_info', {
      percentage: 100,
      status: 'COMPLETED',
      details: 'ok',
    });
    failing.getValidation = async () => {
      throw new Error('provider explosion');
    };
    const service = new ImplementationWizardService(
      model as never,
      buildValidator(allStepsResult(100, 'COMPLETED'), { company_info: failing }),
    );

    const overview = await service.getOverview(new Types.ObjectId('a'.repeat(24)));

    assert.equal(overview.totalSteps, 14);
    // 13 pasos al 100% + company_info (peso 0.1) en 0 → 90% ponderado.
    assert.equal(overview.overallPercentage, 90);
    const companyInfo = overview.steps.find((s) => s.stepId === 'company_info');
    assert.equal(companyInfo?.percentage, 0);
    assert.equal(companyInfo?.status, 'PENDING');
    assert.equal(companyInfo?.completed, false);
    // El resto sigue calculando.
    assert.ok(overview.steps.filter((s) => s.completed).length >= 13);
  });
});

describe('ImplementationWizardService.getDashboardMetrics', () => {
  it('refresca con validación real y expone title/moduleRoute/pendingCriteria por paso', async () => {
    const { model } = makeWizardModel();
    const service = new ImplementationWizardService(
      model as never,
      buildValidator(allStepsResult(100, 'COMPLETED', ['ok'], [])),
    );

    const metrics = await service.getDashboardMetrics(new Types.ObjectId('a'.repeat(24)));

    assert.equal(metrics.completionPercentage, 100);
    assert.equal(metrics.completedSteps, 14);
    assert.ok('title' in metrics.steps[0]);
    assert.ok('moduleRoute' in metrics.steps[0]);
    assert.ok('pendingCriteria' in metrics.steps[0]);
    assert.equal(metrics.steps[0].title, 'Información Empresa');
  });

  it('no re-ejecuta validación si la última ejecución es reciente (TTL)', async () => {
    const { model, getStored } = makeWizardModel();
    let validateCalls = 0;
    const baseValidator = buildValidator(allStepsResult(100, 'COMPLETED'));
    const countingValidator = new Proxy(baseValidator, {
      get(target, prop, receiver) {
        if (prop === 'validate') {
          return async (...args: Parameters<ImplementationValidatorService['validate']>) => {
            validateCalls += 1;
            return target.validate(...args);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as ImplementationValidatorService;
    const service = new ImplementationWizardService(model as never, countingValidator);

    const companyId = new Types.ObjectId('a'.repeat(24));
    const first = await service.getDashboardMetrics(companyId);
    assert.equal(validateCalls, 1);
    assert.equal(first.completionPercentage, 100);

    // La segunda lectura dentro del TTL no vuelve a correr la validación.
    const second = await service.getDashboardMetrics(companyId);
    assert.equal(validateCalls, 1);
    assert.equal(second.completionPercentage, 100);

    // Simular que el TTL expiró.
    const stored = getStored();
    assert.ok(stored, 'el wizard debe existir tras la primera lectura');
    stored.lastAutoValidationAt = new Date(Date.now() - AUTO_VALIDATION_TTL_MS - 1000).toISOString();
    await service.getDashboardMetrics(companyId);
    assert.equal(validateCalls, 2);
  });
});
