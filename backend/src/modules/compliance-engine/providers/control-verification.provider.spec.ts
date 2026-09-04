import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { ControlVerificationProvider } from './control-verification.provider';
import { InspectionActivityDocument } from '../../inspections/schemas/inspection-activity.schema';

/**
 * Tests del ControlVerificationProvider — Estándar 4.2.2
 * Verificación de aplicación de medidas.
 */

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function createMockInspection(overrides: Partial<{
  status: string;
  plannedDate: Date;
  responsible: string;
}> = {}): Partial<InspectionActivityDocument> {
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(VALID_COMPANY_ID),
    status: 'completada',
    plannedDate: new Date(),
    responsible: 'Inspector A',
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
  return new ControlVerificationProvider(buildModel(records) as any);
}

describe('ControlVerificationProvider (4.2.2)', () => {
  describe('NO_DATA', () => {
    it('returns 0% when no inspections exist', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.percentage, 0);
      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.findings.length, 1);
      assert.equal(result.findings[0].id, 'control-verify-no-data');
      assert.equal(result.phases?.check, 0);
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
      const provider = createProvider([createMockInspection()]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.percentage >= 0);
      assert.notEqual(result.status, 'NO_DATA');
    });
  });

  describe('Compliance Calculation', () => {
    it('high percentage when all inspections completed', async () => {
      const records = [
        createMockInspection({ status: 'completada', responsible: 'A' }),
        createMockInspection({ status: 'completada', responsible: 'B' }),
      ];
      const provider = createProvider(records);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.percentage > 80);
    });

    it('overdue generates HIGH finding', async () => {
      const pastDate = new Date('2020-01-01');
      const records = [
        createMockInspection({ status: 'pendiente', plannedDate: pastDate, responsible: 'A' }),
      ];
      const provider = createProvider(records);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.findings.some(f => f.id === 'control-verify-overdue'));
    });

    it('phase = check (VERIFICAR)', async () => {
      const provider = createProvider([createMockInspection()]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.phases?.check !== undefined);
      assert.equal(result.phases?.do, undefined);
      assert.equal(result.phases?.plan, undefined);
    });

    it('no responsible generates MEDIUM finding', async () => {
      const records = [createMockInspection({ responsible: '' })];
      const provider = createProvider(records);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.findings.some(f => f.id === 'control-verify-no-responsible'));
    });
  });
});
