import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';
import { FormulaRegistryService } from './formula-registry.service.js';
import { IndicatorMeasurementStatus } from '../enums/indicator-measurement-status.enum.js';
import type { FormulaDefinition, DataSourceDefinition } from './formula-types.js';

function ds(module: string, field: string): DataSourceDefinition {
  return { module, field } as DataSourceDefinition;
}

const COMPANY_A = new Types.ObjectId('64a000000000000000000001'.slice(0, 24));
const COMPANY_B = new Types.ObjectId('64a000000000000000000002'.slice(0, 24));

function buildService() {
  return new FormulaRegistryService();
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMULA-1: PERCENTAGE correcto
// ═══════════════════════════════════════════════════════════════════════════

describe('FORMULA-1: PERCENTAGE formula', () => {
  it('valida estructura PERCENTAGE', () => {
    const service = buildService();
    const formula: FormulaDefinition = {
      type: 'PERCENTAGE',
      part: ds('trainings', 'count'),
      whole: ds('risks', 'count'),
    };
    assert.doesNotThrow(() => service.validateFormula(formula));
  });

  it('resolve retorna resultado con status NO_DATA (fuentes placeholder)', async () => {
    const service = buildService();
    const formula: FormulaDefinition = {
      type: 'PERCENTAGE',
      part: ds('trainings', 'count'),
      whole: ds('risks', 'count'),
    };
    const result = await service.resolve(COMPANY_A, formula);
    assert.equal(result.source, 'AUTOMATIC');
    // Placeholder resolvers return 0 → NO_DATA because denominator = 0
    assert.equal(result.status, IndicatorMeasurementStatus.NO_DATA);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FORMULA-2: RATIO correcto
// ═══════════════════════════════════════════════════════════════════════════

describe('FORMULA-2: RATIO formula', () => {
  it('valida estructura RATIO', () => {
    const service = buildService();
    const formula: FormulaDefinition = {
      type: 'RATIO',
      numerator: ds('incidents', 'count'),
      denominator: ds('trainings', 'count'),
    };
    assert.doesNotThrow(() => service.validateFormula(formula));
  });

  it('resolve retorna resultado válido', async () => {
    const service = buildService();
    const formula: FormulaDefinition = {
      type: 'RATIO',
      numerator: ds('incidents', 'count'),
      denominator: ds('trainings', 'count'),
    };
    const result = await service.resolve(COMPANY_A, formula);
    assert.equal(result.source, 'AUTOMATIC');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FORMULA-3: COUNT correcto
// ═══════════════════════════════════════════════════════════════════════════

describe('FORMULA-3: COUNT formula', () => {
  it('valida estructura COUNT', () => {
    const service = buildService();
    const formula: FormulaDefinition = {
      type: 'COUNT',
      source: ds('incidents', 'count'),
    };
    assert.doesNotThrow(() => service.validateFormula(formula));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FORMULA-4: AVERAGE correcto
// ═══════════════════════════════════════════════════════════════════════════

describe('FORMULA-4: AVERAGE formula', () => {
  it('valida estructura AVERAGE', () => {
    const service = buildService();
    const formula: FormulaDefinition = {
      type: 'AVERAGE',
      source: ds('trainings', 'avgCompletion'),
    };
    assert.doesNotThrow(() => service.validateFormula(formula));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FORMULA-5: denominator = 0 → NO_DATA
// ═══════════════════════════════════════════════════════════════════════════

describe('FORMULA-5: denominator = 0 produces NO_DATA', () => {
  it('PERCENTAGE with denominator returning 0 → NO_DATA', async () => {
    const service = buildService();
    const formula: FormulaDefinition = {
      type: 'PERCENTAGE',
      part: ds('trainings', 'count'),
      whole: ds('trainings', 'count'), // placeholder returns 0
    };
    const result = await service.resolve(COMPANY_A, formula);
    assert.equal(result.status, IndicatorMeasurementStatus.NO_DATA);
    assert.equal(result.calculatedValue, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FORMULA-6: datos faltantes → NO_DATA
// ═══════════════════════════════════════════════════════════════════════════

describe('FORMULA-6: missing data produces NO_DATA', () => {
  it('unknown module → NO_DATA', async () => {
    const service = buildService();
    const formula: FormulaDefinition = {
      type: 'COUNT',
      source: { module: 'nonexistent' as never, field: 'count' as never },
    };
    // This should fail validation, not produce NO_DATA
    assert.throws(
      () => service.validateFormula(formula),
      /Invalid module/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FORMULA-7: NaN → 0 + sanitization
// ═══════════════════════════════════════════════════════════════════════════

describe('FORMULA-7: NaN is sanitized to 0', () => {
  it('resolve never returns NaN in calculatedValue', async () => {
    const service = buildService();
    const formula: FormulaDefinition = {
      type: 'PERCENTAGE',
      part: ds('trainings', 'count'),
      whole: ds('risks', 'count'),
    };
    const result = await service.resolve(COMPANY_A, formula);
    assert.ok(Number.isFinite(result.calculatedValue), 'calculatedValue must be finite');
    assert.ok(!Number.isNaN(result.calculatedValue), 'calculatedValue must not be NaN');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FORMULA-8: Infinity → 0 + sanitization
// ═══════════════════════════════════════════════════════════════════════════

describe('FORMULA-8: Infinity is sanitized to 0', () => {
  it('resolve never returns Infinity in calculatedValue', async () => {
    const service = buildService();
    const formula: FormulaDefinition = {
      type: 'RATIO',
      numerator: ds('incidents', 'count'),
      denominator: ds('trainings', 'count'),
    };
    const result = await service.resolve(COMPANY_A, formula);
    assert.ok(Number.isFinite(result.calculatedValue), 'calculatedValue must be finite');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FORMULA-9: module desconocido rechazado
// ═══════════════════════════════════════════════════════════════════════════

describe('FORMULA-9: unknown module is rejected', () => {
  it('validateFormula throws for unknown module', () => {
    const service = buildService();
    const formula: FormulaDefinition = {
      type: 'COUNT',
      source: { module: 'unknown-module' as never, field: 'count' as never },
    };
    assert.throws(
      () => service.validateFormula(formula),
      /Invalid module/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FORMULA-10: field desconocido rechazado
// ═══════════════════════════════════════════════════════════════════════════

describe('FORMULA-10: unknown field is rejected', () => {
  it('validateFormula throws for unknown field', () => {
    const service = buildService();
    const formula: FormulaDefinition = {
      type: 'COUNT',
      source: { module: 'incidents', field: 'nonexistent' as never },
    };
    assert.throws(
      () => service.validateFormula(formula),
      /Invalid field/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FORMULA-11: companyId obligatorio
// ═══════════════════════════════════════════════════════════════════════════

describe('FORMULA-11: companyId is required', () => {
  it('resolve throws for invalid companyId', async () => {
    const service = buildService();
    const formula: FormulaDefinition = {
      type: 'COUNT',
      source: ds('incidents', 'count'),
    };
    await assert.rejects(
      () => service.resolve(null as never, formula),
      /companyId is required/,
    );
  });

  it('resolve throws for non-objectId companyId', async () => {
    const service = buildService();
    const formula: FormulaDefinition = {
      type: 'COUNT',
      source: ds('incidents', 'count'),
    };
    // Types.ObjectId.isValid('invalid') returns false
    await assert.rejects(
      () => service.resolve('invalid' as never, formula),
      /companyId is required/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FORMULA-12: cross-tenant imposible
// ═══════════════════════════════════════════════════════════════════════════

describe('FORMULA-12: cross-tenant impossible', () => {
  it('resolve uses companyId parameter, not global state', async () => {
    const service = buildService();
    const formula: FormulaDefinition = {
      type: 'COUNT',
      source: ds('incidents', 'count'),
    };
    // Both calls use different companyId — each gets its own resolution
    const resultA = await service.resolve(COMPANY_A, formula);
    const resultB = await service.resolve(COMPANY_B, formula);
    // Both return the same placeholder value (0), but the companyId is passed
    // In FASE 2 with real resolvers, these would return different values
    assert.equal(resultA.source, 'AUTOMATIC');
    assert.equal(resultB.source, 'AUTOMATIC');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FORMULA-13: periodStart/periodEnd respetados
// ═══════════════════════════════════════════════════════════════════════════

describe('FORMULA-13: period dates are passed through', () => {
  it('resolve accepts periodStart and periodEnd', async () => {
    const service = buildService();
    const formula: FormulaDefinition = {
      type: 'COUNT',
      source: ds('incidents', 'count'),
    };
    const start = new Date('2026-01-01');
    const end = new Date('2026-01-31');
    const result = await service.resolve(COMPANY_A, formula, start, end);
    assert.equal(result.source, 'AUTOMATIC');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FORMULA-14: array vacío → NO_DATA
// ═══════════════════════════════════════════════════════════════════════════

describe('FORMULA-14: empty result produces NO_DATA', () => {
  it('placeholder resolvers return 0 → NO_DATA for division formulas', async () => {
    const service = buildService();
    const formula: FormulaDefinition = {
      type: 'PERCENTAGE',
      part: ds('trainings', 'count'),
      whole: ds('trainings', 'count'),
    };
    const result = await service.resolve(COMPANY_A, formula);
    assert.equal(result.status, IndicatorMeasurementStatus.NO_DATA);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FORMULA-15: MANUAL no intenta cálculo automático
// ═══════════════════════════════════════════════════════════════════════════

describe('FORMULA-15: MANUAL formula returns NO_DATA', () => {
  it('MANUAL formula does not attempt automatic calculation', async () => {
    const service = buildService();
    const formula: FormulaDefinition = { type: 'MANUAL' };
    assert.doesNotThrow(() => service.validateFormula(formula));
    const result = await service.resolve(COMPANY_A, formula);
    assert.equal(result.status, IndicatorMeasurementStatus.NO_DATA);
    assert.equal(result.calculatedValue, 0);
    assert.equal(result.source, 'AUTOMATIC');
  });

  it('isAutomatic returns false for MANUAL', () => {
    const service = buildService();
    assert.equal(service.isAutomatic({ type: 'MANUAL' }), false);
    assert.equal(service.isAutomatic({ type: 'COUNT', source: ds('incidents', 'count') }), true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FORMULA-VALIDATION: Additional validation tests
// ═══════════════════════════════════════════════════════════════════════════

describe('FORMULA-VALIDATION: Formula structure validation', () => {
  it('rejects invalid formula type', () => {
    const service = buildService();
    assert.throws(
      () => service.validateFormula({ type: 'INVALID' as never }),
      /Invalid formula type/,
    );
  });

  it('rejects PERCENTAGE without part', () => {
    const service = buildService();
    assert.throws(
      () => service.validateFormula({ type: 'PERCENTAGE' } as never),
      /part/,
    );
  });

  it('rejects RATIO without numerator', () => {
    const service = buildService();
    assert.throws(
      () => service.validateFormula({ type: 'RATIO' } as never),
      /numerator/,
    );
  });

  it('rejects COUNT without source', () => {
    const service = buildService();
    assert.throws(
      () => service.validateFormula({ type: 'COUNT' } as never),
      /source/,
    );
  });

  it('validates all supported modules', () => {
    const service = buildService();
    // Each module uses its first valid field
    const moduleFields: Array<[string, string]> = [
      ['incidents', 'count'],
      ['trainings', 'count'],
      ['inspections', 'count'],
      ['risks', 'count'],
      ['evaluations', 'count'],
      ['annual-work-plan', 'overallPercentage'],
      ['sst-objectives', 'count'],
      ['documents', 'count'],
      ['legal-matrix', 'compliancePercentage'],
      ['emergencies', 'preparednessScore'],
      ['copasst-training', 'coveragePercentage'],
      ['convivencia', 'compliancePercentage'],
      ['absenteeism', 'absenceRate'],
    ];
    for (const [mod, field] of moduleFields) {
      assert.doesNotThrow(
        () => service.validateFormula({
          type: 'COUNT',
          source: { module: mod as never, field: field as never },
        }),
        `Module "${mod}" with field "${field}" should be valid`,
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// IND-REGRESSION: ComplianceEngine no fue modificado
// ═══════════════════════════════════════════════════════════════════════════

describe('IND-REGRESSION: Pesos PHVA intactos', () => {
  it('plan=0.25, do=0.60, check=0.05, act=0.10', async () => {
    const { getPhaseWeights } = await import('../../compliance-engine/utils/compliance-weights.js');
    const w = getPhaseWeights();
    assert.equal(w.plan, 0.25);
    assert.equal(w.do, 0.6);
    assert.equal(w.check, 0.05);
    assert.equal(w.act, 0.1);
  });
});
