import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { ManagementReviewProvider } from './management-review.provider';

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function createMockMeeting(overrides: Partial<{ status: string; date: Date; participants: any[] }> = {}) {
  return { _id: new Types.ObjectId(), companyId: new Types.ObjectId(VALID_COMPANY_ID), title: 'Revisión', date: new Date(), status: 'COMPLETED', participants: [new Types.ObjectId()], ...overrides };
}

function buildModel(records: any[]) {
  return { find: (_q: any) => ({ exec: () => Promise.resolve(records) }) };
}

function createProvider(records: any[]) {
  return new ManagementReviewProvider(buildModel(records) as any);
}

describe('ManagementReviewProvider (6.1.2)', () => {
  it('returns 0% NO_DATA when no meetings exist', async () => {
    const provider = createProvider([]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.phases?.check, 0);
  });

  it('100% when all meetings completed with participants', async () => {
    const provider = createProvider([createMockMeeting(), createMockMeeting({ date: new Date() })]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 100);
  });

  it('lower percentage when meetings not completed', async () => {
    const provider = createProvider([createMockMeeting({ status: 'SCHEDULED' })]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.ok(result.percentage < 100);
  });

  it('phase = check (VERIFICAR)', async () => {
    const provider = createProvider([createMockMeeting()]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.ok(result.phases?.check !== undefined);
  });
});
