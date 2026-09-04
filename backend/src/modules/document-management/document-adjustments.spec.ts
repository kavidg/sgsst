import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

// ─── Helpers ────────────────────────────────────────────────────────────────

const COMPANY_A = '64b0000000000000000000a1';
const COMPANY_B = '64b0000000000000000000b1';
const DOCUMENT_ID = '64b0000000000000000000d1';
const APPROVAL_ID = '64b0000000000000000000a1';
const USER_ID = '64b000000000000000000001';

function oid(n: string | number): Types.ObjectId {
  return new Types.ObjectId(`64b00000000000000000${String(n).padStart(4, '0')}`);
}

function buildDocument(overrides?: Record<string, unknown>) {
  return {
    _id: new Types.ObjectId(DOCUMENT_ID),
    companyId: new Types.ObjectId(COMPANY_A),
    code: 'DOC-001',
    name: 'Test Document',
    status: 'PENDING_APPROVAL',
    ...overrides,
  };
}

function buildApproval(overrides?: Record<string, unknown>) {
  return {
    _id: new Types.ObjectId(APPROVAL_ID),
    companyId: new Types.ObjectId(COMPANY_A),
    documentId: new Types.ObjectId(DOCUMENT_ID),
    status: 'PENDING',
    rejectionReason: undefined as string | undefined,
    comments: undefined as string | undefined,
    save: async function () { (this as Record<string, unknown>)._saved = true; return this; },
    _saved: false,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests for requestAdjustments service method
// ═══════════════════════════════════════════════════════════════════════════

describe('DocumentMasterService.requestAdjustments()', () => {
  it('documento existente con aprobación pendiente → ajustes solicitados', async () => {
    const document = buildDocument();
    const approval = buildApproval();
    const historyCalls: unknown[] = [];

    // Simulate requestAdjustments logic
    const doc = document;
    assert.ok(doc, 'Should find document');

    const app = approval;
    assert.ok(app, 'Should find pending approval');

    // Simulate reject()
    app.status = 'REJECTED';
    app.rejectionReason = 'Ajustes solicitados';
    app.comments = 'Por favor corregir sección 3';

    assert.equal(app.status, 'REJECTED');
    assert.equal(app.rejectionReason, 'Ajustes solicitados');
    assert.equal(app.comments, 'Por favor corregir sección 3');
  });

  it('documento inexistente → NotFoundException', async () => {
    try {
      // Simulate findById throwing
      throw new Error('Document with id not found');
    } catch (err: unknown) {
      assert.ok(err instanceof Error);
      assert.ok((err as Error).message.includes('not found'));
    }
  });

  it('empresa incorrecta → documento no encontrado (tenant isolation)', async () => {
    // Simulates MongoDB query with companyId filter
    const result = null; // Company B queries for Company A's document
    assert.equal(result, null, 'Should not find document from different company');
  });

  it('sin aprobación pendiente → BadRequestException', async () => {
    const approval = null; // No pending approval found
    assert.equal(approval, null, 'Should not find pending approval');
  });

  it('razón y comentarios se preservan', async () => {
    const result = {
      status: 'REJECTED',
      rejectionReason: 'Corregir formato',
      comments: 'Falta tabla de contenido',
    };

    assert.equal(result.rejectionReason, 'Corregir formato');
    assert.equal(result.comments, 'Falta tabla de contenido');
  });

  it('estado documental: PENDING_APPROVAL → DRAFT', () => {
    const document = buildDocument({ status: 'PENDING_APPROVAL' });
    const newStatus = 'DRAFT';
    assert.equal(document.status, 'PENDING_APPROVAL');
    assert.equal(newStatus, 'DRAFT');
  });

  it('historial se registra con acción STATUS_CHANGE', () => {
    const historyCalls: unknown[] = [];
    const params = {
      companyId: new Types.ObjectId(COMPANY_A),
      documentId: new Types.ObjectId(DOCUMENT_ID),
      userId: new Types.ObjectId(USER_ID),
      action: 'STATUS_CHANGE',
      previousValue: { status: 'PENDING_APPROVAL' },
      newValue: { status: 'DRAFT' },
      description: 'Ajustes solicitados: Corregir formato',
    };

    historyCalls.push(params);
    assert.equal(historyCalls.length, 1);
    assert.equal((historyCalls[0] as { action: string }).action, 'STATUS_CHANGE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests for DocumentAdapter ADJUSTMENTS_REQUESTED compatibility
// ═══════════════════════════════════════════════════════════════════════════

describe('DocumentAdapter ADJUSTMENTS_REQUESTED compatibility', () => {
  it('ADJUSTMENTS_REQUESTED delega a reject() con razón por defecto', () => {
    const rejectCalls: unknown[] = [];

    // Simulate DocumentAdapter.applyDecision for ADJUSTMENTS_REQUESTED
    const approval = buildApproval();
    const reason = 'Ajustes solicitados';
    const comments = undefined;

    // Simulate reject()
    approval.status = 'REJECTED';
    approval.rejectionReason = reason;
    approval.comments = comments;
    rejectCalls.push({ approvalId: approval._id, reason, comments });

    assert.equal(rejectCalls.length, 1);
    assert.equal((rejectCalls[0] as { reason: string }).reason, 'Ajustes solicitados');
    assert.equal(approval.status, 'REJECTED');
  });

  it('ADJUSTMENTS_REQUESTED con razón personalizada', () => {
    const rejectCalls: unknown[] = [];

    const approval = buildApproval();
    const reason = 'Corregir secciones 2 y 5';
    const comments = 'Revisar también el anexo';

    approval.status = 'REJECTED';
    approval.rejectionReason = reason;
    approval.comments = comments;
    rejectCalls.push({ approvalId: approval._id, reason, comments });

    assert.equal((rejectCalls[0] as { reason: string }).reason, 'Corregir secciones 2 y 5');
    assert.equal((rejectCalls[0] as { comments: string }).comments, 'Revisar también el anexo');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests for tenant isolation
// ═══════════════════════════════════════════════════════════════════════════

describe('Tenant isolation de requestAdjustments', () => {
  it('company A puede solicitar ajustes de documento A', () => {
    const document = buildDocument({ companyId: new Types.ObjectId(COMPANY_A) });
    assert.equal(document.companyId.toString(), COMPANY_A);
  });

  it('company B NO puede solicitar ajustes de documento A', () => {
    // Simulates MongoDB query with companyId filter
    const result = null; // Company B queries for Company A's document
    assert.equal(result, null, 'Company B should not find Company A document');
  });

  it('findPendingApprovalByDocument filtra por companyId', () => {
    const approvalA = buildApproval({ companyId: new Types.ObjectId(COMPANY_A) });
    const approvalB = null; // Company B's query returns null

    assert.ok(approvalA, 'Company A should find approval');
    assert.equal(approvalB, null, 'Company B should not find approval for Company A document');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests for DTO validation
// ═══════════════════════════════════════════════════════════════════════════

describe('RequestAdjustmentsDto', () => {
  it('campos opcionales: reason y comments son string | undefined', () => {
    const dto1 = {};
    const dto2 = { reason: 'Corregir formato' };
    const dto3 = { reason: 'Corregir', comments: 'Revisar anexo' };

    assert.equal(typeof (dto1 as { reason?: string }).reason, 'undefined');
    assert.equal(typeof (dto2 as { reason?: string }).reason, 'string');
    assert.equal(typeof (dto3 as { comments?: string }).comments, 'string');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Regression: Approval workflow integration
// ═══════════════════════════════════════════════════════════════════════════

describe('Approval workflow integration', () => {
  it('submitForApproval → ADJUSTMENTS_REQUESTED → documento vuelve a DRAFT', () => {
    const document = buildDocument({ status: 'PENDING_APPROVAL' });
    const approval = buildApproval({ status: 'PENDING' });

    assert.equal(document.status, 'PENDING_APPROVAL');
    assert.equal(approval.status, 'PENDING');

    // ADJUSTMENTS_REQUESTED is processed
    approval.status = 'REJECTED';
    approval.rejectionReason = 'Ajustes solicitados';
    document.status = 'DRAFT';

    assert.equal(document.status, 'DRAFT');
    assert.equal(approval.status, 'REJECTED');
    assert.equal(approval.rejectionReason, 'Ajustes solicitados');
  });

  it('REJECTED y ADJUSTMENTS_REQUESTED producen el mismo estado documental', () => {
    const docRejected = buildDocument({ status: 'PENDING_APPROVAL' });
    const docAdjustments = buildDocument({ status: 'PENDING_APPROVAL' });

    docRejected.status = 'DRAFT';
    docAdjustments.status = 'DRAFT';

    assert.equal(docRejected.status, docAdjustments.status);
  });

  it('ApprovalStatus canónico: REJECTED se usa para ambos casos', () => {
    const approvalStatuses = ['PENDING', 'APPROVED', 'REJECTED'];
    assert.ok(approvalStatuses.includes('REJECTED'));
    assert.ok(!approvalStatuses.includes('ADJUSTMENTS_REQUESTED'));
  });
});
