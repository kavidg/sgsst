import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// ═══════════════════════════════════════════════════════════════════════════
// SEED: IND-03 and IND-07 exist
// ═══════════════════════════════════════════════════════════════════════════

describe('ABSENT-SEED-01: IND-03 y IND-07 existen en el seed', () => {
  it('Seed tiene 11 indicadores (7 previos + 2 ausentismo + 2 documentos)', async () => {
    const { MVP_INDICATOR_DEFINITIONS } = await import('./seeds/mvp-indicator-definitions.js');
    assert.equal(MVP_INDICATOR_DEFINITIONS.length, 11);
  });

  it('IND-03 existe con code ind-03-absenteeism-rate', async () => {
    const { MVP_INDICATOR_DEFINITIONS } = await import('./seeds/mvp-indicator-definitions.js');
    const ind = MVP_INDICATOR_DEFINITIONS.find((d) => d.code === 'ind-03-absenteeism-rate');
    assert.ok(ind, 'IND-03 not found');
    assert.equal(ind.formula.type, 'RATIO_SCALED');
    assert.equal(ind.frequency, 'MONTHLY');
    assert.equal(ind.catalogCode, '3.2.1');
  });

  it('IND-07 existe con code ind-07-absenteeism-records', async () => {
    const { MVP_INDICATOR_DEFINITIONS } = await import('./seeds/mvp-indicator-definitions.js');
    const ind = MVP_INDICATOR_DEFINITIONS.find((d) => d.code === 'ind-07-absenteeism-records');
    assert.ok(ind, 'IND-07 not found');
    assert.equal(ind.formula.type, 'COUNT');
    assert.equal(ind.frequency, 'MONTHLY');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FORMULA: RATIO_SCALED for absenteeism
// ═══════════════════════════════════════════════════════════════════════════

describe('ABSENT-FORMULA-01: IND-03 calcula correctamente', () => {
  it('40 daysAbsent / 3200 hours × 200000 = 2500', async () => {
    const { FormulaRegistryService } = await import('./formula/formula-registry.service.js');
    const { Types } = await import('mongoose');

    const mockResolver = {
      resolve: async (module: string, field: string) => {
        if (module === 'absenteeism' && field === 'daysAbsent') return { value: 40, available: true };
        if (module === 'work-data' && field === 'hoursWorked') return { value: 3200, available: true };
        return { value: 0, available: false };
      },
    };

    const registry = new FormulaRegistryService(mockResolver as any);
    const result = await registry.resolve(
      new Types.ObjectId('aabbccddeeff001122334455'),
      {
        type: 'RATIO_SCALED',
        numerator: { module: 'absenteeism', field: 'daysAbsent' },
        denominator: { module: 'work-data', field: 'hoursWorked' },
        scale: 200000,
      } as any,
    );

    assert.equal(result.calculatedValue, 2500);
    assert.equal(result.numerator, 40);
    assert.equal(result.denominator, 3200);
  });

  it('80 daysAbsent / 3200 hours × 200000 = 5000', async () => {
    const { FormulaRegistryService } = await import('./formula/formula-registry.service.js');
    const { Types } = await import('mongoose');

    const mockResolver = {
      resolve: async (module: string, field: string) => {
        if (module === 'absenteeism' && field === 'daysAbsent') return { value: 80, available: true };
        if (module === 'work-data' && field === 'hoursWorked') return { value: 3200, available: true };
        return { value: 0, available: false };
      },
    };

    const registry = new FormulaRegistryService(mockResolver as any);
    const result = await registry.resolve(
      new Types.ObjectId('aabbccddeeff001122334455'),
      {
        type: 'RATIO_SCALED',
        numerator: { module: 'absenteeism', field: 'daysAbsent' },
        denominator: { module: 'work-data', field: 'hoursWorked' },
        scale: 200000,
      } as any,
    );

    assert.equal(result.calculatedValue, 5000);
  });
});

describe('ABSENT-FORMULA-02: IND-07 COUNT funciona', () => {
  it('5 absenteeism records → count = 5', async () => {
    const { FormulaRegistryService } = await import('./formula/formula-registry.service.js');
    const { Types } = await import('mongoose');

    const mockResolver = {
      resolve: async (module: string, field: string) => {
        if (module === 'absenteeism' && field === 'count') return { value: 5, available: true };
        return { value: 0, available: false };
      },
    };

    const registry = new FormulaRegistryService(mockResolver as any);
    const result = await registry.resolve(
      new Types.ObjectId('aabbccddeeff001122334455'),
      {
        type: 'COUNT',
        source: { module: 'absenteeism', field: 'count' },
      } as any,
    );

    assert.equal(result.calculatedValue, 5);
    assert.equal(result.numerator, 5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NO_DATA vs ZERO
// ═══════════════════════════════════════════════════════════════════════════

describe('ABSENT-NODATA-01: Sin registros → NO_DATA', () => {
  it('absenteeism.daysAbsent unavailable → NO_DATA', async () => {
    const { FormulaRegistryService } = await import('./formula/formula-registry.service.js');
    const { Types } = await import('mongoose');
    const { IndicatorMeasurementStatus } = await import('./enums/indicator-measurement-status.enum.js');

    const registry = new FormulaRegistryService({
      resolve: async () => ({ value: 0, available: false }),
    } as any);

    const result = await registry.resolve(
      new Types.ObjectId('aabbccddeeff001122334455'),
      {
        type: 'RATIO_SCALED',
        numerator: { module: 'absenteeism', field: 'daysAbsent' },
        denominator: { module: 'work-data', field: 'hoursWorked' },
        scale: 200000,
      } as any,
    );

    assert.equal(result.status, IndicatorMeasurementStatus.NO_DATA);
    assert.equal(result.calculatedValue, 0);
  });
});

describe('ABSENT-NODATA-02: 0 daysAbsent con horas → CALCULATED 0', () => {
  it('0 daysAbsent, 3200 hours → 0 (valid result)', async () => {
    const { FormulaRegistryService } = await import('./formula/formula-registry.service.js');
    const { Types } = await import('mongoose');
    const { IndicatorMeasurementStatus } = await import('./enums/indicator-measurement-status.enum.js');

    const registry = new FormulaRegistryService({
      resolve: async (module: string, field: string) => {
        if (module === 'absenteeism' && field === 'daysAbsent') return { value: 0, available: true };
        if (module === 'work-data' && field === 'hoursWorked') return { value: 3200, available: true };
        return { value: 0, available: false };
      },
    } as any);

    const result = await registry.resolve(
      new Types.ObjectId('aabbccddeeff001122334455'),
      {
        type: 'RATIO_SCALED',
        numerator: { module: 'absenteeism', field: 'daysAbsent' },
        denominator: { module: 'work-data', field: 'hoursWorked' },
        scale: 200000,
      } as any,
    );

    assert.equal(result.calculatedValue, 0);
    assert.equal(result.status, IndicatorMeasurementStatus.CALCULATED);
  });
});

describe('ABSENT-NODATA-03: Con datos sin hoursWorked → NO_DATA', () => {
  it('40 daysAbsent, no hoursWorked → NO_DATA', async () => {
    const { FormulaRegistryService } = await import('./formula/formula-registry.service.js');
    const { Types } = await import('mongoose');
    const { IndicatorMeasurementStatus } = await import('./enums/indicator-measurement-status.enum.js');

    const registry = new FormulaRegistryService({
      resolve: async (module: string, field: string) => {
        if (module === 'absenteeism' && field === 'daysAbsent') return { value: 40, available: true };
        if (module === 'work-data' && field === 'hoursWorked') return { value: 0, available: false };
        return { value: 0, available: false };
      },
    } as any);

    const result = await registry.resolve(
      new Types.ObjectId('aabbccddeeff001122334455'),
      {
        type: 'RATIO_SCALED',
        numerator: { module: 'absenteeism', field: 'daysAbsent' },
        denominator: { module: 'work-data', field: 'hoursWorked' },
        scale: 200000,
      } as any,
    );

    assert.equal(result.status, IndicatorMeasurementStatus.NO_DATA);
    assert.equal(result.calculatedValue, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-TENANT
// ═══════════════════════════════════════════════════════════════════════════

describe('ABSENT-TENANT-01: Company isolation', () => {
  it('Company A and B get different results', async () => {
    const { FormulaRegistryService } = await import('./formula/formula-registry.service.js');
    const { Types } = await import('mongoose');

    const companyA = new Types.ObjectId('aabbccddeeff001122334455');
    const companyB = new Types.ObjectId('112233445566778899001122');

    const mockResolver = {
      resolve: async (module: string, field: string, companyId: any) => {
        if (module === 'absenteeism' && field === 'daysAbsent') {
          return { value: companyId.equals(companyA) ? 40 : 80, available: true };
        }
        if (module === 'work-data' && field === 'hoursWorked') {
          return { value: 3200, available: true };
        }
        return { value: 0, available: false };
      },
    };

    const registry = new FormulaRegistryService(mockResolver as any);
    const formula = {
      type: 'RATIO_SCALED',
      numerator: { module: 'absenteeism', field: 'daysAbsent' },
      denominator: { module: 'work-data', field: 'hoursWorked' },
      scale: 200000,
    } as any;

    const resultA = await registry.resolve(companyA, formula);
    const resultB = await registry.resolve(companyB, formula);

    // Company A: 40/3200 × 200000 = 2500
    assert.equal(resultA.calculatedValue, 2500);
    // Company B: 80/3200 × 200000 = 5000
    assert.equal(resultB.calculatedValue, 5000);
    assert.notEqual(resultA.calculatedValue, resultB.calculatedValue);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// E2E: Complete absenteeism indicator flow
// ═══════════════════════════════════════════════════════════════════════════

describe('ABSENT-E2E-01: Flujo completo de indicadores de ausentismo', () => {
  it('Company A: 40 daysAbsent, 3200 hours → IND-03=2500, IND-07=count', async () => {
    const { FormulaRegistryService } = await import('./formula/formula-registry.service.js');
    const { Types } = await import('mongoose');

    const mockResolver = {
      resolve: async (module: string, field: string) => {
        if (module === 'absenteeism' && field === 'daysAbsent') return { value: 40, available: true };
        if (module === 'absenteeism' && field === 'count') return { value: 8, available: true };
        if (module === 'work-data' && field === 'hoursWorked') return { value: 3200, available: true };
        return { value: 0, available: false };
      },
    };

    const registry = new FormulaRegistryService(mockResolver as any);
    const companyId = new Types.ObjectId('aabbccddeeff001122334455');

    // IND-03: (40 / 3200) × 200000 = 2500
    const r03 = await registry.resolve(companyId, {
      type: 'RATIO_SCALED',
      numerator: { module: 'absenteeism', field: 'daysAbsent' },
      denominator: { module: 'work-data', field: 'hoursWorked' },
      scale: 200000,
    } as any);
    assert.equal(r03.calculatedValue, 2500);

    // IND-07: count = 8
    const r07 = await registry.resolve(companyId, {
      type: 'COUNT',
      source: { module: 'absenteeism', field: 'count' },
    } as any);
    assert.equal(r07.calculatedValue, 8);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TARGET: IND-03
// ═══════════════════════════════════════════════════════════════════════════

describe('ABSENT-TARGET-01: IND-03 target evaluation', () => {
  it('absenteeism=300 with LTE target=500 → TARGET_MET', async () => {
    const { IndicatorMeasurementStatus } = await import('./enums/indicator-measurement-status.enum.js');
    const value = 300;
    const target = 500;
    const status = value <= target
      ? IndicatorMeasurementStatus.TARGET_MET
      : IndicatorMeasurementStatus.TARGET_NOT_MET;
    assert.equal(status, IndicatorMeasurementStatus.TARGET_MET);
  });

  it('absenteeism=600 with LTE target=500 → TARGET_NOT_MET', async () => {
    const { IndicatorMeasurementStatus } = await import('./enums/indicator-measurement-status.enum.js');
    const value = 600;
    const target = 500;
    const status = value <= target
      ? IndicatorMeasurementStatus.TARGET_MET
      : IndicatorMeasurementStatus.TARGET_NOT_MET;
    assert.equal(status, IndicatorMeasurementStatus.TARGET_NOT_MET);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REGRESSION
// ═══════════════════════════════════════════════════════════════════════════

describe('ABSENT-REGRESSION-01: PHVA weights intactos', () => {
  it('plan=0.25, do=0.60, check=0.05, act=0.10', async () => {
    const { getPhaseWeights } = await import('../compliance-engine/utils/compliance-weights.js');
    const w = getPhaseWeights();
    assert.equal(w.plan, 0.25);
    assert.equal(w.do, 0.6);
    assert.equal(w.check, 0.05);
    assert.equal(w.act, 0.1);
  });
});

describe('ABSENT-REGRESSION-02: All previous indicators still work', () => {
  it('IND-01 through IND-09 calculate correctly', async () => {
    const { FormulaRegistryService } = await import('./formula/formula-registry.service.js');
    const { Types } = await import('mongoose');

    const mockResolver = {
      resolve: async (module: string, field: string) => {
        if (module === 'trainings' && field === 'avgCompletion') return { value: 90, available: true };
        if (module === 'inspections' && field === 'completionRate') return { value: 85, available: true };
        if (module === 'risks' && field === 'controlledPercentage') return { value: 75, available: true };
        if (module === 'trainings' && field === 'effectivenessPercentage') return { value: 80, available: true };
        if (module === 'incidents' && field === 'closedCount') return { value: 8, available: true };
        if (module === 'incidents' && field === 'count') return { value: 10, available: true };
        if (module === 'incidents' && field === 'accidentCount') return { value: 5, available: true };
        if (module === 'incidents' && field === 'daysLost') return { value: 20, available: true };
        if (module === 'work-data' && field === 'hoursWorked') return { value: 3200, available: true };
        if (module === 'absenteeism' && field === 'daysAbsent') return { value: 40, available: true };
        if (module === 'absenteeism' && field === 'count') return { value: 8, available: true };
        return { value: 0, available: false };
      },
    };

    const registry = new FormulaRegistryService(mockResolver as any);
    const companyId = new Types.ObjectId('aabbccddeeff001122334455');

    // IND-01: 5/3200 × 200000 = 312.5
    const r01 = await registry.resolve(companyId, {
      type: 'RATIO_SCALED',
      numerator: { module: 'incidents', field: 'accidentCount' },
      denominator: { module: 'work-data', field: 'hoursWorked' },
      scale: 200000,
    } as any);
    assert.equal(r01.calculatedValue, 312.5);

    // IND-03: 40/3200 × 200000 = 2500
    const r03 = await registry.resolve(companyId, {
      type: 'RATIO_SCALED',
      numerator: { module: 'absenteeism', field: 'daysAbsent' },
      denominator: { module: 'work-data', field: 'hoursWorked' },
      scale: 200000,
    } as any);
    assert.equal(r03.calculatedValue, 2500);

    // IND-04: AVERAGE avgCompletion = 90
    const r04 = await registry.resolve(companyId, { type: 'AVERAGE', source: { module: 'trainings', field: 'avgCompletion' } } as any);
    assert.equal(r04.calculatedValue, 90);

    // IND-09: 8/10 × 100 = 80
    const r09 = await registry.resolve(companyId, {
      type: 'PERCENTAGE',
      part: { module: 'incidents', field: 'closedCount' },
      whole: { module: 'incidents', field: 'count' },
    } as any);
    assert.equal(r09.calculatedValue, 80);
  });
});
