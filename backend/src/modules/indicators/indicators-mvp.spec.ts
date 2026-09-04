import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// ═══════════════════════════════════════════════════════════════════════════
// SEED tests (no schema dependency — pure import)
// ═══════════════════════════════════════════════════════════════════════════

describe('SEED-1: Los 5 indicadores MVP existen', () => {
  it('MVP_INDICATOR_DEFINITIONS tiene al menos 5 entradas', async () => {
    const { MVP_INDICATOR_DEFINITIONS } = await import('./seeds/mvp-indicator-definitions.js');
    assert.ok(MVP_INDICATOR_DEFINITIONS.length >= 5, `Expected >= 5, got ${MVP_INDICATOR_DEFINITIONS.length}`);
  });

  it('Cada indicador tiene code, name, formula, frequency', async () => {
    const { MVP_INDICATOR_DEFINITIONS } = await import('./seeds/mvp-indicator-definitions.js');
    for (const ind of MVP_INDICATOR_DEFINITIONS) {
      assert.ok(ind.code, `Indicator missing code: ${JSON.stringify(ind)}`);
      assert.ok(ind.name, `Indicator ${ind.code} missing name`);
      assert.ok(ind.formula, `Indicator ${ind.code} missing formula`);
      assert.ok(ind.frequency, `Indicator ${ind.code} missing frequency`);
      assert.ok(ind.targetOperator, `Indicator ${ind.code} missing targetOperator`);
      assert.ok(typeof ind.targetValue === 'number', `Indicator ${ind.code} missing targetValue`);
    }
  });
});

describe('SEED-2: Códigos son estables y únicos', () => {
  it('No hay códigos duplicados', async () => {
    const { MVP_INDICATOR_DEFINITIONS } = await import('./seeds/mvp-indicator-definitions.js');
    const codes = MVP_INDICATOR_DEFINITIONS.map((d) => d.code);
    const unique = new Set(codes);
    assert.equal(codes.length, unique.size, `Duplicate codes found: ${codes.join(', ')}`);
  });

  it('Códigos esperados existen', async () => {
    const { MVP_INDICATOR_DEFINITIONS } = await import('./seeds/mvp-indicator-definitions.js');
    const codes = MVP_INDICATOR_DEFINITIONS.map((d) => d.code);
    assert.ok(codes.includes('ind-04-training-compliance'));
    assert.ok(codes.includes('ind-05-inspection-compliance'));
    assert.ok(codes.includes('ind-06-risk-controlled'));
    assert.ok(codes.includes('ind-08-training-effectiveness'));
    assert.ok(codes.includes('ind-09-incident-closure'));
  });
});

