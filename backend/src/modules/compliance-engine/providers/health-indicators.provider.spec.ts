import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { HealthIndicatorsProvider } from './health-indicators.provider';
import { IndicatorSubcategory } from '../../indicators/enums/indicator-subcategory.enum';
import { IndicatorMeasurementStatus } from '../../indicators/enums/indicator-measurement-status.enum';

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function createHealthDefinition(overrides: Record<string, any> = {}) {
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(VALID_COMPANY_ID),
    code: 'frecuencia-accidentes',
    name: 'Frecuencia de accidentes',
    subcategory: IndicatorSubcategory.HEALTH,
    isActive: true,
    frequency: 'MONTHLY',
    targetValue: 5,
    ...overrides,
  };
}

function createNonHealthDefinition() {
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(VALID_COMPANY_ID),
    code: 'cumplimiento-legal',
    name: 'Cumplimiento legal',
    subcategory: IndicatorSubcategory.COMPLIANCE,
    isActive: true,
  };
}

function createMeasurement(overrides: Record<string, any> = {}) {
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 1);
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(VALID_COMPANY_ID),
    period: '2026-01',
    status: IndicatorMeasurementStatus.TARGET_MET,
    calculatedValue: 3,
    measuredAt: threeMonthsAgo,
    ...overrides,
  };
}

function createProvider(
  definitions: any[],
  measurementMap: Record<string, any[]> = {},
) {
  return new HealthIndicatorsProvider({
    findAllDefinitions: (_c: any) => Promise.resolve(definitions),
    findMeasurements: (_c: any, indicatorId: string) =>
      Promise.resolve(measurementMap[indicatorId] ?? []),
  } as any);
}

describe('HealthIndicatorsProvider (3.3.2)', () => {
  it('returns 0% NO_DATA when no health indicators exist', async () => {
    const provider = createProvider([createNonHealthDefinition()]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.phases?.do, 0);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].id, 'health-indicators-no-data');
    assert.equal(result.findings[0].priority, 'HIGH');
  });

  it('returns 0% when definitions array is empty', async () => {
    const provider = createProvider([]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
  });

  it('returns 100% when all health indicators have measurements, recent data, and targets met', async () => {
    const def1 = createHealthDefinition({ code: 'frecuencia' });
    const def2 = createHealthDefinition({ code: 'severidad' });
    const m1 = createMeasurement({ status: IndicatorMeasurementStatus.TARGET_MET });
    const m2 = createMeasurement({ status: IndicatorMeasurementStatus.TARGET_MET });
    const provider = createProvider([def1, def2], {
      [def1._id.toString()]: [m1],
      [def2._id.toString()]: [m2],
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'TARGET_MET');
    assert.equal(result.phases?.do, 100);
  });

  it('flags indicators without measurements', async () => {
    const def1 = createHealthDefinition();
    const provider = createProvider([def1], {});
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    const finding = result.findings.find(
      (f) => f.id === 'health-indicators-no-measurements',
    );
    assert.ok(finding, 'should flag no-measurements');
    assert.equal(finding!.priority, 'HIGH');
  });

  it('flags stale measurements (older than 3 months)', async () => {
    const def1 = createHealthDefinition();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const oldMeasurement = createMeasurement({
      measuredAt: sixMonthsAgo,
      status: IndicatorMeasurementStatus.CALCULATED,
    });
    const provider = createProvider([def1], {
      [def1._id.toString()]: [oldMeasurement],
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    const finding = result.findings.find(
      (f) => f.id === 'health-indicators-outdated',
    );
    assert.ok(finding, 'should flag outdated measurements');
    assert.equal(finding!.priority, 'MEDIUM');
  });

  it('flags targets not met', async () => {
    const def1 = createHealthDefinition();
    const m1 = createMeasurement({
      status: IndicatorMeasurementStatus.TARGET_NOT_MET,
    });
    const provider = createProvider([def1], {
      [def1._id.toString()]: [m1],
    });
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    const finding = result.findings.find(
      (f) => f.id === 'health-indicators-below-target',
    );
    assert.ok(finding, 'should flag below-target');
    assert.equal(finding!.priority, 'MEDIUM');
  });

  it('isolation: only queries data for the given companyId', async () => {
    let queriedCompanyId: any = null;
    const fakeService = {
      findAllDefinitions: (c: any) => {
        queriedCompanyId = c;
        return Promise.resolve([]);
      },
      findMeasurements: () => Promise.resolve([]),
    };
    const provider = new HealthIndicatorsProvider(fakeService as any);
    await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(queriedCompanyId.toString(), VALID_COMPANY_ID);
  });

  it('ignores non-health indicators', async () => {
    const provider = createProvider([
      createNonHealthDefinition(),
      createNonHealthDefinition(),
    ]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
  });
});
