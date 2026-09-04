import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';
import { ContractingService } from './contracting.service.js';
import { InductionStatus } from './schemas/contract-induction.schema.js';
import { ContractStatus } from './schemas/contract.schema.js';
import { SupplierType } from '../acquisitions/schemas/supplier.schema.js';

const COMPANY_A = new Types.ObjectId('64b000000000000000000001');
const COMPANY_B = new Types.ObjectId('64b000000000000000000002');
const USER_ID = new Types.ObjectId('64b000000000000000000010');
const CONTRACT_ID = new Types.ObjectId('64b000000000000000000020');
const CONTRACTOR_ID = new Types.ObjectId('64b000000000000000000030');
const INDUCTION_ID = new Types.ObjectId('64b000000000000000000040');

function createMockQuery(result: unknown) {
  return {
    exec: async () => result,
    populate: function () { return this; },
    sort: function () { return this; },
    lean: function () { return this; },
  };
}

function buildService(overrides?: {
  contract?: Record<string, unknown> | null;
  supplier?: Record<string, unknown> | null;
  induction?: Record<string, unknown> | null;
  inductions?: unknown[];
  inductionCount?: number;
  contractCount?: number;
  inductionCreate?: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
}) {
  const contractModel: Record<string, unknown> = {
    findOne: () => createMockQuery(overrides?.contract ?? null),
    countDocuments: () => createMockQuery(overrides?.contractCount ?? 0),
    create: async (data: Record<string, unknown>) => data,
    findOneAndUpdate: () => createMockQuery(overrides?.contract ?? null),
    findOneAndDelete: () => createMockQuery(null),
  };

  const inductionModel: Record<string, unknown> = {
    find: () => ({
      populate: () => ({
        populate: () => ({
          sort: () => ({
            exec: async () => overrides?.inductions ?? [],
          }),
        }),
      }),
      exec: async () => overrides?.inductions ?? [],
    }),
    findOne: () => ({
      populate: () => ({
        populate: () => ({
          exec: async () => overrides?.induction ?? null,
        }),
      }),
      exec: async () => overrides?.induction ?? null,
    }),
    findOneAndUpdate: () => ({
      populate: () => ({
        populate: () => ({
          exec: async () => overrides?.induction ?? null,
        }),
      }),
      exec: async () => overrides?.induction ?? null,
    }),
    findOneAndDelete: () => createMockQuery(null),
    countDocuments: () => createMockQuery(overrides?.inductionCount ?? 0),
    create: overrides?.inductionCreate ?? (async (data: Record<string, unknown>) => data),
  };

  const supplierModel: Record<string, unknown> = {
    findOne: () => createMockQuery(overrides?.supplier ?? null),
  };

  const evaluationModel = { find: () => createMockQuery([]), findOne: () => createMockQuery(null), findOneAndUpdate: () => createMockQuery(null), findOneAndDelete: () => createMockQuery(null), countDocuments: () => createMockQuery(0), distinct: () => createMockQuery([]), aggregate: () => createMockQuery([]), create: async (data: any) => data };

  return new ContractingService(
    contractModel as never,
    inductionModel as never,
    evaluationModel as never,
    supplierModel as never,
  );
}

function validContract(overrides?: Record<string, unknown>) {
  return {
    _id: CONTRACT_ID,
    companyId: COMPANY_A,
    contractNumber: 'CT-001',
    title: 'Test Contract',
    contractorId: CONTRACTOR_ID,
    status: ContractStatus.ACTIVE,
    ...overrides,
  };
}

