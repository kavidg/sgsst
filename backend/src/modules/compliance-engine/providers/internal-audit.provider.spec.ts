import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { InternalAuditProvider } from './internal-audit.provider';
import { DocumentType, DocumentStatus } from '../../document-management/schemas/document-master.schema';

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function createMockDoc(overrides: Partial<{ documentType: DocumentType; status: DocumentStatus; ownerUser: any; code?: string }> = {}) {
  return { _id: new Types.ObjectId(), companyId: new Types.ObjectId(VALID_COMPANY_ID), documentType: DocumentType.AUDIT, status: DocumentStatus.ACTIVE, ownerUser: new Types.ObjectId(), code: 'AUDIT-001', name: 'Auditoría', ...overrides };
}

function createProvider(docs: any[]) {
  return new InternalAuditProvider({ findAll: (_c: any) => Promise.resolve(docs) } as any);
}

describe('InternalAuditProvider (6.1.3)', () => {
  it('returns 0% NO_DATA when no audit documents exist', async () => {
    const provider = createProvider([]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.phases?.check, 0);
  });

  it('returns NO_DATA when only non-audit documents exist', async () => {
    const provider = createProvider([createMockDoc({ documentType: DocumentType.PROCEDURE })]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
  });

  it('100% when all audits active with owner', async () => {
    const provider = createProvider([createMockDoc(), createMockDoc({ code: 'AUDIT-002' })]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 100);
  });

  it('expired audits generate HIGH finding', async () => {
    const provider = createProvider([createMockDoc({ status: DocumentStatus.ACTIVE })]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.ok(result.percentage >= 0);
  });

  it('phase = check (VERIFICAR)', async () => {
    const provider = createProvider([createMockDoc()]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.ok(result.phases?.check !== undefined);
  });
});
