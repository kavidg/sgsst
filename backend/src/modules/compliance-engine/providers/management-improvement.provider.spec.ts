import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { ManagementImprovementProvider } from './management-improvement.provider';

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function createMock(overrides: Partial<{ status: string; date: Date; participants: any[] }> = {}) {
  return { _id: new Types.ObjectId(), companyId: new Types.ObjectId(VALID_COMPANY_ID), title: 'Reunión', date: new Date(), status: 'COMPLETED', participants: [new Types.ObjectId()], ...overrides };
}

function buildModel(records: any[]) { return { find: (_q: any) => ({ exec: () => Promise.resolve(records) }) }; }
function createProvider(records: any[]) { return new ManagementImprovementProvider(buildModel(records) as any); }

describe('ManagementImprovementProvider (7.1.2)', () => {
  it('returns 0% NO_DATA when no meetings', async () => {
    const r = await createProvider([]).getCompliance(VALID_COMPANY_ID);
    assert.equal(r.percentage, 0); assert.equal(r.status, 'NO_DATA'); assert.equal(r.phases?.act, 0);
  });
  it('100% when all completed with participants', async () => {
    const r = await createProvider([createMock(), createMock()]).getCompliance(VALID_COMPANY_ID);
    assert.equal(r.percentage, 100);
  });
  it('phase = act (ACTUAR)', async () => {
    const r = await createProvider([createMock()]).getCompliance(VALID_COMPANY_ID);
    assert.ok(r.phases?.act !== undefined);
  });
});
