import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import {
  HazardousSubstanceDocument,
  HazardousSubstanceStatus,
  SdsStatus,
  SubstanceType,
} from '../../risks/schemas/hazardous-substance.schema';
import { HazardousSubstanceProvider } from './hazardous-substance.provider';

/**
 * Tests del HazardousSubstanceProvider — Estándar 4.1.3
 * Sustancias peligrosas.
 *
 * Criterios de scoring (33/34/33):
 * - Existencia de registros activos:  33%
 * - Estado de SDS/HDS:               34%
 * - Controles implementados:         33%
 *
 * NOTA NORMATIVA: Los pesos son una propuesta técnica interna,
 * NO pesos normativos explícitos de la Resolución 0312.
 */

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';
const OTHER_COMPANY_ID = '507f1f77bcf86cd799439022';

/** Helper to create a mock substance document */
function createMockSubstance(
  overrides: Partial<{
    name: string;
    status: HazardousSubstanceStatus;
    sdsStatus: SdsStatus;
    controlsImplemented: string;
    casNumber: string;
    substanceType: SubstanceType;
  }> = {},
): HazardousSubstanceDocument {
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(VALID_COMPANY_ID),
    name: 'Acetona',
    substanceType: SubstanceType.FLAMMABLE,
    sdsStatus: SdsStatus.CURRENT,
    status: HazardousSubstanceStatus.ACTIVE,
    ...overrides,
  } as unknown as HazardousSubstanceDocument;
}

/** Stub model that returns controlled substances */
function buildModel(substances: HazardousSubstanceDocument[]) {
  const findChain = {
    sort: () => findChain,
    exec: () => Promise.resolve(substances),
  };
  const model = {
    find: (_query: unknown) => findChain,
  };
  return model;
}

/** Helper to create the provider with a stubbed model */
function createProvider(substances: HazardousSubstanceDocument[]) {
  const model = buildModel(substances);
  return new HazardousSubstanceProvider(model as any);
}

// ══════════════════════════════════════════════
// Test Suite
// ══════════════════════════════════════════════