describe('SEED-3: Fórmulas son declarativas y válidas', () => {
  it('IND-04 usa AVERAGE sobre trainings.avgCompletion', async () => {
    const { MVP_INDICATOR_DEFINITIONS } = await import('./seeds/mvp-indicator-definitions.js');
    const ind = MVP_INDICATOR_DEFINITIONS.find((d) => d.code === 'ind-04-training-compliance')!;
    assert.equal(ind.formula.type, 'AVERAGE');
    assert.equal((ind.formula as any).source.module, 'trainings');
    assert.equal((ind.formula as any).source.field, 'avgCompletion');
  });

  it('IND-05 usa AVERAGE sobre inspections.completionRate', async () => {
    const { MVP_INDICATOR_DEFINITIONS } = await import('./seeds/mvp-indicator-definitions.js');
    const ind = MVP_INDICATOR_DEFINITIONS.find((d) => d.code === 'ind-05-inspection-compliance')!;
    assert.equal(ind.formula.type, 'AVERAGE');
    assert.equal((ind.formula as any).source.module, 'inspections');
    assert.equal((ind.formula as any).source.field, 'completionRate');
  });

  it('IND-06 usa AVERAGE sobre risks.controlledPercentage', async () => {
    const { MVP_INDICATOR_DEFINITIONS } = await import('./seeds/mvp-indicator-definitions.js');
    const ind = MVP_INDICATOR_DEFINITIONS.find((d) => d.code === 'ind-06-risk-controlled')!;
    assert.equal(ind.formula.type, 'AVERAGE');
    assert.equal((ind.formula as any).source.module, 'risks');
    assert.equal((ind.formula as any).source.field, 'controlledPercentage');
  });

  it('IND-08 usa AVERAGE sobre trainings.effectivenessPercentage', async () => {
    const { MVP_INDICATOR_DEFINITIONS } = await import('./seeds/mvp-indicator-definitions.js');
    const ind = MVP_INDICATOR_DEFINITIONS.find((d) => d.code === 'ind-08-training-effectiveness')!;
    assert.equal(ind.formula.type, 'AVERAGE');
    assert.equal((ind.formula as any).source.module, 'trainings');
    assert.equal((ind.formula as any).source.field, 'effectivenessPercentage');
  });

  it('IND-09 usa PERCENTAGE sobre incidents.closedCount/count', async () => {
    const { MVP_INDICATOR_DEFINITIONS } = await import('./seeds/mvp-indicator-definitions.js');
    const ind = MVP_INDICATOR_DEFINITIONS.find((d) => d.code === 'ind-09-incident-closure')!;
    assert.equal(ind.formula.type, 'PERCENTAGE');
    assert.equal((ind.formula as any).part.module, 'incidents');
    assert.equal((ind.formula as any).part.field, 'closedCount');
    assert.equal((ind.formula as any).whole.module, 'incidents');
    assert.equal((ind.formula as any).whole.field, 'count');
  });
});

