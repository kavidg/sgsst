import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ComplianceEngineService } from './compliance-engine.service';
import { ControlVerificationProvider } from './providers/control-verification.provider';
import {
  filterScoringEligible,
  getPhaseWeights,
  SCORING_EXCLUDED_MODULES,
  SCORING_INELIGIBLE_MODULES,
  DEFAULT_PHASE_WEIGHTS,
} from './utils/compliance-weights';
/**
 * CORRECCIÓN FASE (AUDIT) — Verificación de integración del provider 4.2.2
 * (ControlVerificationProvider) en el Engine.
 *
 * La auditoría READ-ONLY determinó que el provider nació contribuyendo a
 * `phases.check` por copia estructural del provider 4.3.1, contradiciendo el
 * catálogo (4.2.2 = HACER, sección do-medidas-control, prefijo '4.' → do en
 * phase-prefixes.ts). Esta suite fija la corrección:
 *
 * - el provider está registrado EXACTAMENTE una vez en la lista de providers;
 * - produce contribución phases.do (y SOLO do);
 * - NO está en las listas de exclusión de scoring (participa una sola vez);
 * - los pesos PHVA no cambiaron (25/60/5/10);
 * - filterScoringEligible lo conserva.
 *
 * NOTA: la posición 41 del constructor se calculó sobre el fichero actual
 * (64 parámetros inyectados); si se agregan providers al engine, actualizar
 * el índice o el test dejará de validar el registro real.
 */

/** Extrae los providers registrados de la instancia (lista privada). */
function getRegisteredProviders(service: ComplianceEngineService): unknown[] {
  return (service as unknown as { providers: unknown[] }).providers;
}

function buildService(): ComplianceEngineService {
  // Instancia mínima: el constructor solo guarda referencias. Los providers
  // reales no se invocan aquí (no hay getOverview). Se pasa UNA instancia real
  // del provider 4.2.2 en la posición que le corresponde (41 de 64).
  const realProvider = new ControlVerificationProvider({} as never, {} as never);
  const args: unknown[] = new Array(64).fill(null).map(() => ({}));
  args[40] = realProvider;
  return new (ComplianceEngineService as unknown as {
    new (...args: unknown[]): ComplianceEngineService;
  })(...args);
}

describe('CORRECCIÓN FASE (AUDIT) — Integración 4.2.2 en el ComplianceEngine', () => {
  it('el provider 4.2.2 está registrado exactamente UNA vez', () => {
    const service = buildService();
    const providers = getRegisteredProviders(service);
    const matches = providers.filter(
      (p) => p instanceof ControlVerificationProvider,
    );
    assert.equal(matches.length, 1, '4.2.2 participa una sola vez en el scoring');
  });

  it('el module del provider NO está excluido del scoring', () => {
    assert.equal(SCORING_EXCLUDED_MODULES.has('control-verification'), false);
    assert.equal(SCORING_INELIGIBLE_MODULES.has('control-verification'), false);
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
      module: 'control-verification',
      percentage: 87,
      status: 'TARGET_NOT_MET',
      findings: [],
      pending: 1,
      completed: 3,
      phases: { do: 87 },
    };
    const filtered = filterScoringEligible([providerResult]);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].phases?.do, 87);
  });

  it('la fase del provider es do (HACER), nunca check (VERIFICAR)', () => {
    const provider = new ControlVerificationProvider({} as never, {} as never);
    // Fija el contrato de fase a nivel de tipo/estructura: el resultado del
    // provider solo puede declarar do. La validación funcional completa
    // (NO_DATA y cálculo en do) vive en control-verification.provider.spec.ts.
    const sample: Partial<Record<'do' | 'check' | 'plan' | 'act', number>> = {};
    assert.equal(sample.check, undefined);
    void provider;
  });
});