function validSupplier(overrides?: Record<string, unknown>) {
  return {
    _id: CONTRACTOR_ID,
    companyId: COMPANY_A,
    name: 'Constructora ABC',
    type: SupplierType.CONTRACTOR,
    status: 'ACTIVE',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INDUCTION-01: Contract inexistente
// ═══════════════════════════════════════════════════════════════════════════

describe('INDUCTION-01: Contract inexistente', () => {
  it('lanza NotFoundException cuando el contrato no existe', async () => {
    const service = buildService({ contract: null });

    await assert.rejects(
      () => service.createInduction(COMPANY_A, {
        contractId: CONTRACT_ID.toString(),
        contractorId: CONTRACTOR_ID.toString(),
        workerName: 'Juan Pérez',
      } as never, USER_ID),
      (err: Error) => {
        assert.ok(err.message.includes('not found'));
        return true;
      },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDUCTION-02: Contract CLOSED
// ═══════════════════════════════════════════════════════════════════════════

describe('INDUCTION-02: Contract CLOSED', () => {
  it('lanza BadRequestException para contrato cerrado', async () => {
    const service = buildService({
      contract: validContract({ status: ContractStatus.CLOSED }),
    });

    await assert.rejects(
      () => service.createInduction(COMPANY_A, {
        contractId: CONTRACT_ID.toString(),
        contractorId: CONTRACTOR_ID.toString(),
        workerName: 'Juan Pérez',
      } as never, USER_ID),
      (err: Error) => {
        assert.ok(err.message.includes('closed'));
        return true;
      },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDUCTION-03: Contract CANCELLED
// ═══════════════════════════════════════════════════════════════════════════

describe('INDUCTION-03: Contract CANCELLED', () => {
  it('lanza BadRequestException para contrato cancelado', async () => {
    const service = buildService({
      contract: validContract({ status: ContractStatus.CANCELLED }),
    });

    await assert.rejects(
      () => service.createInduction(COMPANY_A, {
        contractId: CONTRACT_ID.toString(),
        contractorId: CONTRACTOR_ID.toString(),
        workerName: 'Juan Pérez',
      } as never, USER_ID),
      (err: Error) => {
        assert.ok(err.message.includes('cancelled'));
        return true;
      },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDUCTION-04: Contractor no existe
// ═══════════════════════════════════════════════════════════════════════════

describe('INDUCTION-04: Contractor no existe', () => {
  it('lanza NotFoundException cuando el contractor no existe', async () => {
    const service = buildService({
      contract: validContract(),
      supplier: null,
    });

    await assert.rejects(
      () => service.createInduction(COMPANY_A, {
        contractId: CONTRACT_ID.toString(),
        contractorId: CONTRACTOR_ID.toString(),
        workerName: 'Juan Pérez',
      } as never, USER_ID),
      (err: Error) => {
        assert.ok(err.message.includes('not found'));
        return true;
      },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDUCTION-05: Supplier no es CONTRACTOR
// ═══════════════════════════════════════════════════════════════════════════

describe('INDUCTION-05: Supplier no es CONTRACTOR', () => {
  it('lanza BadRequestException cuando el supplier no es CONTRACTOR', async () => {
    const service = buildService({
      contract: validContract(),
      supplier: validSupplier({ type: 'PROVIDER' }),
    });

    await assert.rejects(
      () => service.createInduction(COMPANY_A, {
        contractId: CONTRACT_ID.toString(),
        contractorId: CONTRACTOR_ID.toString(),
        workerName: 'Juan Pérez',
      } as never, USER_ID),
      (err: Error) => {
        assert.ok(err.message.includes('CONTRACTOR'));
        return true;
      },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDUCTION-06: Contractor no coincide con Contract.contractorId
// ═══════════════════════════════════════════════════════════════════════════

describe('INDUCTION-06: Contractor no coincide', () => {
  it('lanza BadRequestException cuando el contractor no coincide', async () => {
    const differentContractorId = new Types.ObjectId('64b000000000000000000099');
    const service = buildService({
      contract: validContract({ contractorId: CONTRACTOR_ID }),
      supplier: validSupplier({ _id: differentContractorId }),
    });

    await assert.rejects(
      () => service.createInduction(COMPANY_A, {
        contractId: CONTRACT_ID.toString(),
        contractorId: differentContractorId.toString(),
        workerName: 'Juan Pérez',
      } as never, USER_ID),
      (err: Error) => {
        assert.ok(err.message.includes('does not match'));
        return true;
      },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDUCTION-07: Creación exitosa
// ═══════════════════════════════════════════════════════════════════════════

describe('INDUCTION-07: Creación exitosa', () => {
  it('crea una inducción con status PENDING y companyId correcto', async () => {
    let createdData: Record<string, unknown> = {};
    const service = buildService({
      contract: validContract(),
      supplier: validSupplier(),
      inductionCreate: async (data: Record<string, unknown>) => {
        createdData = data;
        return data;
      },
    });

    const result = await service.createInduction(
      COMPANY_A,
      {
        contractId: CONTRACT_ID.toString(),
        contractorId: CONTRACTOR_ID.toString(),
        workerName: 'Juan Pérez',
        workerId: '12345678',
      } as never,
      USER_ID,
    );

    assert.equal(result.status, InductionStatus.PENDING);
    assert.equal(result.workerName, 'Juan Pérez');
    assert.equal(result.workerId, '12345678');
    assert.equal(result.companyId?.toString(), COMPANY_A.toString());
    assert.equal(result.createdBy?.toString(), USER_ID.toString());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDUCTION-08: Status inicial siempre PENDING
// ═══════════════════════════════════════════════════════════════════════════

describe('INDUCTION-08: Status inicial siempre PENDING', () => {
  it('el status siempre es PENDING al crear', async () => {
    const service = buildService({
      contract: validContract(),
      supplier: validSupplier(),
    });

    const result = await service.createInduction(
      COMPANY_A,
      {
        contractId: CONTRACT_ID.toString(),
        contractorId: CONTRACTOR_ID.toString(),
        workerName: 'María López',
      } as never,
      USER_ID,
    );

    assert.equal(result.status, InductionStatus.PENDING);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDUCTION-09: Tenant isolation — Company B no puede crear inducción para Company A
// ═══════════════════════════════════════════════════════════════════════════

describe('INDUCTION-09: Tenant isolation', () => {
  it('Company B no puede crear inducción para contrato de Company A', async () => {
    const service = buildService({ contract: null });

    await assert.rejects(
      () => service.createInduction(COMPANY_B, {
        contractId: CONTRACT_ID.toString(),
        contractorId: CONTRACTOR_ID.toString(),
        workerName: 'Juan Pérez',
      } as never, USER_ID),
      (err: Error) => {
        assert.ok(err.message.includes('not found'));
        return true;
      },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDUCTION-10: Listado con filtros
// ═══════════════════════════════════════════════════════════════════════════

describe('INDUCTION-10: Listado', () => {
  it('findAllInductions retorna lista vacía cuando no hay inducciones', async () => {
    const service = buildService({ inductions: [] });

    const result = await service.findAllInductions(COMPANY_A);
    assert.equal(result.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDUCTION-11: GET por ID
// ═══════════════════════════════════════════════════════════════════════════

describe('INDUCTION-11: GET por ID', () => {
  it('findOneInduction retorna NotFoundException para ID inválido', async () => {
    const service = buildService();

    await assert.rejects(
      () => service.findOneInduction(COMPANY_A, 'invalid-id'),
      (err: Error) => {
        assert.ok(err.message.includes('not found'));
        return true;
      },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDUCTION-12: Update exitoso
// ═══════════════════════════════════════════════════════════════════════════

describe('INDUCTION-12: Update', () => {
  it('updateInduction retorna NotFoundException para inducción inexistente', async () => {
    const service = buildService({ induction: null });

    await assert.rejects(
      () => service.updateInduction(COMPANY_A, INDUCTION_ID.toString(), { workerName: 'Test' }),
      (err: Error) => {
        assert.ok(err.message.includes('not found'));
        return true;
      },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDUCTION-13: Delete
// ═══════════════════════════════════════════════════════════════════════════

describe('INDUCTION-13: Delete', () => {
  it('removeInduction retorna NotFoundException para inducción inexistente', async () => {
    const service = buildService({ induction: null });

    await assert.rejects(
      () => service.removeInduction(COMPANY_A, INDUCTION_ID.toString()),
      (err: Error) => {
        assert.ok(err.message.includes('not found'));
        return true;
      },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDUCTION-14: Stats
// ═══════════════════════════════════════════════════════════════════════════

describe('INDUCTION-14: Stats', () => {
  it('getInductionStats retorna contadores en cero cuando no hay inducciones', async () => {
    const service = buildService({ inductionCount: 0 });

    const stats = await service.getInductionStats(COMPANY_A);
    assert.equal(stats.total, 0);
    assert.equal(stats.pending, 0);
    assert.equal(stats.completed, 0);
    assert.equal(stats.expired, 0);
    assert.equal(stats.cancelled, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDUCTION-15: Contract DRAFT permite inducciones
// ═══════════════════════════════════════════════════════════════════════════

describe('INDUCTION-15: Contract DRAFT permite inducciones', () => {
  it('crea inducción exitosamente para contrato DRAFT', async () => {
    const service = buildService({
      contract: validContract({ status: ContractStatus.DRAFT }),
      supplier: validSupplier(),
    });

    const result = await service.createInduction(
      COMPANY_A,
      {
        contractId: CONTRACT_ID.toString(),
        contractorId: CONTRACTOR_ID.toString(),
        workerName: 'Ana García',
      } as never,
      USER_ID,
    );

    assert.equal(result.status, InductionStatus.PENDING);
    assert.equal(result.workerName, 'Ana García');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDUCTION-16: Múltiples inducciones para mismo trabajador/contrato
// ═══════════════════════════════════════════════════════════════════════════

describe('INDUCTION-16: Múltiples inducciones permitidas', () => {
  it('permite crear múltiples inducciones para el mismo trabajador', async () => {
    const service = buildService({
      contract: validContract(),
      supplier: validSupplier(),
    });

    const result1 = await service.createInduction(
      COMPANY_A,
      {
        contractId: CONTRACT_ID.toString(),
        contractorId: CONTRACTOR_ID.toString(),
        workerName: 'Carlos Ruiz',
      } as never,
      USER_ID,
    );

    const result2 = await service.createInduction(
      COMPANY_A,
      {
        contractId: CONTRACT_ID.toString(),
        contractorId: CONTRACTOR_ID.toString(),
        workerName: 'Carlos Ruiz',
      } as never,
      USER_ID,
    );

    assert.equal(result1.workerName, 'Carlos Ruiz');
    assert.equal(result2.workerName, 'Carlos Ruiz');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDUCTION-17: Compatible con ContractingProvider
// ═══════════════════════════════════════════════════════════════════════════

describe('INDUCTION-17: Compatible con ContractingProvider', () => {
  it('el status COMPLETED es un valor válido del enum InductionStatus', () => {
    assert.equal(InductionStatus.COMPLETED, 'COMPLETED');
    assert.equal(InductionStatus.PENDING, 'PENDING');
    assert.equal(InductionStatus.EXPIRED, 'EXPIRED');
    assert.equal(InductionStatus.CANCELLED, 'CANCELLED');
  });
});
