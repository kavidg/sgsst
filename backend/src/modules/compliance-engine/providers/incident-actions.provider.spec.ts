import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { IncidentActionsProvider } from './incident-actions.provider';

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function createMock(overrides: Partial<{ status: string; correctiveActions: any[]; rootCause: string }> = {}) {
  return { _id: new Types.ObjectId(), companyId: new Types.ObjectId(VALID_COMPANY_ID), status: 'INVESTIGATED', correctiveActions: [{ description: 'Acción' }], rootCause: 'Causa identificada', ...overrides };
}

function buildModel(records: any[]) { return { find: (_q: any) => ({ exec: () => Promise.resolve(records) }) }; }
function createProvider(records: any[]) { return new IncidentActionsProvider(buildModel(records) as any); }

describe('IncidentActionsProvider (7.1.3)', () => {
  it('returns 0% NO_DATA when no incidents', async () => {
    const r = await createProvider([]).getCompliance(VALID_COMPANY_ID);
    assert.equal(r.percentage, 0); assert.equal(r.status, 'NO_DATA'); assert.equal(r.phases?.act, 0);
  });
  it('100% when all investigated with actions and root cause', async () => {
    const r = await createProvider([createMock(), createMock()]).getCompliance(VALID_COMPANY_ID);
    assert.equal(r.percentage, 100);
  });
  it('not-investigated generates HIGH finding', async () => {
    const r = await createProvider([createMock({ status: 'OPEN' })]).getCompliance(VALID_COMPANY_ID);
    assert.ok(r.findings.some(f => f.id === 'incident-actions-not-investigated'));
  });
  it('phase = act (ACTUAR)', async () => {
    const r = await createProvider([createMock()]).getCompliance(VALID_COMPANY_ID);
    assert.ok(r.phases?.act !== undefined);
  });
});
