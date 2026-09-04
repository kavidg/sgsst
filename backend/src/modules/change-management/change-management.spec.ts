import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';
import { ChangeManagementService } from './change-management.service.js';
import { ChangeType, ImpactLevel, ChangeStatus } from './schema/change-request.schema.js';

const COMPANY_A = new Types.ObjectId('64b000000000000000000001');
const COMPANY_B = new Types.ObjectId('64b000000000000000000002');
const USER_ID = new Types.ObjectId('64b000000000000000000010');
const REQUEST_ID = new Types.ObjectId('64b000000000000000000050');
const USER_NAME = 'Juan Pérez';

function createMockQuery(result: unknown) {
  return {
    exec: async () => result,
    sort: function () { return this; },
    lean: function () { return this; },
    select: function () { return this; },
  };
}

function buildService(overrides?: {
  request?: Record<string, unknown> | null;
  requests?: unknown[];
  createResult?: Record<string, unknown>;
}) {
  const model: Record<string, unknown> = {
    findOne: () => createMockQuery(overrides?.request ?? null),
    find: () => createMockQuery(overrides?.requests ?? []),
    findOneAndUpdate: () => createMockQuery(overrides?.request ?? null),
    findOneAndDelete: () => createMockQuery(null),
    countDocuments: () => createMockQuery(0),
    create: overrides?.createResult
      ? async (data: Record<string, unknown>) => ({ ...overrides?.createResult, ...data })
      : async (data: Record<string, unknown>) => data,
  };

  return new ChangeManagementService(model as never);
}

function validRequest(overrides?: Record<string, unknown>) {
  return {
    _id: REQUEST_ID,
    companyId: COMPANY_A,
    title: 'Cambio de proceso de seguridad',
    description: 'Se requiere actualizar el procedimiento de seguridad industrial',
    changeType: ChangeType.PROCESS,
    impactLevel: ImpactLevel.MEDIUM,
    status: ChangeStatus.DRAFT,
    requestedBy: USER_ID,
    requestedByName: USER_NAME,
    riskAnalysis: 'Riesgo medio de interrupción operativa',
    controlActions: ['Capacitación previa', 'Supervisión durante implementación'],
    affectedProcesses: ['Producción', 'Mantenimiento'],
    affectedWorkers: ['Operarios planta 1'],
    createdBy: USER_ID,
    createdByName: USER_NAME,
    ...overrides,
  };
}

// ==================== SCHEMA TESTS ====================

describe('Schema: ChangeRequest', () => {
  it('SCHEMA-01: ChangeType enum has correct values', () => {
    assert.equal(ChangeType.PROCESS, 'PROCESS');
    assert.equal(ChangeType.STRUCTURE, 'STRUCTURE');
    assert.equal(ChangeType.PERSONNEL, 'PERSONNEL');
    assert.equal(ChangeType.TECHNOLOGY, 'TECHNOLOGY');
    assert.equal(ChangeType.INFRASTRUCTURE, 'INFRASTRUCTURE');
  });

  it('SCHEMA-02: ImpactLevel enum has correct values', () => {
    assert.equal(ImpactLevel.LOW, 'LOW');
    assert.equal(ImpactLevel.MEDIUM, 'MEDIUM');
    assert.equal(ImpactLevel.HIGH, 'HIGH');
    assert.equal(ImpactLevel.CRITICAL, 'CRITICAL');
  });

  it('SCHEMA-03: ChangeStatus enum has correct values', () => {
    assert.equal(ChangeStatus.DRAFT, 'DRAFT');
    assert.equal(ChangeStatus.PENDING_APPROVAL, 'PENDING_APPROVAL');
    assert.equal(ChangeStatus.APPROVED, 'APPROVED');
    assert.equal(ChangeStatus.IMPLEMENTED, 'IMPLEMENTED');
    assert.equal(ChangeStatus.REJECTED, 'REJECTED');
  });
});

// ==================== CREATION TESTS ====================