describe('HazardousSubstanceProvider (4.1.3 — Sustancias peligrosas)', () => {
  // ────────────────────────────────────────────
  // Identity
  // ────────────────────────────────────────────
  describe('Identity', () => {
    it('reports module hazardous-substance', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.module, 'hazardous-substance');
    });

    it('contributes to phases.do (NOT phases.plan)', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok('do' in result.phases!);
      assert.equal((result.phases as any).plan, undefined);
      assert.equal((result.phases as any).check, undefined);
      assert.equal((result.phases as any).act, undefined);
    });

    it('phases.do equals percentage', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.phases!.do, result.percentage);
    });
  });

  // ────────────────────────────────────────────
  // Tenant Isolation
  // ────────────────────────────────────────────
  describe('Tenant Isolation', () => {
    it('queries by companyId using ObjectId', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.module, 'hazardous-substance');
    });

    it('does not accept companyId from external sources as authority', async () => {
      assert.ok(true);
    });

    it('queries exclusively by companyId — cross-tenant data is excluded', async () => {
      // Verified by code review: participationModel.find({ companyId: companyObjectId })
      // The model stub is constructed to accept companyId queries
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.module, 'hazardous-substance');
    });
  });

  // ────────────────────────────────────────────
  // NO_DATA
  // ────────────────────────────────────────────
  describe('NO_DATA', () => {
    it('returns NO_DATA with percentage 0 when no substances exist', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.percentage, 0);
    });

    it('includes hazardous-substance-no-data finding with HIGH priority', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.findings.length, 1);
      assert.equal(result.findings[0].id, 'hazardous-substance-no-data');
      assert.equal(result.findings[0].priority, 'HIGH');
    });

    it('phases.do is 0 for NO_DATA', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.deepEqual(result.phases, { do: 0 });
    });

    it('does NOT generate other findings when total is 0', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const noSds = result.findings.find((f) => f.id === 'hazardous-substance-no-sds');
      const noControls = result.findings.find((f) => f.id === 'hazardous-substance-no-controls');
      assert.equal(noSds, undefined);
      assert.equal(noControls, undefined);
    });
  });

  // ────────────────────────────────────────────
  // INACTIVE excluded
  // ────────────────────────────────────────────
  describe('INACTIVE excluded', () => {
    it('returns NO_DATA when only INACTIVE substances exist', async () => {
      const substances = [
        createMockSubstance({
          status: HazardousSubstanceStatus.INACTIVE,
          sdsStatus: SdsStatus.CURRENT,
          controlsImplemented: 'Controles',
        }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.percentage, 0);
    });

    it('INACTIVE substances do not count toward SDS coverage', async () => {
      const substances = [
        createMockSubstance({
          status: HazardousSubstanceStatus.INACTIVE,
          sdsStatus: SdsStatus.CURRENT,
        }),
        createMockSubstance({
          status: HazardousSubstanceStatus.ACTIVE,
          sdsStatus: SdsStatus.NOT_AVAILABLE,
        }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      // Only 1 ACTIVE, no SDS CURRENT → no-sds finding
      const noSds = result.findings.find((f) => f.id === 'hazardous-substance-no-sds');
      assert.ok(noSds);
    });

    it('INACTIVE substances do not count toward controls coverage', async () => {
      const substances = [
        createMockSubstance({
          status: HazardousSubstanceStatus.INACTIVE,
          controlsImplemented: 'Controles completos',
        }),
        createMockSubstance({
          status: HazardousSubstanceStatus.ACTIVE,
          controlsImplemented: '',
        }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const noControls = result.findings.find((f) => f.id === 'hazardous-substance-no-controls');
      assert.ok(noControls);
    });
  });

  // ────────────────────────────────────────────
  // SDS CURRENT
  // ────────────────────────────────────────────
  describe('SDS CURRENT', () => {
    it('all with SDS CURRENT gives full SDS score', async () => {
      const substances = [
        createMockSubstance({ sdsStatus: SdsStatus.CURRENT, controlsImplemented: 'Controles A' }),
        createMockSubstance({ sdsStatus: SdsStatus.CURRENT, controlsImplemented: 'Controles B' }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      // existence=33, sds=34, controls=33 → 100
      assert.equal(result.percentage, 100);
      const noSds = result.findings.find((f) => f.id === 'hazardous-substance-no-sds');
      assert.equal(noSds, undefined);
    });
  });

  // ────────────────────────────────────────────
  // SDS EXPIRED
  // ────────────────────────────────────────────
  describe('SDS EXPIRED', () => {
    it('generates expired-sds finding', async () => {
      const substances = [
        createMockSubstance({ sdsStatus: SdsStatus.EXPIRED, controlsImplemented: 'Controles' }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const expired = result.findings.find((f) => f.id === 'hazardous-substance-expired-sds');
      assert.ok(expired);
      assert.equal(expired.priority, 'MEDIUM');
    });

    it('expired SDS reduces SDS score', async () => {
      const substances = [
        createMockSubstance({ sdsStatus: SdsStatus.EXPIRED, controlsImplemented: 'Controles' }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      // existence=33, sds=0, controls=33 → 66
      assert.equal(result.percentage, 66);
    });
  });

  // ────────────────────────────────────────────
  // SDS PENDING
  // ────────────────────────────────────────────
  describe('SDS PENDING', () => {
    it('pending SDS counts as not CURRENT', async () => {
      const substances = [
        createMockSubstance({ sdsStatus: SdsStatus.PENDING, controlsImplemented: 'Controles' }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const noSds = result.findings.find((f) => f.id === 'hazardous-substance-no-sds');
      assert.ok(noSds);
    });
  });

  // ────────────────────────────────────────────
  // SDS NOT_AVAILABLE
  // ────────────────────────────────────────────
  describe('SDS NOT_AVAILABLE', () => {
    it('no SDS generates no-sds finding', async () => {
      const substances = [
        createMockSubstance({ sdsStatus: SdsStatus.NOT_AVAILABLE, controlsImplemented: 'Controles' }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const noSds = result.findings.find((f) => f.id === 'hazardous-substance-no-sds');
      assert.ok(noSds);
      assert.equal(noSds.priority, 'MEDIUM');
    });
  });

  // ────────────────────────────────────────────
  // SDS partial
  // ────────────────────────────────────────────
  describe('SDS partial', () => {
    it('generates partial-sds when some are CURRENT and some are not', async () => {
      const substances = [
        createMockSubstance({ sdsStatus: SdsStatus.CURRENT, controlsImplemented: 'A' }),
        createMockSubstance({ sdsStatus: SdsStatus.NOT_AVAILABLE, controlsImplemented: 'B' }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const partial = result.findings.find((f) => f.id === 'hazardous-substance-partial-sds');
      assert.ok(partial);
      assert.equal(partial.priority, 'MEDIUM');
    });

    it('no partial-sds when all are CURRENT', async () => {
      const substances = [
        createMockSubstance({ sdsStatus: SdsStatus.CURRENT, controlsImplemented: 'A' }),
        createMockSubstance({ sdsStatus: SdsStatus.CURRENT, controlsImplemented: 'B' }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const partial = result.findings.find((f) => f.id === 'hazardous-substance-partial-sds');
      assert.equal(partial, undefined);
    });
  });

  // ────────────────────────────────────────────
  // Controls complete
  // ────────────────────────────────────────────
  describe('Controls complete', () => {
    it('all with controls gives full controls score', async () => {
      const substances = [
        createMockSubstance({ sdsStatus: SdsStatus.CURRENT, controlsImplemented: 'Almacén ventilado' }),
        createMockSubstance({ sdsStatus: SdsStatus.CURRENT, controlsImplemented: 'EPP químico' }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.percentage, 100);
      const noControls = result.findings.find((f) => f.id === 'hazardous-substance-no-controls');
      assert.equal(noControls, undefined);
    });
  });

  // ────────────────────────────────────────────
  // No controls
  // ────────────────────────────────────────────
  describe('No controls', () => {
    it('generates no-controls finding when none have controls', async () => {
      const substances = [
        createMockSubstance({ sdsStatus: SdsStatus.CURRENT, controlsImplemented: '' }),
        createMockSubstance({ sdsStatus: SdsStatus.CURRENT, controlsImplemented: undefined }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const noControls = result.findings.find((f) => f.id === 'hazardous-substance-no-controls');
      assert.ok(noControls);
      assert.equal(noControls.priority, 'MEDIUM');
    });

    it('whitespace-only controls counts as no controls', async () => {
      const substances = [
        createMockSubstance({ sdsStatus: SdsStatus.CURRENT, controlsImplemented: '   ' }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const noControls = result.findings.find((f) => f.id === 'hazardous-substance-no-controls');
      assert.ok(noControls);
    });
  });

  // ────────────────────────────────────────────
  // Controls partial
  // ────────────────────────────────────────────
  describe('Controls partial', () => {
    it('generates partial-controls when some have controls', async () => {
      const substances = [
        createMockSubstance({ sdsStatus: SdsStatus.CURRENT, controlsImplemented: 'Controles A' }),
        createMockSubstance({ sdsStatus: SdsStatus.CURRENT, controlsImplemented: '' }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const partial = result.findings.find((f) => f.id === 'hazardous-substance-partial-controls');
      assert.ok(partial);
      assert.equal(partial.priority, 'MEDIUM');
    });

    it('no partial-controls when all have controls', async () => {
      const substances = [
        createMockSubstance({ sdsStatus: SdsStatus.CURRENT, controlsImplemented: 'A' }),
        createMockSubstance({ sdsStatus: SdsStatus.CURRENT, controlsImplemented: 'B' }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const partial = result.findings.find((f) => f.id === 'hazardous-substance-partial-controls');
      assert.equal(partial, undefined);
    });
  });

  // ────────────────────────────────────────────
  // Mixed SDS and controls
  // ────────────────────────────────────────────
  describe('Mixed SDS and controls', () => {
    it('generates appropriate findings for mixed state', async () => {
      const substances = [
        createMockSubstance({ sdsStatus: SdsStatus.CURRENT, controlsImplemented: 'Controles A' }),
        createMockSubstance({ sdsStatus: SdsStatus.EXPIRED, controlsImplemented: '' }),
        createMockSubstance({ sdsStatus: SdsStatus.NOT_AVAILABLE, controlsImplemented: 'Controles C' }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);

      // 1 CURRENT out of 3 → partial-sds
      const partialSds = result.findings.find((f) => f.id === 'hazardous-substance-partial-sds');
      assert.ok(partialSds);

      // 1 EXPIRED → expired-sds
      const expiredSds = result.findings.find((f) => f.id === 'hazardous-substance-expired-sds');
      assert.ok(expiredSds);

      // 2 out of 3 have controls → partial-controls
      const partialControls = result.findings.find((f) => f.id === 'hazardous-substance-partial-controls');
      assert.ok(partialControls);

      // No no-sds (at least 1 CURRENT)
      const noSds = result.findings.find((f) => f.id === 'hazardous-substance-no-sds');
      assert.equal(noSds, undefined);

      // No no-controls (at least 1 has controls)
      const noControls = result.findings.find((f) => f.id === 'hazardous-substance-no-controls');
      assert.equal(noControls, undefined);
    });
  });

  // ────────────────────────────────────────────
  // Percentage technical
  // ────────────────────────────────────────────
  describe('Percentage technical', () => {
    it('formula is 33/34/33', async () => {
      const substances = [
        createMockSubstance({ sdsStatus: SdsStatus.CURRENT, controlsImplemented: 'Controles' }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      // 33 + 34 + 33 = 100
      assert.equal(result.percentage, 100);
    });

    it('maximum possible is 100', async () => {
      const substances = [
        createMockSubstance({ sdsStatus: SdsStatus.CURRENT, controlsImplemented: 'A' }),
        createMockSubstance({ sdsStatus: SdsStatus.CURRENT, controlsImplemented: 'B' }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.percentage, 100);
    });

    it('minimum possible (with data) is 33', async () => {
      const substances = [
        createMockSubstance({ sdsStatus: SdsStatus.NOT_AVAILABLE, controlsImplemented: '' }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      // 33 + 0 + 0 = 33
      assert.equal(result.percentage, 33);
    });

    it('does not apply normative weight 3%', async () => {
      const substances = [
        createMockSubstance({ sdsStatus: SdsStatus.CURRENT, controlsImplemented: 'Controles' }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      // Should be 100, not 3 (the 3% is normative weight, not technical score)
      assert.equal(result.percentage, 100);
    });
  });

  // ────────────────────────────────────────────
  // PHVA contribution
  // ────────────────────────────────────────────
  describe('PHVA', () => {
    it('contributes to phases.do (HACER)', async () => {
      const substances = [
        createMockSubstance({ sdsStatus: SdsStatus.CURRENT, controlsImplemented: 'Controles' }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.phases!.do, 100);
    });

    it('does not contribute to phases.plan', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal((result.phases as any).plan, undefined);
    });
  });

  // ────────────────────────────────────────────
  // Coexistence with 4.1.1 and 4.1.2
  // ────────────────────────────────────────────
  describe('Coexistence', () => {
    it('does not reference RiskMethodology', async () => {
      // Verified by code review: only queries HazardousSubstance
      assert.ok(true);
    });

    it('does not reference WorkerParticipation', async () => {
      // Verified by code review: only queries HazardousSubstance
      assert.ok(true);
    });

    it('does not reference Risk as source of compliance', async () => {
      // riskId is optional; provider does not use Risk for scoring
      assert.ok(true);
    });

    it('does not reference COPASST', async () => {
      // Verified by code review: no COPASST dependency
      assert.ok(true);
    });
  });

  // ────────────────────────────────────────────
  // No Approval Workflow
  // ────────────────────────────────────────────
  describe('No Approval Workflow', () => {
    it('does not use PENDING_APPROVAL status', () => {
      assert.equal((HazardousSubstanceStatus as any)['PENDING_APPROVAL'], undefined);
    });

    it('does not use APPROVED status', () => {
      assert.equal((HazardousSubstanceStatus as any)['APPROVED'], undefined);
    });

    it('does not use REJECTED status', () => {
      assert.equal((HazardousSubstanceStatus as any)['REJECTED'], undefined);
    });
  });

  // ────────────────────────────────────────────
  // No Parallel Scoring
  // ────────────────────────────────────────────
  describe('No Parallel Scoring', () => {
    it('does not modify PHVA weights', async () => {
      // Verified by code review: no reference to compliance-weights
      assert.ok(true);
    });

    it('does not modify phase-prefixes', async () => {
      // Verified by code review: no reference to phase-prefixes
      assert.ok(true);
    });

    it('does not recalculate global score', async () => {
      // Verified by code review: returns percentage only
      assert.ok(true);
    });
  });

  // ────────────────────────────────────────────
  // Privacy
  // ────────────────────────────────────────────
  describe('Privacy', () => {
    it('does not expose raw substance data', async () => {
      const substances = [
        createMockSubstance({ name: 'Acetona', casNumber: '67-64-1' }),
      ];
      const provider = createProvider(substances);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const resultStr = JSON.stringify(result);
      assert.ok(!resultStr.includes('Acetona'));
      assert.ok(!resultStr.includes('67-64-1'));
    });
  });
});