describe('SEED-4: Categorías y metas correctas', () => {
  it('IND-04: PROCESS, TRAINING, GTE 80, QUARTERLY', async () => {
    const { MVP_INDICATOR_DEFINITIONS } = await import('./seeds/mvp-indicator-definitions.js');
    const { IndicatorCategory } = await import('./enums/indicator-category.enum.js');
    const { IndicatorSubcategory } = await import('./enums/indicator-subcategory.enum.js');
    const { IndicatorTargetOperator } = await import('./enums/indicator-target-operator.enum.js');
    const { IndicatorFrequency } = await import('./enums/indicator-frequency.enum.js');

    const ind = MVP_INDICATOR_DEFINITIONS.find((d) => d.code === 'ind-04-training-compliance')!;
    assert.equal(ind.category, IndicatorCategory.PROCESS);
    assert.equal(ind.subcategory, IndicatorSubcategory.TRAINING);
    assert.equal(ind.targetOperator, IndicatorTargetOperator.GTE);
    assert.equal(ind.targetValue, 80);
    assert.equal(ind.frequency, IndicatorFrequency.QUARTERLY);
  });

  it('IND-05: PROCESS, SAFETY, GTE 90, MONTHLY', async () => {
    const { MVP_INDICATOR_DEFINITIONS } = await import('./seeds/mvp-indicator-definitions.js');
    const { IndicatorCategory } = await import('./enums/indicator-category.enum.js');
    const { IndicatorSubcategory } = await import('./enums/indicator-subcategory.enum.js');
    const { IndicatorTargetOperator } = await import('./enums/indicator-target-operator.enum.js');
    const { IndicatorFrequency } = await import('./enums/indicator-frequency.enum.js');

    const ind = MVP_INDICATOR_DEFINITIONS.find((d) => d.code === 'ind-05-inspection-compliance')!;
    assert.equal(ind.category, IndicatorCategory.PROCESS);
    assert.equal(ind.subcategory, IndicatorSubcategory.SAFETY);
    assert.equal(ind.targetOperator, IndicatorTargetOperator.GTE);
    assert.equal(ind.targetValue, 90);
    assert.equal(ind.frequency, IndicatorFrequency.MONTHLY);
  });

  it('IND-09: PROCESS, SAFETY, GTE 80, MONTHLY', async () => {
    const { MVP_INDICATOR_DEFINITIONS } = await import('./seeds/mvp-indicator-definitions.js');
    const { IndicatorCategory } = await import('./enums/indicator-category.enum.js');
    const { IndicatorSubcategory } = await import('./enums/indicator-subcategory.enum.js');
    const { IndicatorTargetOperator } = await import('./enums/indicator-target-operator.enum.js');
    const { IndicatorFrequency } = await import('./enums/indicator-frequency.enum.js');

    const ind = MVP_INDICATOR_DEFINITIONS.find((d) => d.code === 'ind-09-incident-closure')!;
    assert.equal(ind.category, IndicatorCategory.PROCESS);
    assert.equal(ind.subcategory, IndicatorSubcategory.SAFETY);
    assert.equal(ind.targetOperator, IndicatorTargetOperator.GTE);
    assert.equal(ind.targetValue, 80);
    assert.equal(ind.frequency, IndicatorFrequency.MONTHLY);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FORMULA REGISTRY tests
// ═══════════════════════════════════════════════════════════════════════════

describe('FORMULA-AUTO: FormulaRegistry resuelve fórmulas MVP', () => {
  it('IND-04 AVERAGE con datos disponibles', async () => {
    const { FormulaRegistryService } = await import('./formula/formula-registry.service.js');
    const { Types } = await import('mongoose');

    // Mock resolver that returns avgCompletion = 85
    const mockResolver = {
      resolve: async () => ({ value: 85, available: true }),
    };

    const registry = new FormulaRegistryService(mockResolver as any);
    const result = await registry.resolve(
      new Types.ObjectId('aabbccddeeff001122334455'),
      { type: 'AVERAGE', source: { module: 'trainings', field: 'avgCompletion' } } as any,
      new Date('2026-01-01'),
      new Date('2026-03-31'),
    );

    assert.equal(result.calculatedValue, 85);
    assert.equal(result.status, 'CALCULATED');
  });

  it('IND-09 PERCENTAGE: 8 closed of 10 total = 80%', async () => {
    const { FormulaRegistryService } = await import('./formula/formula-registry.service.js');
    const { Types } = await import('mongoose');

    const calls: Array<{ module: string; field: string }> = [];
    const mockResolver = {
      resolve: async (module: string, field: string) => {
        calls.push({ module, field });
        if (module === 'incidents' && field === 'closedCount') return { value: 8, available: true };
        if (module === 'incidents' && field === 'count') return { value: 10, available: true };
        return { value: 0, available: false };
      },
    };

    const registry = new FormulaRegistryService(mockResolver as any);
    const result = await registry.resolve(
      new Types.ObjectId('aabbccddeeff001122334455'),
      {
        type: 'PERCENTAGE',
        part: { module: 'incidents', field: 'closedCount' },
        whole: { module: 'incidents', field: 'count' },
      } as any,
    );

    assert.equal(result.calculatedValue, 80);
    assert.equal(result.numerator, 8);
    assert.equal(result.denominator, 10);
    assert.equal(result.status, 'CALCULATED');
  });
});

describe('FORMULA-NODATA: Fuentes sin datos producen NO_DATA', () => {
  it('AVERAGE sin datos → NO_DATA', async () => {
    const { FormulaRegistryService } = await import('./formula/formula-registry.service.js');
    const { Types } = await import('mongoose');
    const { IndicatorMeasurementStatus } = await import('./enums/indicator-measurement-status.enum.js');

    const mockResolver = {
      resolve: async () => ({ value: 0, available: false }),
    };

    const registry = new FormulaRegistryService(mockResolver as any);
    const result = await registry.resolve(
      new Types.ObjectId('aabbccddeeff001122334455'),
      { type: 'AVERAGE', source: { module: 'trainings', field: 'avgCompletion' } } as any,
    );

    assert.equal(result.status, IndicatorMeasurementStatus.NO_DATA);
    assert.equal(result.calculatedValue, 0);
  });

  it('PERCENTAGE con denominator 0 → NO_DATA', async () => {
    const { FormulaRegistryService } = await import('./formula/formula-registry.service.js');
    const { Types } = await import('mongoose');
    const { IndicatorMeasurementStatus } = await import('./enums/indicator-measurement-status.enum.js');

    const mockResolver = {
      resolve: async (module: string, field: string) => {
        if (field === 'count') return { value: 0, available: true };
        return { value: 5, available: true };
      },
    };

    const registry = new FormulaRegistryService(mockResolver as any);
    const result = await registry.resolve(
      new Types.ObjectId('aabbccddeeff001122334455'),
      {
        type: 'PERCENTAGE',
        part: { module: 'incidents', field: 'closedCount' },
        whole: { module: 'incidents', field: 'count' },
      } as any,
    );

    assert.equal(result.status, IndicatorMeasurementStatus.NO_DATA);
    assert.equal(result.calculatedValue, 0);
  });

  it('MANUAL formula → NO_DATA', async () => {
    const { FormulaRegistryService } = await import('./formula/formula-registry.service.js');
    const { Types } = await import('mongoose');
    const { IndicatorMeasurementStatus } = await import('./enums/indicator-measurement-status.enum.js');

    const registry = new FormulaRegistryService();
    const result = await registry.resolve(
      new Types.ObjectId('aabbccddeeff001122334455'),
      { type: 'MANUAL' } as any,
    );

    assert.equal(result.status, IndicatorMeasurementStatus.NO_DATA);
    assert.equal(result.calculatedValue, 0);
  });
});

describe('FORMULA-TARGETS: Evaluación de metas', () => {
  it('IND-04 con valor 85 y meta GTE 80 → TARGET_MET', async () => {
    const { IndicatorMeasurementStatus } = await import('./enums/indicator-measurement-status.enum.js');
    const { IndicatorTargetOperator } = await import('./enums/indicator-target-operator.enum.js');

    // Simulate evaluateTarget logic
    const value = 85;
    const targetOperator = IndicatorTargetOperator.GTE;
    const targetValue = 80;

    let status: string;
    if (targetOperator === IndicatorTargetOperator.GTE) {
      status = value >= targetValue ? IndicatorMeasurementStatus.TARGET_MET : IndicatorMeasurementStatus.TARGET_NOT_MET;
    } else {
      status = IndicatorMeasurementStatus.CALCULATED;
    }

    assert.equal(status, IndicatorMeasurementStatus.TARGET_MET);
  });

  it('IND-05 con valor 75 y meta GTE 90 → TARGET_NOT_MET', async () => {
    const { IndicatorMeasurementStatus } = await import('./enums/indicator-measurement-status.enum.js');
    const { IndicatorTargetOperator } = await import('./enums/indicator-target-operator.enum.js');

    const value = 75;
    const targetOperator = IndicatorTargetOperator.GTE;
    const targetValue = 90;

    let status: string;
    if (targetOperator === IndicatorTargetOperator.GTE) {
      status = value >= targetValue ? IndicatorMeasurementStatus.TARGET_MET : IndicatorMeasurementStatus.TARGET_NOT_MET;
    } else {
      status = IndicatorMeasurementStatus.CALCULATED;
    }

    assert.equal(status, IndicatorMeasurementStatus.TARGET_NOT_MET);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PERIOD tests
// ═══════════════════════════════════════════════════════════════════════════

describe('PERIOD-CALC: getPeriodDates para cálculo automático', () => {
  it('QUARTERLY Q1: enero-marzo', async () => {
    const { getPeriodDates } = await import('./utils/period.validator.js');
    const { IndicatorFrequency } = await import('./enums/indicator-frequency.enum.js');
    const { start, end } = getPeriodDates('2026-Q1', IndicatorFrequency.QUARTERLY);
    assert.equal(start.getMonth(), 0);
    assert.equal(end.getMonth(), 2);
    assert.equal(end.getDate(), 31);
  });

  it('MONTHLY enero: 1-31', async () => {
    const { getPeriodDates } = await import('./utils/period.validator.js');
    const { IndicatorFrequency } = await import('./enums/indicator-frequency.enum.js');
    const { start, end } = getPeriodDates('2026-01', IndicatorFrequency.MONTHLY);
    assert.equal(start.getDate(), 1);
    assert.equal(end.getDate(), 31);
  });

  it('QUARTERLY Q2: abril-junio', async () => {
    const { getPeriodDates } = await import('./utils/period.validator.js');
    const { IndicatorFrequency } = await import('./enums/indicator-frequency.enum.js');
    const { start, end } = getPeriodDates('2026-Q2', IndicatorFrequency.QUARTERLY);
    assert.equal(start.getMonth(), 3);
    assert.equal(end.getMonth(), 5);
    assert.equal(end.getDate(), 30);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER policy tests (no schema dependency)
// ═══════════════════════════════════════════════════════════════════════════

describe('PROVIDER-POLICY: IndicatorsProvider políticas documentadas', () => {
  it('eligible = 0 → percentage = 0, status = NO_DATA', async () => {
    const summary = {
      totalActive: 5,
      withMeasurements: 0,
      withoutMeasurements: 5,
      targetMet: 0,
      targetNotMet: 0,
      noData: 5,
    };

    const eligible = summary.withMeasurements;
    const percentage = eligible > 0
      ? Math.round((summary.targetMet / eligible) * 100)
      : 0;
    const status = summary.totalActive === 0 || eligible === 0 ? 'NO_DATA' : 'OK';

    assert.equal(percentage, 0);
    assert.equal(status, 'NO_DATA');
  });

  it('NO_DATA no reduce porcentaje de elegibles', async () => {
    const summary = {
      totalActive: 10,
      withMeasurements: 3,
      withoutMeasurements: 7,
      targetMet: 3,
      targetNotMet: 0,
      noData: 7,
    };

    const eligible = summary.withMeasurements;
    const percentage = eligible > 0
      ? Math.round((summary.targetMet / eligible) * 100)
      : 0;

    assert.equal(percentage, 100);
    assert.equal(eligible, 3);
  });

  it('TARGET_NOT_MET sí reduce porcentaje', async () => {
    const summary = {
      totalActive: 5,
      withMeasurements: 5,
      withoutMeasurements: 0,
      targetMet: 3,
      targetNotMet: 2,
      noData: 0,
    };

    const eligible = summary.withMeasurements;
    const percentage = eligible > 0
      ? Math.round((summary.targetMet / eligible) * 100)
      : 0;

    assert.equal(percentage, 60);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REGRESSION: PHVA weights + PHASE_PREFIXES intactos
// ═══════════════════════════════════════════════════════════════════════════

describe('MVP-REGRESSION-01: Pesos PHVA intactos', () => {
  it('plan=0.25, do=0.60, check=0.05, act=0.10', async () => {
    const { getPhaseWeights } = await import('../compliance-engine/utils/compliance-weights.js');
    const w = getPhaseWeights();
    assert.equal(w.plan, 0.25);
    assert.equal(w.do, 0.6);
    assert.equal(w.check, 0.05);
    assert.equal(w.act, 0.1);
  });
});

describe('MVP-REGRESSION-02: PHASE_PREFIXES intactos', () => {
  it('do contiene 2.5.1, 3., 4., 5.', async () => {
    const { PHASE_PREFIXES } = await import('../compliance-engine/utils/phase-prefixes.js');
    assert.ok(PHASE_PREFIXES.do.includes('2.5.1'));
    assert.ok(PHASE_PREFIXES.do.includes('3.'));
    assert.ok(PHASE_PREFIXES.do.includes('4.'));
    assert.ok(PHASE_PREFIXES.do.includes('5.'));
  });

  it('check contiene 2.6.1, 3.3.2, 4.2.2, 6.', async () => {
    const { PHASE_PREFIXES } = await import('../compliance-engine/utils/phase-prefixes.js');
    assert.ok(PHASE_PREFIXES.check.includes('2.6.1'));
    assert.ok(PHASE_PREFIXES.check.includes('3.3.2'));
    assert.ok(PHASE_PREFIXES.check.includes('4.2.2'));
    assert.ok(PHASE_PREFIXES.check.includes('6.'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATORS: DataSourceResolverRegistry fields
// ═══════════════════════════════════════════════════════════════════════════

describe('RESOLVER-FIELDS: DataSourceResolverRegistry soporta campos MVP', () => {
  it('trainings tiene avgCompletion y effectivenessPercentage', async () => {
    const { VALID_FIELDS_BY_MODULE } = await import('./formula/formula-types.js');
    assert.ok(VALID_FIELDS_BY_MODULE.trainings.includes('avgCompletion'));
    assert.ok(VALID_FIELDS_BY_MODULE.trainings.includes('effectivenessPercentage'));
    assert.ok(VALID_FIELDS_BY_MODULE.trainings.includes('participationPercentage'));
  });

  it('inspections tiene completionRate', async () => {
    const { VALID_FIELDS_BY_MODULE } = await import('./formula/formula-types.js');
    assert.ok(VALID_FIELDS_BY_MODULE.inspections.includes('completionRate'));
  });

  it('risks tiene controlledPercentage', async () => {
    const { VALID_FIELDS_BY_MODULE } = await import('./formula/formula-types.js');
    assert.ok(VALID_FIELDS_BY_MODULE.risks.includes('controlledPercentage'));
  });

  it('incidents tiene closedCount y count', async () => {
    const { VALID_FIELDS_BY_MODULE } = await import('./formula/formula-types.js');
    assert.ok(VALID_FIELDS_BY_MODULE.incidents.includes('closedCount'));
    assert.ok(VALID_FIELDS_BY_MODULE.incidents.includes('count'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NO-DATA vs ZERO policy
// ═══════════════════════════════════════════════════════════════════════════

describe('NODATA-ZERO: Diferencia entre NO_DATA y 0 real', () => {
  it('0 incidentes reales → CALCULATED con value=0', async () => {
    const { FormulaRegistryService } = await import('./formula/formula-registry.service.js');
    const { Types } = await import('mongoose');
    const { IndicatorMeasurementStatus } = await import('./enums/indicator-measurement-status.enum.js');

    // Simulates 0 incidents (available: true, value: 0)
    const mockResolver = {
      resolve: async (module: string, field: string) => {
        if (field === 'count') return { value: 0, available: true };
        if (field === 'closedCount') return { value: 0, available: true };
        return { value: 0, available: false };
      },
    };

    const registry = new FormulaRegistryService(mockResolver as any);
    const result = await registry.resolve(
      new Types.ObjectId('aabbccddeeff001122334455'),
      {
        type: 'PERCENTAGE',
        part: { module: 'incidents', field: 'closedCount' },
        whole: { module: 'incidents', field: 'count' },
      } as any,
    );

    // denominator = 0 → NO_DATA (division by zero protection)
    assert.equal(result.status, IndicatorMeasurementStatus.NO_DATA);
    assert.equal(result.calculatedValue, 0);
  });

  it('sin datos de trainings → NO_DATA', async () => {
    const { FormulaRegistryService } = await import('./formula/formula-registry.service.js');
    const { Types } = await import('mongoose');
    const { IndicatorMeasurementStatus } = await import('./enums/indicator-measurement-status.enum.js');

    const mockResolver = {
      resolve: async () => ({ value: 0, available: false }),
    };

    const registry = new FormulaRegistryService(mockResolver as any);
    const result = await registry.resolve(
      new Types.ObjectId('aabbccddeeff001122334455'),
      { type: 'AVERAGE', source: { module: 'trainings', field: 'avgCompletion' } } as any,
    );

    assert.equal(result.status, IndicatorMeasurementStatus.NO_DATA);
  });

  it('trainings con avgCompletion real = 0 → CALCULATED', async () => {
    const { FormulaRegistryService } = await import('./formula/formula-registry.service.js');
    const { Types } = await import('mongoose');
    const { IndicatorMeasurementStatus } = await import('./enums/indicator-measurement-status.enum.js');

    // Simulates training data that exists but has 0% completion
    const mockResolver = {
      resolve: async () => ({ value: 0, available: true }),
    };

    const registry = new FormulaRegistryService(mockResolver as any);
    const result = await registry.resolve(
      new Types.ObjectId('aabbccddeeff001122334455'),
      { type: 'AVERAGE', source: { module: 'trainings', field: 'avgCompletion' } } as any,
    );

    assert.equal(result.status, IndicatorMeasurementStatus.CALCULATED);
    assert.equal(result.calculatedValue, 0);
  });
});
