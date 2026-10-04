import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { IndicatorsProvider } from './indicators.provider';
import {
  INDICATORS_FORMULA,
  INDICATORS_STANDARD_CODE,
  INDICATORS_SCORE_WEIGHTS,
} from './indicators-scoring';

// ─── Helpers ────────────────────────────────────────────────────────────────

const VALID_COMPANY_ID = 'aabbccddeeff001122334455';
const OTHER_COMPANY_ID = 'bbccddeeff00112233445511';

type SnapshotOverride = {
  definitions?: Array<Record<string, unknown>>;
  measurements?: Array<Record<string, unknown>>;
  periods?: Array<Record<string, unknown>>;
};

function def(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: overrides._id ?? 'd1',
    code: 'ind-01',
    name: 'Indicador 1',
    description: 'Descripción',
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

function meas(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: overrides._id ?? 'm1',
    indicatorId: overrides.indicatorId ?? 'd1',
    period: overrides.period ?? '2026-01',
    status: overrides.status ?? 'TARGET_MET',
    source: overrides.source ?? 'AUTOMATIC',
    evidence: overrides.evidence ?? '',
    notes: overrides.notes ?? '',
    measuredAt: overrides.measuredAt ?? '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildProvider(overrides: SnapshotOverride = {}): {
  provider: IndicatorsProvider;
  receivedCompanyId: { value: unknown };
} {
  const receivedCompanyId: { value: unknown } = { value: undefined };
  const indicatorsService = {
    getComplianceSnapshot: async (companyId: unknown) => {
      receivedCompanyId.value = companyId;
      return {
        definitions: overrides.definitions ?? [],
        measurements: overrides.measurements ?? [],
        periods: overrides.periods ?? [],
      };
    },
  };
  return { provider: new IndicatorsProvider(indicatorsService as never), receivedCompanyId };
}

// Complete → medición válida con meta y análisis.
function completeScenario(count: number): SnapshotOverride {
  const definitions = Array.from({ length: count }, (_, i) => def({ _id: `d${i + 1}`, code: `ind-${String(i + 1).padStart(2, '0')}` }));
  const measurements = definitions.map((d, i) =>
    meas({ _id: `m${i + 1}`, indicatorId: d._id as string, period: '2026-01', status: 'TARGET_MET', notes: `análisis ${i + 1}` }),
  );
  return { definitions, measurements, periods: [{ period: '2026-01', status: 'CLOSED', closedAt: '2026-02-01T00:00:00.000Z' }] };
}

// ═══════════════════════════════════════════════════════════════════════════
// IDENTIDAD Y METADATA
// ═══════════════════════════════════════════════════════════════════════════

describe('IndicatorsProvider (6.1.1) — identidad y metadata', () => {
  it('module indicators + standardCode 6.1.1 + formula dimensions:v1 + semantic EXACT', async () => {
    const { provider } = buildProvider(completeScenario(2));
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.equal(result.module, 'indicators');
    assert.equal((result.metadata as Record<string, unknown>).standardCode, INDICATORS_STANDARD_CODE);
    assert.equal((result.metadata as Record<string, unknown>).formula, INDICATORS_FORMULA);
    assert.equal((result.metadata as Record<string, unknown>).semantic, 'EXACT');
    assert.deepEqual(
      (result.metadata as Record<string, unknown>).weights,
      { ...INDICATORS_SCORE_WEIGHTS },
    );
  });

  it('metadata expone las 6 dimensiones con ratio/numerator/denominator/weight', async () => {
    const { provider } = buildProvider(completeScenario(3));
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    const dims = (result.metadata as Record<string, unknown>).dimensions as Record<string, Record<string, unknown>>;

    for (const key of ['existence', 'definitionQuality', 'measurement', 'targetCompliance', 'analysisEvidence', 'history']) {
      assert.ok(dims[key], `dimensión ${key} presente`);
      // ratio numérico o null (no evaluable — nunca 0 artificial).
      assert.ok(dims[key].ratio === null || typeof dims[key].ratio === 'number');
      assert.equal(typeof dims[key].weight, 'number');
      assert.ok('numerator' in dims[key]);
      assert.ok('denominator' in dims[key]);
    }
  });

  it('metadata expone counters reales y el período evaluado', async () => {
    const { provider } = buildProvider(completeScenario(2));
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    const metadata = result.metadata as Record<string, unknown>;
    const counters = metadata.counters as Record<string, number>;

    assert.equal(metadata.evaluatedPeriod, '2026-01');
    assert.equal(counters.activeIndicators, 2);
    assert.equal(counters.indicatorsWithMeasurement, 2);
    assert.equal(counters.targetMet, 2);
    assert.equal(counters.measurementsWithNotes, 2);
    assert.equal(counters.closedPeriods, 1);
    assert.equal(counters.duplicateMeasurementKeys, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NO_DATA
// ═══════════════════════════════════════════════════════════════════════════

describe('IndicatorsProvider — NO_DATA', () => {
  it('Caso A: sin indicadores → NO_DATA, 0%, finding indicators-no-active', async () => {
    const { provider } = buildProvider({});
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].id, 'indicators-no-active');
    assert.equal((result.metadata as Record<string, unknown>).noDataReason, 'no-active-indicators');
    assert.ok(result.phases);
    assert.equal(result.phases!.check, 0);
  });

  it('Caso B: activos pero sin medición válida → NO_DATA (no incumplimiento ordinario)', async () => {
    const { provider } = buildProvider({
      definitions: [def(), def({ _id: 'd2', code: 'ind-02' })],
      measurements: [meas({ indicatorId: 'd1', status: 'NO_DATA' })],
      periods: [],
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.findings[0].id, 'indicators-no-data');
    assert.equal((result.metadata as Record<string, unknown>).noDataReason, 'no-valid-measurements');
  });

  it('Caso B variante: solo medición de un indicador INACTIVO → NO_DATA', async () => {
    const { provider } = buildProvider({
      definitions: [def({ isActive: false })],
      measurements: [meas({ indicatorId: 'd1', status: 'TARGET_MET', notes: 'x' })],
      periods: [],
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.equal(result.status, 'NO_DATA');
    assert.equal((result.metadata as Record<string, unknown>).noDataReason, 'no-active-indicators');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SCORING / FASES / PENDING-COMPLETED
// ═══════════════════════════════════════════════════════════════════════════

describe('IndicatorsProvider — scoring y fases', () => {
  it('escenario completo con todos en meta → 100% y phases.check = 100', async () => {
    const { provider } = buildProvider(completeScenario(4));
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'TARGET_MET');
    assert.equal(result.phases!.check, 100);
    assert.equal(result.completed, 4);
    assert.equal(result.pending, 0);
  });

  it('solo contribuye a phases.check (no plan/do/act)', async () => {
    const { provider } = buildProvider(completeScenario(2));
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.equal(result.phases!.plan, undefined);
    assert.equal(result.phases!.do, undefined);
    assert.equal(result.phases!.act, undefined);
  });

  it('metas fuera de cumplimiento reducen el score y generan finding', async () => {
    const definitions = [def(), def({ _id: 'd2', code: 'ind-02' })];
    const measurements = [
      meas({ indicatorId: 'd1', status: 'TARGET_MET', notes: 'ok' }),
      meas({ indicatorId: 'd2', status: 'TARGET_NOT_MET' }),
    ];
    const { provider } = buildProvider({ definitions, measurements, periods: [] });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.ok(result.percentage < 100);
    assert.ok(result.findings.some((f) => f.id === 'indicators-target-not-met'));
    assert.equal(result.completed, 1);
    assert.equal(result.pending, 1);
  });

  it('ficha incompleta genera finding y penaliza la dimensión D2', async () => {
    const definitions = [
      def(),
      def({ _id: 'd2', code: 'ind-02', description: '', responsible: '', responsibleArea: '' }),
    ];
    const measurements = [
      meas({ indicatorId: 'd1', status: 'TARGET_MET', notes: 'ok' }),
      meas({ indicatorId: 'd2', status: 'TARGET_MET', notes: 'ok' }),
    ];
    const { provider } = buildProvider({ definitions, measurements, periods: [] });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.ok(result.percentage < 100);
    assert.ok(result.findings.some((f) => f.id === 'indicators-definition-incomplete'));
    const counters = (result.metadata as Record<string, unknown>).counters as Record<string, number>;
    assert.equal(counters.completeDefinitions, 1);
    assert.equal(counters.incompleteDefinitions, 1);
  });

  it('mediciones sin notes/evidence generan finding de análisis (trazabilidad estructural)', async () => {
    const { provider } = buildProvider({
      definitions: [def()],
      measurements: [meas({ indicatorId: 'd1', status: 'TARGET_MET' })],
      periods: [],
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.ok(result.findings.some((f) => f.id === 'indicators-analysis-missing'));
    const counters = (result.metadata as Record<string, unknown>).counters as Record<string, number>;
    assert.equal(counters.measurementsWithEvidence, 0);
    assert.equal(counters.measurementsWithNotes, 0);
  });

  it('historial multiperíodo sin períodos cerrados genera finding (D6 contexto)', async () => {
    const definitions = [def()];
    const measurements = [
      meas({ indicatorId: 'd1', period: '2025-12', status: 'TARGET_MET', notes: 'a' }),
      meas({ indicatorId: 'd1', period: '2026-01', status: 'TARGET_MET', notes: 'b' }),
    ];
    const { provider } = buildProvider({ definitions, measurements, periods: [] });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.ok(result.findings.some((f) => f.id === 'indicators-history-incomplete'));
    // D6: 2 períodos distintos → ratio 1 (no null); el resto en meta → 100%.
    assert.equal(result.status, 'TARGET_MET');
    assert.equal(result.percentage, 100);
    const history = ((result.metadata as Record<string, unknown>).dimensions as Record<string, Record<string, unknown>>).history;
    assert.equal(history.ratio, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TENANT ISOLATION / INTEGRIDAD / ROBUSTEZ
// ═══════════════════════════════════════════════════════════════════════════

describe('IndicatorsProvider — tenant isolation y robustez', () => {
  it('delega el companyId resuelto por el backend (nunca input de cliente)', async () => {
    const { provider, receivedCompanyId } = buildProvider(completeScenario(1));
    await provider.getCompliance(VALID_COMPANY_ID);

    assert.ok(receivedCompanyId.value !== undefined);
    assert.equal(String(receivedCompanyId.value), VALID_COMPANY_ID);
  });

  it('una sola coordinación de consultas (sin N+1): snapshot único por evaluación', async () => {
    let snapshotCalls = 0;
    const indicatorsService = {
      getComplianceSnapshot: async () => {
        snapshotCalls++;
        return { definitions: [], measurements: [], periods: [] };
      },
    };
    const provider = new IndicatorsProvider(indicatorsService as never);
    await provider.getCompliance(VALID_COMPANY_ID);

    assert.equal(snapshotCalls, 1);
  });

  it('no crea ni muta datos (NO ejecuta seed ni cálculos automáticos)', async () => {
    let unexpected = false;
    const indicatorsService = {
      getComplianceSnapshot: async () => ({ definitions: [], measurements: [], periods: [] }),
      ensureSeedIndicators: async () => { unexpected = true; return {}; },
      calculateAllAutomatic: async () => { unexpected = true; return {}; },
      createMeasurement: async () => { unexpected = true; return {}; },
    };
    const provider = new IndicatorsProvider(indicatorsService as never);
    await provider.getCompliance(VALID_COMPANY_ID);

    assert.equal(unexpected, false);
  });

  it('mediciones duplicadas (misma clave indicatorId+period) se reportan sin sumar puntos', async () => {
    const { provider } = buildProvider({
      definitions: [def()],
      measurements: [
        meas({ _id: 'm1', indicatorId: 'd1', status: 'TARGET_MET', notes: 'a' }),
        meas({ _id: 'm2', indicatorId: 'd1', status: 'TARGET_NOT_MET' }),
      ],
      periods: [],
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    const counters = (result.metadata as Record<string, unknown>).counters as Record<string, number>;
    assert.equal(counters.duplicateMeasurementKeys, 1);
    assert.ok(result.findings.some((f) => f.id === 'indicators-duplicate-measurements'));
    // La medición más reciente (measuredAt mayor) decide el estado: TARGET_MET.
    assert.equal(counters.targetMet, 1);
    assert.equal(counters.targetNotMet, 0);
  });

  it('datos corruptos no rompen el scoring (campos ausentes/no finitos)', async () => {
    const { provider } = buildProvider({
      definitions: [{ _id: 'd1' }, def({ _id: 'd2', code: 'ind-02', targetValue: Number.NaN })],
      measurements: [{ _id: 'm1', indicatorId: 'd2', status: 'TARGET_MET', notes: 'x' }],
      periods: [{ status: 'WEIRD' }],
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.ok(Number.isFinite(result.percentage));
    assert.ok(result.percentage >= 0 && result.percentage <= 100);
  });

  it('snapshots de otras empresas no participan: el provider solo consume lo devuelto por el servicio (tenant-scoped)', async () => {
    const { provider } = buildProvider(completeScenario(2));
    const result = await provider.getCompliance(OTHER_COMPANY_ID);
    const counters = (result.metadata as Record<string, unknown>).counters as Record<string, number>;

    // El score refleja EXACTAMENTE el snapshot del companyId solicitado.
    assert.equal(counters.activeIndicators, 2);
    assert.equal(String((result.metadata as Record<string, unknown>).evaluatedPeriod), '2026-01');
  });
});
