import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApprovalEntity } from '../enums/approval-entity.enum';
import { ApprovalStatus } from '../enums/approval-status.enum';
import { BaseApprovalAdapter } from './base-approval.adapter';

/** Concrete test implementation of BaseApprovalAdapter */
class TestAdapter extends BaseApprovalAdapter {
  readonly module = ApprovalEntity.ACQUISITION;

  async getEntity(_companyId: string, _entityId?: string): Promise<unknown> {
    return { _id: 'test' };
  }

  async applyDecision(): Promise<unknown> {
    return { updated: true };
  }

  mapStatus(localStatus: string): ApprovalStatus {
    switch (localStatus) {
      case 'PENDING_APPROVAL': return ApprovalStatus.PENDING_APPROVAL;
      case 'APPROVED': return ApprovalStatus.APPROVED;
      case 'REJECTED': return ApprovalStatus.REJECTED;
      case 'ADJUSTMENTS_REQUESTED': return ApprovalStatus.ADJUSTMENTS_REQUESTED;
      default: return ApprovalStatus.DRAFT;
    }
  }
}

describe('BaseApprovalAdapter', () => {
  it('default allowedRoles returns owner and manager', () => {
    const adapter = new TestAdapter();
    const roles = adapter.allowedRoles();
    assert.deepEqual(roles, ['owner', 'manager']);
  });

  it('module is set correctly', () => {
    const adapter = new TestAdapter();
    assert.equal(adapter.module, ApprovalEntity.ACQUISITION);
  });

  it('getEntityLabel is optional and returns undefined by default', () => {
    const adapter = new TestAdapter();
    assert.equal(adapter.getEntityLabel, undefined);
  });

  it('getDefaultActionUrl is optional and returns undefined by default', () => {
    const adapter = new TestAdapter();
    assert.equal(adapter.getDefaultActionUrl, undefined);
  });

  it('mapDecisionToStatus maps APPROVED correctly', () => {
    const adapter = new TestAdapter();
    const result = (adapter as any).mapDecisionToStatus('APPROVED');
    assert.equal(result, ApprovalStatus.APPROVED);
  });

  it('mapDecisionToStatus maps REJECTED correctly', () => {
    const adapter = new TestAdapter();
    const result = (adapter as any).mapDecisionToStatus('REJECTED');
    assert.equal(result, ApprovalStatus.REJECTED);
  });

  it('mapDecisionToStatus maps ADJUSTMENTS_REQUESTED correctly', () => {
    const adapter = new TestAdapter();
    const result = (adapter as any).mapDecisionToStatus('ADJUSTMENTS_REQUESTED');
    assert.equal(result, ApprovalStatus.ADJUSTMENTS_REQUESTED);
  });

  it('mapDecisionToStatus defaults to DRAFT for unknown decision', () => {
    const adapter = new TestAdapter();
    const result = (adapter as any).mapDecisionToStatus('UNKNOWN');
    assert.equal(result, ApprovalStatus.DRAFT);
  });
});

describe('BaseApprovalAdapter with overrides', () => {
  class CustomAdapter extends BaseApprovalAdapter {
    readonly module = ApprovalEntity.DOCUMENT;

    async getEntity(): Promise<unknown> { return {}; }
    async applyDecision(): Promise<unknown> { return {}; }
    mapStatus(): ApprovalStatus { return ApprovalStatus.DRAFT; }

    allowedRoles(): string[] {
      return ['owner', 'admin', 'manager'];
    }

    getEntityLabel(entity: unknown): string {
      const doc = entity as { code?: string };
      return doc?.code ?? 'Documento';
    }

    getDefaultActionUrl(): string {
      return '/documents';
    }
  }

  it('custom allowedRoles overrides default', () => {
    const adapter = new CustomAdapter();
    assert.deepEqual(adapter.allowedRoles(), ['owner', 'admin', 'manager']);
  });

  it('getEntityLabel returns custom label', () => {
    const adapter = new CustomAdapter();
    assert.equal(adapter.getEntityLabel({ code: 'DOC-001' }), 'DOC-001');
  });

  it('getEntityLabel falls back when no code', () => {
    const adapter = new CustomAdapter();
    assert.equal(adapter.getEntityLabel({}), 'Documento');
  });

  it('getDefaultActionUrl returns custom URL', () => {
    const adapter = new CustomAdapter();
    assert.equal(adapter.getDefaultActionUrl(), '/documents');
  });
});
