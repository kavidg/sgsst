import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computeIndicatorsScore,
  INDICATORS_SCORE_WEIGHTS,
  redistributeWeightedScore,
  type IndicatorDefinitionLike,
  type IndicatorMeasurementLike,
} from './indicators-scoring';

// ─── Factories ──────────────────────────────────────────────────────────────

function def(overrides: Partial<IndicatorDefinitionLike> = {}): IndicatorDefinitionLike {
  return {
    _id: 'd1',
    code: 'ind-01',
    name: 'Indicador 1',
    description: 'Descripción del indicador',
    category: 'PROCESS',
    subcategory: 'SAFETY',
    sourceModule: 'trainings',
    formulaType: 'AUTOMATIC',
    formula: { type: 'AVERAGE', source: { module: 'trainings', field: 'avgCompletion' } },
    unit: '%',
    targetOperator: 'GTE',
    targetValue: 80,
    frequency: 'MONTHLY',
    responsible: 'Responsable SST',
    responsibleArea: 'HSEQ',
    isActive: true,
    catalogCode: '6.1.1',
    ...overrides,
  };
}

function meas(overrides: Partial<IndicatorMeasurementLike> = {}): IndicatorMeasurementLike {
  return {
    _id: 'm1',
    indicatorId: 'd1',
    period: '2026-01',
    status: 'TARGET_MET',
    source: 'AUTOMATIC',
    evidence: '',
    notes: '',
    measuredAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

const weightsSum = Object.values(INDICATORS_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);

// ═══════════════════════════════════════════════════════════════════════════
// PESOS Y CONTRATO
// ═══════════════════════════════════════════════════════════════════════════

describe('indicators-scoring — pesos y contrato', () => {
  it('los 6 pesos suman exactamente 100', () => {
    assert.equal(weightsSum, 100);
  });

  it('cada dimensión expone ratio, numerator, denominator y weight', () => {
    const b = computeIndicatorsScore({
      definitions: [def()],
      measurements: [meas({ notes: 'análisis' })],
      periods: [],
    });
    for (const dim of Object.values(b.dimensions)) {
      assert.ok('ratio' in dim);
      assert.ok('numerator' in dim);
      assert.ok('denominator' in dim);
      assert.ok('weight' in dim);
    }
  });

  it('determinismo: misma entrada → mismo resultado', () => {
    const input = {
      definitions: [def(), def({ _id: 'd2', code: 'ind-02' })],
      measurements: [meas({ indicatorId: 'd1', notes: 'a' }), meas({ _id: 'm2', indicatorId: 'd2', status: 'TARGET_NOT_MET' as const })],
      periods: [],
    };
    assert.deepEqual(computeIndicatorsScore(input), computeIndicatorsScore(input));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CASO 1: sin indicadores → NO_DATA
// ═══════════════════════════════════════════════════════════════════════════

describe('indicators-scoring — NO_DATA', () => {
  it('1. sin indicadores → NO_DATA (no-active-indicators), 0%', () => {
    const b = computeIndicatorsScore({ definitions: [], measurements: [], periods: [] });
    assert.equal(b.noData, true);
    assert.equal(b.noDataReason, 'no-active-indicators');
    assert.equal(b.percentage, 0);
    assert.equal(b.findings[0].id, 'indicators-no-active');
  });

  it('11. todos los indicadores inactivos → NO_DATA (no-active)', () => {
    const b = computeIndicatorsScore({
      definitions: [def({ isActive: false }), def({ _id: 'd2', code: 'ind-02', isActive: false })],
      measurements: [meas({ indicatorId: 'd1', notes: 'x' })],
      periods: [],
    });
    assert.equal(b.noData, true);
    assert.equal(b.noDataReason, 'no-active-indicators');
    assert.equal(b.counters.inactiveIndicators, 2);
  });

  it('2. activos sin ninguna medición válida → NO_DATA (no-valid-measurements)', () => {
    const b = computeIndicatorsScore({
      definitions: [def(), def({ _id: 'd2', code: 'ind-02' })],
      measurements: [meas({ indicatorId: 'd1', status: 'NO_DATA' })],
      periods: [],
    });
    assert.equal(b.noData, true);
    assert.equal(b.noDataReason, 'no-valid-measurements');
    assert.equal(b.percentage, 0);
    assert.equal(b.findings[0].id, 'indicators-no-data');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DIMENSIONES
// ═══════════════════════════════════════════════════════════════════════════

describe('indicators-scoring — dimensiones', () => {
  it('2. escenario completo → 100% (todas las dimensiones en 1)', () => {
    const b = computeIndicatorsScore({
      definitions: [def(), def({ _id: 'd2', code: 'ind-02' })],
      measurements: [
        meas({ indicatorId: 'd1', notes: 'a' }),
        meas({ _id: 'm2', indicatorId: 'd2', notes: 'b' }),
      ],
      periods: [{ period: '2026-01', status: 'CLOSED', closedAt: '2026-02-01T00:00:00.000Z' }],
    });
    assert.equal(b.noData, false);
    assert.equal(b.percentage, 100);
    assert.equal(b.counters.completeDefinitions, 2);
    assert.equal(b.counters.targetMet, 2);
  });

  it('3. ficha incompleta penaliza D2 (no premia documentos vacíos)', () => {
    const b = computeIndicatorsScore({
      definitions: [
        def(),
        def({ _id: 'd2', code: 'ind-02', description: '', targetOperator: undefined }),
      ],
      measurements: [
        meas({ indicatorId: 'd1', notes: 'a' }),
        meas({ _id: 'm2', indicatorId: 'd2', notes: 'b' }),
      ],
      periods: [],
    });
    assert.equal(b.dimensions.definitionQuality.ratio, 0.5);
    assert.ok(b.percentage < 100);
    assert.ok(b.findings.some((f) => f.id === 'indicators-definition-incomplete'));
  });

  it('4. indicador activo sin medición penaliza D3', () => {
    const b = computeIndicatorsScore({
      definitions: [def(), def({ _id: 'd2', code: 'ind-02' })],
      measurements: [meas({ indicatorId: 'd1', notes: 'a' })],
      periods: [],
    });
    assert.equal(b.dimensions.measurement.ratio, 0.5);
    assert.equal(b.counters.indicatorsWithoutMeasurement, 1);
    assert.ok(b.findings.some((f) => f.id === 'indicators-without-measurement'));
  });

  it('5/6. TARGET_MET y TARGET_NOT_MET alimentan D4 con estados del módulo (no recalcula)', () => {
    const b = computeIndicatorsScore({
      definitions: [def(), def({ _id: 'd2', code: 'ind-02' })],
      measurements: [
        meas({ indicatorId: 'd1', notes: 'a' }),
        meas({ _id: 'm2', indicatorId: 'd2', status: 'TARGET_NOT_MET' }),
      ],
      periods: [],
    });
    assert.equal(b.dimensions.targetCompliance.ratio, 0.5);
    assert.equal(b.counters.targetMet, 1);
    assert.equal(b.counters.targetNotMet, 1);
    assert.ok(b.findings.some((f) => f.id === 'indicators-target-not-met'));
  });

  it('CALCULATED (sin meta definida) es medición válida pero no participa en D4', () => {
    const b = computeIndicatorsScore({
      definitions: [def({ targetOperator: undefined, targetValue: undefined })],
      measurements: [meas({ indicatorId: 'd1', status: 'CALCULATED', notes: 'x' })],
      periods: [],
    });
    assert.equal(b.noData, false);
    assert.equal(b.dimensions.targetCompliance.ratio, null);
    assert.equal(b.counters.calculatedWithoutTarget, 1);
    // D4 null → redistribuida. Además, ficha sin meta = incompleta (D2 = 0):
    // activos: 10+20+25+15 = 70; raw = 10·1 + 20·0 + 25·1 + 15·1 = 50.
    assert.ok(Math.abs(b.percentage - (50 / 70) * 100) < 1e-9);
  });

  it('7. notas/evidencia alimentan D5 (solo trazabilidad estructural)', () => {
    const b = computeIndicatorsScore({
      definitions: [def(), def({ _id: 'd2', code: 'ind-02' })],
      measurements: [
        meas({ indicatorId: 'd1', notes: 'análisis' }),
        meas({ _id: 'm2', indicatorId: 'd2', evidence: 'url://acta' }),
      ],
      periods: [],
    });
    assert.equal(b.dimensions.analysisEvidence.ratio, 1);
    assert.equal(b.counters.measurementsWithNotes, 1);
    assert.equal(b.counters.measurementsWithEvidence, 1);
  });

  it('7b. mediciones válidas sin notes ni evidence → D5 en 0 y finding', () => {
    const b = computeIndicatorsScore({
      definitions: [def()],
      measurements: [meas({ indicatorId: 'd1' })],
      periods: [],
    });
    assert.equal(b.dimensions.analysisEvidence.ratio, 0);
    assert.ok(b.findings.some((f) => f.id === 'indicators-analysis-missing'));
  });

  it('8. dos períodos medidos → D6 evaluable en 1; un período → null (redistribuida)', () => {
    const multi = computeIndicatorsScore({
      definitions: [def()],
      measurements: [
        meas({ indicatorId: 'd1', period: '2025-12', notes: 'a' }),
        meas({ _id: 'm2', indicatorId: 'd1', period: '2026-01', notes: 'b' }),
      ],
      periods: [],
    });
    assert.equal(multi.dimensions.history.ratio, 1);
    assert.equal(multi.counters.distinctMeasuredPeriods, 2);

    const single = computeIndicatorsScore({
      definitions: [def()],
      measurements: [meas({ indicatorId: 'd1', notes: 'a' })],
      periods: [],
    });
    assert.equal(single.dimensions.history.ratio, null);
    // D6 null → redistribuida; el resto en meta → 100% (peso activo 90).
    assert.equal(single.percentage, 100);
  });

  it('12. múltiples períodos: la medición MÁS RECIENTE decide (period lexicográfico + measuredAt)', () => {
    const b = computeIndicatorsScore({
      definitions: [def()],
      measurements: [
        meas({ _id: 'm1', indicatorId: 'd1', period: '2025-12', status: 'TARGET_NOT_MET', notes: 'viejo' }),
        meas({ _id: 'm2', indicatorId: 'd1', period: '2026-01', status: 'TARGET_MET', notes: 'reciente' }),
      ],
      periods: [],
    });
    assert.equal(b.counters.targetMet, 1);
    assert.equal(b.counters.targetNotMet, 0);
    assert.equal(b.dimensions.targetCompliance.ratio, 1);
  });

  it('12b. mismo período: measuredAt más reciente decide (empate de período)', () => {
    const b = computeIndicatorsScore({
      definitions: [def()],
      measurements: [
        meas({ _id: 'm1', indicatorId: 'd1', measuredAt: '2026-01-15T00:00:00.000Z', status: 'TARGET_NOT_MET' }),
        meas({ _id: 'm2', indicatorId: 'd1', measuredAt: '2026-01-31T00:00:00.000Z', status: 'TARGET_MET', notes: 'x' }),
      ],
      periods: [],
    });
    assert.equal(b.counters.targetMet, 1);
    assert.equal(b.counters.targetNotMet, 0);
  });

  it('13. duplicados indicatorId+period se cuentan como incidencia sin duplicar puntos', () => {
    const b = computeIndicatorsScore({
      definitions: [def()],
      measurements: [
        meas({ _id: 'm1', indicatorId: 'd1', notes: 'a' }),
        meas({ _id: 'm2', indicatorId: 'd1' }),
        meas({ _id: 'm3', indicatorId: 'd1' }),
      ],
      periods: [],
    });
    assert.equal(b.counters.duplicateMeasurementKeys, 2);
    assert.equal(b.counters.targetMet, 1); // una sola decisión por indicador
    assert.ok(b.findings.some((f) => f.id === 'indicators-duplicate-measurements'));
  });

  it('14. valores inválidos (NaN, null, arrays) no rompen ni distorsionan el score', () => {
    const b = computeIndicatorsScore({
      definitions: [
        { _id: 'dx' }, // sin code/name → no activa
        def({ _id: 'd2', code: 'ind-02', targetValue: Number.NaN }),
        def({ _id: 'd3', code: 'ind-03', formula: 'no-object' as unknown as Record<string, unknown> }),
      ],
      measurements: [
        meas({ indicatorId: 'd2', status: 'TARGET_MET', notes: 'x' }),
        meas({ _id: 'm2', indicatorId: 'd3', status: 'TARGET_MET', evidence: 'e' }),
        { _id: 'mz', indicatorId: null as unknown as string, status: 'TARGET_MET' },
      ],
      periods: [{ status: null as unknown as string }],
    });
    assert.ok(Number.isFinite(b.percentage));
    assert.ok(b.percentage >= 0 && b.percentage <= 100);
    assert.equal(b.counters.activeIndicators, 2);
  });

  it('15. fechas inválidas en measuredAt no rompen el desempate (fallback estable)', () => {
    const b = computeIndicatorsScore({
      definitions: [def()],
      measurements: [
        meas({ _id: 'm1', indicatorId: 'd1', measuredAt: 'not-a-date', status: 'TARGET_MET', notes: 'a' }),
        meas({ _id: 'm2', indicatorId: 'd1', measuredAt: undefined, status: 'TARGET_MET', notes: 'b' }),
      ],
      periods: [],
    });
    assert.equal(b.counters.targetMet, 1);
    assert.ok(Number.isFinite(b.percentage));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REDISTRIBUCIÓN
// ═══════════════════════════════════════════════════════════════════════════

describe('indicators-scoring — redistribución', () => {
  it('9/10. dimensiones null salen del denominador (helper oficial)', () => {
    assert.equal(redistributeWeightedScore([{ ratio: 1, weight: 50 }, { ratio: null, weight: 50 }]), 100);
    assert.equal(redistributeWeightedScore([{ ratio: 0.5, weight: 50 }, { ratio: null, weight: 50 }]), 50);
    assert.equal(redistributeWeightedScore([{ ratio: null, weight: 100 }]), 0);
  });

  it('D2/D3 null (0 activos) no participa; el NO_DATA global manda', () => {
    const b = computeIndicatorsScore({
      definitions: [def({ isActive: false })],
      measurements: [],
      periods: [],
    });
    assert.equal(b.noData, true);
    assert.equal(b.dimensions.definitionQuality.ratio, null);
    assert.equal(b.dimensions.measurement.ratio, null);
  });
});
