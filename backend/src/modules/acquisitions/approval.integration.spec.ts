import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApprovalStatus } from '../approval-workflow/enums/approval-status.enum';
import { ApprovalDecision } from '../approval-workflow/enums/approval-decision.enum';

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-01: ApprovalEntity.ACQUISITION exists in enum
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-01: ApprovalEntity.ACQUISITION exists', () => {
  it('ACQUISITION is defined in the enum file', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../approval-workflow/enums/approval-entity.enum.ts'),
      'utf8',
    );
    assert.ok(source.includes("ACQUISITION = 'ACQUISITION'"), 'ACQUISITION must be in ApprovalEntity enum');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-02: AcquisitionAdapter implements ApprovalAdapter
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-02: AcquisitionAdapter implements ApprovalAdapter', () => {
  it('adapter file has correct structure', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../approval-workflow/adapters/acquisition.adapter.ts'),
      'utf8',
    );
    assert.ok(source.includes('ApprovalAdapter'), 'Must implement ApprovalAdapter');
    assert.ok(source.includes('readonly module = ApprovalEntity.ACQUISITION'), 'Must set module to ACQUISITION');
    assert.ok(source.includes('getEntity'), 'Must have getEntity method');
    assert.ok(source.includes('applyDecision'), 'Must have applyDecision method');
    assert.ok(source.includes('mapStatus'), 'Must have mapStatus method');
    assert.ok(source.includes('allowedRoles'), 'Must have allowedRoles method');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-03: Acquisition schema has approvalStatus field
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-03: Acquisition schema has approvalStatus', () => {
  it('schema includes approvalStatus field with ApprovalStatus enum', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './schemas/acquisition.schema.ts'),
      'utf8',
    );
    assert.ok(source.includes('approvalStatus'), 'Schema must have approvalStatus field');
    assert.ok(source.includes("import { ApprovalStatus }"), 'Must import ApprovalStatus');
    assert.ok(source.includes('ApprovalStatus'), 'Must reference ApprovalStatus');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-04: AcquisitionProvider does NOT reference approvalStatus
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-04: Compliance scoring unchanged', () => {
  it('AcquisitionProvider does not reference approvalStatus', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../compliance-engine/providers/acquisition.provider.ts'),
      'utf8',
    );
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
  it('no AcquisitionApprovalStatus enum exists', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './schemas/acquisition.schema.ts'),
      'utf8',
    );
    assert.ok(!source.includes('AcquisitionApprovalStatus'), 'Must not create parallel approval enum');
  });

  it('no separate approval collection exists', () => {
    const files = fs.readdirSync(path.resolve(__dirname, './schemas/'));
    const approvalFiles = files.filter((f: string) => f.includes('approval') || f.includes('Approval'));
    assert.equal(approvalFiles.length, 0, 'No approval-specific schemas should exist in acquisitions module');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-07: Adapter registers in ApprovalWorkflowModule
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-07: Adapter registered in module', () => {
  it('ApprovalWorkflowModule imports AcquisitionAdapter', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../approval-workflow/approval-workflow.module.ts'),
      'utf8',
    );
    assert.ok(source.includes('AcquisitionAdapter'), 'Module must import AcquisitionAdapter');
    assert.ok(source.includes('AcquisitionsModule'), 'Module must import AcquisitionsModule');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-08: AcquisitionsModule imports ApprovalWorkflowModule
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-08: AcquisitionsModule has approval dependency', () => {
  it('AcquisitionsModule imports ApprovalWorkflowModule via forwardRef', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.module.ts'),
      'utf8',
    );
    assert.ok(source.includes('ApprovalWorkflowModule'), 'Must import ApprovalWorkflowModule');
    assert.ok(source.includes('forwardRef'), 'Must use forwardRef to avoid circular dependency');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-09: Controller has approval endpoints
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-09: Controller has approval endpoints', () => {
  it('controller has submit-approval, approve, reject, approval, approval/history endpoints', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.controller.ts'),
      'utf8',
    );
    assert.ok(source.includes('submit-approval'), 'Must have submit-approval endpoint');
    assert.ok(source.includes('approve'), 'Must have approve endpoint');
    assert.ok(source.includes('reject'), 'Must have reject endpoint');
    assert.ok(source.includes('approval'), 'Must have approval status endpoint');
    assert.ok(source.includes('approval/history'), 'Must have approval history endpoint');
  });

  it('controller uses ApprovalWorkflowService', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.controller.ts'),
      'utf8',
    );
    assert.ok(source.includes('ApprovalWorkflowService'), 'Must inject ApprovalWorkflowService');
    assert.ok(source.includes('ApprovalEntity.ACQUISITION'), 'Must use ACQUISITION entity');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-10: Service has approval methods
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-10: Service has approval methods', () => {
  it('service has getApprovalStatus, prepareForApproval, getApprovalMetrics', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.service.ts'),
      'utf8',
    );
    assert.ok(source.includes('getApprovalStatus'), 'Must have getApprovalStatus');
    assert.ok(source.includes('prepareForApproval'), 'Must have prepareForApproval');
    assert.ok(source.includes('getApprovalMetrics'), 'Must have getApprovalMetrics');
  });

  it('service imports ApprovalStatus', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.service.ts'),
      'utf8',
    );
    assert.ok(source.includes("import { ApprovalStatus }"), 'Must import ApprovalStatus');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-11: Transition rules are enforced
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-11: Transition rules', () => {
  it('prepareForApproval rejects PENDING_APPROVAL status', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.service.ts'),
      'utf8',
    );
    assert.ok(source.includes('already pending approval'), 'Must reject PENDING_APPROVAL');
    assert.ok(source.includes('already approved'), 'Must reject APPROVED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-12: Tenant isolation in service
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-12: Tenant isolation in service', () => {
  it('service methods filter by companyId', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.service.ts'),
      'utf8',
    );
    // All approval methods should filter by companyId
    assert.ok(source.includes('companyId') && source.includes('findOne'), 'Must filter by companyId');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-13: Evidence adapter has approvalMetrics
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-13: Evidence adapter includes approvalMetrics', () => {
  it('StandardEvidenceContext has approvalMetrics field', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../compliance-ai/standard-analysis/adapters/standard-evidence.adapter.ts'),
      'utf8',
    );
    assert.ok(source.includes('approvalMetrics'), 'StandardEvidenceContext must have approvalMetrics');
  });

  it('AcquisitionCountQueries has getApprovalMetrics', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../compliance-ai/standard-analysis/adapters/acquisition-evidence.adapter.ts'),
      'utf8',
    );
    assert.ok(source.includes('getApprovalMetrics'), 'AcquisitionCountQueries must have getApprovalMetrics');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-14: Analyzer handles approval findings
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-14: Analyzer handles approval findings', () => {
  it('analyzer enriches with approval-pending and approval-rejected findings', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../compliance-ai/standard-analysis/analyzers/acquisition-standard.analyzer.ts'),
      'utf8',
    );
    assert.ok(source.includes('approval-pending'), 'Must handle approval-pending finding');
    assert.ok(source.includes('approval-rejected'), 'Must handle approval-rejected finding');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-15: Frontend API has approval functions
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-15: Frontend API has approval functions', () => {
  it('api.ts has approval-related types and functions', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../../../frontend/src/api.ts'),
      'utf8',
    );
    assert.ok(source.includes('AcquisitionApprovalStatus'), 'Must have AcquisitionApprovalStatus type');
    assert.ok(source.includes('AcquisitionApprovalResponse'), 'Must have AcquisitionApprovalResponse type');
    assert.ok(source.includes('submitAcquisitionForApproval'), 'Must have submitAcquisitionForApproval function');
    assert.ok(source.includes('approveAcquisition'), 'Must have approveAcquisition function');
    assert.ok(source.includes('rejectAcquisition'), 'Must have rejectAcquisition function');
    assert.ok(source.includes('fetchAcquisitionApproval'), 'Must have fetchAcquisitionApproval function');
    assert.ok(source.includes('fetchAcquisitionApprovalHistory'), 'Must have fetchAcquisitionApprovalHistory function');
  });

  it('AcquisitionModel includes approvalStatus field', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../../../frontend/src/api.ts'),
      'utf8',
    );
    assert.ok(source.includes('approvalStatus?: AcquisitionApprovalStatus'), 'AcquisitionModel must have approvalStatus');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-16: prepareForApproval accepts actor info
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-16: prepareForApproval accepts actor info', () => {
  it('service method signature includes optional actor parameter', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.service.ts'),
      'utf8',
    );
    assert.ok(source.includes('actor?:'), 'prepareForApproval must accept actor parameter');
    assert.ok(source.includes('userId'), 'actor must include userId');
    assert.ok(source.includes('userEmail'), 'actor must include userEmail');
  });

  it('controller passes user info to prepareForApproval', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.controller.ts'),
      'utf8',
    );
    assert.ok(
      source.includes('prepareForApproval(companyId, id, {'),
      'Controller must pass actor object to prepareForApproval',
    );
    assert.ok(
      source.includes('userId: user._id.toString()'),
      'Controller must pass userId from authenticated user',
    );
    assert.ok(
      source.includes('userEmail: user.email'),
      'Controller must pass userEmail from authenticated user',
    );
  });

  it('history registration uses actor userId when available', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.service.ts'),
      'utf8',
    );
    assert.ok(
      source.includes('actor?.userId ? new Types.ObjectId(actor.userId) : undefined'),
      'History must use actor.userId when available',
    );
    assert.ok(
      source.includes("actor?.userEmail ?? ''"),
      'History must use actor.userEmail when available',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-17: AcquisitionAdapter applies companyId in update
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-17: AcquisitionAdapter uses companyId in update', () => {
  it('applyDecision uses findOneAndUpdate with companyId filter', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../approval-workflow/adapters/acquisition.adapter.ts'),
      'utf8',
    );
    assert.ok(
      source.includes('findOneAndUpdate'),
      'Must use findOneAndUpdate instead of findByIdAndUpdate',
    );
    assert.ok(
      source.includes('{ _id: acquisitionId, companyId }'),
      'Update filter must include companyId',
    );
  });

  it('applyDecision has null check after findOneAndUpdate', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../approval-workflow/adapters/acquisition.adapter.ts'),
      'utf8',
    );
    assert.ok(
      source.includes('if (!updated)'),
      'Must check for null after findOneAndUpdate',
    );
  });

  it('applyDecision still verifies entity with getEntity first', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../approval-workflow/adapters/acquisition.adapter.ts'),
      'utf8',
    );
    assert.ok(
      source.includes('findOne({ _id: acquisitionId, companyId })'),
      'Must still verify entity with companyId before update',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-18: ADJUSTMENTS_REQUESTED endpoint exists
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-18: request-adjustments endpoint exists', () => {
  it('controller has request-adjustments endpoint', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.controller.ts'),
      'utf8',
    );
    assert.ok(source.includes('request-adjustments'), 'Must have request-adjustments endpoint');
    assert.ok(source.includes('requestAdjustments'), 'Must have requestAdjustments method');
  });

  it('endpoint requires owner or manager role', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.controller.ts'),
      'utf8',
    );
    // Find the requestAdjustments method and verify its @Roles decorator
    const idx = source.indexOf('async requestAdjustments');
    assert.ok(idx > 0, 'requestAdjustments method must exist');
    const beforeMethod = source.substring(Math.max(0, idx - 200), idx);
    assert.ok(
      beforeMethod.includes("@Roles('owner', 'manager')"),
      'requestAdjustments must require owner or manager role',
    );
  });

  it('endpoint validates reason is provided', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.controller.ts'),
      'utf8',
    );
    assert.ok(
      source.includes('Reason is required to request adjustments'),
      'Must validate reason is provided',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-19: Service requestAdjustments exists and validates
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-19: Service requestAdjustments method', () => {
  it('service has requestAdjustments method', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.service.ts'),
      'utf8',
    );
    assert.ok(source.includes('async requestAdjustments'), 'Must have requestAdjustments method');
    assert.ok(source.includes('PENDING_APPROVAL status to request adjustments'), 'Must validate PENDING_APPROVAL status');
  });

  it('service records history with ACQUISITION_ADJUSTMENTS_REQUESTED action', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.service.ts'),
      'utf8',
    );
    assert.ok(
      source.includes('ACQUISITION_ADJUSTMENTS_REQUESTED'),
      'Must record history with ACQUISITION_ADJUSTMENTS_REQUESTED action',
    );
  });

  it('service stores reason in history newValue', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.service.ts'),
      'utf8',
    );
    assert.ok(
      source.includes('{ approvalStatus: ApprovalStatus.ADJUSTMENTS_REQUESTED, reason }'),
      'Must store reason in history newValue',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-20: Adapter handles ADJUSTMENTS_REQUESTED in mapDecisionToStatus
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-20: Adapter handles ADJUSTMENTS_REQUESTED', () => {
  it('mapDecisionToStatus maps ADJUSTMENTS_REQUESTED correctly', () => {
    // mapDecisionToStatus lives in BaseApprovalAdapter; AcquisitionAdapter inherits it
    const source = fs.readFileSync(
      path.resolve(__dirname, '../approval-workflow/adapters/base-approval.adapter.ts'),
      'utf8',
    );
    assert.ok(
      source.includes("case 'ADJUSTMENTS_REQUESTED':"),
      'Must map ADJUSTMENTS_REQUESTED decision',
    );
    assert.ok(
      source.includes('ApprovalStatus.ADJUSTMENTS_REQUESTED'),
      'Must map to ADJUSTMENTS_REQUESTED status',
    );
  });

  it('mapStatus handles ADJUSTMENTS_REQUESTED', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../approval-workflow/adapters/acquisition.adapter.ts'),
      'utf8',
    );
    assert.ok(
      source.includes("case ApprovalStatus.ADJUSTMENTS_REQUESTED:"),
      'mapStatus must handle ADJUSTMENTS_REQUESTED case',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-21: ADJUSTMENTS_REQUESTED in ApprovalStatus enum
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-21: ADJUSTMENTS_REQUESTED is in ApprovalStatus enum', () => {
  it('enum includes ADJUSTMENTS_REQUESTED', () => {
    assert.equal(ApprovalStatus.ADJUSTMENTS_REQUESTED, 'ADJUSTMENTS_REQUESTED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-22: Acquisition schema supports ADJUSTMENTS_REQUESTED
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-22: Schema supports ADJUSTMENTS_REQUESTED', () => {
  it('acquisition approvalStatus field accepts ADJUSTMENTS_REQUESTED', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './schemas/acquisition.schema.ts'),
      'utf8',
    );
    assert.ok(
      source.includes('enum: Object.values(ApprovalStatus)'),
      'approvalStatus must use ApprovalStatus enum values',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-23: Compliance scoring unchanged with ADJUSTMENTS_REQUESTED
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-23: Compliance scoring unchanged', () => {
  it('AcquisitionProvider still does not reference approvalStatus', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../compliance-engine/providers/acquisition.provider.ts'),
      'utf8',
    );
    assert.ok(!source.includes('ApprovalStatus'), 'Provider must not import ApprovalStatus');
    assert.ok(!source.includes('ADJUSTMENTS_REQUESTED'), 'Provider must not reference ADJUSTMENTS_REQUESTED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-24: Frontend API has requestAcquisitionAdjustments
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-24: Frontend API has adjustments function', () => {
  it('api.ts has requestAcquisitionAdjustments function', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../../../frontend/src/api.ts'),
      'utf8',
    );
    assert.ok(source.includes('requestAcquisitionAdjustments'), 'Must have requestAcquisitionAdjustments function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// APPROVAL-25: Frontend has adjustments UI
// ═══════════════════════════════════════════════════════════════════════════

describe('APPROVAL-25: Frontend has adjustments UI', () => {
  it('AcquisitionsAdvancedPanel has adjustments modal', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../../../frontend/src/components/AcquisitionsAdvancedPanel.tsx'),
      'utf8',
    );
    assert.ok(source.includes('showAdjustmentsModal'), 'Must have showAdjustmentsModal state');
    assert.ok(source.includes('handleRequestAdjustments'), 'Must have handleRequestAdjustments handler');
    assert.ok(source.includes('Solicitar ajustes'), 'Must have Solicitar ajustes text');
    assert.ok(source.includes('adjustmentsReason'), 'Must have adjustmentsReason state');
  });

  it('AcquisitionsAdvancedPanel shows resubmit when ADJUSTMENTS_REQUESTED', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../../../frontend/src/components/AcquisitionsAdvancedPanel.tsx'),
      'utf8',
    );
    assert.ok(
      source.includes("approvalStatus === 'ADJUSTMENTS_REQUESTED'"),
      'Must handle ADJUSTMENTS_REQUESTED status',
    );
    assert.ok(
      source.includes('Enviar nuevamente'),
      'Must show resubmit option',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ALERT-01: AlertsService is imported in AcquisitionsModule
// ═══════════════════════════════════════════════════════════════════════════

describe('ALERT-01: Notifications wired via ApprovalWorkflowModule', () => {
  it('module imports ApprovalWorkflowModule which provides ApprovalNotificationService', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.module.ts'),
      'utf8',
    );
    assert.ok(source.includes('ApprovalWorkflowModule'), 'AcquisitionsModule must import ApprovalWorkflowModule');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ALERT-02: AcquisitionsService has notifyApprovalEvent method
// ═══════════════════════════════════════════════════════════════════════════

describe('ALERT-02: Service has notifyApprovalEvent method', () => {
  it('service has notifyApprovalEvent method', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.service.ts'),
      'utf8',
    );
    assert.ok(source.includes('async notifyApprovalEvent'), 'Must have notifyApprovalEvent method');
  });

  it('service delegates to ApprovalNotificationService', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.service.ts'),
      'utf8',
    );
    assert.ok(source.includes('approvalNotificationService.notify'), 'Must delegate to ApprovalNotificationService');
  });

  it('ApprovalNotificationService queries owner and manager roles', () => {
    // Roles query now lives in ApprovalNotificationService (generic)
    const source = fs.readFileSync(
      path.resolve(__dirname, '../approval-workflow/services/approval-notification.service.ts'),
      'utf8',
    );
    assert.ok(
      source.includes('role: { $in: roles }'),
      'Must query roles from adapter allowedRoles()',
    );
  });

  it('ApprovalNotificationService has Logger for error observability', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../approval-workflow/services/approval-notification.service.ts'),
      'utf8',
    );
    assert.ok(source.includes('private readonly logger = new Logger'), 'Must have Logger instance');
    assert.ok(source.includes('this.logger.warn'), 'Must log warnings on alert failures');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ALERT-03: Controller calls notifyApprovalEvent on submit
// ═══════════════════════════════════════════════════════════════════════════

describe('ALERT-03: Controller creates alerts on approval events', () => {
  it('submitForApproval creates ACQUISITION_APPROVAL_SUBMITTED alert', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.controller.ts'),
      'utf8',
    );
    assert.ok(source.includes('ACQUISITION_APPROVAL_SUBMITTED'), 'Must create submission alert');
  });

  it('approve creates ACQUISITION_APPROVED alert', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.controller.ts'),
      'utf8',
    );
    assert.ok(source.includes('ACQUISITION_APPROVED'), 'Must create approval alert');
  });

  it('reject creates ACQUISITION_REJECTED alert', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.controller.ts'),
      'utf8',
    );
    assert.ok(source.includes('ACQUISITION_REJECTED'), 'Must create rejection alert');
  });

  it('requestAdjustments creates ACQUISITION_ADJUSTMENTS_REQUESTED alert', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.controller.ts'),
      'utf8',
    );
    assert.ok(source.includes('ACQUISITION_ADJUSTMENTS_REQUESTED'), 'Must create adjustments alert');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ALERT-04: Alerts use void to not block workflow
// ═══════════════════════════════════════════════════════════════════════════

describe('ALERT-04: Alerts do not block workflow', () => {
  it('all notifyApprovalEvent calls use void', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.controller.ts'),
      'utf8',
    );
    const voidCount = (source.match(/void this\.acquisitionsService\.notifyApprovalEvent/g) ?? []).length;
    assert.ok(voidCount >= 4, `Must have at least 4 void notifyApprovalEvent calls, found ${voidCount}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ALERT-05: Alerts use moduleCode 2.9.1
// ═══════════════════════════════════════════════════════════════════════════

describe('ALERT-05: Alerts use correct moduleCode', () => {
  it('AcquisitionAdapter provides moduleCode 2.9.1', () => {
    // moduleCode/moduleName now come from the adapter (generic architecture)
    const source = fs.readFileSync(
      path.resolve(__dirname, '../approval-workflow/adapters/acquisition.adapter.ts'),
      'utf8',
    );
    assert.ok(source.includes("return '2.9.1'"), 'Adapter must provide moduleCode 2.9.1');
    assert.ok(source.includes("return 'Adquisiciones'"), 'Adapter must provide moduleName Adquisiciones');
  });

  it('ApprovalNotificationService uses adapter.getModuleCode()', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../approval-workflow/services/approval-notification.service.ts'),
      'utf8',
    );
    assert.ok(source.includes('getModuleCode'), 'Must call adapter.getModuleCode()');
    assert.ok(source.includes('getModuleName'), 'Must call adapter.getModuleName()');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ALERT-06: Scoring unchanged
// ═══════════════════════════════════════════════════════════════════════════

describe('ALERT-06: Scoring unchanged with alerts', () => {
  it('AcquisitionProvider does not reference AlertsService', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../compliance-engine/providers/acquisition.provider.ts'),
      'utf8',
    );
    assert.ok(!source.includes('AlertsService'), 'Provider must not reference AlertsService');
    assert.ok(!source.includes('notifyApprovalEvent'), 'Provider must not reference notifyApprovalEvent');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ALERT-07: Messages are acquisition-specific (prevent cross-acquisition dedup)
// ═══════════════════════════════════════════════════════════════════════════

describe('ALERT-07: Messages are acquisition-specific', () => {
  it('submit alert includes requestNumber in message', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.controller.ts'),
      'utf8',
    );
    assert.ok(
      source.includes('Adquisición ${prepared.requestNumber} enviada'),
      'Submit alert must include requestNumber in message',
    );
  });

  it('adjustments alert includes requestNumber in message', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.controller.ts'),
      'utf8',
    );
    assert.ok(
      source.includes('Adquisición ${result.requestNumber}: se solicitaron'),
      'Adjustments alert must include requestNumber in message',
    );
  });

  it('approve alert includes acquisition ID in message', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.controller.ts'),
      'utf8',
    );
    assert.ok(
      source.includes('Adquisición ${id} fue aprobada'),
      'Approve alert must include acquisition ID in message',
    );
  });

  it('reject alert includes acquisition ID in message', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.controller.ts'),
      'utf8',
    );
    assert.ok(
      source.includes('Adquisición ${id} fue rechazada'),
      'Reject alert must include acquisition ID in message',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ALERT-08: Recipients include owner and manager
// ═══════════════════════════════════════════════════════════════════════════

describe('ALERT-08: Recipients include owner and manager', () => {
  it('ApprovalNotificationService queries roles from adapter', () => {
    // Roles query is now generic — delegated to adapter.allowedRoles()
    const source = fs.readFileSync(
      path.resolve(__dirname, '../approval-workflow/services/approval-notification.service.ts'),
      'utf8',
    );
    assert.ok(
      source.includes('adapter?.allowedRoles'),
      'Must get roles from adapter allowedRoles()',
    );
  });

  it('AcquisitionAdapter returns owner and manager roles', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../approval-workflow/adapters/acquisition.adapter.ts'),
      'utf8',
    );
    assert.ok(
      source.includes("'owner', 'manager'"),
      'AcquisitionAdapter must include owner and manager roles',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ALERT-09: Errors are logged but do not block workflow
// ═══════════════════════════════════════════════════════════════════════════

describe('ALERT-09: Errors are logged but do not block workflow', () => {
  it('ApprovalNotificationService has try/catch with logger.warn', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../approval-workflow/services/approval-notification.service.ts'),
      'utf8',
    );
    assert.ok(source.includes('this.logger.warn'), 'Must log warnings on failures');
    // Verify the outer try/catch exists
    const methodStart = source.indexOf('async notify');
    const methodBody = source.substring(methodStart, methodStart + 2000);
    assert.ok(methodBody.includes('try {'), 'Must have try block');
    assert.ok(methodBody.includes('catch'), 'Must have catch block for errors');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ALERT-10: Tenant isolation in alerts
// ═══════════════════════════════════════════════════════════════════════════

describe('ALERT-10: Tenant isolation in alerts', () => {
  it('ApprovalNotificationService uses companyId for recipient query', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../approval-workflow/services/approval-notification.service.ts'),
      'utf8',
    );
    assert.ok(
      source.includes('companyId: ctx.companyId'),
      'Must filter recipients by companyId from context',
    );
  });

  it('alert creation uses companyId from context', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../approval-workflow/services/approval-notification.service.ts'),
      'utf8',
    );
    assert.ok(
      source.includes('companyId: ctx.companyId.toString()'),
      'Alert must use companyId from context',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ALERT-11: Multiple cycles produce independent alerts
// ═══════════════════════════════════════════════════════════════════════════

describe('ALERT-11: Multiple cycles produce independent alerts', () => {
  it('submit and adjustments use different message patterns', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.controller.ts'),
      'utf8',
    );
    // Submit message includes "enviada al flujo"
    assert.ok(source.includes('enviada al flujo'), 'Submit message must be distinct');
    // Adjustments message includes "solicitaron ajustes"
    assert.ok(source.includes('solicitaron ajustes'), 'Adjustments message must be distinct');
    // These different messages ensure deduplication does not collapse them
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ALERT-12: No parallel notification system
// ═══════════════════════════════════════════════════════════════════════════

describe('ALERT-12: No parallel notification system', () => {
  it('no AcquisitionAlertsService or AcquisitionNotification exists', () => {
    const fs = require('fs');
    const pathMod = require('path');
    const serviceDir = pathMod.resolve(__dirname, './');
    const files = fs.readdirSync(serviceDir);
    const alertFiles = files.filter((f: string) =>
      f.includes('alert') || f.includes('notification') || f.includes('Alert') || f.includes('Notification'),
    );
    assert.equal(alertFiles.length, 0, 'No parallel alert/notification files should exist in acquisitions module');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ALERT-13: AlertsModule imported in AcquisitionsModule
// ═══════════════════════════════════════════════════════════════════════════

describe('ALERT-13: Module wiring complete', () => {
  it('AcquisitionsModule imports ApprovalWorkflowModule', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './acquisitions.module.ts'),
      'utf8',
    );
    assert.ok(source.includes('ApprovalWorkflowModule'), 'Must import ApprovalWorkflowModule');
  });

  it('ApprovalWorkflowModule provides ApprovalNotificationService', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../approval-workflow/approval-workflow.module.ts'),
      'utf8',
    );
    assert.ok(source.includes('ApprovalNotificationService'), 'ApprovalWorkflowModule must provide ApprovalNotificationService');
  });
});
