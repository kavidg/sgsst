import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { ControlImplementationProvider } from './control-implementation.provider';
import { RiskDocument } from '../../risks/schemas/risk.schema';

/**
 * Tests del ControlImplementationProvider — Estándar 4.2.1
 * Implementación de medidas de control.
 */

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function createMockRisk(overrides: Partial<{
  controlMeasures: string;
  riskLevel: number;
  process: string;
}> = {}): Partial<RiskDocument> {
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(VALID_COMPANY_ID),
    controlMeasures: 'EPP obligatorio, barreras de protección',
    riskLevel: 15,
    process: 'Producción',
    ...overrides,
  };
}

function buildModel(records: any[]) {
  return {
    find: (_query: any) => ({
      exec: () => Promise.resolve(records),
    }),
  };
}

function createProvider(records: any[]) {
  return new ControlImplementationProvider(buildModel(records) as any);
}

describe('ControlImplementationProvider (4.2.1)', () => {
  describe('NO_DATA', () => {
    it('returns 0% when no risks exist', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.percentage, 0);
      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.findings.length, 1);
      assert.equal(result.findings[0].id, 'control-impl-no-data');
      assert.equal(result.phases?.do, 0);
    });
  });

  describe('Tenant Isolation', () => {
    it('returns NO_DATA when model has no records for the company', async () => {
      // The provider queries with companyId; when the model returns empty, result is 0% NO_DATA
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.percentage, 0);
      assert.equal(result.status, 'NO_DATA');
    });

    it('returns data when model has records for the company', async () => {
      const provider = createProvider([createMockRisk()]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.percentage >= 0);
      assert.notEqual(result.status, 'NO_DATA');
    });
  });

  describe('Compliance Calculation', () => {
    it('high percentage when all risks have controls', async () => {
      const records = [
        createMockRisk({ controlMeasures: 'Control A completo' }),
        createMockRisk({ controlMeasures: 'Control B completo' }),
      ];
      const provider = createProvider(records);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.percentage > 80);
      assert.equal(result.status, 'TARGET_MET');
      assert.equal(result.completed, 2);
      assert.equal(result.pending, 0);
    });

    it('lower percentage when some risks lack controls', async () => {
      const records = [
        createMockRisk({ controlMeasures: 'Control A' }),
        createMockRisk({ controlMeasures: '' }),
      ];
      const provider = createProvider(records);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.percentage > 0);
      assert.ok(result.percentage < 100);
      assert.ok(result.findings.some(f => f.id === 'control-impl-missing'));
    });

    it('high risk without controls generates HIGH finding', async () => {
      const records = [
        createMockRisk({ riskLevel: 20, controlMeasures: '' }),
      ];
      const provider = createProvider(records);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.findings.some(f => f.id === 'control-impl-high-risk'));
    });

    it('phase = do (HACER)', async () => {
      const provider = createProvider([createMockRisk()]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.phases?.do !== undefined);
      assert.equal(result.phases?.plan, undefined);
      assert.equal(result.phases?.check, undefined);
    });
  });
});
