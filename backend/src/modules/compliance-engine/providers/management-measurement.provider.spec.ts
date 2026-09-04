import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { ManagementMeasurementProvider } from './management-measurement.provider';

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function createMockDef(overrides: Partial<{ isActive: boolean; code: string }> = {}) {
  return { _id: new Types.ObjectId(), companyId: new Types.ObjectId(VALID_COMPANY_ID), isActive: true, code: 'IND-001', ...overrides };
}

function createMockMeas(overrides: Partial<{ indicatorId: any; status: string }> = {}) {
  return { _id: new Types.ObjectId(), companyId: new Types.ObjectId(VALID_COMPANY_ID), indicatorId: new Types.ObjectId(), status: 'TARGET_MET', ...overrides };
}

function buildModels(defs: any[], meas: any[]) {
  return {
    find: (_q: any) => ({ exec: () => Promise.resolve(defs) }),
  };
}

function createProvider(defs: any[], meas: any[]) {
  return new ManagementMeasurementProvider(
    buildModels(defs, meas) as any,
    buildModels(meas, meas) as any,
  );
}

describe('ManagementMeasurementProvider (6.1.1)', () => {
  it('returns 0% NO_DATA when no indicators exist', async () => {
    const provider = createProvider([], []);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.phases?.check, 0);
  });

  it('100% when all indicators active with measurements meeting target', async () => {
    const def = createMockDef({ isActive: true });
    const meas = createMockMeas({ indicatorId: def._id, status: 'TARGET_MET' });
    const provider = createProvider([def], [meas]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 100);
  });

  it('lower percentage when some indicators inactive', async () => {
    const provider = createProvider([createMockDef({ isActive: true }), createMockDef({ isActive: false, code: 'IND-002' })], []);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.ok(result.percentage < 100);
    assert.ok(result.findings.some(f => f.id === 'management-measurement-inactive'));
  });

  it('phase = check (VERIFICAR)', async () => {
    const provider = createProvider([createMockDef()], []);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.ok(result.phases?.check !== undefined);
    assert.equal(result.phases?.do, undefined);
  });
});
