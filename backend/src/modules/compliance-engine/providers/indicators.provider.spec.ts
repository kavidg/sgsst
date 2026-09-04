import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { IndicatorMeasurementStatus } from '../../indicators/enums/indicator-measurement-status.enum';
import { IndicatorsProvider } from './indicators.provider';

// ─── Helpers ────────────────────────────────────────────────────────────────

const VALID_COMPANY_ID = 'aabbccddeeff001122334455';

function buildProvider(overrides?: {
  totalActive?: number;
  withMeasurements?: number;
  withoutMeasurements?: number;
  targetMet?: number;
  targetNotMet?: number;
  noData?: number;
}): IndicatorsProvider {
  const summary = {
    totalActive: overrides?.totalActive ?? 0,
    withMeasurements: overrides?.withMeasurements ?? 0,
    withoutMeasurements: overrides?.withoutMeasurements ?? 0,
    targetMet: overrides?.targetMet ?? 0,
    targetNotMet: overrides?.targetNotMet ?? 0,
    noData: overrides?.noData ?? 0,
  };

  const indicatorsService = {
    getDashboardSummary: async () => summary,
    findAllDefinitions: async () => [],
  };

  return new IndicatorsProvider(indicatorsService as never);
}

// ═══════════════════════════════════════════════════════════════════════════
// INDICATOR-PROVIDER-1: Sin indicadores activos
// ═══════════════════════════════════════════════════════════════════════════

