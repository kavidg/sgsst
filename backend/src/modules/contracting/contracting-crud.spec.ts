import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { Types } from 'mongoose';

/**
 * Tests para BLOQUE 6B — CRUD de Contratación (2.10.1).
 */

// ==================== MOCK HELPERS ====================

function mockQuery(result: unknown) {
  const q: any = {};
  q.sort = () => q;
  q.populate = () => q;
  q.skip = () => q;
  q.limit = () => q;
  q.exec = () => Promise.resolve(result);
  return q;
}

function mockCount(n: number) {
  return { exec: () => Promise.resolve(n) };
}

function createMockModel() {
  const m: any = {};
  m.create = (..._args: any[]) => Promise.resolve({ _id: new Types.ObjectId(), status: 'DRAFT' });
  m.find = (_q?: any) => mockQuery([]);
  m.findOne = (_q?: any) => mockQuery(null);
  m.findOneAndUpdate = (_q?: any, _u?: any, _o?: any) => mockQuery(null);
  m.findOneAndDelete = (_q?: any) => mockQuery(null);
  m.countDocuments = (_q?: any) => mockCount(0);
  return m;
}

// ==================== CONSTANTS ====================

const COMPANY_A = new Types.ObjectId('6a1efb525fff84649b532541');
const COMPANY_B = new Types.ObjectId('6b2efb525fff84649b532542');
const CONTRACTOR_ID = new Types.ObjectId('7a1efb525fff84649b532543');
const CONTRACT_ID = new Types.ObjectId('8a1efb525fff84649b532544');

const VALID_SUPPLIER = {
  _id: CONTRACTOR_ID,
  companyId: COMPANY_A,
  name: 'Proveedor Limpieza SAS',
  type: 'CONTRACTOR',
  status: 'ACTIVE',
};

