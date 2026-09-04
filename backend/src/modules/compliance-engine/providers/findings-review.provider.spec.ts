import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { FindingsReviewProvider } from './findings-review.provider';

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function createMockCommitment(overrides: Partial<{ status: string; dueDate: Date; responsibleUser: any }> = {}) {
  return { _id: new Types.ObjectId(), companyId: new Types.ObjectId(VALID_COMPANY_ID), title: 'Hallazgo', status: 'IN_PROGRESS', responsibleUser: new Types.ObjectId(), ...overrides };
}

function buildModel(records: any[]) {
  return { find: (_q: any) => ({ exec: () => Promise.resolve(records) }) };
}

function createProvider(records: any[]) {
  return new FindingsReviewProvider(buildModel(records) as any);
}

describe('FindingsReviewProvider (6.1.4)', () => {
  it('returns 0% NO_DATA when no commitments exist', async () => {
    const provider = createProvider([]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.phases?.check, 0);
  });

  it('100% when all commitments completed with responsible', async () => {
    const provider = createProvider([createMockCommitment({ status: 'COMPLETED' }), createMockCommitment({ status: 'CLOSED' })]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 100);
  });

  it('overdue generates HIGH finding', async () => {
    const provider = createProvider([createMockCommitment({ dueDate: new Date('2020-01-01') })]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.ok(result.findings.some(f => f.id === 'findings-review-overdue'));
  });

  it('OPEN status generates MEDIUM finding', async () => {
    const provider = createProvider([createMockCommitment({ status: 'OPEN' })]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.ok(result.findings.some(f => f.id === 'findings-review-pending'));
  });

  it('phase = check (VERIFICAR)', async () => {
    const provider = createProvider([createMockCommitment()]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.ok(result.phases?.check !== undefined);
  });
});
