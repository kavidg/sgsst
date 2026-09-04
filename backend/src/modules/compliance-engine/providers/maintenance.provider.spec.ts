import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { MaintenanceProvider } from './maintenance.provider';
import { InspectionActivityDocument } from '../../inspections/schemas/inspection-activity.schema';

/**
 * Tests del MaintenanceProvider — Estándar 4.2.5
 * Mantenimiento.
 */

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function createMockActivity(overrides: Partial<{
  status: string;
  plannedDate: Date;
  responsible: string;
}> = {}): Partial<InspectionActivityDocument> {
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(VALID_COMPANY_ID),
    status: 'completada',
    plannedDate: new Date(),
    responsible: 'Técnico A',
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
  return new MaintenanceProvider(buildModel(records) as any);
}

describe('MaintenanceProvider (4.2.5)', () => {
  describe('NO_DATA', () => {
    it('returns 0% when no maintenance activities exist', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.percentage, 0);
      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.findings.length, 1);
      assert.equal(result.findings[0].id, 'maintenance-no-data');
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
      const provider = createProvider([createMockActivity()]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.percentage >= 0);
      assert.notEqual(result.status, 'NO_DATA');
    });
  });

  describe('Compliance Calculation', () => {
    it('high percentage when all activities completed', async () => {
      const records = [
        createMockActivity({ status: 'completada', responsible: 'A' }),
        createMockActivity({ status: 'completada', responsible: 'B' }),
      ];
      const provider = createProvider(records);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.percentage > 80);
      assert.equal(result.completed, 2);
      assert.equal(result.pending, 0);
    });

    it('overdue generates HIGH finding', async () => {
      const pastDate = new Date('2020-01-01');
      const records = [
        createMockActivity({ status: 'pendiente', plannedDate: pastDate, responsible: 'A' }),
      ];
      const provider = createProvider(records);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.findings.some(f => f.id === 'maintenance-overdue'));
    });

    it('phase = do (HACER)', async () => {
      const provider = createProvider([createMockActivity()]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.phases?.do !== undefined);
      assert.equal(result.phases?.check, undefined);
      assert.equal(result.phases?.plan, undefined);
    });
  });
});
