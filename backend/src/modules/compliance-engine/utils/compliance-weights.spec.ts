import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertValidPhaseWeights,
  DEFAULT_PHASE_WEIGHTS,
  getPhaseWeights,
} from './compliance-weights';
import { calculateWeightedCompliance } from './compliance-calculator';
import { PhaseCompliance } from '../interfaces/compliance-engine.interface';
import { CATALOG_60 } from '../../standard-catalog/constants/catalog-60';
import { computeEffectiveWeights } from '../../standard-catalog/utils/effective-weights';

function phase(plan: number, do_: number, check: number, act: number): PhaseCompliance {
  return { plan, do: do_, check, act };
}

describe('AUDIT-2 — Pesos oficiales PHVA (PHVA-WEIGHTS)', () => {
  it('PHVA-WEIGHTS-01 — los pesos oficiales son PLANEAR 0.25, HACER 0.60, VERIFICAR 0.05, ACTUAR 0.10', () => {
    assert.equal(DEFAULT_PHASE_WEIGHTS.plan, 0.25);
    assert.equal(DEFAULT_PHASE_WEIGHTS.do, 0.6);
    assert.equal(DEFAULT_PHASE_WEIGHTS.check, 0.05);
    assert.equal(DEFAULT_PHASE_WEIGHTS.act, 0.1);
  });

  it('PHVA-WEIGHTS-02 — la suma de los pesos oficiales es exactamente 1', () => {
    const sum = Object.values(DEFAULT_PHASE_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.equal(sum, 1);
  });

  it('PHVA-WEIGHTS-03 — pesos inválidos son rechazados (negativos y suma != 1)', () => {
    assert.throws(
      () => assertValidPhaseWeights({ plan: -0.25, do: 0.6, check: 0.05, act: 0.1 }),
      /negative/,
    );
    assert.throws(
      () => assertValidPhaseWeights({ plan: 0.5, do: 0.6, check: 0.05, act: 0.1 }),
      /expected 1/,
    );
    // NaN tampoco es aceptable.
    assert.throws(
      () => assertValidPhaseWeights({ plan: NaN, do: 0.6, check: 0.05, act: 0.1 }),
      /negative or not a number/,
    );
    // getPhaseWeights() valida la configuración oficial antes de devolverla.
    assert.doesNotThrow(() => getPhaseWeights());
  });

  it('PHVA-WEIGHTS-04 — cálculo ponderado con los pesos oficiales (motor real calculateWeightedCompliance)', () => {
    // Caso A: 100/100/100/100 → 100.
    assert.equal(
      calculateWeightedCompliance(phase(100, 100, 100, 100), getPhaseWeights()),
      100,
    );
    // Caso diferencial: Planear 100, Hacer 50, Verificar 0, Actuar 0 → 55.
    assert.equal(
      calculateWeightedCompliance(phase(100, 50, 0, 0), getPhaseWeights()),
      55,
    );
    // Caso C: solo Hacer 100 → 60.
    assert.equal(
      calculateWeightedCompliance(phase(0, 100, 0, 0), getPhaseWeights()),
      60,
    );
    // Caso D: solo Verificar 100 → 5.
    assert.equal(
      calculateWeightedCompliance(phase(0, 0, 100, 0), getPhaseWeights()),
      5,
    );
    // Caso E: solo Actuar 100 → 10.
    assert.equal(
      calculateWeightedCompliance(phase(0, 0, 0, 100), getPhaseWeights()),
      10,
    );
  });

  it('PHVA-WEIGHTS-05 — los pesos normativos de los estándares 0312 NO cambiaron', () => {
    const normativeSum = CATALOG_60.reduce(
      (sum, standard) => sum + (standard.normativeWeight ?? 0),
      0,
    );
    // Baseline certificado del catálogo: 50 estándares IMPLEMENTED suman 100
    // + 10 PLANNED suman 110 total (documentado en catalog-60.ts).
    assert.equal(normativeSum, 110);
    // Un estándar representativo conserva su peso normativo.
    const responsible = CATALOG_60.find((s) => s.code === '1.1.1');
    assert.equal(responsible?.normativeWeight, 0.5);
    // Los niveles aplicables del estándar se conservan.
    assert.deepEqual(responsible?.applicableLevels, ['7', '21', '60']);
  });

  it('PHVA-WEIGHTS-06 — los niveles 7/21/60 y los pesos efectivos de estándares siguen funcionando', () => {
    // computeEffectiveWeights normaliza SOLO los estándares activos
    // (IMPLEMENTED/PARTIAL) para que la escala efectiva sume exactamente 100.
    const effective = computeEffectiveWeights(CATALOG_60);
    let sum = 0;
    for (const weight of effective.values()) sum += weight;
    assert.ok(Math.abs(sum - 100) < 1e-6, `escala efectiva debe sumar 100 (actual: ${sum})`);
    // Los niveles aplicables siguen presentes en el catálogo (7/21/60).
    for (const standard of CATALOG_60) {
      assert.ok(standard.applicableLevels.length > 0, `${standard.code} debe declarar niveles`);
    }
  });

  it('PHVA-WEIGHTS-07 — PhvaAnalysisService y Compliance Engine usan la misma definición (una única fuente)', () => {
    // PhvaAnalysisService consume overview.overallCompliance del Compliance
    // Engine, que usa getPhaseWeights(): no existe una segunda copia de pesos.
    // Verificación estructural: no hay literales del conjunto antiguo en phva/.
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const phvaService = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'src', 'modules', 'phva', 'phva-analysis.service.ts'),
      'utf8',
    );
    assert.ok(!phvaService.includes('0.35') && !phvaService.includes('0.15'));
    // El Compliance Engine consume la fuente única (getPhaseWeights) y no
    // tiene literales propios del conjunto antiguo.
    const engineService = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'src',
        'modules',
        'compliance-engine',
        'compliance-engine.service.ts',
      ),
      'utf8',
    );
    assert.ok(engineService.includes('getPhaseWeights'));
    assert.ok(!engineService.includes('0.35') && !engineService.includes('0.15'));
    // La fuente única es compliance-weights.ts.
    const weightsSource = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'src',
        'modules',
        'compliance-engine',
        'utils',
        'compliance-weights.ts',
      ),
      'utf8',
    );
    assert.ok(weightsSource.includes('plan: 0.25') && weightsSource.includes('do: 0.6'));
  });

  it('PHVA-WEIGHTS-08 — el conjunto antiguo 0.35 / check 0.25 / 0.15 ya no existe en la fuente de pesos', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const source = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'src',
        'modules',
        'compliance-engine',
        'utils',
        'compliance-weights.ts',
      ),
      'utf8',
    );
    assert.ok(!source.includes('do: 0.35'));
    assert.ok(!source.includes('check: 0.25'));
    assert.ok(!source.includes('act: 0.15'));
    // 0.15 puede seguir existiendo legítimamente en DEFAULT_MODULE_WEIGHTS
    // (trainings: 0.15) — los pesos de fase y los de módulo son responsabilidades
    // distintas. Verificamos el conjunto antiguo solo a nivel de fase:
    assert.ok(!source.includes('plan: 0.25, do: 0.35'));
  });
});
