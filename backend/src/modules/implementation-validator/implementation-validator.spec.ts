import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { StepId } from '../implementation-wizard/schemas/implementation-wizard.schema';
import {
  calculateWeightedImplementation,
  deriveStepStatus,
} from './implementation-calculator';
import { getImplementationWeights } from './implementation-weights';
import { ImplementationValidatorService } from './implementation-validator.service';
import {
  ProviderValidationResult,
  WizardValidationProvider,
} from './interfaces/wizard-validation-provider.interface';

const ALL_STEPS: StepId[] = [
  'company_info', 'users_roles', 'responsible_sst', 'course_50_hours',
  'sst_policy', 'sst_objectives', 'initial_evaluation', 'annual_plan',
  'copasst', 'copasst_training', 'convivencia_committee', 'training',
  'communication', 'legal_matrix', 'document_management',
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

function buildService(
  results: Partial<Record<StepId, Omit<ProviderValidationResult, 'stepId'>>>,
  overrides?: Partial<Record<StepId, WizardValidationProvider>>,
): ImplementationValidatorService {
  const providers: WizardValidationProvider[] = ALL_STEPS.map((stepId) =>
    overrides?.[stepId] ??
    makeProvider(stepId, results[stepId] ?? { percentage: 0, status: 'PENDING', details: 'sin datos' }),
  );
  return new ImplementationValidatorService(
    ...(providers as unknown as ConstructorParameters<typeof ImplementationValidatorService>),
  );
}

describe('implementation-calculator', () => {
  it('calcula el porcentaje ponderado con subconjunto de pasos (3 de 15)', () => {
    const weights = getImplementationWeights();
    const results: ProviderValidationResult[] = [
      { stepId: 'company_info', percentage: 100, status: 'COMPLETED', details: '' },
      { stepId: 'initial_evaluation', percentage: 100, status: 'COMPLETED', details: '' },
      { stepId: 'annual_plan', percentage: 100, status: 'COMPLETED', details: '' },
    ];
    // company_info 0.1 + initial_evaluation 0.1 + annual_plan 0.1 = 0.3
    // → 100% * 0.3 / 0.3 = 100
    assert.equal(calculateWeightedImplementation(results, weights), 100);
  });

  it('normaliza cuando faltan pesos definidos (no distorsiona)', () => {
    const weights = getImplementationWeights();
    const results: ProviderValidationResult[] = [
      { stepId: 'company_info', percentage: 80, status: 'COMPLETED', details: '' },
    ];
    // company_info weight 0.1 → 80 * 0.1 / 0.1 = 80
    assert.equal(calculateWeightedImplementation(results, weights), 80);
  });

  it('retorna 0 sin resultados', () => {
    assert.equal(calculateWeightedImplementation([], getImplementationWeights()), 0);
  });

  it('todos los pasos completos dan 100', () => {
    const results: ProviderValidationResult[] = ALL_STEPS.map((stepId) => ({
      stepId,
      percentage: 100,
      status: 'COMPLETED',
      details: '',
    }));
    assert.equal(calculateWeightedImplementation(results, getImplementationWeights()), 100);
  });
});

describe('deriveStepStatus', () => {
  it('mapea umbrales correctamente', () => {
    assert.equal(deriveStepStatus(100), 'COMPLETED');
    assert.equal(deriveStepStatus(80), 'COMPLETED');
    assert.equal(deriveStepStatus(79), 'IN_PROGRESS');
    assert.equal(deriveStepStatus(1), 'IN_PROGRESS');
    assert.equal(deriveStepStatus(0), 'PENDING');
  });
});

describe('ImplementationValidatorService', () => {
  it('empresa nueva sin datos: todos responden, porcentaje ~0, sin errores', async () => {
    const empty: Partial<Record<StepId, Omit<ProviderValidationResult, 'stepId'>>> =
      Object.fromEntries(
        ALL_STEPS.map((stepId) => [
          stepId,
          { percentage: 0, status: 'PENDING', details: 'sin datos' },
        ]),
      );

    const summary = await buildService(empty).validate('company-new');

    assert.equal(summary.results.length, 15);
    assert.equal(summary.weightedPercentage, 0);
    assert.equal(summary.level, 'NO_DATA');
    assert.ok(summary.results.every((result) => result.status === 'PENDING'));
  });

  it('empresa parcialmente configurada: pasos IN_PROGRESS y porcentaje intermedio', async () => {
    const partial: Partial<Record<StepId, Omit<ProviderValidationResult, 'stepId'>>> =
      Object.fromEntries(
        ALL_STEPS.map((stepId) => [
          stepId,
          { percentage: 50, status: 'IN_PROGRESS', details: 'parcial' },
        ]),
      );

    const summary = await buildService(partial).validate('company-partial');

    assert.equal(summary.results.length, 15);
    assert.ok(summary.weightedPercentage > 0 && summary.weightedPercentage < 100);
    assert.ok(summary.results.every((result) => result.status === 'IN_PROGRESS'));
  });

  it('empresa completa: mayoría COMPLETED y porcentaje cercano a 100', async () => {
    const complete: Partial<Record<StepId, Omit<ProviderValidationResult, 'stepId'>>> =
      Object.fromEntries(
        ALL_STEPS.map((stepId) => [
          stepId,
          { percentage: 100, status: 'COMPLETED', details: 'completo' },
        ]),
      );

    const summary = await buildService(complete).validate('company-complete');

    assert.equal(summary.results.length, 15);
    assert.equal(summary.weightedPercentage, 100);
    assert.equal(summary.level, 'EXCELLENT');
    assert.ok(summary.results.every((result) => result.status === 'COMPLETED'));
  });

  it('un provider que falla no rompe Promise.all (tolerancia)', async () => {
    const failingProvider = makeProvider('company_info', {
      percentage: 100,
      status: 'COMPLETED',
      details: 'ok',
    });
    failingProvider.getValidation = async () => {
      throw new Error('provider explosion');
    };

    const service = buildService({}, { company_info: failingProvider });
    const summary = await service.validate('company-failing');

    assert.equal(summary.results.length, 15);
    const companyInfo = summary.results.find((result) => result.stepId === 'company_info');
    assert.equal(companyInfo?.percentage, 0);
    assert.equal(companyInfo?.status, 'PENDING');
    // El resto sigue calculando y el weighted nunca lanza.
    assert.ok(summary.weightedPercentage >= 0);
  });
});
