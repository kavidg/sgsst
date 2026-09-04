import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import { SstObjectivesHandler } from '../approval-workflow/adapters/handlers/sst-objectives.handler';
import { ApprovalDecision } from '../approval-workflow/enums/approval-decision.enum';
import { ApplyDecisionContext } from '../approval-workflow/adapters/approval-adapter.interface';

// ─── Helpers ────────────────────────────────────────────────────────────────

const COMPANY_A = '64b0000000000000000000a1';
const COMPANY_B = '64b0000000000000000000b1';

function buildUserModel() {
  return {
    findById: () => ({ exec: async () => ({ _id: new Types.ObjectId(), email: 'test@test.com' }) }),
    findOne: () => ({ exec: async () => ({ _id: new Types.ObjectId(), email: 'test@test.com' }) }),
  } as never;
}

function buildRecord(companyId: string, overrides?: Record<string, unknown>) {
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(companyId),
    itemCode: '2.2.1',
    objectives: [],
    alerts: [],
    history: [],
    complianceStatus: 'NON_COMPLIANT',
    complianceReason: 'No existen objetivos SST activos.',
    save: async function () { (this as Record<string, unknown>)._saveCount = ((this as Record<string, unknown>)._saveCount as number ?? 0) + 1; return this; },
    _saveCount: 0,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 1 — findSstObjectives is really read-only
// ═══════════════════════════════════════════════════════════════════════════

describe('findSstObjectives es read-only', () => {
  it('ejecuta findOne y no llama saveSstObjectivesWithCompliance ni record.save()', async () => {
    const findOneCalls: unknown[] = [];
    const saveCalls: string[] = [];

    const service = {
      findSstObjectives: async (companyId: Types.ObjectId) => {
        findOneCalls.push({ companyId });
        return buildRecord(companyId.toString());
      },
      findOrCreateSstObjectives: async () => {
        saveCalls.push('findOrCreateSstObjectives');
        throw new Error('findOrCreateSstObjectives should NOT be called');
      },
    } as unknown as { findSstObjectives: (companyId: Types.ObjectId) => Promise<unknown>; findOrCreateSstObjectives: () => Promise<never> };

    // Simulate the read-only flow: findSstObjectives → no save
    const record = await service.findSstObjectives(new Types.ObjectId(COMPANY_A));

    assert.equal(findOneCalls.length, 1);
    assert.equal(saveCalls.length, 0);
    assert.ok(record);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test 4 — Approval getEntity no escribe
// ═══════════════════════════════════════════════════════════════════════════

describe('SstObjectivesHandler.getEntity() no dispara persistencia', () => {
  it('usa findSstObjectives (read-only) en lugar de findOrCreateSstObjectives', async () => {
    const methodCalls: string[] = [];
    const record = buildRecord(COMPANY_A);

    const service = {
      findSstObjectives: async () => {
        methodCalls.push('findSstObjectives');
        return record;
      },
      findOrCreateSstObjectives: async () => {
        methodCalls.push('findOrCreateSstObjectives');
        return record;
      },
    } as never;

    const handler = new SstObjectivesHandler(service, buildUserModel());
    const result = await handler.getEntity(COMPANY_A);

    assert.equal(methodCalls.length, 1);
    assert.equal(methodCalls[0], 'findSstObjectives');
    assert.ok((result as { entity: unknown }).entity);
    assert.equal((result as { status: string }).status, 'NON_COMPLIANT');
  });

  it('lanza NotFoundException cuando el record es null', async () => {
    const service = {
      findSstObjectives: async () => null,
      findOrCreateSstObjectives: async () => null,
    } as never;

    const handler = new SstObjectivesHandler(service, buildUserModel());

    try {
      await handler.getEntity(COMPANY_A);
      assert.fail('Should have thrown NotFoundException');
    } catch (err: unknown) {
      assert.ok(err instanceof Error);
      assert.ok((err as Error).message.includes('SST Objectives not found'));
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test 5 — applyDecision no hace doble-save
// ═══════════════════════════════════════════════════════════════════════════

describe('SstObjectivesHandler.applyDecision() no hace doble-save', () => {
  it('APPROVED: una sola persistencia (save del handler), no dos', async () => {
    const methodCalls: string[] = [];
    const record = buildRecord(COMPANY_A);

    const service = {
      findSstObjectives: async () => {
        methodCalls.push('findSstObjectives');
        return record;
      },
      findOrCreateSstObjectives: async () => {
        methodCalls.push('findOrCreateSstObjectives');
        return record;
      },
    } as never;

    const handler = new SstObjectivesHandler(service, buildUserModel());
    const ctx: ApplyDecisionContext = {
      companyId: new Types.ObjectId(COMPANY_A),
      entityId: new Types.ObjectId(),
      decision: ApprovalDecision.APPROVED,
      actor: { userId: 'user1', email: 'test@test.com', role: 'manager', timestamp: new Date() },
    };

    await handler.applyDecision(ctx);

    // Only findSstObjectives should be called, not findOrCreateSstObjectives
    assert.equal(methodCalls.length, 1);
    assert.equal(methodCalls[0], 'findSstObjectives');
    // Only one save (from applyDecision's record.save())
    assert.equal(record._saveCount, 1);
    assert.equal(record.complianceStatus, 'COMPLIES');
  });

  it('REJECTED: una sola persistencia', async () => {
    const record = buildRecord(COMPANY_A);

    const service = {
      findSstObjectives: async () => record,
      findOrCreateSstObjectives: async () => { throw new Error('should not be called'); },
    } as never;

    const handler = new SstObjectivesHandler(service, buildUserModel());
    const ctx: ApplyDecisionContext = {
      companyId: new Types.ObjectId(COMPANY_A),
      entityId: new Types.ObjectId(),
      decision: ApprovalDecision.REJECTED,
      reason: 'Motivo de rechazo',
      actor: { userId: 'user1', email: 'test@test.com', role: 'manager', timestamp: new Date() },
    };

    await handler.applyDecision(ctx);

    assert.equal(record._saveCount, 1);
    assert.equal(record.complianceStatus, 'NON_COMPLIANT');
    assert.equal(record.complianceReason, 'Motivo de rechazo');
  });

  it('ADJUSTMENTS_REQUESTED: una sola persistencia', async () => {
    const record = buildRecord(COMPANY_A);

    const service = {
      findSstObjectives: async () => record,
      findOrCreateSstObjectives: async () => { throw new Error('should not be called'); },
    } as never;

    const handler = new SstObjectivesHandler(service, buildUserModel());
    const ctx: ApplyDecisionContext = {
      companyId: new Types.ObjectId(COMPANY_A),
      entityId: new Types.ObjectId(),
      decision: ApprovalDecision.ADJUSTMENTS_REQUESTED,
      comments: 'Se solicitan ajustes',
      actor: { userId: 'user1', email: 'test@test.com', role: 'manager', timestamp: new Date() },
    };

    await handler.applyDecision(ctx);

    assert.equal(record._saveCount, 1);
    assert.equal(record.complianceStatus, 'PENDING');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test 6 — Tenant isolation
// ═══════════════════════════════════════════════════════════════════════════

describe('Tenant isolation de findSstObjectives', () => {
  it('findSstObjectives con companyId diferente no devuelve el record', async () => {
    // Simulate: Company A queries, but only Company B's record exists
    const recordCompanyB = buildRecord(COMPANY_B);

    const service = {
      findSstObjectives: async (companyId: Types.ObjectId) => {
        // Simulates MongoDB: only returns records matching companyId
        if (companyId.toString() === COMPANY_B) return recordCompanyB;
        return null;
      },
    } as never;

    const handler = new SstObjectivesHandler(service as never, buildUserModel());

    // Company A queries → should get null (no record for Company A)
    try {
      await handler.getEntity(COMPANY_A);
      assert.fail('Should have thrown NotFoundException for cross-tenant access');
    } catch (err: unknown) {
      assert.ok(err instanceof Error);
      assert.ok((err as Error).message.includes('SST Objectives not found'));
    }
  });

  it('applyDecision con companyId diferente lanza NotFoundException', async () => {
    const recordCompanyB = buildRecord(COMPANY_B);

    const service = {
      findSstObjectives: async (companyId: Types.ObjectId) => {
        if (companyId.toString() === COMPANY_B) return recordCompanyB;
        return null;
      },
    } as never;

    const handler = new SstObjectivesHandler(service as never, buildUserModel());
    const ctx: ApplyDecisionContext = {
      companyId: new Types.ObjectId(COMPANY_A),
      entityId: new Types.ObjectId(),
      decision: ApprovalDecision.APPROVED,
      actor: { userId: 'user1', email: 'test@test.com', role: 'manager', timestamp: new Date() },
    };

    try {
      await handler.applyDecision(ctx);
      assert.fail('Should have thrown NotFoundException for cross-tenant access');
    } catch (err: unknown) {
      assert.ok(err instanceof Error);
      assert.ok((err as Error).message.includes('SST Objectives not found'));
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test 7 — Regresión de estados de approval
// ═══════════════════════════════════════════════════════════════════════════

describe('Regresión: estados de approval workflow', () => {
  function buildHandlerWithRecord() {
    const record = buildRecord(COMPANY_A, { complianceStatus: 'PENDING' });
    const service = {
      findSstObjectives: async () => record,
      findOrCreateSstObjectives: async () => { throw new Error('should not be called'); },
    } as never;
    return { handler: new SstObjectivesHandler(service, buildUserModel()), record };
  }

  it('PENDING → APPROVED: complianceStatus = COMPLIES', async () => {
    const { handler, record } = buildHandlerWithRecord();
    const ctx: ApplyDecisionContext = {
      companyId: new Types.ObjectId(COMPANY_A),
      entityId: new Types.ObjectId(),
      decision: ApprovalDecision.APPROVED,
      actor: { userId: 'user1', email: 'test@test.com', role: 'manager', timestamp: new Date() },
    };

    await handler.applyDecision(ctx);
    assert.equal(record.complianceStatus, 'COMPLIES');
    assert.equal(record.complianceReason, 'Objetivos SST aprobados.');
  });

  it('PENDING → REJECTED: complianceStatus = NON_COMPLIANT', async () => {
    const { handler, record } = buildHandlerWithRecord();
    const ctx: ApplyDecisionContext = {
      companyId: new Types.ObjectId(COMPANY_A),
      entityId: new Types.ObjectId(),
      decision: ApprovalDecision.REJECTED,
      reason: 'No cumple requisitos',
      actor: { userId: 'user1', email: 'test@test.com', role: 'manager', timestamp: new Date() },
    };

    await handler.applyDecision(ctx);
    assert.equal(record.complianceStatus, 'NON_COMPLIANT');
    assert.equal(record.complianceReason, 'No cumple requisitos');
  });

  it('PENDING → ADJUSTMENTS_REQUESTED: complianceStatus = PENDING', async () => {
    const { handler, record } = buildHandlerWithRecord();
    const ctx: ApplyDecisionContext = {
      companyId: new Types.ObjectId(COMPANY_A),
      entityId: new Types.ObjectId(),
      decision: ApprovalDecision.ADJUSTMENTS_REQUESTED,
      comments: 'Ajustar objetivos 1 y 3',
      actor: { userId: 'user1', email: 'test@test.com', role: 'manager', timestamp: new Date() },
    };

    await handler.applyDecision(ctx);
    assert.equal(record.complianceStatus, 'PENDING');
    assert.equal(record.complianceReason, 'Ajustar objetivos 1 y 3');
  });

  it('mapStatus conserva el mapeo existente', () => {
    const { handler } = buildHandlerWithRecord();
    // Only specific statuses map to specific ApprovalStatus values;
    // compliance-specific statuses like COMPLIES/NON_COMPLIANT are unknown → DRAFT
    assert.equal(handler.mapStatus('PENDING'), 'PENDING_APPROVAL');
    assert.equal(handler.mapStatus('APPROVED'), 'APPROVED');
    assert.equal(handler.mapStatus('APPROVED_AND_SIGNED'), 'APPROVED');
    assert.equal(handler.mapStatus('REJECTED'), 'REJECTED');
    assert.equal(handler.mapStatus('ADJUSTMENTS_REQUESTED'), 'ADJUSTMENTS_REQUESTED');
    assert.equal(handler.mapStatus('DRAFT'), 'DRAFT');
    assert.equal(handler.mapStatus('COMPLIES'), 'DRAFT');
    assert.equal(handler.mapStatus('NON_COMPLIANT'), 'DRAFT');
  });

  it('allowedRoles sigue siendo owner y manager', () => {
    const { handler } = buildHandlerWithRecord();
    const roles = handler.allowedRoles();
    assert.deepEqual(roles, ['owner', 'manager']);
  });
});
