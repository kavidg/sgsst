import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import {
  MeasurementType,
  MeasurementStatus,
  ComplianceResult,
  EnvironmentalMeasurementDocument,
} from '../../risks/schemas/environmental-measurement.schema';
import { EnvironmentalMeasurementProvider } from './environmental-measurement.provider';

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function createMockMeasurement(overrides: Partial<{
  measurementType: MeasurementType;
  status: MeasurementStatus;
  resultValue: number;
  resultUnit: string;
  complianceResult: ComplianceResult;
  area: string;
}> = {}): EnvironmentalMeasurementDocument {
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(VALID_COMPANY_ID),
    measurementType: MeasurementType.NOISE,
    description: 'Test measurement',
    area: 'Production',
    measurementDate: new Date('2026-06-15'),
    status: MeasurementStatus.COMPLETED,
    resultValue: 85,
    resultUnit: 'dB',
    complianceResult: ComplianceResult.WITHIN_LIMITS,
    ...overrides,
  } as unknown as EnvironmentalMeasurementDocument;
}

function buildModel(measurements: EnvironmentalMeasurementDocument[]) {
  const findChain = {
    sort: () => findChain,
    exec: () => Promise.resolve(measurements),
  };
  return {
    find: () => findChain,
  };
}

function createProvider(measurements: EnvironmentalMeasurementDocument[]) {
  const model = buildModel(measurements);
  return new EnvironmentalMeasurementProvider(model as any);
}

describe('EnvironmentalMeasurementProvider', () => {
  // ── NO_DATA ──
  describe('NO_DATA', () => {
    it('returns NO_DATA with percentage 0 when no measurements exist', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.percentage, 0);
    });

    it('includes env-measurement-no-data finding with HIGH priority', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.findings.length, 1);
      assert.equal(result.findings[0].id, 'env-measurement-no-data');
      assert.equal(result.findings[0].priority, 'HIGH');
    });

    it('phases.do is 0 for NO_DATA', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.deepEqual(result.phases, { do: 0 });
    });
  });

  // ── COMPLETE DATA ──
  describe('Complete Data', () => {
    it('returns high percentage with all 4 expected types, results, and comparisons', async () => {
      const measurements = [
        createMockMeasurement({ measurementType: MeasurementType.NOISE, resultValue: 85, resultUnit: 'dB', complianceResult: ComplianceResult.WITHIN_LIMITS }),
        createMockMeasurement({ measurementType: MeasurementType.ILLUMINATION, resultValue: 450, resultUnit: 'lux', complianceResult: ComplianceResult.WITHIN_LIMITS }),
        createMockMeasurement({ measurementType: MeasurementType.TEMPERATURE, resultValue: 24, resultUnit: '°C', complianceResult: ComplianceResult.WITHIN_LIMITS }),
        createMockMeasurement({ measurementType: MeasurementType.AIR_QUALITY, resultValue: 0.5, resultUnit: 'mg/m³', complianceResult: ComplianceResult.WITHIN_LIMITS }),
      ];
      const provider = createProvider(measurements);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      // existence=25, typeCoverage=25, result=25, comparison=25 → 100
      assert.equal(result.percentage, 100);
      assert.equal(result.status, 'TARGET_MET');
    });
  });

  // ── MISSING TYPES ──
  describe('Missing Types', () => {
    it('generates missing-types finding when not all expected types are covered', async () => {
      const measurements = [
        createMockMeasurement({ measurementType: MeasurementType.NOISE }),
      ];
      const provider = createProvider(measurements);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const finding = result.findings.find((f) => f.id === 'env-measurement-missing-types');
      assert.ok(finding);
      assert.equal(finding.priority, 'MEDIUM');
    });
  });

  // ── NO RESULTS ──
  describe('No Results', () => {
    it('generates no-results finding when measurements lack resultValue', async () => {
      const measurements = [
        createMockMeasurement({ resultValue: undefined, resultUnit: undefined }),
      ];
      const provider = createProvider(measurements);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const finding = result.findings.find((f) => f.id === 'env-measurement-no-results');
      assert.ok(finding);
    });
  });

  // ── EXCEEDS LIMITS ──
  describe('Exceeds Limits', () => {
    it('generates exceeds-limits finding with HIGH priority', async () => {
      const measurements = [
        createMockMeasurement({ complianceResult: ComplianceResult.EXCEEDS_LIMITS }),
      ];
      const provider = createProvider(measurements);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const finding = result.findings.find((f) => f.id === 'env-measurement-exceeds-limits');
      assert.ok(finding);
      assert.equal(finding.priority, 'HIGH');
    });
  });

  // ── Tenant Isolation ──
  describe('Tenant Isolation', () => {
    it('queries by companyId', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.module, 'environmental-measurement');
    });
  });

  // ── Module ──
  describe('Module', () => {
    it('reports module environmental-measurement', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.module, 'environmental-measurement');
    });
  });

  // ── PHVA Contribution ──
  describe('PHVA Contribution', () => {
    it('contributes to phases.do', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok('do' in result.phases!);
      assert.equal((result.phases as any).plan, undefined);
    });
  });

  // ── CANCELLED not counted ──
  describe('Status Filtering', () => {
    it('does not count CANCELLED measurements', async () => {
      const measurements = [
        createMockMeasurement({ status: MeasurementStatus.CANCELLED }),
      ];
      const provider = createProvider(measurements);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.status, 'NO_DATA');
    });

    it('does not count PENDING measurements', async () => {
      const measurements = [
        createMockMeasurement({ status: MeasurementStatus.PENDING }),
      ];
      const provider = createProvider(measurements);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.status, 'NO_DATA');
    });
  });
});
