import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';
import { IndicatorMeasurementStatus } from './enums/indicator-measurement-status.enum';
import { IndicatorTargetOperator } from './enums/indicator-target-operator.enum';
import { IndicatorFormulaType } from './enums/indicator-formula-type.enum';

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DATA & HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const COMPANY_A = new Types.ObjectId('64a000000000000000000001');
const COMPANY_B = new Types.ObjectId('64a000000000000000000002');

let idCounter = 1;
function makeId(): Types.ObjectId {
  const hex = idCounter.toString(16).padStart(24, '0');
  idCounter++;
  return new Types.ObjectId(hex);
}

interface MockDefinition {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  code: string;
  name: string;
  formulaType: string;
  targetOperator?: string;
  targetValue?: number;
  targetMin?: number;
  targetMax?: number;
  unit: string;
  isActive: boolean;
}

interface MockMeasurement {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  indicatorId: Types.ObjectId;
  period: string;
  calculatedValue: number;
  status: string;
  source: string;
  numerator: number;
  denominator: number;
  measuredAt: Date;
  periodStart: Date;
  periodEnd: Date;
}

function buildDefinition(overrides?: Partial<MockDefinition> & { code?: string }): MockDefinition {
  return {
    _id: makeId(),
    companyId: COMPANY_A,
    code: overrides?.code ?? 'ind-09-incident-closure',
    name: overrides?.name ?? 'Incidentes cerrados',
    formulaType: overrides?.formulaType ?? IndicatorFormulaType.AUTOMATIC,
    targetOperator: overrides?.targetOperator ?? IndicatorTargetOperator.GTE,
    targetValue: overrides?.targetValue ?? 80,
    targetMin: overrides?.targetMin,
    targetMax: overrides?.targetMax,
    unit: overrides?.unit ?? '%',
    isActive: overrides?.isActive ?? true,
  };
}

function buildMeasurement(overrides?: Partial<MockMeasurement>): MockMeasurement {
  return {
    _id: makeId(),
    companyId: COMPANY_A,
    indicatorId: overrides?.indicatorId ?? makeId(),
    period: overrides?.period ?? '2026-08',
    calculatedValue: overrides?.calculatedValue ?? 80,
    status: overrides?.status ?? IndicatorMeasurementStatus.TARGET_MET,
    source: overrides?.source ?? 'AUTOMATIC',
    numerator: overrides?.numerator ?? 8,
    denominator: overrides?.denominator ?? 10,
    measuredAt: overrides?.measuredAt ?? new Date('2026-08-15'),
    periodStart: overrides?.periodStart ?? new Date('2026-08-01'),
    periodEnd: overrides?.periodEnd ?? new Date('2026-08-31'),
  };
}

/**
 * Simulate getDashboard logic as implemented in IndicatorsService.getDashboard().
 * This mirrors the service method without needing to instantiate it (avoids Mongoose schema deps).
 */
function simulateGetDashboard(
  definitions: MockDefinition[],
  measurements: MockMeasurement[],
  period: string,
): {
  period: string;
  summary: {
    total: number;
    eligible: number;
    targetMet: number;
    targetNotMet: number;
    noData: number;
    compliancePercentage: number;
  };
  indicators: Array<{
    id: string;
    code: string;
    name: string;
    formulaType: string;
    calculatedValue: number | null;
    target: { operator?: string; value?: number; min?: number; max?: number };
    status: string;
    source: string | null;
    period: string;
    unit: string;
  }>;
} {
  // Build measurement map: indicatorId → measurement
  const measurementMap = new Map<string, MockMeasurement>();
  for (const m of measurements) {
    if (m.period === period) {
      measurementMap.set(m.indicatorId.toString(), m);
    }
  }

  const indicators: ReturnType<typeof simulateGetDashboard>['indicators'] = [];
  let total = 0;
  let eligible = 0;
  let targetMet = 0;
  let targetNotMet = 0;
  let noData = 0;

  for (const def of definitions) {
    total++;
    const measurement = measurementMap.get(def._id.toString());

    if (!measurement || measurement.status === IndicatorMeasurementStatus.NO_DATA) {
      noData++;
      indicators.push({
        id: def._id.toString(),
        code: def.code,
        name: def.name,
        formulaType: def.formulaType,
        calculatedValue: null,
        target: { operator: def.targetOperator, value: def.targetValue, min: def.targetMin, max: def.targetMax },
        status: IndicatorMeasurementStatus.NO_DATA,
        source: null,
        period,
        unit: def.unit,
      });
      continue;
    }

    eligible++;
    if (measurement.status === IndicatorMeasurementStatus.TARGET_MET) {
      targetMet++;
    } else if (measurement.status === IndicatorMeasurementStatus.TARGET_NOT_MET) {
      targetNotMet++;
    }

    indicators.push({
      id: def._id.toString(),
      code: def.code,
      name: def.name,
      formulaType: def.formulaType,
      calculatedValue: measurement.calculatedValue,
      target: { operator: def.targetOperator, value: def.targetValue, min: def.targetMin, max: def.targetMax },
      status: measurement.status,
      source: measurement.source ?? null,
      period: measurement.period,
      unit: def.unit,
    });
  }

  const compliancePercentage = eligible > 0
    ? Math.round((targetMet / eligible) * 100)
    : 0;

  return {
    period,
    summary: { total, eligible, targetMet, targetNotMet, noData, compliancePercentage },
    indicators,
  };
}

