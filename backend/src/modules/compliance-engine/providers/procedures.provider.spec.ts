import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { ProceduresProvider } from './procedures.provider';
import { RiskDocument } from '../../risks/schemas/risk.schema';

/**
 * Tests del ProceduresProvider — Estándar 4.2.3
 * Procedimientos e instructivos.
 */

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function createMockRisk(overrides: Partial<{
  controlMeasures: string;
  process: string;
}> = {}): Partial<RiskDocument> {
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(VALID_COMPANY_ID),
    controlMeasures: 'Procedimiento documentado para tarea crítica',
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
  return new ProceduresProvider(buildModel(records) as any);
}

describe('ProceduresProvider (4.2.3)', () => {
  describe('NO_DATA', () => {
    it('returns 0% when no risks exist', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.percentage, 0);
      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.findings.length, 1);
      assert.equal(result.findings[0].id, 'procedures-no-data');
      assert.equal(result.phases?.do, 0);
    });
  });

  describe('Tenant Isolation', () => {
    it('returns NO_DATA when model has no records', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.percentage, 0);
      assert.equal(result.status, 'NO_DATA');
    });

    it('returns data when model has records', async () => {
      const provider = createProvider([createMockRisk()]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.percentage >= 0);
      assert.notEqual(result.status, 'NO_DATA');
    });
  });

  describe('Compliance Calculation', () => {
    it('high percentage when all risks have documented procedures', async () => {
      const records = [
        createMockRisk({ controlMeasures: 'Procedimiento completo documentado con más de 20 caracteres' }),
        createMockRisk({ controlMeasures: 'Otro procedimiento completo documentado con más de 20 caracteres' }),
      ];
      const provider = createProvider(records);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.percentage > 80);
    });

    it('lower percentage when some risks lack procedures', async () => {
      const records = [
        createMockRisk({ controlMeasures: 'Procedimiento' }),
        createMockRisk({ controlMeasures: '' }),
      ];
      const provider = createProvider(records);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.percentage > 0);
      assert.ok(result.percentage < 100);
      assert.ok(result.findings.some(f => f.id === 'procedures-missing'));
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
