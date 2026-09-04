import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// ═══════════════════════════════════════════════════════════════════════════
// Test enums directly (no schema dependency)
// ═══════════════════════════════════════════════════════════════════════════

describe('IND-ENUM: Indicator enums exist and have correct values', () => {
  it('IndicatorCategory has expected values', async () => {
    const { IndicatorCategory } = await import('./enums/indicator-category.enum.js');
    assert.equal(IndicatorCategory.STRUCTURE, 'STRUCTURE');
    assert.equal(IndicatorCategory.PROCESS, 'PROCESS');
    assert.equal(IndicatorCategory.RESULT, 'RESULT');
  });

  it('IndicatorSubcategory has expected values', async () => {
    const { IndicatorSubcategory } = await import('./enums/indicator-subcategory.enum.js');
    assert.equal(IndicatorSubcategory.SAFETY, 'SAFETY');
    assert.equal(IndicatorSubcategory.HEALTH, 'HEALTH');
    assert.equal(IndicatorSubcategory.TRAINING, 'TRAINING');
  });

  it('IndicatorFormulaType has expected values', async () => {
    const { IndicatorFormulaType } = await import('./enums/indicator-formula-type.enum.js');
    assert.equal(IndicatorFormulaType.AUTOMATIC, 'AUTOMATIC');
    assert.equal(IndicatorFormulaType.SEMI_AUTOMATIC, 'SEMI_AUTOMATIC');
    assert.equal(IndicatorFormulaType.MANUAL, 'MANUAL');
  });

  it('IndicatorFrequency has expected values', async () => {
    const { IndicatorFrequency } = await import('./enums/indicator-frequency.enum.js');
    assert.equal(IndicatorFrequency.MONTHLY, 'MONTHLY');
    assert.equal(IndicatorFrequency.QUARTERLY, 'QUARTERLY');
    assert.equal(IndicatorFrequency.SEMESTRAL, 'SEMESTRAL');
    assert.equal(IndicatorFrequency.ANNUAL, 'ANNUAL');
  });

  it('IndicatorTargetOperator has expected values', async () => {
    const { IndicatorTargetOperator } = await import('./enums/indicator-target-operator.enum.js');
    assert.equal(IndicatorTargetOperator.GTE, 'GTE');
    assert.equal(IndicatorTargetOperator.LTE, 'LTE');
    assert.equal(IndicatorTargetOperator.EQ, 'EQ');
    assert.equal(IndicatorTargetOperator.BETWEEN, 'BETWEEN');
  });

  it('IndicatorMeasurementStatus has expected values', async () => {
    const { IndicatorMeasurementStatus } = await import('./enums/indicator-measurement-status.enum.js');
    assert.equal(IndicatorMeasurementStatus.NO_DATA, 'NO_DATA');
    assert.equal(IndicatorMeasurementStatus.CALCULATED, 'CALCULATED');
    assert.equal(IndicatorMeasurementStatus.TARGET_MET, 'TARGET_MET');
    assert.equal(IndicatorMeasurementStatus.TARGET_NOT_MET, 'TARGET_NOT_MET');
  });

  it('IndicatorPeriodStatus has expected values', async () => {
    const { IndicatorPeriodStatus } = await import('./enums/indicator-period-status.enum.js');
    assert.equal(IndicatorPeriodStatus.OPEN, 'OPEN');
    assert.equal(IndicatorPeriodStatus.CLOSED, 'CLOSED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test period validator (no schema dependency)
// ═══════════════════════════════════════════════════════════════════════════

describe('IND-PERIOD: Period format validation', () => {
  it('validates monthly format YYYY-MM', async () => {
    const { validatePeriodFormat } = await import('./utils/period.validator.js');
    const { IndicatorFrequency } = await import('./enums/indicator-frequency.enum.js');
    assert.doesNotThrow(() => validatePeriodFormat('2026-01', IndicatorFrequency.MONTHLY));
    assert.doesNotThrow(() => validatePeriodFormat('2026-12', IndicatorFrequency.MONTHLY));
  });

  it('rejects invalid monthly format', async () => {
    const { validatePeriodFormat } = await import('./utils/period.validator.js');
    const { IndicatorFrequency } = await import('./enums/indicator-frequency.enum.js');
    assert.throws(() => validatePeriodFormat('2026-13', IndicatorFrequency.MONTHLY), /Invalid month/);
    assert.throws(() => validatePeriodFormat('26-01', IndicatorFrequency.MONTHLY), /Invalid monthly period/);
    assert.throws(() => validatePeriodFormat('foo', IndicatorFrequency.MONTHLY), /Invalid monthly period/);
  });

  it('validates quarterly format YYYY-QN', async () => {
    const { validatePeriodFormat } = await import('./utils/period.validator.js');
    const { IndicatorFrequency } = await import('./enums/indicator-frequency.enum.js');
    assert.doesNotThrow(() => validatePeriodFormat('2026-Q1', IndicatorFrequency.QUARTERLY));
    assert.doesNotThrow(() => validatePeriodFormat('2026-Q4', IndicatorFrequency.QUARTERLY));
  });

  it('rejects invalid quarterly format', async () => {
    const { validatePeriodFormat } = await import('./utils/period.validator.js');
    const { IndicatorFrequency } = await import('./enums/indicator-frequency.enum.js');
    assert.throws(() => validatePeriodFormat('2026-Q5', IndicatorFrequency.QUARTERLY), /Invalid quarterly period/);
  });

  it('validates semestral format YYYY-SN', async () => {
    const { validatePeriodFormat } = await import('./utils/period.validator.js');
    const { IndicatorFrequency } = await import('./enums/indicator-frequency.enum.js');
    assert.doesNotThrow(() => validatePeriodFormat('2026-S1', IndicatorFrequency.SEMESTRAL));
    assert.doesNotThrow(() => validatePeriodFormat('2026-S2', IndicatorFrequency.SEMESTRAL));
  });

  it('rejects invalid semestral format', async () => {
    const { validatePeriodFormat } = await import('./utils/period.validator.js');
    const { IndicatorFrequency } = await import('./enums/indicator-frequency.enum.js');
    assert.throws(() => validatePeriodFormat('2026-S3', IndicatorFrequency.SEMESTRAL), /Invalid semestral period/);
  });

  it('validates annual format YYYY', async () => {
    const { validatePeriodFormat } = await import('./utils/period.validator.js');
    const { IndicatorFrequency } = await import('./enums/indicator-frequency.enum.js');
    assert.doesNotThrow(() => validatePeriodFormat('2026', IndicatorFrequency.ANNUAL));
  });

  it('rejects invalid annual format', async () => {
    const { validatePeriodFormat } = await import('./utils/period.validator.js');
    const { IndicatorFrequency } = await import('./enums/indicator-frequency.enum.js');
    assert.throws(() => validatePeriodFormat('26', IndicatorFrequency.ANNUAL), /Invalid annual period/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test period date calculation
// ═══════════════════════════════════════════════════════════════════════════

describe('IND-PERIOD-DATE: Period date calculation', () => {
  it('calculates monthly dates correctly', async () => {
    const { getPeriodDates } = await import('./utils/period.validator.js');
    const { IndicatorFrequency } = await import('./enums/indicator-frequency.enum.js');
    const { start, end } = getPeriodDates('2026-01', IndicatorFrequency.MONTHLY);
    assert.equal(start.getFullYear(), 2026);
    assert.equal(start.getMonth(), 0); // January
    assert.equal(start.getDate(), 1);
    assert.equal(end.getFullYear(), 2026);
    assert.equal(end.getMonth(), 0);
    assert.equal(end.getDate(), 31); // Jan has 31 days
  });

  it('calculates quarterly dates correctly', async () => {
    const { getPeriodDates } = await import('./utils/period.validator.js');
    const { IndicatorFrequency } = await import('./enums/indicator-frequency.enum.js');
    const { start, end } = getPeriodDates('2026-Q2', IndicatorFrequency.QUARTERLY);
    assert.equal(start.getMonth(), 3); // April
    assert.equal(end.getMonth(), 5); // June
    assert.equal(end.getDate(), 30); // June has 30 days
  });

  it('calculates semestral dates correctly', async () => {
    const { getPeriodDates } = await import('./utils/period.validator.js');
    const { IndicatorFrequency } = await import('./enums/indicator-frequency.enum.js');
    const { start, end } = getPeriodDates('2026-S2', IndicatorFrequency.SEMESTRAL);
    assert.equal(start.getMonth(), 6); // July
    assert.equal(end.getMonth(), 11); // December
    assert.equal(end.getDate(), 31);
  });

  it('calculates annual dates correctly', async () => {
    const { getPeriodDates } = await import('./utils/period.validator.js');
    const { IndicatorFrequency } = await import('./enums/indicator-frequency.enum.js');
    const { start, end } = getPeriodDates('2026', IndicatorFrequency.ANNUAL);
    assert.equal(start.getMonth(), 0); // January
    assert.equal(end.getMonth(), 11); // December
    assert.equal(end.getDate(), 31);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test barrel export
// ═══════════════════════════════════════════════════════════════════════════

describe('IND-BARREL: Enums barrel export', () => {
  it('exports all enums from index', async () => {
    const enums = await import('./enums/index.js');
    assert.ok(enums.IndicatorCategory);
    assert.ok(enums.IndicatorSubcategory);
    assert.ok(enums.IndicatorFormulaType);
    assert.ok(enums.IndicatorFrequency);
    assert.ok(enums.IndicatorTargetOperator);
    assert.ok(enums.IndicatorMeasurementStatus);
    assert.ok(enums.IndicatorPeriodStatus);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// IND-REGRESSION: ComplianceEngine no fue modificado
// ═══════════════════════════════════════════════════════════════════════════

describe('IND-REGRESSION-01: Pesos PHVA intactos', () => {
  it('plan=0.25, do=0.60, check=0.05, act=0.10', async () => {
    const { getPhaseWeights } = await import('../compliance-engine/utils/compliance-weights.js');
    const w = getPhaseWeights();
    assert.equal(w.plan, 0.25);
    assert.equal(w.do, 0.6);
    assert.equal(w.check, 0.05);
    assert.equal(w.act, 0.1);
  });
});

describe('IND-REGRESSION-02: PHASE_PREFIXES no cambiaron', () => {
  it('do contiene prefixes esperados', async () => {
    const { PHASE_PREFIXES } = await import('../compliance-engine/utils/phase-prefixes.js');
    assert.ok(PHASE_PREFIXES.do.includes('3.'));
    assert.ok(PHASE_PREFIXES.do.includes('4.'));
    assert.ok(PHASE_PREFIXES.do.includes('5.'));
    assert.ok(PHASE_PREFIXES.do.includes('2.5.1'));
  });

  it('check contiene prefixes esperados', async () => {
    const { PHASE_PREFIXES } = await import('../compliance-engine/utils/phase-prefixes.js');
    assert.ok(PHASE_PREFIXES.check.includes('6.'));
    assert.ok(PHASE_PREFIXES.check.includes('2.6.1'));
    assert.ok(PHASE_PREFIXES.check.includes('3.3.2'));
    assert.ok(PHASE_PREFIXES.check.includes('4.2.2'));
  });
});