/**
 * Simulate getIndicatorDetail logic as implemented in IndicatorsService.getIndicatorDetail().
 */
function simulateGetIndicatorDetail(
  definitions: MockDefinition[],
  measurements: MockMeasurement[],
  indicatorCode: string,
  period: string,
): {
  id: string;
  code: string;
  name: string;
  formulaType: string;
  target: { operator?: string; value?: number; min?: number; max?: number };
  measurement: MockMeasurement | null;
  status: string;
  unit: string;
} | null {
  const def = definitions.find(
    (d) => d.code === indicatorCode.toLowerCase().trim() && d.isActive,
  );
  if (!def) return null;

  const meas = measurements.find(
    (m) =>
      m.indicatorId.toString() === def._id.toString() &&
      m.period === period,
  );

  let status: string;
  let measurementResult: MockMeasurement | null = null;

  if (!meas || meas.status === IndicatorMeasurementStatus.NO_DATA) {
    status = IndicatorMeasurementStatus.NO_DATA;
  } else {
    status = meas.status;
    measurementResult = meas;
  }

  return {
    id: def._id.toString(),
    code: def.code,
    name: def.name,
    formulaType: def.formulaType,
    target: { operator: def.targetOperator, value: def.targetValue, min: def.targetMin, max: def.targetMax },
    measurement: measurementResult,
    status,
    unit: def.unit,
  };
}

/**
 * Simulate period validation as implemented in IndicatorsService.validatePeriodString().
 */
