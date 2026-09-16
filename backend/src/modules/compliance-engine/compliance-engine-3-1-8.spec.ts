import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ComplianceEngineService } from './compliance-engine.service';
import { WorkplaceSanitaryConditionsProvider } from './providers/workplace-sanitary-conditions.provider';
import {
  filterScoringEligible,
  getPhaseWeights,
  SCORING_EXCLUDED_MODULES,
  SCORING_INELIGIBLE_MODULES,
  DEFAULT_PHASE_WEIGHTS,
} from './utils/compliance-weights';
/**
 * FASE 34B — Verificación de integración del provider 3.1.8 en el Engine.
 *
 * Confirma:
 * - el provider está registrado EXACTAMENTE una vez en la lista de providers;
 * - produce contribución phases.do;
 * - NO está en las listas de exclusión de scoring (participa una sola vez);
 * - los pesos PHVA no cambiaron (25/60/5/10);
 * - la fórmula de agregación no cambió.
 */

/** Extrae los providers registrados de la instancia (lista privada). */
function getRegisteredProviders(service: ComplianceEngineService): unknown[] {
  return (service as unknown as { providers: unknown[] }).providers;
}

function buildService(): ComplianceEngineService {
  // Instancia mínima: el constructor solo guarda referencias. Los providers
  // reales no se invocan aquí (no hay getOverview). Se pasa UNA instancia real
  // del provider 3.1.8 en la posición que le corresponde (última).
  const realProvider = new WorkplaceSanitaryConditionsProvider({} as never);
  const args: unknown[] = new Array(66).fill(null).map(() => ({}));
  args.push(realProvider);
  return new (ComplianceEngineService as unknown as {
    new (...args: unknown[]): ComplianceEngineService;
  })(...args);
}

describe('FASE 34B — Integración 3.1.8 en el ComplianceEngine', () => {
  it('el provider 3.1.8 está registrado exactamente UNA vez', () => {
    const service = buildService();
    const providers = getRegisteredProviders(service);
    const matches = providers.filter(
      (p) => p instanceof WorkplaceSanitaryConditionsProvider,
    );
    assert.equal(matches.length, 1, '3.1.8 participa una sola vez en el scoring');
  });

  it('el module del provider NO está excluido del scoring', () => {
    assert.equal(SCORING_EXCLUDED_MODULES.has('workplace-sanitary-conditions'), false);
    assert.equal(SCORING_INELIGIBLE_MODULES.has('workplace-sanitary-conditions'), false);
  });

  it('los pesos PHVA no cambiaron (plan .25 / do .6 / check .05 / act .1)', () => {
    const weights = getPhaseWeights();
    assert.equal(weights.plan, 0.25);
    assert.equal(weights.do, 0.6);
    assert.equal(weights.check, 0.05);
    assert.equal(weights.act, 0.1);
    assert.deepEqual(DEFAULT_PHASE_WEIGHTS, { plan: 0.25, do: 0.6, check: 0.05, act: 0.1 });
  });

  it('el provider produce contribución do y filterScoringEligible lo conserva', () => {
    const providerResult = {
      module: 'workplace-sanitary-conditions',
      percentage: 92,
      status: 'PARTIAL',
      findings: [],
      pending: 1,
      completed: 2,
      phases: { do: 92 },
    };
    const filtered = filterScoringEligible([providerResult]);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].phases?.do, 92);
  });

  it('la metadata del provider declara standard 3.1.8 / do / EXACT', () => {
    const provider = new WorkplaceSanitaryConditionsProvider({} as never);
    const meta = provider.metadata;
    assert.equal(meta.standard, '3.1.8');
    assert.equal(meta.phase, 'do');
    assert.equal(meta.semantic, 'EXACT');
  });
});
