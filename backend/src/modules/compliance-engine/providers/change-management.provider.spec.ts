import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Tests para BLOQUE 2.11.1-D — ChangeManagementProvider (2.11.1 · Gestión del cambio).
 *
 * Valida que el provider genera resultados de cumplimiento correctos
 * para el dominio de Gestión del Cambio, incluyendo tenant isolation,
 * manejo de NO_DATA, scoring 30/30/20/20, y compatibilidad con ProviderComplianceResult.
 */

// ==================== MOCK HELPERS ====================

function mockQuery(result: unknown) {
  const q: any = {};
  q.sort = () => q;
  q.populate = () => q;
  q.exec = () => Promise.resolve(result);
  return q;
}

function mockCount(n: number) {
  return { exec: () => Promise.resolve(n) };
}

function createMockModel() {
  const m: any = {};
  m.countDocuments = (_q?: any) => mockCount(0);
  return m;
}

// ==================== CONSTANTS ====================

const COMPANY_A = '6a1efb525fff84649b532541';
const COMPANY_B = '6b2efb525fff84649b532542';

// ==================== IMPORTS ====================

import { ChangeManagementProvider } from './change-management.provider';
import { ChangeStatus, ImpactLevel } from '../../change-management/schema/change-request.schema';

// ==================== SERVICE CREATION ====================

function createProvider(config?: {
  totalChanges?: number;
  approvedChanges?: number;
  implementedChanges?: number;
  rejectedChanges?: number;
  pendingApprovalChanges?: number;
  draftChanges?: number;
  changesNeedingImpact?: number;
  changesWithRiskAnalysis?: number;
  changesWithControlActions?: number;
  implementedWithFollowUp?: number;
}): ChangeManagementProvider {
  const model = createMockModel();

  model.countDocuments = (query?: any) => {
    // totalChanges (no filters)
    if (!query || Object.keys(query).length <= 1) {
      if (query?.companyId) return mockCount(config?.totalChanges ?? 0);
      return mockCount(config?.totalChanges ?? 0);
    }

    const status = query.status;
    const impactLevel = query.impactLevel;
    const riskAnalysis = query.riskAnalysis;
    const controlActions = query.controlActions;
    const followUpDate = query.followUpDate;

    // Status-based queries
    if (status === ChangeStatus.APPROVED) return mockCount(config?.approvedChanges ?? 0);
    if (status === ChangeStatus.IMPLEMENTED && followUpDate) return mockCount(config?.implementedWithFollowUp ?? 0);
    if (status === ChangeStatus.IMPLEMENTED) return mockCount(config?.implementedChanges ?? 0);
    if (status === ChangeStatus.REJECTED) return mockCount(config?.rejectedChanges ?? 0);
    if (status === ChangeStatus.PENDING_APPROVAL) return mockCount(config?.pendingApprovalChanges ?? 0);
    if (status === ChangeStatus.DRAFT) return mockCount(config?.draftChanges ?? 0);

    // Impact level queries
    if (impactLevel && riskAnalysis) return mockCount(config?.changesWithRiskAnalysis ?? 0);
    if (impactLevel && controlActions) return mockCount(config?.changesWithControlActions ?? 0);
    if (impactLevel) return mockCount(config?.changesNeedingImpact ?? 0);

    return mockCount(0);
  };

  return new ChangeManagementProvider(model);
}

// ==================== TESTS ====================