describe('INDICATOR-PROVIDER-1: Sin indicadores activos', () => {
  it('percentage 0, status NO_DATA, sin indicadores', async () => {
    const provider = buildProvider({ totalActive: 0 });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.module, 'indicators');
    assert.equal(result.completed, 0);
    assert.equal(result.pending, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDICATOR-PROVIDER-2: Indicadores activos sin mediciones
// ═══════════════════════════════════════════════════════════════════════════

describe('INDICATOR-PROVIDER-2: Indicadores activos sin mediciones', () => {
  it('percentage 0, status NO_DATA, pending refleja NO_DATA', async () => {
    const provider = buildProvider({
      totalActive: 5,
      withMeasurements: 0,
      withoutMeasurements: 5,
      targetMet: 0,
      targetNotMet: 0,
      noData: 5,
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.pending, 5); // targetNotMet(0) + noData(5)
    assert.equal(result.completed, 0);
    // Debe generar finding de no-data
    assert.ok(result.findings.length > 0);
    assert.ok(result.findings[0].title.includes('sin medición'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDICATOR-PROVIDER-3: Todos alcanzan meta
// ═══════════════════════════════════════════════════════════════════════════

describe('INDICATOR-PROVIDER-3: Todos los indicadores alcanzan meta', () => {
  it('100%', async () => {
    const provider = buildProvider({
      totalActive: 4,
      withMeasurements: 4,
      withoutMeasurements: 0,
      targetMet: 4,
      targetNotMet: 0,
      noData: 0,
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.equal(result.percentage, 100);
    assert.equal(result.completed, 4);
    assert.equal(result.pending, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDICATOR-PROVIDER-4: 8 elegibles, 6 cumplen → 75%
// ═══════════════════════════════════════════════════════════════════════════

describe('INDICATOR-PROVIDER-4: 8 elegibles, 6 cumplen → 75%', () => {
  it('percentage = 75', async () => {
    const provider = buildProvider({
      totalActive: 10,
      withMeasurements: 8,
      withoutMeasurements: 2,
      targetMet: 6,
      targetNotMet: 2,
      noData: 2,
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.equal(result.percentage, 75);
    assert.equal(result.completed, 6);
    assert.equal(result.pending, 4); // targetNotMet(2) + noData(2)
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDICATOR-PROVIDER-5: TARGET_NOT_MET correctamente identificados
// ═══════════════════════════════════════════════════════════════════════════

describe('INDICATOR-PROVIDER-5: TARGET_NOT_MET correctamente identificados', () => {
  it('genera finding de target not met', async () => {
    const provider = buildProvider({
      totalActive: 5,
      withMeasurements: 5,
      withoutMeasurements: 0,
      targetMet: 3,
      targetNotMet: 2,
      noData: 0,
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.equal(result.percentage, 60);
    assert.equal(result.pending, 2);
    assert.ok(result.findings.some(f => f.title.includes('no alcanzan la meta')));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDICATOR-PROVIDER-6: NO_DATA no se transforma en incumplimiento
// ═══════════════════════════════════════════════════════════════════════════

describe('INDICATOR-PROVIDER-6: NO_DATA no se transforma en incumplimiento', () => {
  it('2 met, 2 noData → 100% (no se cuentan como no cumplen)', async () => {
    const provider = buildProvider({
      totalActive: 4,
      withMeasurements: 2,
      withoutMeasurements: 2,
      targetMet: 2,
      targetNotMet: 0,
      noData: 2,
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    // eligible = 2, met = 2 → 100%
    assert.equal(result.percentage, 100);
    assert.equal(result.completed, 2);
    assert.equal(result.pending, 2); // solo noData
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDICATOR-PROVIDER-7: GTE meta correctamente respetada
// ═══════════════════════════════════════════════════════════════════════════

describe('INDICATOR-PROVIDER-7: GTE meta correctamente respetada', () => {
  it('la evaluación de meta GTE ya fue hecha en IndicatorsService', async () => {
    // Este test documenta que la evaluación GTE ocurre en
    // IndicatorsService.createMeasurement → evaluateTarget.
    // El provider solo consume el resultado (TARGET_MET/TARGET_NOT_MET).
    const provider = buildProvider({
      totalActive: 3,
      withMeasurements: 3,
      withoutMeasurements: 0,
      targetMet: 3, // los 3 cumplen GTE
      targetNotMet: 0,
      noData: 0,
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDICATOR-PROVIDER-8: LTE meta correctamente respetada
// ═══════════════════════════════════════════════════════════════════════════

describe('INDICATOR-PROVIDER-8: LTE meta correctamente respetada', () => {
  it('la evaluación de meta LTE ya fue hecha en IndicatorsService', async () => {
    const provider = buildProvider({
      totalActive: 2,
      withMeasurements: 2,
      withoutMeasurements: 0,
      targetMet: 1,
      targetNotMet: 1,
      noData: 0,
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDICATOR-PROVIDER-9: EQ meta correctamente respetada
// ═══════════════════════════════════════════════════════════════════════════

describe('INDICATOR-PROVIDER-9: EQ meta correctamente respetada', () => {
  it('la evaluación de meta EQ ya fue hecha en IndicatorsService', async () => {
    const provider = buildProvider({
      totalActive: 4,
      withMeasurements: 4,
      withoutMeasurements: 0,
      targetMet: 2,
      targetNotMet: 2,
      noData: 0,
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDICATOR-PROVIDER-10: BETWEEN meta correctamente respetada
// ═══════════════════════════════════════════════════════════════════════════

describe('INDICATOR-PROVIDER-10: BETWEEN meta correctamente respetada', () => {
  it('la evaluación de meta BETWEEN ya fue hecha en IndicatorsService', async () => {
    const provider = buildProvider({
      totalActive: 5,
      withMeasurements: 5,
      withoutMeasurements: 0,
      targetMet: 3,
      targetNotMet: 2,
      noData: 0,
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 60);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDICATOR-PROVIDER-11: companyId isolation
// ═══════════════════════════════════════════════════════════════════════════

describe('INDICATOR-PROVIDER-11: companyId isolation', () => {
  it('el provider delega el filtrado por companyId a IndicatorsService', async () => {
    let receivedCompanyId: string | undefined;
    const indicatorsService = {
      getDashboardSummary: async (companyId: { toString: () => string }) => {
        receivedCompanyId = companyId.toString();
        return {
          totalActive: 2,
          withMeasurements: 2,
          withoutMeasurements: 0,
          targetMet: 2,
          targetNotMet: 0,
          noData: 0,
        };
      },
      findAllDefinitions: async () => [],
    };

    const provider = new IndicatorsProvider(indicatorsService as never);
    await provider.getCompliance('aabbccddeeff001122334455');

    assert.equal(receivedCompanyId, 'aabbccddeeff001122334455');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDICATOR-PROVIDER-12: phases.check alimentado
// ═══════════════════════════════════════════════════════════════════════════

describe('INDICATOR-PROVIDER-12: phases.check alimentado correctamente', () => {
  it('phases.check = percentage', async () => {
    const provider = buildProvider({
      totalActive: 4,
      withMeasurements: 4,
      withoutMeasurements: 0,
      targetMet: 3,
      targetNotMet: 1,
      noData: 0,
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.ok(result.phases);
    assert.equal(result.phases.check, 75);
  });

  it('phases.check = 0 cuando NO_DATA', async () => {
    const provider = buildProvider({ totalActive: 0 });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.ok(result.phases);
    assert.equal(result.phases.check, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDICATOR-PROVIDER-13: No se crean indicadores automáticamente
// ═══════════════════════════════════════════════════════════════════════════

describe('INDICATOR-PROVIDER-13: No se crean indicadores automáticamente', () => {
  it('el provider solo consume definiciones existentes', async () => {
    let findAllDefinitionsCalled = false;
    const indicatorsService = {
      getDashboardSummary: async () => ({
        totalActive: 0,
        withMeasurements: 0,
        withoutMeasurements: 0,
        targetMet: 0,
        targetNotMet: 0,
        noData: 0,
      }),
      findAllDefinitions: async () => {
        findAllDefinitionsCalled = true;
        return [];
      },
    };

    const provider = new IndicatorsProvider(indicatorsService as never);
    await provider.getCompliance(VALID_COMPANY_ID);

    // El provider NO debe crear indicadores — solo consumir
    assert.equal(findAllDefinitionsCalled, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDICATOR-PROVIDER-14: Fuentes existentes preservadas
// ═══════════════════════════════════════════════════════════════════════════

describe('INDICATOR-PROVIDER-14: Fuentes existentes preservadas', () => {
  it('el provider no accede a módulos externos', async () => {
    const provider = buildProvider({
      totalActive: 3,
      withMeasurements: 3,
      withoutMeasurements: 0,
      targetMet: 2,
      targetNotMet: 1,
      noData: 0,
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    // El provider solo consulta IndicatorsService
    // No accede a incidentModel, trainingModel, etc.
    assert.equal(result.module, 'indicators');
    assert.ok(result.phases);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDICATOR-PROVIDER-15: NO_DATA no se transforma en incumplimiento
// ═══════════════════════════════════════════════════════════════════════════

describe('INDICATOR-PROVIDER-15: NO_DATA no se transforma en incumplimiento', () => {
  it('solo 1 medición válida de 10 indicadores → 100% si cumple meta', async () => {
    const provider = buildProvider({
      totalActive: 10,
      withMeasurements: 1,
      withoutMeasurements: 9,
      targetMet: 1,
      targetNotMet: 0,
      noData: 9,
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    // eligible = 1, met = 1 → 100%
    // Los 9 NO_DATA NO se cuentan como incumplimiento
    assert.equal(result.percentage, 100);
    assert.equal(result.completed, 1);
    assert.equal(result.pending, 9); // solo noData
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDICATOR-PROVIDER-16: edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe('INDICATOR-PROVIDER-16: edge cases', () => {
  it('todos targetNotMet, ninguno noData → 0%', async () => {
    const provider = buildProvider({
      totalActive: 5,
      withMeasurements: 5,
      withoutMeasurements: 0,
      targetMet: 0,
      targetNotMet: 5,
      noData: 0,
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.equal(result.percentage, 0);
    assert.equal(result.completed, 0);
    assert.equal(result.pending, 5);
    // 0% es un valor válido, NO es NO_DATA
    assert.notEqual(result.status, 'NO_DATA');
  });

  it('solo noData, sin targetNotMet → NO_DATA', async () => {
    const provider = buildProvider({
      totalActive: 3,
      withMeasurements: 0,
      withoutMeasurements: 3,
      targetMet: 0,
      targetNotMet: 0,
      noData: 3,
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
  });

  it('1 indicador activo con medición y meta alcanzada → 100%', async () => {
    const provider = buildProvider({
      totalActive: 1,
      withMeasurements: 1,
      withoutMeasurements: 0,
      targetMet: 1,
      targetNotMet: 0,
      noData: 0,
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.equal(result.percentage, 100);
  });

  it('finding de no-active indicators cuando totalActive = 0', async () => {
    const provider = buildProvider({ totalActive: 0 });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.equal(result.findings.length, 1);
    assert.ok(result.findings[0].title.includes('No hay indicadores'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDICATOR-PROVIDER-17: Independencia de EvaluationsProvider
// ═══════════════════════════════════════════════════════════════════════════

describe('INDICATOR-PROVIDER-17: Independencia de EvaluationsProvider', () => {
  it('el provider solo contribuye a phases.check, no a plan/do/act', async () => {
    const provider = buildProvider({
      totalActive: 4,
      withMeasurements: 4,
      withoutMeasurements: 0,
      targetMet: 3,
      targetNotMet: 1,
      noData: 0,
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.ok(result.phases);
    assert.equal(result.phases.check, 75);
    assert.equal(result.phases.plan, undefined);
    assert.equal(result.phases.do, undefined);
    assert.equal(result.phases.act, undefined);
  });
});
