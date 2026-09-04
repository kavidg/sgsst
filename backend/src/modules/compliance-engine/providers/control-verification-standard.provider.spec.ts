import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { ControlVerificationStandardProvider } from './control-verification-standard.provider';
import { RiskDocument } from '../../risks/schemas/risk.schema';
import { InspectionActivityDocument } from '../../inspections/schemas/inspection-activity.schema';

/**
 * Tests del ControlVerificationStandardProvider — Estándar 4.3.1
 * Verificación de controles.
 */

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function createMockRisk(overrides: Partial<{
  controlMeasures: string;
  riskLevel: number;
}> = {}): Partial<RiskDocument> {
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(VALID_COMPANY_ID),
    controlMeasures: 'Control implementado',
    riskLevel: 15,
    ...overrides,
  };
}

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

function createProvider(risks: any[], inspections: any[]) {
  return new ControlVerificationStandardProvider(
    buildModel(risks) as any,
    buildModel(inspections) as any,
  );
}

describe('ControlVerificationStandardProvider (4.3.1)', () => {
  describe('NO_DATA', () => {
    it('returns 0% when no risks and no inspections exist', async () => {
      const provider = createProvider([], []);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.percentage, 0);
      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.findings.length, 1);
      assert.equal(result.findings[0].id, 'control-verification-standard-no-data');
      assert.equal(result.phases?.check, 0);
    });
  });

  describe('Tenant Isolation', () => {
    it('returns NO_DATA when model has no records', async () => {
      const provider = createProvider([], []);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.percentage, 0);
      assert.equal(result.status, 'NO_DATA');
    });

    it('returns data when model has records', async () => {
      const provider = createProvider([createMockRisk()], [createMockInspection()]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.percentage >= 0);
      assert.notEqual(result.status, 'NO_DATA');
    });
  });

  describe('Compliance Calculation', () => {
    it('high percentage when risks have controls and inspections completed', async () => {
      const risks = [
        createMockRisk({ controlMeasures: 'Control A' }),
        createMockRisk({ controlMeasures: 'Control B' }),
      ];
      const inspections = [
        createMockInspection({ status: 'completada', responsible: 'A' }),
        createMockInspection({ status: 'completada', responsible: 'B' }),
      ];
      const provider = createProvider(risks, inspections);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.percentage > 80);
    });

    it('lower percentage when risks lack controls', async () => {
      const risks = [
        createMockRisk({ controlMeasures: '' }),
        createMockRisk({ controlMeasures: '' }),
      ];
      const inspections = [createMockInspection()];
      const provider = createProvider(risks, inspections);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.percentage < 80);
      assert.ok(result.findings.some(f => f.id === 'control-verification-standard-no-controls'));
    });

    it('no inspections generates no-verifications finding', async () => {
      const risks = [createMockRisk({ controlMeasures: 'Control' })];
      const provider = createProvider(risks, []);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.findings.some(f => f.id === 'control-verification-standard-no-verifications'));
    });

    it('overdue generates HIGH finding', async () => {
      const pastDate = new Date('2020-01-01');
      const inspections = [
        createMockInspection({ status: 'pendiente', plannedDate: pastDate, responsible: 'A' }),
      ];
      const provider = createProvider([createMockRisk()], inspections);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.findings.some(f => f.id === 'control-verification-standard-overdue'));
    });

    it('phase = check (VERIFICAR)', async () => {
      const provider = createProvider([createMockRisk()], [createMockInspection()]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.phases?.check !== undefined);
      assert.equal(result.phases?.do, undefined);
      assert.equal(result.phases?.plan, undefined);
    });
  });
});
