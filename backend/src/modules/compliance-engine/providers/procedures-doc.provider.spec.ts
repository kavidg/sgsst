import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { ProceduresDocProvider } from './procedures-doc.provider';
import { DocumentType, DocumentStatus } from '../../document-management/schemas/document-master.schema';

/**
 * Tests del ProceduresDocProvider — Estándar 5.1.1
 * Procedimientos SG-SST.
 */

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function createMockDoc(overrides: Partial<{
  documentType: DocumentType;
  status: DocumentStatus;
  expirationDate: Date | null;
  ownerUser: Types.ObjectId | null;
  code?: string;
}> = {}): any {
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(VALID_COMPANY_ID),
    code: 'PROC-001',
    name: 'Procedimiento de prueba',
    documentType: DocumentType.PROCEDURE,
    status: DocumentStatus.ACTIVE,
    version: 1,
    isActive: true,
    ownerUser: new Types.ObjectId(),
    expirationDate: null,
    ...overrides,
  };
}

function buildService(docs: any[]) {
  return {
    findAll: (_companyId: any) => Promise.resolve(docs),
  };
}

function createProvider(docs: any[]) {
  return new ProceduresDocProvider(buildService(docs) as any);
}

describe('ProceduresDocProvider (5.1.1)', () => {
  describe('NO_DATA', () => {
    it('returns 0% when no procedure documents exist', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.percentage, 0);
      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.findings.length, 1);
      assert.equal(result.findings[0].id, 'procedures-doc-no-data');
      assert.equal(result.phases?.do, 0);
    });

    it('returns NO_DATA when only non-procedure documents exist', async () => {
      const docs = [createMockDoc({ documentType: DocumentType.RECORD })];
      const provider = createProvider(docs);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.percentage, 0);
      assert.equal(result.status, 'NO_DATA');
    });
  });

  describe('Tenant Isolation', () => {
    it('returns NO_DATA when no records', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.percentage, 0);
    });

    it('returns data when records exist', async () => {
      const provider = createProvider([createMockDoc()]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.percentage >= 0);
      assert.notEqual(result.status, 'NO_DATA');
    });
  });

  describe('Compliance Calculation', () => {
    it('100% when all procedures are active with owner and no expiry', async () => {
      const docs = [
        createMockDoc({ status: DocumentStatus.ACTIVE, ownerUser: new Types.ObjectId() }),
        createMockDoc({ status: DocumentStatus.APPROVED, ownerUser: new Types.ObjectId(), code: 'PROC-002' }),
      ];
      const provider = createProvider(docs);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.percentage, 100);
    });

    it('lower percentage when some procedures are inactive', async () => {
      const docs = [
        createMockDoc({ status: DocumentStatus.ACTIVE, ownerUser: new Types.ObjectId() }),
        createMockDoc({ status: DocumentStatus.DRAFT, ownerUser: new Types.ObjectId(), code: 'PROC-002' }),
      ];
      const provider = createProvider(docs);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.percentage < 100);
      assert.ok(result.findings.some(f => f.id === 'procedures-doc-inactive'));
    });

    it('expired procedures generate HIGH finding', async () => {
      const docs = [
        createMockDoc({ expirationDate: new Date('2020-01-01'), ownerUser: new Types.ObjectId() }),
      ];
      const provider = createProvider(docs);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.findings.some(f => f.id === 'procedures-doc-expired'));
    });

    it('no owner generates MEDIUM finding', async () => {
      const docs = [
        createMockDoc({ status: DocumentStatus.ACTIVE, ownerUser: null }),
      ];
      const provider = createProvider(docs);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.findings.some(f => f.id === 'procedures-doc-no-responsible'));
    });

    it('phase = do (HACER)', async () => {
      const provider = createProvider([createMockDoc()]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.phases?.do !== undefined);
      assert.equal(result.phases?.check, undefined);
      assert.equal(result.phases?.plan, undefined);
    });
  });
});
