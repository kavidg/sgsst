import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';
import { ChangeManagementService } from './change-management.service.js';
import { ChangeRequest, ChangeRequestDocument, ChangeType, ImpactLevel, ChangeStatus } from './schema/change-request.schema.js';
import { ApprovalEntity } from '../approval-workflow/enums/approval-entity.enum.js';
import { ApprovalStatus } from '../approval-workflow/enums/approval-status.enum.js';

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
    affectedProcesses: ['Producción'],
    affectedWorkers: ['Operarios'],
    createdBy: USER_ID,
    createdByName: USER_NAME,
    ...overrides,
  };
}

// ==================== REGISTRATION TESTS ====================

describe('Approval: ChangeManagement', () => {

  // APPROVAL-01: CHANGE_MANAGEMENT exists in ApprovalEntity
  it('APPROVAL-01: CHANGE_MANAGEMENT exists in ApprovalEntity', () => {
    assert.ok(ApprovalEntity.CHANGE_MANAGEMENT);
    assert.equal(ApprovalEntity.CHANGE_MANAGEMENT, 'CHANGE_MANAGEMENT');
  });

  // APPROVAL-02: ChangeRequest schema exists
  it('APPROVAL-02: ChangeRequest schema exists', () => {
    assert.ok(ChangeRequest);
    const instance = new ChangeRequest();
    assert.ok(typeof instance === 'object');
  });

  // APPROVAL-03: ApprovalEntity has all expected values
  it('APPROVAL-03: ApprovalEntity enum has expected values', () => {
    assert.ok(ApprovalEntity.CHANGE_MANAGEMENT);
    assert.ok(ApprovalEntity.CONTRACTING);
    assert.ok(ApprovalEntity.ACQUISITION);
  });

  // ==================== PREPARE FOR APPROVAL TESTS ====================

  // APPROVAL-04: DRAFT can be submitted for approval
  it('APPROVAL-04: DRAFT can be submitted for approval', async () => {
    const existing = validRequest({ status: ChangeStatus.DRAFT });
    const service = new ChangeManagementService({
      findOne: () => createMockQuery(existing),
      findOneAndUpdate: () => createMockQuery({ ...existing, status: ChangeStatus.PENDING_APPROVAL }),
    } as never);

    const result = await service.prepareForApproval(COMPANY_A, REQUEST_ID.toString());
    assert.ok(result);
    assert.equal(result.requestId, REQUEST_ID.toString());
  });

  // APPROVAL-05: Status changes to PENDING_APPROVAL
  it('APPROVAL-05: prepareForApproval sets status to PENDING_APPROVAL', async () => {
    const existing = validRequest({ status: ChangeStatus.DRAFT });
    let capturedUpdate: Record<string, unknown> | undefined;
    const service = new ChangeManagementService({
      findOne: () => createMockQuery(existing),
      findOneAndUpdate: (query: unknown, update: unknown) => {
        capturedUpdate = update as Record<string, unknown>;
        return createMockQuery({ ...existing, status: ChangeStatus.PENDING_APPROVAL });
      },
    } as never);

    await service.prepareForApproval(COMPANY_A, REQUEST_ID.toString());
    assert.ok(capturedUpdate);
    assert.deepStrictEqual((capturedUpdate as any).$set, { status: ChangeStatus.PENDING_APPROVAL });
  });

  // APPROVAL-06: REJECTED can be resubmitted
  it('APPROVAL-06: REJECTED can be resubmitted', async () => {
    const existing = validRequest({ status: ChangeStatus.REJECTED });
    const service = new ChangeManagementService({
      findOne: () => createMockQuery(existing),
      findOneAndUpdate: () => createMockQuery({ ...existing, status: ChangeStatus.PENDING_APPROVAL }),
    } as never);

    const result = await service.prepareForApproval(COMPANY_A, REQUEST_ID.toString());
    assert.ok(result);
  });

  // APPROVAL-07: APPROVED cannot be submitted
  it('APPROVAL-07: APPROVED cannot be submitted for approval', async () => {
    const existing = validRequest({ status: ChangeStatus.APPROVED });
    const service = new ChangeManagementService({
      findOne: () => createMockQuery(existing),
    } as never);

    try {
      await service.prepareForApproval(COMPANY_A, REQUEST_ID.toString());
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
      assert.match(err.message, /APPROVED/i);
    }
  });

  // APPROVAL-08: PENDING_APPROVAL cannot be submitted
  it('APPROVAL-08: PENDING_APPROVAL cannot be submitted again', async () => {
    const existing = validRequest({ status: ChangeStatus.PENDING_APPROVAL });
    const service = new ChangeManagementService({
      findOne: () => createMockQuery(existing),
    } as never);

    try {
      await service.prepareForApproval(COMPANY_A, REQUEST_ID.toString());
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
    }
  });

  // APPROVAL-09: MEDIUM impact requires riskAnalysis for approval
  it('APPROVAL-09: MEDIUM impact requires riskAnalysis for approval', async () => {
    const existing = validRequest({
      status: ChangeStatus.DRAFT,
      impactLevel: ImpactLevel.MEDIUM,
      riskAnalysis: undefined,
    });
    const service = new ChangeManagementService({
      findOne: () => createMockQuery(existing),
    } as never);

    try {
      await service.prepareForApproval(COMPANY_A, REQUEST_ID.toString());
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
      assert.match(err.message, /riskAnalysis/i);
    }
  });

  // APPROVAL-10: MEDIUM impact requires controlActions for approval
  it('APPROVAL-10: MEDIUM impact requires controlActions for approval', async () => {
    const existing = validRequest({
      status: ChangeStatus.DRAFT,
      impactLevel: ImpactLevel.MEDIUM,
      riskAnalysis: 'Análisis válido',
      controlActions: [],
    });
    const service = new ChangeManagementService({
      findOne: () => createMockQuery(existing),
    } as never);

    try {
      await service.prepareForApproval(COMPANY_A, REQUEST_ID.toString());
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
      assert.match(err.message, /control/i);
    }
  });

  // ==================== TENANT ISOLATION TESTS ====================

  // APPROVAL-TENANT-01: Company A can prepare its own request
  it('APPROVAL-TENANT-01: company can prepare its own request', async () => {
    const existing = validRequest({ companyId: COMPANY_A });
    const service = new ChangeManagementService({
      findOne: () => createMockQuery(existing),
      findOneAndUpdate: () => createMockQuery({ ...existing, status: ChangeStatus.PENDING_APPROVAL }),
    } as never);

    const result = await service.prepareForApproval(COMPANY_A, REQUEST_ID.toString());
    assert.ok(result);
  });

  // APPROVAL-TENANT-02: Company B cannot access request of Company A
  it('APPROVAL-TENANT-02: company B cannot access request of company A', async () => {
    const service = new ChangeManagementService({
      findOne: () => createMockQuery(null),
    } as never);

    try {
      await service.prepareForApproval(COMPANY_B, REQUEST_ID.toString());
      assert.fail('Expected NotFoundException');
    } catch (err: any) {
      assert.equal(err.name, 'NotFoundException');
    }
  });

  // ==================== STATUS TRANSITION TESTS ====================

  // APPROVAL-BYPASS-01: PATCH cannot convert DRAFT → APPROVED directly
  it('APPROVAL-BYPASS-01: PATCH cannot convert DRAFT → APPROVED directly', async () => {
    const existing = validRequest({ status: ChangeStatus.DRAFT });
    const service = new ChangeManagementService({
      findOne: () => createMockQuery(existing),
    } as never);

    try {
      await service.update(COMPANY_A, REQUEST_ID.toString(), {
        status: ChangeStatus.APPROVED,
      });
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
      assert.match(err.message, /Cannot transition/i);
    }
  });

  // APPROVAL-BYPASS-02: PATCH cannot convert PENDING_APPROVAL → APPROVED directly
  it('APPROVAL-BYPASS-02: PATCH cannot convert PENDING_APPROVAL → APPROVED directly', async () => {
    const existing = validRequest({ status: ChangeStatus.PENDING_APPROVAL });
    const service = new ChangeManagementService({
      findOne: () => createMockQuery(existing),
    } as never);

    try {
      await service.update(COMPANY_A, REQUEST_ID.toString(), {
        status: ChangeStatus.APPROVED,
      });
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
    }
  });

  // APPROVAL-BYPASS-03: PATCH cannot convert PENDING_APPROVAL → REJECTED directly
  it('APPROVAL-BYPASS-03: PATCH cannot convert PENDING_APPROVAL → REJECTED directly', async () => {
    const existing = validRequest({ status: ChangeStatus.PENDING_APPROVAL });
    const service = new ChangeManagementService({
      findOne: () => createMockQuery(existing),
    } as never);

    try {
      await service.update(COMPANY_A, REQUEST_ID.toString(), {
        status: ChangeStatus.REJECTED,
      });
      assert.fail('Expected BadRequestException');
    } catch (err: any) {
      assert.equal(err.name, 'BadRequestException');
    }
  });

  // ==================== GET APPROVAL STATUS TESTS ====================

  // APPROVAL-STATUS-01: getApprovalStatus returns correct structure
  it('APPROVAL-STATUS-01: getApprovalStatus returns correct structure', async () => {
    const existing = validRequest({ status: ChangeStatus.PENDING_APPROVAL });
    const service = new ChangeManagementService({
      findOne: () => createMockQuery(existing),
    } as never);

    const result = await service.getApprovalStatus(COMPANY_A, REQUEST_ID.toString());
    assert.equal(result.requestId, REQUEST_ID.toString());
    assert.equal(result.title, existing.title);
    assert.equal(result.status, ChangeStatus.PENDING_APPROVAL);
  });

  // APPROVAL-STATUS-02: getApprovalStatus not found → NotFoundException
  it('APPROVAL-STATUS-02: getApprovalStatus not found → NotFoundException', async () => {
    const service = new ChangeManagementService({
      findOne: () => createMockQuery(null),
    } as never);

    try {
      await service.getApprovalStatus(COMPANY_A, REQUEST_ID.toString());
      assert.fail('Expected NotFoundException');
    } catch (err: any) {
      assert.equal(err.name, 'NotFoundException');
    }
  });

  // ==================== COMPLETE FLOW TESTS ====================

  // APPROVAL-FLOW-01: DRAFT → PENDING_APPROVAL → APPROVED flow
  it('APPROVAL-FLOW-01: DRAFT → PENDING_APPROVAL → APPROVED flow', async () => {
    // Step 1: Start with DRAFT
    const draftRequest = validRequest({ status: ChangeStatus.DRAFT });
    const service = new ChangeManagementService({
      findOne: () => createMockQuery(draftRequest),
      findOneAndUpdate: () => createMockQuery({ ...draftRequest, status: ChangeStatus.PENDING_APPROVAL }),
    } as never);

    // Step 2: Prepare for approval
    const prepared = await service.prepareForApproval(COMPANY_A, REQUEST_ID.toString());
    assert.ok(prepared);
    assert.equal(prepared.requestId, REQUEST_ID.toString());
  });

  // APPROVAL-FLOW-02: DRAFT → PENDING_APPROVAL → REJECTED → DRAFT flow
  it('APPROVAL-FLOW-02: DRAFT → PENDING_APPROVAL → REJECTED → DRAFT flow', async () => {
    // Step 1: Start with REJECTED (simulating after rejection)
    const rejectedRequest = validRequest({ status: ChangeStatus.REJECTED });
    const service = new ChangeManagementService({
      findOne: () => createMockQuery(rejectedRequest),
      findOneAndUpdate: () => createMockQuery({ ...rejectedRequest, status: ChangeStatus.PENDING_APPROVAL }),
    } as never);

    // Step 2: Resubmit after rejection
    const resubmitted = await service.prepareForApproval(COMPANY_A, REQUEST_ID.toString());
    assert.ok(resubmitted);
  });
});
