import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApprovalStatus } from '../approval-workflow/enums/approval-status.enum';
import { ApprovalDecision } from '../approval-workflow/enums/approval-decision.enum';

const fs = require('fs');
const pathMod = require('path');
// Resolve source root from dist-test location: dist-test/modules/contracting/ → ../../..
const SRC_ROOT = pathMod.resolve(__dirname, '..', '..', '..');

function readFile(relativePath: string): string {
  return fs.readFileSync(pathMod.resolve(SRC_ROOT, relativePath), 'utf8');
}

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-01: ApprovalEntity.CONTRACTING exists in enum
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-01: ApprovalEntity.CONTRACTING exists', () => {
  it('CONTRACTING is defined in the enum file', () => {
    const source = readFile('src/modules/approval-workflow/enums/approval-entity.enum.ts');
    assert.ok(source.includes("CONTRACTING = 'CONTRACTING'"), 'CONTRACTING must be in ApprovalEntity enum');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-02: ContractingAdapter implements ApprovalAdapter
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-02: ContractingAdapter implements ApprovalAdapter', () => {
  it('adapter file has correct structure', () => {
    const source = readFile('src/modules/approval-workflow/adapters/contracting.adapter.ts');
    assert.ok(source.includes('ApprovalAdapter'), 'Must implement ApprovalAdapter');
    assert.ok(source.includes('readonly module = ApprovalEntity.CONTRACTING'), 'Must set module to CONTRACTING');
    assert.ok(source.includes('getEntity'), 'Must have getEntity method');
    assert.ok(source.includes('applyDecision'), 'Must have applyDecision method');
    assert.ok(source.includes('mapStatus'), 'Must have mapStatus method');
    assert.ok(source.includes('allowedRoles'), 'Must have allowedRoles method');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-03: Contract schema has approvalStatus field
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-03: Contract schema has approvalStatus', () => {
  it('schema includes approvalStatus field with ApprovalStatus enum', () => {
    const source = readFile('src/modules/contracting/schemas/contract.schema.ts');
    assert.ok(source.includes('approvalStatus'), 'Schema must have approvalStatus field');
    assert.ok(source.includes("import { ApprovalStatus }"), 'Must import ApprovalStatus');
    assert.ok(source.includes('ApprovalStatus'), 'Must reference ApprovalStatus');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-04: ContractingProvider does NOT reference approvalStatus
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-04: Compliance scoring unchanged', () => {
  it('ContractingProvider does not reference approvalStatus', () => {
    const source = readFile('src/modules/compliance-engine/providers/contracting.provider.ts');
    assert.ok(!source.includes('ApprovalStatus'), 'Provider must not import ApprovalStatus');
    assert.ok(!source.includes('approvalStatus'), 'Provider must not reference approvalStatus');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-05: ApprovalStatus values are canonical
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-05: ApprovalStatus is canonical', () => {
  it('uses the same ApprovalStatus enum as Approval Workflow Core', () => {
    assert.equal(ApprovalStatus.PENDING_APPROVAL, 'PENDING_APPROVAL');
    assert.equal(ApprovalStatus.APPROVED, 'APPROVED');
    assert.equal(ApprovalStatus.REJECTED, 'REJECTED');
    assert.equal(ApprovalStatus.DRAFT, 'DRAFT');
    assert.equal(ApprovalStatus.ADJUSTMENTS_REQUESTED, 'ADJUSTMENTS_REQUESTED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-06: No parallel approval system
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-06: No parallel approval system', () => {
  it('no ContractApprovalStatus enum exists', () => {
    const source = readFile('src/modules/contracting/schemas/contract.schema.ts');
    assert.ok(!source.includes('ContractApprovalStatus'), 'Must not create parallel approval enum');
  });

  it('no separate approval collection exists', () => {
    const files = fs.readdirSync(pathMod.resolve(SRC_ROOT, 'src/modules/contracting/schemas/'));
    const approvalFiles = files.filter((f: string) => f.includes('approval') || f.includes('Approval'));
    assert.equal(approvalFiles.length, 0, 'No approval-specific schemas should exist in contracting module');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-07: Adapter registers in ApprovalWorkflowModule
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-07: Adapter registered in module', () => {
  it('ApprovalWorkflowModule imports ContractingAdapter', () => {
    const source = readFile('src/modules/approval-workflow/approval-workflow.module.ts');
    assert.ok(source.includes('ContractingAdapter'), 'Module must import ContractingAdapter');
    assert.ok(source.includes('ContractingModule'), 'Module must import ContractingModule');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-08: ContractingModule imports ApprovalWorkflowModule
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-08: ContractingModule has approval dependency', () => {
  it('ContractingModule imports ApprovalWorkflowModule via forwardRef', () => {
    const source = readFile('src/modules/contracting/contracting.module.ts');
    assert.ok(source.includes('ApprovalWorkflowModule'), 'Must import ApprovalWorkflowModule');
    assert.ok(source.includes('forwardRef'), 'Must use forwardRef to avoid circular dependency');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-09: Controller has approval endpoints
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-09: Controller has approval endpoints', () => {
  it('controller has submit-approval, approve, reject, request-adjustments, approval, approval/history endpoints', () => {
    const source = readFile('src/modules/contracting/contracting.controller.ts');
    assert.ok(source.includes('submit-approval'), 'Must have submit-approval endpoint');
    assert.ok(source.includes('approve'), 'Must have approve endpoint');
    assert.ok(source.includes('reject'), 'Must have reject endpoint');
    assert.ok(source.includes('request-adjustments'), 'Must have request-adjustments endpoint');
    assert.ok(source.includes('approval'), 'Must have approval status endpoint');
    assert.ok(source.includes('approval/history'), 'Must have approval history endpoint');
  });

  it('controller uses ApprovalWorkflowService', () => {
    const source = readFile('src/modules/contracting/contracting.controller.ts');
    assert.ok(source.includes('ApprovalWorkflowService'), 'Must inject ApprovalWorkflowService');
    assert.ok(source.includes('ApprovalEntity.CONTRACTING'), 'Must use CONTRACTING entity');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-10: Service has approval methods
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-10: Service has approval methods', () => {
  it('service has getApprovalStatus and prepareForApproval', () => {
    const source = readFile('src/modules/contracting/contracting.service.ts');
    assert.ok(source.includes('getApprovalStatus'), 'Must have getApprovalStatus');
    assert.ok(source.includes('prepareForApproval'), 'Must have prepareForApproval');
  });

  it('service imports ApprovalStatus', () => {
    const source = readFile('src/modules/contracting/contracting.service.ts');
    assert.ok(source.includes("import { ApprovalStatus }"), 'Must import ApprovalStatus');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-11: APPROVED transition
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-11: APPROVED transition', () => {
  it('adapter maps APPROVED to ACTIVE status', () => {
    const source = readFile('src/modules/approval-workflow/adapters/contracting.adapter.ts');
    assert.ok(source.includes('ApprovalDecision.APPROVED'), 'Must handle APPROVED decision');
    assert.ok(source.includes('ContractStatus.ACTIVE'), 'APPROVED must set status to ACTIVE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-12: REJECTED transition
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-12: REJECTED transition', () => {
  it('adapter maps REJECTED to DRAFT status', () => {
    const source = readFile('src/modules/approval-workflow/adapters/contracting.adapter.ts');
    assert.ok(source.includes('ApprovalDecision.REJECTED'), 'Must handle REJECTED decision');
    assert.ok(source.includes('ContractStatus.DRAFT'), 'REJECTED must set status to DRAFT');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-13: ADJUSTMENTS_REQUESTED transition
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-13: ADJUSTMENTS_REQUESTED transition', () => {
  it('adapter maps ADJUSTMENTS_REQUESTED to DRAFT status', () => {
    const source = readFile('src/modules/approval-workflow/adapters/contracting.adapter.ts');
    assert.ok(source.includes('ApprovalDecision.ADJUSTMENTS_REQUESTED'), 'Must handle ADJUSTMENTS_REQUESTED decision');
    assert.ok(source.includes('ContractStatus.DRAFT'), 'ADJUSTMENTS_REQUESTED must set status to DRAFT');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-14: Cannot resubmit PENDING_APPROVAL
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-14: Cannot resubmit PENDING_APPROVAL', () => {
  it('prepareForApproval rejects PENDING_APPROVAL status', () => {
    const source = readFile('src/modules/contracting/contracting.service.ts');
    assert.ok(source.includes('already pending approval'), 'Must reject PENDING_APPROVAL');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-15: Cannot resubmit APPROVED or ACTIVE
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-15: Cannot resubmit APPROVED', () => {
  it('prepareForApproval rejects APPROVED status', () => {
    const source = readFile('src/modules/contracting/contracting.service.ts');
    assert.ok(source.includes('already approved'), 'Must reject APPROVED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-16: applyDecision uses companyId
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-16: applyDecision uses companyId', () => {
  it('adapter uses findOneAndUpdate with companyId filter', () => {
    const source = readFile('src/modules/approval-workflow/adapters/contracting.adapter.ts');
    assert.ok(source.includes('findOneAndUpdate'), 'Must use findOneAndUpdate');
    assert.ok(source.includes('{ _id: contractId, companyId }'), 'Update filter must include companyId');
  });

  it('adapter has null check after findOneAndUpdate', () => {
    const source = readFile('src/modules/approval-workflow/adapters/contracting.adapter.ts');
    assert.ok(source.includes('if (!updated)'), 'Must check for null after findOneAndUpdate');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-17: Notifications
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-17: Notifications', () => {
  it('adapter has getNotificationMessage method', () => {
    const source = readFile('src/modules/approval-workflow/adapters/contracting.adapter.ts');
    assert.ok(source.includes('getNotificationMessage'), 'Must have getNotificationMessage');
  });

  it('adapter provides moduleCode and moduleName', () => {
    const source = readFile('src/modules/approval-workflow/adapters/contracting.adapter.ts');
    assert.ok(source.includes("return '2.10.1'"), 'Must provide moduleCode 2.10.1');
    assert.ok(source.includes("return 'Contratación'"), 'Must provide moduleName Contratación');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-18: Adapter metadata
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-18: Adapter metadata', () => {
  it('adapter returns correct moduleCode and moduleName', () => {
    const source = readFile('src/modules/approval-workflow/adapters/contracting.adapter.ts');
    assert.ok(source.includes("return '2.10.1'"), 'Must return 2.10.1');
    assert.ok(source.includes("return 'Contratación'"), 'Must return Contratación');
    assert.ok(source.includes("return '/contracting'"), 'Must return /contracting');
  });

  it('adapter uses allowedRoles owner and manager', () => {
    const source = readFile('src/modules/approval-workflow/adapters/contracting.adapter.ts');
    assert.ok(source.includes("'owner', 'manager'"), 'Must include owner and manager roles');
  });

  it('adapter extends BaseApprovalAdapter', () => {
    const source = readFile('src/modules/approval-workflow/adapters/contracting.adapter.ts');
    assert.ok(source.includes('extends BaseApprovalAdapter'), 'Must extend BaseApprovalAdapter');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADDITIONAL: Tenant isolation in adapter
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-19: Tenant isolation in adapter', () => {
  it('getEntity uses companyId in query', () => {
    const source = readFile('src/modules/approval-workflow/adapters/contracting.adapter.ts');
    assert.ok(source.includes('findOne({ _id: new Types.ObjectId(entityId), companyId: new Types.ObjectId(companyId) })'), 'getEntity must filter by companyId');
  });

  it('getEntityLabel uses contractNumber with fallback', () => {
    const source = readFile('src/modules/approval-workflow/adapters/contracting.adapter.ts');
    assert.ok(source.includes('contractNumber'), 'Must use contractNumber');
    assert.ok(source.includes('title'), 'Must fallback to title');
    assert.ok(source.includes("'Contrato'"), 'Must fallback to Contrato');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADDITIONAL: ApprovalStatus values in adapter mapStatus
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-20: mapStatus handles all statuses', () => {
  it('mapStatus handles PENDING_APPROVAL, APPROVED, REJECTED, ADJUSTMENTS_REQUESTED', () => {
    const source = readFile('src/modules/approval-workflow/adapters/contracting.adapter.ts');
    assert.ok(source.includes('PENDING_APPROVAL'), 'Must handle PENDING_APPROVAL');
    assert.ok(source.includes('APPROVED'), 'Must handle APPROVED');
    assert.ok(source.includes('REJECTED'), 'Must handle REJECTED');
    assert.ok(source.includes('ADJUSTMENTS_REQUESTED'), 'Must handle ADJUSTMENTS_REQUESTED');
  });
});