describe('CRUD: ChangeManagementService', () => {

  // CREATE-01: Creates DRAFT successfully
  it('CREATE-01: creates a DRAFT change request', async () => {
    let capturedData: Record<string, unknown> | undefined;
    const service = new ChangeManagementService({
      create: async (data: Record<string, unknown>) => { capturedData = data; return data; },
      findOne: () => createMockQuery(null),
    } as never);

    await service.create(COMPANY_A, {
      title: 'Nuevo proceso',
      description: 'Descripción del cambio',
      changeType: ChangeType.PROCESS,
      impactLevel: ImpactLevel.LOW,
    }, USER_ID, USER_NAME);

    assert.equal((capturedData!.companyId as any).toString(), COMPANY_A.toString());
    assert.equal(capturedData!.status, ChangeStatus.DRAFT);
    assert.equal(capturedData!.title, 'Nuevo proceso');
  });

  // CREATE-02: companyId from context, not frontend
  it('CREATE-02: companyId and createdBy controlled by backend', async () => {
    let capturedData: Record<string, unknown> | undefined;
    const service = new ChangeManagementService({
      create: async (data: Record<string, unknown>) => { capturedData = data; return data; },
      findOne: () => createMockQuery(null),
    } as never);

    await service.create(COMPANY_A, {
      title: 'Test',
      description: 'Test',
      changeType: ChangeType.PROCESS,
      impactLevel: ImpactLevel.LOW,
    }, USER_ID, USER_NAME);

    assert.equal((capturedData!.companyId as any).toString(), COMPANY_A.toString());
    assert.equal((capturedData!.createdBy as any).toString(), USER_ID.toString());
    assert.equal((capturedData!.requestedBy as any).toString(), USER_ID.toString());
    assert.equal(capturedData!.createdByName, USER_NAME);
    assert.equal(capturedData!.requestedByName, USER_NAME);
  });

  // CREATE-03: LOW impact allows empty riskAnalysis
  it('CREATE-03: LOW impact allows empty riskAnalysis', async () => {
    const service = new ChangeManagementService({
      create: async (data: Record<string, unknown>) => data,
      findOne: () => createMockQuery(null),
    } as never);

    const result = await service.create(COMPANY_A, {
      title: 'Test',
      description: 'Test',
      changeType: ChangeType.INFRASTRUCTURE,
      impactLevel: ImpactLevel.LOW,
    }, USER_ID, USER_NAME);

    assert.ok(result);
  });

  // CREATE-04: MEDIUM impact requires riskAnalysis
  it('CREATE-04: MEDIUM impact requires riskAnalysis', async () => {
    const service = new ChangeManagementService({
      create: async (data: Record<string, unknown>) => data,
      findOne: () => createMockQuery(null),
    } as never);

    try {
      await service.create(COMPANY_A, {
        title: 'Test',
        description: 'Test',
        changeType: ChangeType.PROCESS,
        impactLevel: ImpactLevel.MEDIUM,
        // no riskAnalysis
      }, USER_ID, USER_NAME);
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
      assert.match(err.message, /riskAnalysis/i);
    }
  });

  // CREATE-05: HIGH impact requires riskAnalysis
  it('CREATE-05: HIGH impact requires riskAnalysis', async () => {
    const service = new ChangeManagementService({
      create: async (data: Record<string, unknown>) => data,
      findOne: () => createMockQuery(null),
    } as never);

    try {
      await service.create(COMPANY_A, {
        title: 'Test',
        description: 'Test',
        changeType: ChangeType.STRUCTURE,
        impactLevel: ImpactLevel.HIGH,
      }, USER_ID, USER_NAME);
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
    }
  });

  // CREATE-06: CRITICAL impact requires riskAnalysis
  it('CREATE-06: CRITICAL impact requires riskAnalysis', async () => {
    const service = new ChangeManagementService({
      create: async (data: Record<string, unknown>) => data,
      findOne: () => createMockQuery(null),
    } as never);

    try {
      await service.create(COMPANY_A, {
        title: 'Test',
        description: 'Test',
        changeType: ChangeType.PERSONNEL,
        impactLevel: ImpactLevel.CRITICAL,
      }, USER_ID, USER_NAME);
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
    }
  });

  // CREATE-07: MEDIUM impact requires controlActions
  it('CREATE-07: MEDIUM impact requires controlActions', async () => {
    const service = new ChangeManagementService({
      create: async (data: Record<string, unknown>) => data,
      findOne: () => createMockQuery(null),
    } as never);

    try {
      await service.create(COMPANY_A, {
        title: 'Test',
        description: 'Test',
        changeType: ChangeType.PROCESS,
        impactLevel: ImpactLevel.MEDIUM,
        riskAnalysis: 'Análisis válido',
        controlActions: [],
      }, USER_ID, USER_NAME);
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
      assert.match(err.message, /control/i);
    }
  });

  // CREATE-08: HIGH impact requires controlActions
  it('CREATE-08: HIGH impact requires controlActions', async () => {
    const service = new ChangeManagementService({
      create: async (data: Record<string, unknown>) => data,
      findOne: () => createMockQuery(null),
    } as never);

    try {
      await service.create(COMPANY_A, {
        title: 'Test',
        description: 'Test',
        changeType: ChangeType.TECHNOLOGY,
        impactLevel: ImpactLevel.HIGH,
        riskAnalysis: 'Análisis válido',
        // no controlActions
      }, USER_ID, USER_NAME);
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
    }
  });

  // CREATE-09: followUpDate validation
  it('CREATE-09: followUpDate must not be before implementationDate', async () => {
    const service = new ChangeManagementService({
      create: async (data: Record<string, unknown>) => data,
      findOne: () => createMockQuery(null),
    } as never);

    try {
      await service.create(COMPANY_A, {
        title: 'Test',
        description: 'Test',
        changeType: ChangeType.PROCESS,
        impactLevel: ImpactLevel.LOW,
        implementationDate: '2025-12-31',
        followUpDate: '2025-01-01',
      }, USER_ID, USER_NAME);
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
      assert.match(err.message, /followUpDate/i);
    }
  });

  // ==================== TENANT TESTS ====================

  // TENANT-01: Company A lists its changes
  it('TENANT-01: company can list its changes', async () => {
    const service = buildService({ requests: [validRequest()] });
    const result = await service.findAll(COMPANY_A, {});
    assert.ok(Array.isArray(result));
  });

  // TENANT-02: Company B cannot get change of Company A
  it('TENANT-02: company B cannot get change of company A', async () => {
    const service = buildService({ request: null });

    try {
      await service.findOne(COMPANY_B, REQUEST_ID.toString());
      assert.fail('Expected NotFoundException');
    } catch (err: any) {
      assert.equal(err.name, 'NotFoundException');
    }
  });

  // TENANT-03: Company B cannot modify change of Company A
  it('TENANT-03: company B cannot modify change of company A', async () => {
    const service = buildService({ request: null });

    try {
      await service.update(COMPANY_B, REQUEST_ID.toString(), { title: 'Hacked' });
      assert.fail('Expected NotFoundException');
    } catch (err: any) {
      assert.equal(err.name, 'NotFoundException');
    }
  });

  // TENANT-04: Company B cannot delete change of Company A
  it('TENANT-04: company B cannot delete change of company A', async () => {
    const service = buildService({ request: null });

    try {
      await service.remove(COMPANY_B, REQUEST_ID.toString());
      assert.fail('Expected NotFoundException');
    } catch (err: any) {
      assert.equal(err.name, 'NotFoundException');
    }
  });

  // ==================== STATUS TRANSITION TESTS ====================

  // STATUS-01: DRAFT → PENDING_APPROVAL allowed
  it('STATUS-01: DRAFT → PENDING_APPROVAL is allowed', async () => {
    const existing = validRequest({ status: ChangeStatus.DRAFT });
    const service = buildService({ request: existing });

    // No error means the transition is allowed
    const result = await service.update(COMPANY_A, REQUEST_ID.toString(), {
      status: ChangeStatus.PENDING_APPROVAL,
    });
    assert.ok(result);
  });

  // STATUS-02: APPROVED → DRAFT not allowed
  it('STATUS-02: APPROVED → DRAFT is not allowed', async () => {
    const existing = validRequest({ status: ChangeStatus.APPROVED });
    const service = buildService({ request: existing });

    try {
      await service.update(COMPANY_A, REQUEST_ID.toString(), {
        status: ChangeStatus.DRAFT,
      });
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
      assert.match(err.message, /Cannot transition/i);
    }
  });

  // STATUS-03: IMPLEMENTED → DRAFT not allowed
  it('STATUS-03: IMPLEMENTED → DRAFT is not allowed', async () => {
    const existing = validRequest({ status: ChangeStatus.IMPLEMENTED });
    const service = buildService({ request: existing });

    try {
      await service.update(COMPANY_A, REQUEST_ID.toString(), {
        status: ChangeStatus.DRAFT,
      });
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
    }
  });

  // STATUS-04: REJECTED → APPROVED not allowed
  it('STATUS-04: REJECTED → APPROVED is not allowed', async () => {
    const existing = validRequest({ status: ChangeStatus.REJECTED });
    const service = buildService({ request: existing });

    try {
      await service.update(COMPANY_A, REQUEST_ID.toString(), {
        status: ChangeStatus.APPROVED,
      });
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
    }
  });

  // STATUS-05: REJECTED → DRAFT allowed (resubmit)
  it('STATUS-05: REJECTED → DRAFT is allowed (resubmit)', async () => {
    const existing = validRequest({ status: ChangeStatus.REJECTED });
    const service = buildService({ request: existing });

    const result = await service.update(COMPANY_A, REQUEST_ID.toString(), {
      status: ChangeStatus.DRAFT,
    });
    assert.ok(result);
  });

  // STATUS-06: PENDING_APPROVAL cannot be modified
  it('STATUS-06: PENDING_APPROVAL blocks other status changes', async () => {
    const existing = validRequest({ status: ChangeStatus.PENDING_APPROVAL });
    const service = buildService({ request: existing });

    try {
      await service.update(COMPANY_A, REQUEST_ID.toString(), {
        status: ChangeStatus.APPROVED,
      });
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
    }
  });

  // ==================== READ/UPDATE/DELETE TESTS ====================

  // READ-01: findOne not found → NotFoundException
  it('READ-01: findOne not found → NotFoundException', async () => {
    const service = buildService({ request: null });

    try {
      await service.findOne(COMPANY_A, REQUEST_ID.toString());
      assert.fail('Expected NotFoundException');
    } catch (err: any) {
      assert.equal(err.name, 'NotFoundException');
    }
  });

  // UPDATE-01: update not found → NotFoundException
  it('UPDATE-01: update not found → NotFoundException', async () => {
    const service = buildService({ request: null });

    try {
      await service.update(COMPANY_A, REQUEST_ID.toString(), { title: 'Updated' });
      assert.fail('Expected NotFoundException');
    } catch (err: any) {
      assert.equal(err.name, 'NotFoundException');
    }
  });

  // UPDATE-02: update validates riskAnalysis when impact changes
  it('UPDATE-02: changing impact to MEDIUM requires riskAnalysis', async () => {
    const existing = validRequest({ impactLevel: ImpactLevel.LOW, riskAnalysis: undefined });
    const service = buildService({ request: existing });

    try {
      await service.update(COMPANY_A, REQUEST_ID.toString(), {
        impactLevel: ImpactLevel.MEDIUM,
        // no riskAnalysis
      });
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
    }
  });

  // UPDATE-03: update validates controlActions when impact changes
  it('UPDATE-03: changing impact to HIGH requires controlActions', async () => {
    const existing = validRequest({ impactLevel: ImpactLevel.LOW, controlActions: [] });
    const service = buildService({ request: existing });

    try {
      await service.update(COMPANY_A, REQUEST_ID.toString(), {
        impactLevel: ImpactLevel.HIGH,
        riskAnalysis: 'Análisis',
        controlActions: [],
      });
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
    }
  });

  // DELETE-01: delete not found → NotFoundException
  it('DELETE-01: delete not found → NotFoundException', async () => {
    const service = buildService({ request: null });

    try {
      await service.remove(COMPANY_A, REQUEST_ID.toString());
      assert.fail('Expected NotFoundException');
    } catch (err: any) {
      assert.equal(err.name, 'NotFoundException');
    }
  });

  // DELETE-02: delete success
  it('DELETE-02: delete success', async () => {
    const service = buildService({ request: validRequest() });

    // Override findOneAndDelete to return the request
    const serviceWithDelete = new ChangeManagementService({
      findOne: () => createMockQuery(validRequest()),
      findOneAndDelete: () => createMockQuery(validRequest()),
    } as never);

    const result = await serviceWithDelete.remove(COMPANY_A, REQUEST_ID.toString());
    assert.equal(result.message, 'Change request deleted');
  });

  // STATS-01: stats returns correct structure
  it('STATS-01: stats returns correct structure', async () => {
    const service = buildService({ requests: [] });
    const stats = await service.getStats(COMPANY_A);
    assert.equal(typeof stats.total, 'number');
    assert.equal(typeof stats.draft, 'number');
    assert.equal(typeof stats.pendingApproval, 'number');
    assert.equal(typeof stats.approved, 'number');
    assert.equal(typeof stats.implemented, 'number');
    assert.equal(typeof stats.rejected, 'number');
    assert.ok(stats.byImpactLevel);
    assert.ok(stats.byChangeType);
  });

  // STATS-02: stats counts correctly
  it('STATS-02: stats counts by status', async () => {
    const requests = [
      validRequest({ status: ChangeStatus.DRAFT }),
      validRequest({ status: ChangeStatus.DRAFT }),
      validRequest({ status: ChangeStatus.APPROVED }),
      validRequest({ _id: new Types.ObjectId(), status: ChangeStatus.IMPLEMENTED }),
    ];
    const service = buildService({ requests });
    const stats = await service.getStats(COMPANY_A);
    assert.equal(stats.total, 4);
    assert.equal(stats.draft, 2);
    assert.equal(stats.approved, 1);
    assert.equal(stats.implemented, 1);
  });
});
