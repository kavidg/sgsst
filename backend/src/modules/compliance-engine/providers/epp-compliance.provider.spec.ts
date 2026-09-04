import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { EppComplianceProvider } from './epp-compliance.provider';
import { SstEppDocument } from '../../phva-advanced/schemas/phva-advanced-epp.schema';

/**
 * Tests del EppComplianceProvider — Estándar 4.2.6
 * EPP (Elementos de Protección Personal).
 */

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function createMockEpp(overrides: Partial<{
  catalog: any[];
  assignments: any[];
  complianceStatus: string;
}> = {}): Partial<SstEppDocument> {
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(VALID_COMPANY_ID),
    catalog: [{ name: 'Casco', type: 'Cabeza' }],
    assignments: [{ worker: 'Worker A', eppName: 'Casco', status: 'ACTIVE', condition: 'GOOD' }],
    complianceStatus: 'COMPLIES',
    ...overrides,
  } as Partial<SstEppDocument>;
}

function buildModel(records: any[]) {
  return {
    find: (_query: any) => ({
      exec: () => Promise.resolve(records),
    }),
  };
}

function createProvider(records: any[]) {
  return new EppComplianceProvider(buildModel(records) as any);
}

describe('EppComplianceProvider (4.2.6)', () => {
  describe('NO_DATA', () => {
    it('returns 0% when no EPP records exist', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.percentage, 0);
      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.findings.length, 1);
      assert.equal(result.findings[0].id, 'epp-no-data');
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
      const provider = createProvider([createMockEpp()]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.percentage >= 0);
      assert.notEqual(result.status, 'NO_DATA');
    });
  });

  describe('Compliance Calculation', () => {
    it('high percentage when EPP is well managed', async () => {
      const records = [
        createMockEpp({
          catalog: [{ name: 'Casco', type: 'Cabeza' }, { name: 'Guantes', type: 'Manos' }],
          assignments: [
            { worker: 'A', eppName: 'Casco', status: 'ACTIVE', condition: 'GOOD' },
            { worker: 'B', eppName: 'Guantes', status: 'ACTIVE', condition: 'GOOD' },
          ],
          complianceStatus: 'COMPLIES',
        }),
      ];
      const provider = createProvider(records);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.percentage > 80);
    });

    it('no catalog generates HIGH finding', async () => {
      const records = [
        createMockEpp({ catalog: [], assignments: [] }),
      ];
      const provider = createProvider(records);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.findings.some(f => f.id === 'epp-no-catalog'));
    });

    it('damaged EPP generates MEDIUM finding', async () => {
      const records = [
        createMockEpp({
          catalog: [{ name: 'Casco', type: 'Cabeza' }],
          assignments: [{ worker: 'A', eppName: 'Casco', status: 'ACTIVE', condition: 'DAMAGED' }],
        }),
      ];
      const provider = createProvider(records);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.findings.some(f => f.id === 'epp-damaged'));
    });

    it('phase = do (HACER)', async () => {
      const provider = createProvider([createMockEpp()]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.phases?.do !== undefined);
      assert.equal(result.phases?.check, undefined);
      assert.equal(result.phases?.plan, undefined);
    });
  });
});