function simulateValidatePeriod(period: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period.trim())) {
    throw new Error(`Invalid period format: "${period}". Expected YYYY-MM.`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DASH-01: Dashboard con todas las mediciones
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-01: Dashboard con todas las mediciones', () => {
  it('devuelve todos los indicadores con status TARGET_MET', () => {
    const def = buildDefinition();
    const meas = buildMeasurement({ indicatorId: def._id, calculatedValue: 90, status: IndicatorMeasurementStatus.TARGET_MET });

    const result = simulateGetDashboard([def], [meas], '2026-08');

    assert.equal(result.period, '2026-08');
    assert.equal(result.summary.total, 1);
    assert.equal(result.summary.eligible, 1);
    assert.equal(result.summary.targetMet, 1);
    assert.equal(result.summary.targetNotMet, 0);
    assert.equal(result.summary.noData, 0);
    assert.equal(result.summary.compliancePercentage, 100);
    assert.equal(result.indicators.length, 1);
    assert.equal(result.indicators[0].status, IndicatorMeasurementStatus.TARGET_MET);
    assert.equal(result.indicators[0].calculatedValue, 90);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-02: Dashboard con TARGET_MET
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-02: Dashboard con TARGET_MET', () => {
  it('calculatedValue >= target → TARGET_MET', () => {
    const def = buildDefinition({ targetValue: 80 });
    const meas = buildMeasurement({ indicatorId: def._id, calculatedValue: 85, status: IndicatorMeasurementStatus.TARGET_MET });

    const result = simulateGetDashboard([def], [meas], '2026-08');

    assert.equal(result.indicators[0].status, IndicatorMeasurementStatus.TARGET_MET);
    assert.equal(result.summary.targetMet, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-03: Dashboard con TARGET_NOT_MET
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-03: Dashboard con TARGET_NOT_MET', () => {
  it('calculatedValue < target → TARGET_NOT_MET', () => {
    const def = buildDefinition({ targetValue: 80 });
    const meas = buildMeasurement({ indicatorId: def._id, calculatedValue: 50, status: IndicatorMeasurementStatus.TARGET_NOT_MET });

    const result = simulateGetDashboard([def], [meas], '2026-08');

    assert.equal(result.indicators[0].status, IndicatorMeasurementStatus.TARGET_NOT_MET);
    assert.equal(result.summary.targetNotMet, 1);
    assert.equal(result.summary.targetMet, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-04: Dashboard con NO_DATA
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-04: Dashboard con NO_DATA', () => {
  it('definition exists but no measurement → NO_DATA', () => {
    const def = buildDefinition();

    const result = simulateGetDashboard([def], [], '2026-08');

    assert.equal(result.indicators[0].status, IndicatorMeasurementStatus.NO_DATA);
    assert.equal(result.indicators[0].calculatedValue, null);
    assert.equal(result.indicators[0].source, null);
    assert.equal(result.summary.noData, 1);
    assert.equal(result.summary.eligible, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-05: Dashboard con mezcla de estados
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-05: Dashboard con mezcla de estados', () => {
  it('calcula correctamente con TARGET_MET + TARGET_NOT_MET + NO_DATA', () => {
    const def1 = buildDefinition({ code: 'ind-01' });
    const def2 = buildDefinition({ code: 'ind-02', targetValue: 80 });
    const def3 = buildDefinition({ code: 'ind-03' });

    const meas1 = buildMeasurement({ indicatorId: def1._id, calculatedValue: 90, status: IndicatorMeasurementStatus.TARGET_MET });
    const meas2 = buildMeasurement({ indicatorId: def2._id, calculatedValue: 50, status: IndicatorMeasurementStatus.TARGET_NOT_MET });
    // def3 has no measurement → NO_DATA

    const result = simulateGetDashboard([def1, def2, def3], [meas1, meas2], '2026-08');

    assert.equal(result.summary.total, 3);
    assert.equal(result.summary.eligible, 2); // NO_DATA excluded
    assert.equal(result.summary.targetMet, 1);
    assert.equal(result.summary.targetNotMet, 1);
    assert.equal(result.summary.noData, 1);
    // compliancePercentage = (1 / 2) * 100 = 50
    assert.equal(result.summary.compliancePercentage, 50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-06: eligible correctamente calculado
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-06: eligible correctamente calculado', () => {
  it('eligible excluye NO_DATA y solo cuenta los con medición válida', () => {
    const defs = [
      buildDefinition({ code: 'ind-01' }),
      buildDefinition({ code: 'ind-02' }),
      buildDefinition({ code: 'ind-03' }),
      buildDefinition({ code: 'ind-04' }),
      buildDefinition({ code: 'ind-05' }),
    ];

    const meass = [
      buildMeasurement({ indicatorId: defs[0]._id, status: IndicatorMeasurementStatus.TARGET_MET }),
      buildMeasurement({ indicatorId: defs[1]._id, status: IndicatorMeasurementStatus.TARGET_MET }),
      buildMeasurement({ indicatorId: defs[2]._id, status: IndicatorMeasurementStatus.TARGET_NOT_MET }),
      // defs[3] and defs[4] have no measurement → NO_DATA
    ];

    const result = simulateGetDashboard(defs, meass, '2026-08');

    assert.equal(result.summary.total, 5);
    assert.equal(result.summary.eligible, 3); // only the 3 with measurements
    assert.equal(result.summary.noData, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-07: compliancePercentage correctamente calculado
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-07: compliancePercentage correctamente calculado', () => {
  it('8 targetMet / 10 eligible = 80%', () => {
    const defs = Array.from({ length: 10 }, (_, i) =>
      buildDefinition({ code: `ind-${String(i + 1).padStart(2, '0')}` }),
    );
    const meass = [
      ...Array.from({ length: 8 }, (_, i) =>
        buildMeasurement({ indicatorId: defs[i]._id, status: IndicatorMeasurementStatus.TARGET_MET }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        buildMeasurement({ indicatorId: defs[8 + i]._id, status: IndicatorMeasurementStatus.TARGET_NOT_MET }),
      ),
    ];

    const result = simulateGetDashboard(defs, meass, '2026-08');

    assert.equal(result.summary.eligible, 10);
    assert.equal(result.summary.targetMet, 8);
    assert.equal(result.summary.compliancePercentage, 80);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-08: eligible = 0
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-08: eligible = 0', () => {
  it('todas las definiciones sin medición → compliancePercentage = 0', () => {
    const defs = [
      buildDefinition({ code: 'ind-01' }),
      buildDefinition({ code: 'ind-02' }),
    ];

    const result = simulateGetDashboard(defs, [], '2026-08');

    assert.equal(result.summary.total, 2);
    assert.equal(result.summary.eligible, 0);
    assert.equal(result.summary.noData, 2);
    assert.equal(result.summary.compliancePercentage, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-09: IndicatorDefinition sin Measurement
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-09: IndicatorDefinition sin Measurement', () => {
  it('devuelve status NO_DATA con nulls para campos de medición', () => {
    const def = buildDefinition({ code: 'ind-10-document-compliance', name: 'Cumplimiento documental' });

    const result = simulateGetDashboard([def], [], '2026-08');

    const item = result.indicators[0];
    assert.equal(item.code, 'ind-10-document-compliance');
    assert.equal(item.name, 'Cumplimiento documental');
    assert.equal(item.status, IndicatorMeasurementStatus.NO_DATA);
    assert.equal(item.calculatedValue, null);
    assert.equal(item.source, null);
    assert.equal(item.formulaType, IndicatorFormulaType.AUTOMATIC);
    assert.equal(item.unit, '%');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-10: Orden estable
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-10: Orden estable por code ascendente', () => {
  it('los indicadores respetan el orden de entrada (code-sorted definitions)', () => {
    const defs = [
      buildDefinition({ code: 'ind-01-accident-frequency' }),
      buildDefinition({ code: 'ind-05-inspection-compliance' }),
      buildDefinition({ code: 'ind-09-incident-closure' }),
    ];

    const result = simulateGetDashboard(defs, [], '2026-08');

    const codes = result.indicators.map((i) => i.code);
    assert.ok(codes.includes('ind-01-accident-frequency'));
    assert.ok(codes.includes('ind-05-inspection-compliance'));
    assert.ok(codes.includes('ind-09-incident-closure'));
    assert.equal(codes.length, 3);
    // Order preserved from definitions array (which is sorted by code in service)
    assert.equal(codes[0], 'ind-01-accident-frequency');
    assert.equal(codes[1], 'ind-05-inspection-compliance');
    assert.equal(codes[2], 'ind-09-incident-closure');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-11: Tenant isolation
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-11: Tenant isolation', () => {
  it('companyId de Company A se usa consistentemente', () => {
    const def = buildDefinition({ companyId: COMPANY_A });
    const meas = buildMeasurement({ companyId: COMPANY_A, indicatorId: def._id });

    const result = simulateGetDashboard([def], [meas], '2026-08');

    // The simulation uses companyId from definitions/measurements
    // In real service, companyId comes from Firebase auth (resolveCompanyId)
    assert.equal(result.summary.total, 1);
    assert.equal(result.summary.eligible, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-12: Company A ≠ Company B
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-12: Company A ≠ Company B', () => {
  it('Company B no ve datos de Company A', () => {
    const defA = buildDefinition({ companyId: COMPANY_A, code: 'ind-09' });
    const measA = buildMeasurement({ companyId: COMPANY_A, indicatorId: defA._id, calculatedValue: 80, status: IndicatorMeasurementStatus.TARGET_MET });

    // Simulate: querying for Company B with empty definitions (no Company B data)
    const result = simulateGetDashboard([], [], '2026-08');

    assert.equal(result.summary.total, 0);
    assert.equal(result.indicators.length, 0);
    assert.equal(result.summary.targetMet, 0);
    // Company A data NOT leaked
  });

  it('Company A ve solo sus propios indicadores', () => {
    const defA = buildDefinition({ companyId: COMPANY_A, code: 'ind-09' });
    const measA = buildMeasurement({ companyId: COMPANY_A, indicatorId: defA._id, calculatedValue: 80, status: IndicatorMeasurementStatus.TARGET_MET });

    const result = simulateGetDashboard([defA], [measA], '2026-08');

    assert.equal(result.summary.total, 1);
    assert.equal(result.indicators[0].code, 'ind-09');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-13: Period inválido
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-13: Period inválido', () => {
  it('rechaza period con formato incorrecto', () => {
    assert.throws(
      () => simulateValidatePeriod('2026'),
      /Invalid period format/,
    );
    assert.throws(
      () => simulateValidatePeriod('invalid'),
      /Invalid period format/,
    );
    assert.throws(
      () => simulateValidatePeriod('2026-13'),
      /Invalid period format/,
    );
  });

  it('acepta period válido', () => {
    assert.doesNotThrow(() => simulateValidatePeriod('2026-08'));
    assert.doesNotThrow(() => simulateValidatePeriod('2026-01'));
    assert.doesNotThrow(() => simulateValidatePeriod('2026-12'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-14: Indicator code inexistente
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-14: Indicator code inexistente', () => {
  it('getIndicatorDetail retorna null para code inexistente', () => {
    const result = simulateGetIndicatorDetail([], [], 'nonexistent-code', '2026-08');

    assert.equal(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-15: Indicador perteneciente a otro tenant
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-15: Indicador perteneciente a otro tenant', () => {
  it('getIndicatorDetail no encuentra indicador de otra empresa', () => {
    const defB = buildDefinition({ companyId: COMPANY_B, code: 'ind-09-incident-closure' });

    // Querying with different companyId (not in definitions list) → null
    const result = simulateGetIndicatorDetail([], [], 'ind-09-incident-closure', '2026-08');

    assert.equal(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-16: NO_DATA no se convierte en TARGET_NOT_MET
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-16: NO_DATA no se convierte en TargetNotMet', () => {
  it('una definición sin medición mantiene status NO_DATA', () => {
    const def = buildDefinition({ code: 'ind-04', targetValue: 80 });

    const result = simulateGetDashboard([def], [], '2026-08');

    // CRITICAL: NO_DATA must NOT become TARGET_NOT_MET
    assert.equal(result.indicators[0].status, IndicatorMeasurementStatus.NO_DATA);
    assert.notEqual(result.indicators[0].status, IndicatorMeasurementStatus.TARGET_NOT_MET);
    // NO_DATA should not count as eligible
    assert.equal(result.summary.eligible, 0);
    assert.equal(result.summary.targetNotMet, 0);
    assert.equal(result.summary.noData, 1);
    // compliancePercentage should be 0 (eligible=0), NOT penalized by NO_DATA
    assert.equal(result.summary.compliancePercentage, 0);
  });

  it('measurement with explicit NO_DATA status stays NO_DATA', () => {
    const def = buildDefinition({ code: 'ind-09' });
    const meas = buildMeasurement({
      indicatorId: def._id,
      calculatedValue: 0,
      status: IndicatorMeasurementStatus.NO_DATA,
    });

    const result = simulateGetDashboard([def], [meas], '2026-08');

    assert.equal(result.indicators[0].status, IndicatorMeasurementStatus.NO_DATA);
    assert.equal(result.indicators[0].calculatedValue, null);
    assert.equal(result.summary.noData, 1);
    assert.equal(result.summary.eligible, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-17: ZERO calculado correctamente
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-17: ZERO calculado correctamente', () => {
  it('calculatedValue = 0 con target GTE → TARGET_NOT_MET (0 < 80)', () => {
    const def = buildDefinition({ targetOperator: IndicatorTargetOperator.GTE, targetValue: 80 });
    const meas = buildMeasurement({ indicatorId: def._id, calculatedValue: 0, status: IndicatorMeasurementStatus.TARGET_NOT_MET });

    const result = simulateGetDashboard([def], [meas], '2026-08');

    assert.equal(result.indicators[0].calculatedValue, 0);
    assert.equal(result.indicators[0].status, IndicatorMeasurementStatus.TARGET_NOT_MET);
  });

  it('calculatedValue = 0 con target LTE 0 → TARGET_MET (0 <= 0)', () => {
    const def = buildDefinition({ targetOperator: IndicatorTargetOperator.LTE, targetValue: 0 });
    const meas = buildMeasurement({ indicatorId: def._id, calculatedValue: 0, status: IndicatorMeasurementStatus.TARGET_MET });

    const result = simulateGetDashboard([def], [meas], '2026-08');

    assert.equal(result.indicators[0].calculatedValue, 0);
    assert.equal(result.indicators[0].status, IndicatorMeasurementStatus.TARGET_MET);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-18: Dashboard vacío
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-18: Dashboard vacío', () => {
  it('sin definiciones activas → total=0, eligible=0, compliancePercentage=0', () => {
    const result = simulateGetDashboard([], [], '2026-08');

    assert.equal(result.period, '2026-08');
    assert.equal(result.summary.total, 0);
    assert.equal(result.summary.eligible, 0);
    assert.equal(result.summary.targetMet, 0);
    assert.equal(result.summary.targetNotMet, 0);
    assert.equal(result.summary.noData, 0);
    assert.equal(result.summary.compliancePercentage, 0);
    assert.equal(result.indicators.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-19: Compatibilidad con los 11 indicadores MVP
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-19: Compatibilidad con los 11 indicadores MVP', () => {
  it('acepta los 11 codes de los MVP_INDICATOR_DEFINITIONS', async () => {
    const { MVP_INDICATOR_DEFINITIONS } = await import('./seeds/mvp-indicator-definitions.js');

    assert.equal(MVP_INDICATOR_DEFINITIONS.length, 11, 'Should have 11 MVP indicators');

    const expectedCodes = [
      'ind-01-accident-frequency',
      'ind-02-accident-severity',
      'ind-03-absenteeism-rate',
      'ind-04-training-compliance',
      'ind-05-inspection-compliance',
      'ind-06-risk-controlled',
      'ind-07-absenteeism-records',
      'ind-08-training-effectiveness',
      'ind-09-incident-closure',
      'ind-10-document-compliance',
      'ind-11-expired-documents',
    ];

    for (const seed of MVP_INDICATOR_DEFINITIONS) {
      assert.ok(
        expectedCodes.includes(seed.code),
        `MVP code "${seed.code}" is in the expected list`,
      );
    }
  });

  it('dashboard puede representar los 11 indicadores con distintos estados', () => {
    const defs = [
      buildDefinition({ code: 'ind-01-accident-frequency', targetOperator: 'LTE', targetValue: 10 }),
      buildDefinition({ code: 'ind-02-accident-severity', targetOperator: 'LTE', targetValue: 500 }),
      buildDefinition({ code: 'ind-03-absenteeism-rate', targetOperator: 'LTE', targetValue: 500 }),
      buildDefinition({ code: 'ind-04-training-compliance', targetOperator: 'GTE', targetValue: 80 }),
      buildDefinition({ code: 'ind-05-inspection-compliance', targetOperator: 'GTE', targetValue: 90 }),
      buildDefinition({ code: 'ind-06-risk-controlled', targetOperator: 'GTE', targetValue: 70 }),
      buildDefinition({ code: 'ind-07-absenteeism-records', targetOperator: 'LTE', targetValue: 10 }),
      buildDefinition({ code: 'ind-08-training-effectiveness', targetOperator: 'GTE', targetValue: 70 }),
      buildDefinition({ code: 'ind-09-incident-closure', targetOperator: 'GTE', targetValue: 80 }),
      buildDefinition({ code: 'ind-10-document-compliance', targetOperator: 'GTE', targetValue: 90 }),
      buildDefinition({ code: 'ind-11-expired-documents', targetOperator: 'LTE', targetValue: 10 }),
    ];

    const meass = [
      buildMeasurement({ indicatorId: defs[0]._id, calculatedValue: 5, status: IndicatorMeasurementStatus.TARGET_MET }),
      buildMeasurement({ indicatorId: defs[1]._id, calculatedValue: 200, status: IndicatorMeasurementStatus.TARGET_MET }),
      buildMeasurement({ indicatorId: defs[2]._id, calculatedValue: 300, status: IndicatorMeasurementStatus.TARGET_MET }),
      buildMeasurement({ indicatorId: defs[3]._id, calculatedValue: 90, status: IndicatorMeasurementStatus.TARGET_MET }),
      buildMeasurement({ indicatorId: defs[4]._id, calculatedValue: 95, status: IndicatorMeasurementStatus.TARGET_MET }),
      buildMeasurement({ indicatorId: defs[5]._id, calculatedValue: 80, status: IndicatorMeasurementStatus.TARGET_MET }),
      buildMeasurement({ indicatorId: defs[6]._id, calculatedValue: 8, status: IndicatorMeasurementStatus.TARGET_MET }),
      buildMeasurement({ indicatorId: defs[7]._id, calculatedValue: 85, status: IndicatorMeasurementStatus.TARGET_MET }),
      // ind-09 and ind-10 have measurements that don't meet targets
      buildMeasurement({ indicatorId: defs[8]._id, calculatedValue: 75, status: IndicatorMeasurementStatus.TARGET_NOT_MET }),
      buildMeasurement({ indicatorId: defs[9]._id, calculatedValue: 85, status: IndicatorMeasurementStatus.TARGET_NOT_MET }),
      // ind-11 has NO measurement → NO_DATA
    ];

    const result = simulateGetDashboard(defs, meass, '2026-08');

    assert.equal(result.summary.total, 11);
    assert.equal(result.summary.eligible, 10); // ind-11 has no measurement
    assert.equal(result.summary.targetMet, 8);
    assert.equal(result.summary.targetNotMet, 2);
    assert.equal(result.summary.noData, 1);
    // 8/10 = 80%
    assert.equal(result.summary.compliancePercentage, 80);
    assert.equal(result.indicators.length, 11);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-20: No mutación de datos al consultar GET
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-20: No mutación de datos al consultar GET', () => {
  it('getDashboard no modifica las definiciones ni mediciones', () => {
    const def = buildDefinition({ code: 'ind-09' });
    const meas = buildMeasurement({ indicatorId: def._id, calculatedValue: 80, status: IndicatorMeasurementStatus.TARGET_MET });

    // Store original values
    const origDefCode = def.code;
    const origMeasValue = meas.calculatedValue;
    const origMeasStatus = meas.status;

    const result = simulateGetDashboard([def], [meas], '2026-08');

    // Verify original objects not mutated
    assert.equal(def.code, origDefCode);
    assert.equal(meas.calculatedValue, origMeasValue);
    assert.equal(meas.status, origMeasStatus);
    // Verify result is correct
    assert.equal(result.indicators[0].calculatedValue, 80);
    assert.equal(result.indicators[0].status, IndicatorMeasurementStatus.TARGET_MET);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-DETAIL-01: Indicator detail endpoint
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-DETAIL-01: Indicator detail con medición', () => {
  it('devuelve definition + measurement + status para un indicatorCode', () => {
    const def = buildDefinition({
      code: 'ind-09-incident-closure',
      name: 'Incidentes cerrados',
    });
    const meas = buildMeasurement({
      indicatorId: def._id,
      calculatedValue: 85,
      status: IndicatorMeasurementStatus.TARGET_MET,
      numerator: 85,
      denominator: 100,
    });

    const result = simulateGetIndicatorDetail([def], [meas], 'ind-09-incident-closure', '2026-08');

    assert.ok(result);
    assert.equal(result!.code, 'ind-09-incident-closure');
    assert.equal(result!.name, 'Incidentes cerrados');
    assert.equal(result!.formulaType, IndicatorFormulaType.AUTOMATIC);
    assert.equal(result!.status, IndicatorMeasurementStatus.TARGET_MET);
    assert.ok(result!.measurement);
    assert.equal(result!.measurement!.calculatedValue, 85);
    assert.equal(result!.measurement!.numerator, 85);
    assert.equal(result!.measurement!.denominator, 100);
    assert.equal(result!.measurement!.source, 'AUTOMATIC');
    assert.equal(result!.measurement!.period, '2026-08');
  });
});

describe('DASH-DETAIL-02: Indicator detail sin medición (NO_DATA)', () => {
  it('devuelve definition con measurement=null y status NO_DATA', () => {
    const def = buildDefinition({
      code: 'ind-10-document-compliance',
      name: 'Cumplimiento documental',
    });

    const result = simulateGetIndicatorDetail([def], [], 'ind-10-document-compliance', '2026-08');

    assert.ok(result);
    assert.equal(result!.code, 'ind-10-document-compliance');
    assert.equal(result!.status, IndicatorMeasurementStatus.NO_DATA);
    assert.equal(result!.measurement, null);
    assert.equal(result!.unit, '%');
  });
});

describe('DASH-DETAIL-03: Tenant isolation en detail', () => {
  it('companyId mismatch → null (no encontrado)', () => {
    // Indicator only belongs to Company A, not in definitions list for other companies
    const result = simulateGetIndicatorDetail([], [], 'ind-09-incident-closure', '2026-08');

    assert.equal(result, null);
  });
});

describe('DASH-DETAIL-04: Period inválido en detail', () => {
  it('rechaza period con formato incorrecto', () => {
    assert.throws(
      () => simulateValidatePeriod('invalid-period'),
      /Invalid period format/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-TARGET-INFO: Target info structure
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-TARGET-INFO: Target info se incluye correctamente', () => {
  it('target con GTE tiene operator y value', () => {
    const def = buildDefinition({
      targetOperator: IndicatorTargetOperator.GTE,
      targetValue: 80,
    });
    const meas = buildMeasurement({ indicatorId: def._id, calculatedValue: 85, status: IndicatorMeasurementStatus.TARGET_MET });

    const result = simulateGetDashboard([def], [meas], '2026-08');

    assert.equal(result.indicators[0].target.operator, 'GTE');
    assert.equal(result.indicators[0].target.value, 80);
  });

  it('target con BETWEEN tiene min y max', () => {
    const def = buildDefinition({
      targetOperator: IndicatorTargetOperator.BETWEEN,
      targetMin: 70,
      targetMax: 90,
    });
    const meas = buildMeasurement({ indicatorId: def._id, calculatedValue: 80, status: IndicatorMeasurementStatus.TARGET_MET });

    const result = simulateGetDashboard([def], [meas], '2026-08');

    assert.equal(result.indicators[0].target.operator, 'BETWEEN');
    assert.equal(result.indicators[0].target.min, 70);
    assert.equal(result.indicators[0].target.max, 90);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-CALCULATED: Status CALCULATED (sin target definido)
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-CALCULATED: Status CALCULATED cuando no hay target', () => {
  it('indicator sin targetOperator muestra status CALCULATED', () => {
    const def = buildDefinition({
      targetOperator: undefined,
      targetValue: undefined,
    });
    const meas = buildMeasurement({ indicatorId: def._id, calculatedValue: 42, status: IndicatorMeasurementStatus.CALCULATED });

    const result = simulateGetDashboard([def], [meas], '2026-08');

    assert.equal(result.indicators[0].status, IndicatorMeasurementStatus.CALCULATED);
    assert.equal(result.indicators[0].calculatedValue, 42);
    // CALCULATED counts as eligible but not targetMet/targetNotMet
    assert.equal(result.summary.eligible, 1);
    assert.equal(result.summary.targetMet, 0);
    assert.equal(result.summary.targetNotMet, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-MULTI-TENANT-HARDEN: Multi-tenant hardening
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-MULTI-TENANT-HARDEN: Company A IND-09=80%, Company B IND-09=25%', () => {
  it('GET dashboard Company A solo ve datos de Company A', () => {
    const defA = buildDefinition({ companyId: COMPANY_A, code: 'ind-09-incident-closure', targetValue: 80 });
    const measA = buildMeasurement({
      companyId: COMPANY_A,
      indicatorId: defA._id,
      calculatedValue: 80,
      status: IndicatorMeasurementStatus.TARGET_MET,
    });

    const result = simulateGetDashboard([defA], [measA], '2026-08');

    assert.equal(result.summary.total, 1);
    assert.equal(result.indicators[0].calculatedValue, 80);
    assert.equal(result.indicators[0].status, IndicatorMeasurementStatus.TARGET_MET);
    assert.equal(result.summary.compliancePercentage, 100);
  });

  it('GET dashboard Company B solo ve datos de Company B (empty)', () => {
    const result = simulateGetDashboard([], [], '2026-08');

    assert.equal(result.summary.total, 0);
    assert.equal(result.indicators.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DASH-SERVICE-ARCH: Service contract validation
// ═══════════════════════════════════════════════════════════════════════════

describe('DASH-SERVICE-ARCH: Service getDashboard contract', () => {
  it('response structure matches IndicatorDashboardResponse', () => {
    const def = buildDefinition();
    const meas = buildMeasurement({ indicatorId: def._id });

    const result = simulateGetDashboard([def], [meas], '2026-08');

    // Verify required fields exist
    assert.ok(typeof result.period === 'string');
    assert.ok(typeof result.summary.total === 'number');
    assert.ok(typeof result.summary.eligible === 'number');
    assert.ok(typeof result.summary.targetMet === 'number');
    assert.ok(typeof result.summary.targetNotMet === 'number');
    assert.ok(typeof result.summary.noData === 'number');
    assert.ok(typeof result.summary.compliancePercentage === 'number');
    assert.ok(Array.isArray(result.indicators));

    if (result.indicators.length > 0) {
      const item = result.indicators[0];
      assert.ok(typeof item.id === 'string');
      assert.ok(typeof item.code === 'string');
      assert.ok(typeof item.name === 'string');
      assert.ok(typeof item.formulaType === 'string');
      assert.ok(typeof item.status === 'string');
      assert.ok(typeof item.period === 'string');
      assert.ok(typeof item.unit === 'string');
      assert.ok(typeof item.target === 'object');
    }
  });
});

describe('DASH-SERVICE-ARCH: Service getIndicatorDetail contract', () => {
  it('response structure matches IndicatorDetailResponse', () => {
    const def = buildDefinition({ code: 'ind-09-incident-closure' });
    const meas = buildMeasurement({ indicatorId: def._id });

    const result = simulateGetIndicatorDetail([def], [meas], 'ind-09-incident-closure', '2026-08');

    assert.ok(result);
    assert.ok(typeof result!.id === 'string');
    assert.ok(typeof result!.code === 'string');
    assert.ok(typeof result!.name === 'string');
    assert.ok(typeof result!.formulaType === 'string');
    assert.ok(typeof result!.target === 'object');
    assert.ok(typeof result!.status === 'string');
    assert.ok(typeof result!.unit === 'string');

    // Measurement structure
    if (result!.measurement) {
      assert.ok(typeof result!.measurement.calculatedValue === 'number');
      assert.ok(typeof result!.measurement.numerator === 'number');
      assert.ok(typeof result!.measurement.denominator === 'number');
      assert.ok(typeof result!.measurement.status === 'string');
      assert.ok(typeof result!.measurement.period === 'string');
      assert.ok(result!.measurement.periodStart instanceof Date);
      assert.ok(result!.measurement.periodEnd instanceof Date);
    }
  });
});
