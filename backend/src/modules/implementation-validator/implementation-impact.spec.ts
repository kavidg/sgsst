import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { StepId } from '../implementation-wizard/schemas/implementation-wizard.schema';
import { calculateStepImpact } from './implementation-impact';
import { getImplementationWeights } from './implementation-weights';

describe('implementation-impact', () => {
  it('paso completo (100%) → sin impacto (null)', () => {
    assert.equal(calculateStepImpact('sst_policy', 100, getImplementationWeights()), null);
  });

  it('paso pendiente (0%) con peso 0.10 → "+10% implementación"', () => {
    const weights = getImplementationWeights();
    assert.equal(weights['sst_policy'], 0.1);
    assert.equal(calculateStepImpact('sst_policy', 0, weights), '+10% implementación');
  });

  it('cálculo correcto según peso: peso 0.05 → "+5% implementación"', () => {
    const weights = getImplementationWeights();
    assert.equal(weights['training'], 0.05);
    assert.equal(calculateStepImpact('training', 0, weights), '+5% implementación');
  });

  it('paso parcial: impacto proporcional al restante (peso 0.10 × 60%)', () => {
    const weights = getImplementationWeights();
    // sst_policy al 40% → 0.10 × (100 − 40) = 6
    assert.equal(calculateStepImpact('sst_policy', 40, weights), '+6% implementación');
  });

  it('paso con peso inexistente → sin impacto (null)', () => {
    const weights = getImplementationWeights();
    assert.equal(calculateStepImpact('unknown_step' as StepId, 0, weights), null);
  });

  it('peso 0 explícito → sin impacto (null)', () => {
    const weights = { ...getImplementationWeights(), company_info: 0 };
    assert.equal(calculateStepImpact('company_info', 50, weights), null);
  });

  it('porcentaje NaN o negativo → sin impacto (null)', () => {
    const weights = getImplementationWeights();
    assert.equal(calculateStepImpact('sst_policy', Number.NaN, weights), null);
    assert.equal(calculateStepImpact('sst_policy', -10, weights), null);
  });

  it('restante despreciable (redondea a 0) → sin impacto (null)', () => {
    const weights = getImplementationWeights();
    // training peso 0.05 × (100 − 98) = 0.1 → redondea a 0
    assert.equal(calculateStepImpact('training', 98, weights), null);
  });

  it('usa los pesos por defecto cuando no se inyectan', () => {
    assert.equal(calculateStepImpact('sst_policy', 0), '+10% implementación');
  });
});