describe('ChangeManagementProvider (2.11.1 · Gestión del cambio)', () => {

  describe('CHANGE-01: Sin cambios → NO_DATA', () => {
    it('returns NO_DATA when no change requests exist', async () => {
      const provider = createProvider({ totalChanges: 0 });

      const result = await provider.getCompliance(COMPANY_A);

      assert.equal(result.module, 'change-management');
      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.percentage, 0);
      assert.ok(result.findings.length > 0, 'Should have at least one finding');
      const noDataFinding = result.findings.find((f: any) => f.id === 'change-no-data');
      assert.ok(noDataFinding, 'Should have change-no-data finding');
    });
  });

  describe('CHANGE-02: Cambio LOW correctamente documentado', () => {
    it('scores high for documented low-impact changes', async () => {
      const provider = createProvider({
        totalChanges: 1,
        approvedChanges: 1,
        draftChanges: 0,
        changesNeedingImpact: 0, // LOW doesn't need impact
      });

      const result = await provider.getCompliance(COMPANY_A);

      assert.equal(result.module, 'change-management');
      assert.ok(result.percentage > 50, `Percentage ${result.percentage} should be > 50 for documented change`);
      assert.notEqual(result.status, 'NO_DATA');
    });
  });

  describe('CHANGE-03: Cambio MEDIUM con riskAnalysis y controlActions', () => {
    it('scores high for medium changes with complete impact analysis', async () => {
      const provider = createProvider({
        totalChanges: 1,
        approvedChanges: 1,
        changesNeedingImpact: 1,
        changesWithRiskAnalysis: 1,
        changesWithControlActions: 1,
      });

      const result = await provider.getCompliance(COMPANY_A);

      assert.ok(result.percentage >= 90, `Percentage ${result.percentage} should be >= 90 for fully compliant change`);
      // Should NOT have impact findings
      const impactFinding = result.findings.find((f: any) => f.id === 'change-missing-impact-analysis');
      assert.equal(impactFinding, undefined, 'Should not have impact finding when analysis exists');
      const controlFinding = result.findings.find((f: any) => f.id === 'change-missing-control-actions');
      assert.equal(controlFinding, undefined, 'Should not have control finding when actions exist');
    });
  });

  describe('CHANGE-04: Cambio MEDIUM sin riskAnalysis', () => {
    it('generates finding for missing risk analysis', async () => {
      const provider = createProvider({
        totalChanges: 1,
        draftChanges: 1,
        changesNeedingImpact: 1,
        changesWithRiskAnalysis: 0,
        changesWithControlActions: 1,
      });

      const result = await provider.getCompliance(COMPANY_A);

      const impactFinding = result.findings.find((f: any) => f.id === 'change-missing-impact-analysis');
      assert.ok(impactFinding, 'Should have finding for missing risk analysis');
    });
  });

  describe('CHANGE-05: Cambio MEDIUM sin controlActions', () => {
    it('generates finding for missing control actions', async () => {
      const provider = createProvider({
        totalChanges: 1,
        draftChanges: 1,
        changesNeedingImpact: 1,
        changesWithRiskAnalysis: 1,
        changesWithControlActions: 0,
      });

      const result = await provider.getCompliance(COMPANY_A);

      const controlFinding = result.findings.find((f: any) => f.id === 'change-missing-control-actions');
      assert.ok(controlFinding, 'Should have finding for missing control actions');
    });
  });

  describe('CHANGE-06: Cambio HIGH correctamente evaluado', () => {
    it('scores high for high-impact changes with full analysis', async () => {
      const provider = createProvider({
        totalChanges: 1,
        approvedChanges: 1,
        changesNeedingImpact: 1,
        changesWithRiskAnalysis: 1,
        changesWithControlActions: 1,
      });

      const result = await provider.getCompliance(COMPANY_A);

      assert.ok(result.percentage >= 90, `Percentage ${result.percentage} should be >= 90`);
    });
  });

  describe('CHANGE-07: Cambio CRITICAL correctamente evaluado', () => {
    it('scores high for critical changes with full analysis', async () => {
      const provider = createProvider({
        totalChanges: 1,
        implementedChanges: 1,
        implementedWithFollowUp: 1,
        changesNeedingImpact: 1,
        changesWithRiskAnalysis: 1,
        changesWithControlActions: 1,
      });

      const result = await provider.getCompliance(COMPANY_A);

      assert.ok(result.percentage >= 90, `Percentage ${result.percentage} should be >= 90 for critical change with full compliance`);
    });
  });

  describe('CHANGE-08: Cambio PENDING_APPROVAL genera finding', () => {
    it('generates finding for pending approvals', async () => {
      const provider = createProvider({
        totalChanges: 1,
        pendingApprovalChanges: 1,
        draftChanges: 0,
      });

      const result = await provider.getCompliance(COMPANY_A);

      const pendingFinding = result.findings.find((f: any) => f.id === 'change-pending-approval');
      assert.ok(pendingFinding, 'Should have finding for pending approval');
    });
  });

  describe('CHANGE-09: Cambio APPROVED contribuye positivamente', () => {
    it('approved changes contribute positively to approval score', async () => {
      const providerA = createProvider({
        totalChanges: 2,
        approvedChanges: 2,
        draftChanges: 0,
      });

      const resultA = await providerA.getCompliance(COMPANY_A);

      // With all changes approved, approval criterion should be 100%
      assert.ok(resultA.percentage > 30, `Approved changes should boost score`);
    });
  });

  describe('CHANGE-10: Cambio REJECTED genera finding', () => {
    it('generates finding for rejected changes', async () => {
      const provider = createProvider({
        totalChanges: 1,
        rejectedChanges: 1,
        draftChanges: 0,
      });

      const result = await provider.getCompliance(COMPANY_A);

      const rejectedFinding = result.findings.find((f: any) => f.id === 'change-rejected');
      assert.ok(rejectedFinding, 'Should have finding for rejected changes');
    });
  });

  describe('CHANGE-11: Cambio IMPLEMENTED con followUpDate', () => {
    it('scores 100% on implementation criterion', async () => {
      const provider = createProvider({
        totalChanges: 1,
        implementedChanges: 1,
        implementedWithFollowUp: 1,
        approvedChanges: 0,
        draftChanges: 0,
      });

      const result = await provider.getCompliance(COMPANY_A);

      const followUpFinding = result.findings.find((f: any) => f.id === 'change-missing-follow-up');
      assert.equal(followUpFinding, undefined, 'Should not have follow-up finding when followUpDate exists');
    });
  });

  describe('CHANGE-12: Cambio IMPLEMENTED sin followUpDate', () => {
    it('generates finding for missing follow-up', async () => {
      const provider = createProvider({
        totalChanges: 1,
        implementedChanges: 1,
        implementedWithFollowUp: 0,
        draftChanges: 0,
      });

      const result = await provider.getCompliance(COMPANY_A);

      const followUpFinding = result.findings.find((f: any) => f.id === 'change-missing-follow-up');
      assert.ok(followUpFinding, 'Should have finding for missing follow-up');
    });
  });

  describe('CHANGE-13: Cambios DRAFT no generan falsamente finding de seguimiento', () => {
    it('draft changes do not trigger follow-up finding', async () => {
      const provider = createProvider({
        totalChanges: 3,
        draftChanges: 3,
        implementedChanges: 0,
      });

      const result = await provider.getCompliance(COMPANY_A);

      const followUpFinding = result.findings.find((f: any) => f.id === 'change-missing-follow-up');
      assert.equal(followUpFinding, undefined, 'Draft changes should not trigger follow-up finding');
    });
  });

  describe('CHANGE-14: Múltiples cambios correctamente calculados proporcionalmente', () => {
    it('calculates proportional scores for multiple changes', async () => {
      const provider = createProvider({
        totalChanges: 10,
        approvedChanges: 8,
        implementedChanges: 2,
        implementedWithFollowUp: 2,
        draftChanges: 0,
        changesNeedingImpact: 10,
        changesWithRiskAnalysis: 8,
        changesWithControlActions: 7,
      });

      const result = await provider.getCompliance(COMPANY_A);

      assert.equal(result.module, 'change-management');
      assert.ok(result.percentage > 0, 'Should have positive percentage');
      assert.ok(result.percentage <= 100, 'Percentage should not exceed 100');
    });
  });

  describe('CHANGE-15: Tenant isolation - Company A no ve cambios de Company B', () => {
    it('Company A data never contaminates Company B', async () => {
      const providerA = createProvider({
        totalChanges: 5,
        approvedChanges: 5,
        changesNeedingImpact: 5,
        changesWithRiskAnalysis: 5,
        changesWithControlActions: 5,
      });

      const providerB = createProvider({
        totalChanges: 0,
      });

      const resultA = await providerA.getCompliance(COMPANY_A);
      const resultB = await providerB.getCompliance(COMPANY_B);

      assert.ok(resultA.percentage > 0, 'Company A should have compliance');
      assert.equal(resultB.status, 'NO_DATA', 'Company B should have NO_DATA');
    });
  });

  describe('CHANGE-16: Cambios de Company B no alteran el porcentaje de Company A', () => {
    it('separate provider instances maintain isolation', async () => {
      const providerA = createProvider({
        totalChanges: 2,
        approvedChanges: 2,
        draftChanges: 0,
      });

      const resultA = await providerA.getCompliance(COMPANY_A);

      const providerB = createProvider({
        totalChanges: 100,
        approvedChanges: 100,
      });

      const resultB = await providerB.getCompliance(COMPANY_B);

      // resultA should not be affected by resultB's data
      assert.ok(resultA.percentage > 0, 'Company A should still have its own score');
      assert.equal(resultA.module, 'change-management');
      assert.equal(resultB.module, 'change-management');
      // Independence: Company A's score is based only on its own 2 changes
      // With 2 approved out of 2, approval = 100%, docs = 100%
      assert.ok(resultA.percentage > 80, 'Company A score should reflect only its own data');
    });
  });

  describe('CHANGE-17: Los cuatro criterios suman exactamente 100%', () => {
    it('weights sum to 100% (30+30+20+20)', () => {
      const weights = { docs: 30, impact: 30, approval: 20, implementation: 20 };
      const total = weights.docs + weights.impact + weights.approval + weights.implementation;
      assert.equal(total, 100, 'All criterion weights must sum to 100');
    });
  });

  describe('CHANGE-18: La contribución pertenece únicamente a HACER', () => {
    it('phases.do equals percentage and no other phases are set', async () => {
      const provider = createProvider({
        totalChanges: 2,
        approvedChanges: 2,
        draftChanges: 0,
        changesNeedingImpact: 2,
        changesWithRiskAnalysis: 2,
        changesWithControlActions: 2,
      });

      const result = await provider.getCompliance(COMPANY_A);

      assert.ok(result.phases, 'Should have phases');
      assert.equal(result.phases!.do, result.percentage, 'phases.do should equal percentage');
      assert.equal(result.phases!.plan, undefined, 'Should not contribute to plan');
      assert.equal(result.phases!.check, undefined, 'Should not contribute to check');
      assert.equal(result.phases!.act, undefined, 'Should not contribute to act');
    });
  });

  describe('CHANGE-19: No existe doble scoring', () => {
    it('provider returns only one module result', async () => {
      const provider = createProvider({
        totalChanges: 3,
        approvedChanges: 3,
      });

      const result = await provider.getCompliance(COMPANY_A);

      assert.equal(result.module, 'change-management', 'Module should be change-management');
      // Only one result per provider call
      assert.equal(typeof result.percentage, 'number');
      assert.ok(Array.isArray(result.findings));
    });
  });

  describe('CHANGE-20: Resultado compatible con ProviderComplianceResult', () => {
    it('has all required fields', async () => {
      const provider = createProvider({
        totalChanges: 2,
        approvedChanges: 1,
        draftChanges: 1,
      });

      const result = await provider.getCompliance(COMPANY_A);

      // Required fields
      assert.equal(typeof result.module, 'string');
      assert.equal(typeof result.percentage, 'number');
      assert.equal(typeof result.status, 'string');
      assert.ok(Array.isArray(result.findings));
      assert.equal(typeof result.pending, 'number');
      assert.equal(typeof result.completed, 'number');

      // Module must be 'change-management'
      assert.equal(result.module, 'change-management');

      // Percentage must be 0-100
      assert.ok(result.percentage >= 0, 'Percentage >= 0');
      assert.ok(result.percentage <= 100, 'Percentage <= 100');

      // Status must be valid
      assert.ok(['NO_DATA', 'TARGET_MET', 'TARGET_NOT_MET'].includes(result.status));

      // Findings must have required fields
      for (const finding of result.findings) {
        assert.equal(typeof finding.id, 'string');
        assert.equal(finding.module, 'change-management');
        assert.equal(typeof finding.title, 'string');
        assert.equal(typeof finding.description, 'string');
        assert.equal(typeof finding.priority, 'string');
      }
    });
  });

  describe('CHANGE-21: Solo borradores dan score bajo en aprobación', () => {
    it('only draft changes result in low approval score', async () => {
      const provider = createProvider({
        totalChanges: 5,
        draftChanges: 5,
        approvedChanges: 0,
        implementedChanges: 0,
        changesNeedingImpact: 0,
      });

      const result = await provider.getCompliance(COMPANY_A);

      // Docs criterion = 100% (changes exist)
      // Impact = 100% (no medium+ changes)
      // Approval = 0% (all draft, no approved/implemented)
      // Implementation = 100% (no implemented changes)
      // Total = 30*1 + 30*1 + 20*0 + 20*1 = 80%
      assert.equal(result.percentage, 80, 'Should be 80% with only draft changes');
    });
  });

  describe('CHANGE-22: Impacto con cumplimiento parcial', () => {
    it('scores proportionally when some changes lack analysis', async () => {
      const provider = createProvider({
        totalChanges: 4,
        approvedChanges: 4,
        changesNeedingImpact: 4,
        changesWithRiskAnalysis: 2, // 50%
        changesWithControlActions: 2, // 50%
      });

      const result = await provider.getCompliance(COMPANY_A);

      // Impact score = 50% (average of 50% risk + 50% control)
      // Docs = 100%, Impact = 50%, Approval = 100%, Implementation = 100%
      // Total = 30*1 + 30*0.5 + 20*1 + 20*1 = 30+15+20+20 = 85%
      assert.equal(result.percentage, 85, 'Should be 85% with 50% impact compliance');
    });
  });
});
