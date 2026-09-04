import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { CorrectivePreventiveProvider } from './corrective-preventive.provider';

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function createMock(overrides: Partial<{ status: string; dueDate: Date; responsibleUser: any }> = {}) {
  return { _id: new Types.ObjectId(), companyId: new Types.ObjectId(VALID_COMPANY_ID), title: 'Acción', status: 'IN_PROGRESS', responsibleUser: new Types.ObjectId(), ...overrides };
}

function buildModel(records: any[]) { return { find: (_q: any) => ({ exec: () => Promise.resolve(records) }) }; }
function createProvider(records: any[]) { return new CorrectivePreventiveProvider(buildModel(records) as any); }

describe('CorrectivePreventiveProvider (7.1.1)', () => {
  it('returns 0% NO_DATA when no commitments', async () => {
    const r = await createProvider([]).getCompliance(VALID_COMPANY_ID);
    assert.equal(r.percentage, 0); assert.equal(r.status, 'NO_DATA'); assert.equal(r.phases?.act, 0);
  });
  it('100% when all completed with responsible', async () => {
    const r = await createProvider([createMock({ status: 'COMPLETED' }), createMock({ status: 'CLOSED' })]).getCompliance(VALID_COMPANY_ID);
    assert.equal(r.percentage, 100);
  });
  it('overdue generates HIGH finding', async () => {
    const r = await createProvider([createMock({ dueDate: new Date('2020-01-01') })]).getCompliance(VALID_COMPANY_ID);
    assert.ok(r.findings.some(f => f.id === 'corrective-preventive-overdue'));
  });
  it('phase = act (ACTUAR)', async () => {
    const r = await createProvider([createMock()]).getCompliance(VALID_COMPANY_ID);
    assert.ok(r.phases?.act !== undefined); assert.equal(r.phases?.check, undefined);
  });
});
