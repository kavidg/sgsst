import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { ImprovementPlanProvider } from './improvement-plan.provider';

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function createMock(overrides: Partial<{ status: string; progress: number; responsibleUser: any }> = {}) {
  return { _id: new Types.ObjectId(), companyId: new Types.ObjectId(VALID_COMPANY_ID), title: 'Programa', status: 'ACTIVE', progress: 50, responsibleUser: new Types.ObjectId(), ...overrides };
}

function buildModel(records: any[]) { return { find: (_q: any) => ({ exec: () => Promise.resolve(records) }) }; }
function createProvider(records: any[]) { return new ImprovementPlanProvider(buildModel(records) as any); }

describe('ImprovementPlanProvider (7.1.4)', () => {
  it('returns 0% NO_DATA when no programs', async () => {
    const r = await createProvider([]).getCompliance(VALID_COMPANY_ID);
    assert.equal(r.percentage, 0); assert.equal(r.status, 'NO_DATA'); assert.equal(r.phases?.act, 0);
  });
  it('100% when all active with progress and responsible', async () => {
    const r = await createProvider([createMock(), createMock({ progress: 80 })]).getCompliance(VALID_COMPANY_ID);
    assert.equal(r.percentage, 100);
  });
  it('inactive generates MEDIUM finding', async () => {
    const r = await createProvider([createMock({ status: 'COMPLETED' })]).getCompliance(VALID_COMPANY_ID);
    assert.ok(r.findings.some(f => f.id === 'improvement-plan-inactive'));
  });
  it('phase = act (ACTUAR)', async () => {
    const r = await createProvider([createMock()]).getCompliance(VALID_COMPANY_ID);
    assert.ok(r.phases?.act !== undefined);
  });
});
