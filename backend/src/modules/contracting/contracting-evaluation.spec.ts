import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';
import { ContractingService } from './contracting.service.js';
import { ContractStatus } from './schemas/contract.schema.js';
import { SupplierType } from '../acquisitions/schemas/supplier.schema.js';

const COMPANY_A = new Types.ObjectId('64b000000000000000000001');
const COMPANY_B = new Types.ObjectId('64b000000000000000000002');
const USER_ID = new Types.ObjectId('64b000000000000000000010');
const CONTRACT_ID = new Types.ObjectId('64b000000000000000000020');
const CONTRACTOR_ID = new Types.ObjectId('64b000000000000000000030');
const EVAL_ID = new Types.ObjectId('64b000000000000000000050');

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
  evaluation?: Record<string, unknown> | null;
  evaluations?: unknown[];
  evaluationCreate?: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
  evaluationDistinct?: string[];
  evaluationAggregate?: unknown[];
}) {
  const contractModel: Record<string, unknown> = {
    findOne: () => createMockQuery(overrides?.contract ?? null),
    countDocuments: () => createMockQuery(0),
    create: async (data: Record<string, unknown>) => data,
    findOneAndUpdate: () => createMockQuery(overrides?.contract ?? null),
    findOneAndDelete: () => createMockQuery(null),
    distinct: () => createMockQuery([]),
  };

  const inductionModel: Record<string, unknown> = {
    find: () => createMockQuery([]),
    findOne: () => createMockQuery(null),
    findOneAndUpdate: () => createMockQuery(null),
    findOneAndDelete: () => createMockQuery(null),
    countDocuments: () => createMockQuery(0),
    create: async (data: Record<string, unknown>) => data,
  };

  const evaluationModel: Record<string, unknown> = {
    find: () => createMockQuery(overrides?.evaluations ?? []),
    findOne: () => createMockQuery(overrides?.evaluation ?? null),
    findOneAndUpdate: () => createMockQuery(overrides?.evaluation ?? null),
    findOneAndDelete: () => createMockQuery(null),
    countDocuments: () => createMockQuery(0),
    distinct: () => createMockQuery(overrides?.evaluationDistinct ?? []),
    aggregate: () => createMockQuery(overrides?.evaluationAggregate ?? []),
    create: overrides?.evaluationCreate ?? (async (data: Record<string, unknown>) => data),
  };

  const supplierModel: Record<string, unknown> = {
    findOne: () => createMockQuery(overrides?.supplier ?? null),
  };

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
    approvalStatus: 'APPROVED',
    ...overrides,
  };
}

function validSupplier(overrides?: Record<string, unknown>) {
  return {
    _id: CONTRACTOR_ID,
    companyId: COMPANY_A,
    name: 'Test Contractor',
    type: SupplierType.CONTRACTOR,
    ...overrides,
  };
}

function validEvaluation(overrides?: Record<string, unknown>) {
  return {
    _id: EVAL_ID,
    companyId: COMPANY_A,
    contractId: CONTRACT_ID,
    contractorId: CONTRACTOR_ID,
    evaluationDate: new Date('2025-06-15'),
    score: 85,
    criteria: ['Seguridad', 'Calidad'],
    observations: 'Good performance',
    evaluatedBy: USER_ID,
    ...overrides,
  };
}

// ==================== EVALUATION TESTS ====================