const VALID_CONTRACT = {
  _id: CONTRACT_ID,
  companyId: COMPANY_A,
  contractNumber: 'CT-2026-0001',
  title: 'Contrato de servicio de limpieza',
  contractorId: CONTRACTOR_ID,
  status: 'DRAFT',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ==================== IMPORTS ====================

import { ContractingService } from './contracting.service';
import { ContractStatus } from './schemas/contract.schema';

// ==================== SERVICE CREATION ====================

function createService(overrides?: {
  supplierFindOne?: any;
  contractFindOne?: any;
  contractCreate?: any;
  contractFindOneAndUpdate?: any;
  contractFindOneAndDelete?: any;
  contractCountDocuments?: any;
}) {
  const contractModel = createMockModel();
  const supplierModel = createMockModel();

  if (overrides?.supplierFindOne) supplierModel.findOne = overrides.supplierFindOne;
  if (overrides?.contractFindOne) contractModel.findOne = overrides.contractFindOne;
  if (overrides?.contractCreate) contractModel.create = overrides.contractCreate;
  if (overrides?.contractFindOneAndUpdate) contractModel.findOneAndUpdate = overrides.contractFindOneAndUpdate;
  if (overrides?.contractFindOneAndDelete) contractModel.findOneAndDelete = overrides.contractFindOneAndDelete;
  if (overrides?.contractCountDocuments) contractModel.countDocuments = overrides.contractCountDocuments;

  const inductionModel = { find: () => ({ populate: () => ({ populate: () => ({ sort: () => ({ exec: async () => [] }) }) }), exec: async () => [] }), findOne: () => ({ populate: () => ({ populate: () => ({ exec: async () => null }) }), exec: async () => null }), findOneAndUpdate: () => ({ populate: () => ({ populate: () => ({ exec: async () => null }) }), exec: async () => null }), findOneAndDelete: () => ({ exec: async () => null }), countDocuments: () => ({ exec: async () => 0 }), create: async (data: any) => data };
  const evaluationModel = { find: () => ({ sort: () => ({ exec: async () => [] }) }), findOne: () => ({ exec: async () => null }), findOneAndUpdate: () => ({ exec: async () => null }), findOneAndDelete: () => ({ exec: async () => null }), countDocuments: () => ({ exec: async () => 0 }), distinct: () => ({ exec: async () => [] }), aggregate: () => ({ exec: async () => [] }), create: async (data: any) => data };
  return new ContractingService(contractModel, inductionModel as any, evaluationModel as any, supplierModel);
}

// ==================== CRUD TESTS ====================

describe('CRUD: ContractingService', () => {

  describe('create()', () => {
    it('CRUD-01: crear contrato con datos validos', async () => {
      const created = { ...VALID_CONTRACT };
      const svc = createService({
        supplierFindOne: () => mockQuery(VALID_SUPPLIER),
        contractFindOne: () => mockQuery(null),
        contractCreate: (..._args: any[]) => Promise.resolve(created),
      });

      const result = await svc.create(COMPANY_A, {
        contractNumber: 'CT-2026-0001',
        title: 'Contrato de servicio de limpieza',
        contractorId: CONTRACTOR_ID.toString(),
      } as any);

      assert.ok(result, 'Should return created contract');
    });

    it('CRUD-02: status es impuesto por backend = DRAFT', async () => {
      const svc = createService({
        supplierFindOne: () => mockQuery(VALID_SUPPLIER),
        contractFindOne: () => mockQuery(null),
        contractCreate: (..._args: any[]) => {
          const data = _args[0] as any;
          return Promise.resolve({ ...VALID_CONTRACT, status: data.status });
        },
      });

      const result: any = await svc.create(COMPANY_A, {
        contractNumber: 'CT-2026-0001',
        title: 'Test',
        contractorId: CONTRACTOR_ID.toString(),
      } as any);

      assert.equal(result.status, ContractStatus.DRAFT, 'Status must be DRAFT');
    });
  });

  describe('findAll()', () => {
    it('CRUD-03: listar contratos de una empresa', async () => {
      const svc = createService({
        contractFindOne: () => mockQuery(null),
      });

      const result = await svc.findAll(COMPANY_A);

      assert.ok(Array.isArray(result), 'Should return array');
    });
  });

  describe('findOne()', () => {
    it('CRUD-04: obtener contrato por ID', async () => {
      const svc = createService({
        contractFindOne: () => mockQuery(VALID_CONTRACT),
      });

      const result = await svc.findOne(COMPANY_A, CONTRACT_ID.toString());

      assert.ok(result, 'Should return contract');
    });
  });

  describe('update()', () => {
    it('CRUD-05: actualizar contrato', async () => {
      const updated = { ...VALID_CONTRACT, title: 'Updated' };
      const svc = createService({
        contractFindOne: () => mockQuery(VALID_CONTRACT),
        contractFindOneAndUpdate: () => mockQuery(updated),
      });

      const result = await svc.update(COMPANY_A, CONTRACT_ID.toString(), {
        title: 'Updated',
      } as any);

      assert.ok(result, 'Should return updated contract');
    });
  });

  describe('remove()', () => {
    it('CRUD-06: eliminar contrato', async () => {
      const svc = createService({
        contractFindOne: () => mockQuery(VALID_CONTRACT),
        contractFindOneAndDelete: () => mockQuery(VALID_CONTRACT),
      });

      const result = await svc.remove(COMPANY_A, CONTRACT_ID.toString());

      assert.ok(result, 'Should return deletion confirmation');
    });
  });

  // ==================== TENANT ISOLATION ====================

  describe('Tenant isolation', () => {
    it('TENANT-01: Company A no puede ver contrato de Company B', async () => {
      const svc = createService({
        contractFindOne: () => mockQuery(null),
      });

      await assert.rejects(
        () => svc.findOne(COMPANY_B, CONTRACT_ID.toString()),
        (err: Error) => {
          assert.ok(err.message.includes('not found'));
          return true;
        },
      );
    });

    it('TENANT-02: Company A no puede modificar contrato de Company B', async () => {
      const svc = createService({
        contractFindOne: () => mockQuery(null),
      });

      await assert.rejects(
        () => svc.update(COMPANY_B, CONTRACT_ID.toString(), { title: 'Hacked' } as any),
        (err: Error) => {
          assert.ok(err.message.includes('not found'));
          return true;
        },
      );
    });

    it('TENANT-03: Company A no puede eliminar contrato de Company B', async () => {
      const svc = createService({
        contractFindOne: () => mockQuery(null),
      });

      await assert.rejects(
        () => svc.remove(COMPANY_B, CONTRACT_ID.toString()),
        (err: Error) => {
          assert.ok(err.message.includes('not found'));
          return true;
        },
      );
    });

    it('TENANT-04: companyId siempre se pasa desde el contexto autenticado', async () => {
      let capturedCompanyId: any = null;
      const svc = createService({
        supplierFindOne: () => mockQuery(VALID_SUPPLIER),
        contractFindOne: () => mockQuery(null),
        contractCreate: (...args: any[]) => {
          capturedCompanyId = args[0].companyId;
          return Promise.resolve(VALID_CONTRACT);
        },
      });

      await svc.create(COMPANY_A, {
        contractNumber: 'CT-2026-0001',
        title: 'Test',
        contractorId: CONTRACTOR_ID.toString(),
      } as any);

      assert.equal(capturedCompanyId?.toString(), COMPANY_A.toString(), 'companyId must be COMPANY_A');
    });
  });

  // ==================== CONTRACTOR VALIDATION ====================

  describe('Contractor validation', () => {
    it('CONTRACTOR-01: acepta Supplier.CONTRACTOR de la misma empresa', async () => {
      const svc = createService({
        supplierFindOne: () => mockQuery(VALID_SUPPLIER),
        contractFindOne: () => mockQuery(null),
        contractCreate: (..._args: any[]) => Promise.resolve(VALID_CONTRACT),
      });

      const result = await svc.create(COMPANY_A, {
        contractNumber: 'CT-2026-0001',
        title: 'Test',
        contractorId: CONTRACTOR_ID.toString(),
      } as any);

      assert.ok(result, 'Should accept CONTRACTOR type supplier');
    });

    it('CONTRACTOR-02: rechaza Supplier.PROVIDER', async () => {
      const svc = createService({
        supplierFindOne: () => mockQuery({ ...VALID_SUPPLIER, type: 'PROVIDER' }),
      });

      await assert.rejects(
        () => svc.create(COMPANY_A, {
          contractNumber: 'CT-2026-0001',
          title: 'Test',
          contractorId: CONTRACTOR_ID.toString(),
        } as any),
        (err: Error) => {
          assert.ok(err.message.includes('CONTRACTOR'));
          return true;
        },
      );
    });

    it('CONTRACTOR-03: rechaza Supplier.THIRD_PARTY', async () => {
      const svc = createService({
        supplierFindOne: () => mockQuery({ ...VALID_SUPPLIER, type: 'THIRD_PARTY' }),
      });

      await assert.rejects(
        () => svc.create(COMPANY_A, {
          contractNumber: 'CT-2026-0001',
          title: 'Test',
          contractorId: CONTRACTOR_ID.toString(),
        } as any),
        (err: Error) => {
          assert.ok(err.message.includes('CONTRACTOR'));
          return true;
        },
      );
    });

    it('CONTRACTOR-04: rechaza contractor inexistente', async () => {
      const svc = createService({
        supplierFindOne: () => mockQuery(null),
      });

      await assert.rejects(
        () => svc.create(COMPANY_A, {
          contractNumber: 'CT-2026-0001',
          title: 'Test',
          contractorId: new Types.ObjectId().toString(),
        } as any),
        (err: Error) => {
          assert.ok(err.message.includes('not found'));
          return true;
        },
      );
    });

    it('CONTRACTOR-05: rechaza contractor perteneciente a otra empresa', async () => {
      // findOne filters by companyId, so searching COMPANY_A with a supplier that belongs to COMPANY_B returns null
      const svc = createService({
        supplierFindOne: () => mockQuery(null),
      });

      await assert.rejects(
        () => svc.create(COMPANY_A, {
          contractNumber: 'CT-2026-0001',
          title: 'Test',
          contractorId: new Types.ObjectId().toString(),
        } as any),
        (err: Error) => {
          assert.ok(err.message.includes('not found'));
          return true;
        },
      );
    });
  });

  // ==================== DATE VALIDATION ====================

  describe('Date validation', () => {
    it('DATE-01: acepta start sin end', async () => {
      const svc = createService({
        supplierFindOne: () => mockQuery(VALID_SUPPLIER),
        contractFindOne: () => mockQuery(null),
        contractCreate: (..._args: any[]) => Promise.resolve(VALID_CONTRACT),
      });

      const result = await svc.create(COMPANY_A, {
        contractNumber: 'CT-2026-0001',
        title: 'Test',
        contractorId: CONTRACTOR_ID.toString(),
        contractStart: '2026-01-01',
      } as any);

      assert.ok(result, 'Should accept start without end');
    });

    it('DATE-02: acepta end sin start', async () => {
      const svc = createService({
        supplierFindOne: () => mockQuery(VALID_SUPPLIER),
        contractFindOne: () => mockQuery(null),
        contractCreate: (..._args: any[]) => Promise.resolve(VALID_CONTRACT),
      });

      const result = await svc.create(COMPANY_A, {
        contractNumber: 'CT-2026-0001',
        title: 'Test',
        contractorId: CONTRACTOR_ID.toString(),
        contractEnd: '2026-12-31',
      } as any);

      assert.ok(result, 'Should accept end without start');
    });

    it('DATE-03: acepta start <= end', async () => {
      const svc = createService({
        supplierFindOne: () => mockQuery(VALID_SUPPLIER),
        contractFindOne: () => mockQuery(null),
        contractCreate: (..._args: any[]) => Promise.resolve(VALID_CONTRACT),
      });

      const result = await svc.create(COMPANY_A, {
        contractNumber: 'CT-2026-0001',
        title: 'Test',
        contractorId: CONTRACTOR_ID.toString(),
        contractStart: '2026-01-01',
        contractEnd: '2026-12-31',
      } as any);

      assert.ok(result, 'Should accept start before end');
    });

    it('DATE-04: rechaza end < start', async () => {
      const svc = createService({
        supplierFindOne: () => mockQuery(VALID_SUPPLIER),
      });

      await assert.rejects(
        () => svc.create(COMPANY_A, {
          contractNumber: 'CT-2026-0001',
          title: 'Test',
          contractorId: CONTRACTOR_ID.toString(),
          contractStart: '2026-12-31',
          contractEnd: '2026-01-01',
        } as any),
        (err: Error) => {
          assert.ok(err.message.includes('contractEnd') || err.message.includes('before'));
          return true;
        },
      );
    });
  });

  // ==================== DUPLICATE DETECTION ====================

  describe('Duplicate contract number', () => {
    it('DUPLICATE-01: mismo contractNumber dentro de empresa -> Conflict', async () => {
      const svc = createService({
        supplierFindOne: () => mockQuery(VALID_SUPPLIER),
        contractFindOne: () => mockQuery({ _id: new Types.ObjectId(), contractNumber: 'CT-2026-0001' }),
      });

      await assert.rejects(
        () => svc.create(COMPANY_A, {
          contractNumber: 'CT-2026-0001',
          title: 'Test',
          contractorId: CONTRACTOR_ID.toString(),
        } as any),
        (err: Error) => {
          assert.ok(err.message.includes('already exists'));
          return true;
        },
      );
    });

    it('DUPLICATE-02: mismo contractNumber en empresas diferentes -> permitido', async () => {
      const svc = createService({
        supplierFindOne: () => mockQuery({ ...VALID_SUPPLIER, companyId: COMPANY_B }),
        contractFindOne: () => mockQuery(null),
        contractCreate: (..._args: any[]) => Promise.resolve({ ...VALID_CONTRACT, companyId: COMPANY_B }),
      });

      const result = await svc.create(COMPANY_B, {
        contractNumber: 'CT-2026-0001',
        title: 'Test for Company B',
        contractorId: CONTRACTOR_ID.toString(),
      } as any);

      assert.ok(result, 'Should allow same number in different company');
    });
  });

  // ==================== PERMISSION PATTERNS ====================

  describe('Permission patterns (schema level)', () => {
    it('PERMISSION-01: create() acepta companyId valido', async () => {
      const svc = createService({
        supplierFindOne: () => mockQuery(VALID_SUPPLIER),
        contractFindOne: () => mockQuery(null),
        contractCreate: (..._args: any[]) => Promise.resolve(VALID_CONTRACT),
      });

      const result = await svc.create(COMPANY_A, {
        contractNumber: 'CT-2026-0001',
        title: 'Test',
        contractorId: CONTRACTOR_ID.toString(),
      } as any);

      assert.ok(result, 'Should accept valid companyId');
    });

    it('PERMISSION-02: remove() requiere contrato existente en la empresa', async () => {
      const svc = createService({
        contractFindOne: () => mockQuery(null),
      });

      await assert.rejects(
        () => svc.remove(COMPANY_A, CONTRACT_ID.toString()),
        (err: Error) => {
          assert.ok(err.message.includes('not found'));
          return true;
        },
      );
    });

    it('PERMISSION-03: update() requiere contrato existente en la empresa', async () => {
      const svc = createService({
        contractFindOne: () => mockQuery(null),
      });

      await assert.rejects(
        () => svc.update(COMPANY_A, CONTRACT_ID.toString(), { title: 'Test' } as any),
        (err: Error) => {
          assert.ok(err.message.includes('not found'));
          return true;
        },
      );
    });

    it('PERMISSION-04: findOne() requiere contrato existente en la empresa', async () => {
      const svc = createService({
        contractFindOne: () => mockQuery(null),
      });

      await assert.rejects(
        () => svc.findOne(COMPANY_A, CONTRACT_ID.toString()),
        (err: Error) => {
          assert.ok(err.message.includes('not found'));
          return true;
        },
      );
    });
  });

  // ==================== EDGE CASES ====================

  describe('Edge cases', () => {
    it('findOne con ID invalido lanza NotFoundException', async () => {
      const svc = createService();

      await assert.rejects(
        () => svc.findOne(COMPANY_A, 'invalid-id'),
        (err: Error) => {
          assert.ok(err.message.includes('not found'));
          return true;
        },
      );
    });

    it('update con ID invalido lanza NotFoundException', async () => {
      const svc = createService();

      await assert.rejects(
        () => svc.update(COMPANY_A, 'invalid-id', { title: 'Test' } as any),
        (err: Error) => {
          assert.ok(err.message.includes('not found'));
          return true;
        },
      );
    });

    it('remove con ID invalido lanza NotFoundException', async () => {
      const svc = createService();

      await assert.rejects(
        () => svc.remove(COMPANY_A, 'invalid-id'),
        (err: Error) => {
          assert.ok(err.message.includes('not found'));
          return true;
        },
      );
    });

    it('create con contractorId invalido lanza error', async () => {
      const svc = createService({
        supplierFindOne: () => mockQuery(null),
      });

      await assert.rejects(
        () => svc.create(COMPANY_A, {
          contractNumber: 'CT-2026-0001',
          title: 'Test',
          contractorId: 'not-a-valid-objectid',
        } as any),
        (err: Error) => {
          assert.ok(err.message.includes('Invalid') || err.message.includes('not found'));
          return true;
        },
      );
    });

    it('getStats retorna metricas por estado', async () => {
      const svc = createService({
        contractCountDocuments: () => mockCount(5),
      });

      const result = await svc.getStats(COMPANY_A);

      assert.ok(result, 'Should return stats');
      assert.equal(typeof result.total, 'number', 'Should have total');
    });
  });

  // ==================== ARCHITECTURAL INTEGRITY ====================

  describe('Architectural integrity', () => {
    it('ContractStatus enum no contiene estados de aprobacion', () => {
      assert.equal((ContractStatus as any)['PENDING_APPROVAL'], undefined);
      assert.equal((ContractStatus as any)['APPROVED'], undefined);
      assert.equal((ContractStatus as any)['REJECTED'], undefined);
      assert.equal((ContractStatus as any)['ADJUSTMENTS_REQUESTED'], undefined);
    });

    it('ContractStatus contiene DRAFT, ACTIVE, CLOSED, CANCELLED', () => {
      assert.equal(ContractStatus.DRAFT, 'DRAFT');
      assert.equal(ContractStatus.ACTIVE, 'ACTIVE');
      assert.equal(ContractStatus.CLOSED, 'CLOSED');
      assert.equal(ContractStatus.CANCELLED, 'CANCELLED');
    });

    it('update() no permite modificar companyId directamente', async () => {
      let capturedSet: any = null;
      const svc = createService({
        contractFindOne: () => mockQuery(VALID_CONTRACT),
        contractFindOneAndUpdate: (_q: any, update: any) => {
          capturedSet = update.$set;
          return mockQuery(VALID_CONTRACT);
        },
      });

      await svc.update(COMPANY_A, CONTRACT_ID.toString(), {
        companyId: COMPANY_B.toString(),
        title: 'Test',
      } as any);

      assert.ok(capturedSet, 'Should have called findOneAndUpdate');
      assert.equal(capturedSet.companyId, undefined, 'companyId must not be in $set');
    });

    it('update() no permite modificar status directamente', async () => {
      let capturedSet: any = null;
      const svc = createService({
        contractFindOne: () => mockQuery(VALID_CONTRACT),
        contractFindOneAndUpdate: (_q: any, update: any) => {
          capturedSet = update.$set;
          return mockQuery(VALID_CONTRACT);
        },
      });

      await svc.update(COMPANY_A, CONTRACT_ID.toString(), {
        status: 'ACTIVE',
        title: 'Test',
      } as any);

      assert.ok(capturedSet, 'Should have called findOneAndUpdate');
      assert.equal(capturedSet.status, undefined, 'status must not be in $set');
    });
  });
});