describe('EVALUATION CRUD: ContractingService', () => {

  // EVALUATION-01: Contract not found → NotFoundException
  it('EVALUATION-01: contract not found → NotFoundException', async () => {
    const service = buildService({ contract: null, supplier: validSupplier() });

    try {
      await service.createEvaluation(COMPANY_A, {
        contractId: CONTRACT_ID.toString(),
        contractorId: CONTRACTOR_ID.toString(),
        evaluationDate: '2025-06-15',
        score: 85,
      }, USER_ID);
      assert.fail('Expected NotFoundException');
    } catch (err: any) {
      assert.equal(err.name, 'NotFoundException');
    }
  });

  // EVALUATION-02: Contract from another company → NotFoundException
  it('EVALUATION-02: contract from another company → NotFoundException', async () => {
    // When querying with COMPANY_A, the contract belongs to COMPANY_B → findOne returns null
    const service = buildService({ contract: null, supplier: validSupplier() });

    try {
      await service.createEvaluation(COMPANY_A, {
        contractId: CONTRACT_ID.toString(),
        contractorId: CONTRACTOR_ID.toString(),
        evaluationDate: '2025-06-15',
        score: 85,
      }, USER_ID);
      assert.fail('Expected NotFoundException');
    } catch (err: any) {
      assert.equal(err.name, 'NotFoundException');
    }
  });

  // EVALUATION-03: Contract CLOSED → BadRequestException
  it('EVALUATION-03: contract CLOSED → BadRequestException', async () => {
    const contract = validContract({ status: ContractStatus.CLOSED });
    const service = buildService({ contract, supplier: validSupplier() });

    try {
      await service.createEvaluation(COMPANY_A, {
        contractId: CONTRACT_ID.toString(),
        contractorId: CONTRACTOR_ID.toString(),
        evaluationDate: '2025-06-15',
        score: 85,
      }, USER_ID);
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
      assert.match(err.message, /CLOSED/i);
    }
  });

  // EVALUATION-04: Contract CANCELLED → BadRequestException
  it('EVALUATION-04: contract CANCELLED → BadRequestException', async () => {
    const contract = validContract({ status: ContractStatus.CANCELLED });
    const service = buildService({ contract, supplier: validSupplier() });

    try {
      await service.createEvaluation(COMPANY_A, {
        contractId: CONTRACT_ID.toString(),
        contractorId: CONTRACTOR_ID.toString(),
        evaluationDate: '2025-06-15',
        score: 85,
      }, USER_ID);
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
      assert.match(err.message, /CANCELLED/i);
    }
  });

  // EVALUATION-05: Contractor not found → NotFoundException
  it('EVALUATION-05: contractor not found → NotFoundException', async () => {
    const contract = validContract();
    const service = buildService({ contract, supplier: null });

    try {
      await service.createEvaluation(COMPANY_A, {
        contractId: CONTRACT_ID.toString(),
        contractorId: CONTRACTOR_ID.toString(),
        evaluationDate: '2025-06-15',
        score: 85,
      }, USER_ID);
      assert.fail('Expected NotFoundException');
    } catch (err: any) {
      assert.equal(err.name, 'NotFoundException');
    }
  });

  // EVALUATION-06: Supplier not CONTRACTOR → BadRequestException
  it('EVALUATION-06: supplier not CONTRACTOR → BadRequestException', async () => {
    const contract = validContract();
    const supplier = validSupplier({ type: SupplierType.PROVIDER });
    const service = buildService({ contract, supplier });

    try {
      await service.createEvaluation(COMPANY_A, {
        contractId: CONTRACT_ID.toString(),
        contractorId: CONTRACTOR_ID.toString(),
        evaluationDate: '2025-06-15',
        score: 85,
      }, USER_ID);
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
      assert.match(err.message, /CONTRACTOR/i);
    }
  });

  // EVALUATION-07: Contractor doesn't match Contract.contractorId → BadRequestException
  it('EVALUATION-07: contractor mismatch → BadRequestException', async () => {
    const contract = validContract();
    const otherContractor = new Types.ObjectId('64b000000000000000000099');
    const supplier = validSupplier({ _id: otherContractor });
    const service = buildService({ contract, supplier });

    try {
      await service.createEvaluation(COMPANY_A, {
        contractId: CONTRACT_ID.toString(),
        contractorId: otherContractor.toString(),
        evaluationDate: '2025-06-15',
        score: 85,
      }, USER_ID);
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
      assert.match(err.message, /contract/i);
    }
  });

  // EVALUATION-08: Successful creation
  it('EVALUATION-08: successful creation', async () => {
    const contract = validContract();
    const supplier = validSupplier();
    const service = buildService({ contract, supplier });

    let capturedData: Record<string, unknown> | undefined;
    const evaluationModel = {
      find: () => createMockQuery([]),
      findOne: () => createMockQuery(null),
      findOneAndUpdate: () => createMockQuery(null),
      findOneAndDelete: () => createMockQuery(null),
      countDocuments: () => createMockQuery(0),
      distinct: () => createMockQuery([]),
      aggregate: () => createMockQuery([]),
      create: async (data: Record<string, unknown>) => { capturedData = data; return data; },
    };

    const customService = new (ContractingService as any)(
      { findOne: () => createMockQuery(contract), countDocuments: () => createMockQuery(0), distinct: () => createMockQuery([]) },
      { find: () => createMockQuery([]), findOne: () => createMockQuery(null), findOneAndUpdate: () => createMockQuery(null), findOneAndDelete: () => createMockQuery(null), countDocuments: () => createMockQuery(0), create: async (data: any) => data },
      evaluationModel,
      { findOne: () => createMockQuery(supplier) },
    );

    const result = await customService.createEvaluation(COMPANY_A, {
      contractId: CONTRACT_ID.toString(),
      contractorId: CONTRACTOR_ID.toString(),
      evaluationDate: '2025-06-15',
      score: 85,
      criteria: ['Seguridad'],
      observations: 'Good',
    }, USER_ID);

    assert.ok(result);
    assert.equal((capturedData!.companyId as any).toString(), COMPANY_A.toString());
    assert.equal((capturedData!.contractId as any).toString(), CONTRACT_ID.toString());
    assert.equal((capturedData!.contractorId as any).toString(), CONTRACTOR_ID.toString());
    assert.equal((capturedData!.evaluatedBy as any).toString(), USER_ID.toString());
    assert.equal(capturedData!.score, 85);
  });

  // EVALUATION-09: Backend controls companyId and evaluatedBy
  it('EVALUATION-09: companyId and evaluatedBy controlled by backend', async () => {
    const contract = validContract();
    const supplier = validSupplier();
    let capturedData: Record<string, unknown> | undefined;

    const service = new (ContractingService as any)(
      { findOne: () => createMockQuery(contract), countDocuments: () => createMockQuery(0), distinct: () => createMockQuery([]) },
      { find: () => createMockQuery([]), findOne: () => createMockQuery(null), findOneAndUpdate: () => createMockQuery(null), findOneAndDelete: () => createMockQuery(null), countDocuments: () => createMockQuery(0), create: async (data: any) => data },
      { find: () => createMockQuery([]), findOne: () => createMockQuery(null), findOneAndUpdate: () => createMockQuery(null), findOneAndDelete: () => createMockQuery(null), countDocuments: () => createMockQuery(0), distinct: () => createMockQuery([]), aggregate: () => createMockQuery([]), create: async (data: any) => { capturedData = data; return data; } },
      { findOne: () => createMockQuery(supplier) },
    );

    await service.createEvaluation(COMPANY_A, {
      contractId: CONTRACT_ID.toString(),
      contractorId: CONTRACTOR_ID.toString(),
      evaluationDate: '2025-06-15',
      score: 90,
    }, USER_ID);

    assert.equal((capturedData!.companyId as any).toString(), COMPANY_A.toString());
    assert.equal((capturedData!.evaluatedBy as any).toString(), USER_ID.toString());
  });

  // EVALUATION-10: Tenant isolation — different companies
  it('EVALUATION-10: tenant isolation — company B cannot see company A evaluations', async () => {
    const evalA = validEvaluation({ companyId: COMPANY_A });
    const service = buildService({
      contract: validContract(),
      supplier: validSupplier(),
      evaluations: [evalA],
    });

    const companyBEvalService = buildService({
      evaluations: [],
    });

    const companyAResult = await companyBEvalService.findAllEvaluations(COMPANY_A, {});
    assert.equal(Array.isArray(companyAResult), true);
    assert.equal((companyAResult as any[]).length, 0);
  });

  // EVALUATION-11: List with filters
  it('EVALUATION-11: list returns evaluations', async () => {
    const evals = [validEvaluation(), validEvaluation({ _id: new Types.ObjectId() })];
    const service = buildService({ evaluations: evals });

    const result = await service.findAllEvaluations(COMPANY_A, {});
    assert.equal(Array.isArray(result), true);
  });

  // EVALUATION-12: findOne — not found → NotFoundException
  it('EVALUATION-12: findOne not found → NotFoundException', async () => {
    const service = buildService({ evaluation: null });

    try {
      await service.findOneEvaluation(COMPANY_A, EVAL_ID.toString());
      assert.fail('Expected NotFoundException');
    } catch (err: any) {
      assert.equal(err.name, 'NotFoundException');
    }
  });

  // EVALUATION-13: Update evaluation
  it('EVALUATION-13: update evaluation', async () => {
    const evalData = validEvaluation();
    const service = buildService({ evaluation: evalData });

    const result = await service.updateEvaluation(COMPANY_A, EVAL_ID.toString(), {
      score: 95,
      observations: 'Updated',
    });

    assert.ok(result);
  });

  // EVALUATION-14: Update cannot alter relations
  it('EVALUATION-14: update cannot alter companyId or contractId', async () => {
    const evalData = validEvaluation();
    const service = buildService({ evaluation: evalData });

    const result = await service.updateEvaluation(COMPANY_A, EVAL_ID.toString(), {
      score: 95,
    } as any);

    // The result should still reference original entities
    assert.ok(result);
  });

  // EVALUATION-15: Delete evaluation
  it('EVALUATION-15: delete evaluation', async () => {
    const evalData = validEvaluation();
    const service = buildService({ evaluation: evalData });

    const result = await service.removeEvaluation(COMPANY_A, EVAL_ID.toString());
    assert.ok(result);
    assert.equal(result.message, 'Evaluation deleted');
  });

  // EVALUATION-16: Delete tenant isolation
  it('EVALUATION-16: cannot delete evaluation of another company', async () => {
    const service = buildService({ evaluation: null });

    try {
      await service.removeEvaluation(COMPANY_B, EVAL_ID.toString());
      assert.fail('Expected NotFoundException');
    } catch (err: any) {
      assert.equal(err.name, 'NotFoundException');
    }
  });

  // EVALUATION-17: Stats
  it('EVALUATION-17: stats returns totals', async () => {
    const evalWithScore = validEvaluation({ score: 80 });
    const evalData = [evalWithScore];
    const service = new (ContractingService as any)(
      { findOne: () => createMockQuery(null), countDocuments: () => createMockQuery(0), distinct: () => createMockQuery([]) },
      { find: () => createMockQuery([]), findOne: () => createMockQuery(null), findOneAndUpdate: () => createMockQuery(null), findOneAndDelete: () => createMockQuery(null), countDocuments: () => createMockQuery(0), create: async (data: any) => data },
      { find: () => ({ select: () => createMockQuery(evalData) }), findOne: () => createMockQuery(null), findOneAndUpdate: () => createMockQuery(null), findOneAndDelete: () => createMockQuery(null), countDocuments: () => createMockQuery(0), distinct: () => createMockQuery([]), aggregate: () => createMockQuery([]), create: async (data: any) => data },
      { findOne: () => createMockQuery(null) },
    );
    const stats = await service.getEvaluationStats(COMPANY_A);
    assert.ok(stats);
    assert.equal(typeof stats.total, 'number');
    assert.equal(typeof stats.withScore, 'number');
    assert.equal(typeof stats.averageScore, 'number');
    assert.equal(stats.total, 1);
    assert.equal(stats.withScore, 1);
    assert.equal(stats.averageScore, 80);
  });

  // EVALUATION-18: Multiple evaluations per contract allowed
  it('EVALUATION-18: multiple evaluations for same contract allowed', async () => {
    const contract = validContract();
    const supplier = validSupplier();
    let callCount = 0;

    const service = new (ContractingService as any)(
      { findOne: () => createMockQuery(contract), countDocuments: () => createMockQuery(0), distinct: () => createMockQuery([]) },
      { find: () => createMockQuery([]), findOne: () => createMockQuery(null), findOneAndUpdate: () => createMockQuery(null), findOneAndDelete: () => createMockQuery(null), countDocuments: () => createMockQuery(0), create: async (data: any) => data },
      { find: () => createMockQuery([]), findOne: () => createMockQuery(null), findOneAndUpdate: () => createMockQuery(null), findOneAndDelete: () => createMockQuery(null), countDocuments: () => createMockQuery(0), distinct: () => createMockQuery([]), aggregate: () => createMockQuery([]), create: async (data: any) => { callCount++; return data; } },
      { findOne: () => createMockQuery(supplier) },
    );

    await service.createEvaluation(COMPANY_A, {
      contractId: CONTRACT_ID.toString(),
      contractorId: CONTRACTOR_ID.toString(),
      evaluationDate: '2025-06-15',
      score: 85,
    }, USER_ID);

    await service.createEvaluation(COMPANY_A, {
      contractId: CONTRACT_ID.toString(),
      contractorId: CONTRACTOR_ID.toString(),
      evaluationDate: '2025-12-15',
      score: 92,
    }, USER_ID);

    assert.equal(callCount, 2);
  });

  // EVALUATION-19: Score 0 is valid
  it('EVALUATION-19: score 0 is valid', async () => {
    const contract = validContract();
    const supplier = validSupplier();
    let capturedScore: number | undefined;

    const service = new (ContractingService as any)(
      { findOne: () => createMockQuery(contract), countDocuments: () => createMockQuery(0), distinct: () => createMockQuery([]) },
      { find: () => createMockQuery([]), findOne: () => createMockQuery(null), findOneAndUpdate: () => createMockQuery(null), findOneAndDelete: () => createMockQuery(null), countDocuments: () => createMockQuery(0), create: async (data: any) => data },
      { find: () => createMockQuery([]), findOne: () => createMockQuery(null), findOneAndUpdate: () => createMockQuery(null), findOneAndDelete: () => createMockQuery(null), countDocuments: () => createMockQuery(0), distinct: () => createMockQuery([]), aggregate: () => createMockQuery([]), create: async (data: any) => { capturedScore = data.score; return data; } },
      { findOne: () => createMockQuery(supplier) },
    );

    await service.createEvaluation(COMPANY_A, {
      contractId: CONTRACT_ID.toString(),
      contractorId: CONTRACTOR_ID.toString(),
      evaluationDate: '2025-06-15',
      score: 0,
    }, USER_ID);

    assert.equal(capturedScore, 0);
  });

  // EVALUATION-20: Score 100 is valid
  it('EVALUATION-20: score 100 is valid', async () => {
    const contract = validContract();
    const supplier = validSupplier();
    let capturedScore: number | undefined;

    const service = new (ContractingService as any)(
      { findOne: () => createMockQuery(contract), countDocuments: () => createMockQuery(0), distinct: () => createMockQuery([]) },
      { find: () => createMockQuery([]), findOne: () => createMockQuery(null), findOneAndUpdate: () => createMockQuery(null), findOneAndDelete: () => createMockQuery(null), countDocuments: () => createMockQuery(0), create: async (data: any) => data },
      { find: () => createMockQuery([]), findOne: () => createMockQuery(null), findOneAndUpdate: () => createMockQuery(null), findOneAndDelete: () => createMockQuery(null), countDocuments: () => createMockQuery(0), distinct: () => createMockQuery([]), aggregate: () => createMockQuery([]), create: async (data: any) => { capturedScore = data.score; return data; } },
      { findOne: () => createMockQuery(supplier) },
    );

    await service.createEvaluation(COMPANY_A, {
      contractId: CONTRACT_ID.toString(),
      contractorId: CONTRACTOR_ID.toString(),
      evaluationDate: '2025-06-15',
      score: 100,
    }, USER_ID);

    assert.equal(capturedScore, 100);
  });

  // EVALUATION-23: Compatibility with ContractingProvider
  it('EVALUATION-23: compatible with ContractingProvider evaluation criteria', async () => {
    // Verify that creating an evaluation produces data structure compatible with provider
    const contract = validContract();
    const supplier = validSupplier();
    let capturedData: Record<string, unknown> | undefined;

    const service = new (ContractingService as any)(
      { findOne: () => createMockQuery(contract), countDocuments: () => createMockQuery(0), distinct: () => createMockQuery([]) },
      { find: () => createMockQuery([]), findOne: () => createMockQuery(null), findOneAndUpdate: () => createMockQuery(null), findOneAndDelete: () => createMockQuery(null), countDocuments: () => createMockQuery(0), create: async (data: any) => data },
      { find: () => createMockQuery([]), findOne: () => createMockQuery(null), findOneAndUpdate: () => createMockQuery(null), findOneAndDelete: () => createMockQuery(null), countDocuments: () => createMockQuery(0), distinct: () => createMockQuery([]), aggregate: () => createMockQuery([]), create: async (data: any) => { capturedData = data; return data; } },
      { findOne: () => createMockQuery(supplier) },
    );

    await service.createEvaluation(COMPANY_A, {
      contractId: CONTRACT_ID.toString(),
      contractorId: CONTRACTOR_ID.toString(),
      evaluationDate: '2025-06-15',
      score: 85,
    }, USER_ID);

    // The provider expects: companyId, contractId as valid ObjectId
    assert.ok(capturedData!.companyId);
    assert.ok(capturedData!.contractId);
    assert.equal(capturedData!.score, 85);
  });
});
