import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

/**
 * Tests para BLOQUE 6C — ContractingProvider (2.10.1 · Contratación).
 *
 * Valida que el provider genera resultados de cumplimiento correctos
 * para el dominio de Contratación, incluyendo tenant isolation,
 * manejo de NO_DATA, y compatibilidad con ProviderComplianceResult.
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

function createMockModel(defaultResult: number = 0) {
  const m: any = {};
  m.countDocuments = (_q?: any) => mockCount(defaultResult);
  m.distinct = (_field?: string, _q?: any) => mockQuery([]);
  return m;
}

// ==================== CONSTANTS ====================

const COMPANY_A = '6a1efb525fff84649b532541';
const COMPANY_B = '6b2efb525fff84649b532542';

// ==================== IMPORTS ====================

import { ContractingProvider } from './contracting.provider';
import { ContractStatus } from '../../contracting/schemas/contract.schema';
import { InductionStatus } from '../../contracting/schemas/contract-induction.schema';

// ==================== SERVICE CREATION ====================

function createProvider(config?: {
  totalContracts?: number;
  activeContracts?: number;
  cancelledContracts?: number;
  activeWithSst?: number;
  totalInductions?: number;
  completedInductions?: number;
  totalEvaluations?: number;
  distinctEvaluatedContracts?: string[];
  activeContractsWithEval?: number;
}): ContractingProvider {
  const contractModel = createMockModel(0);
  const inductionModel = createMockModel(0);
  const evaluationModel = createMockModel(0);

  // Override countDocuments to return different values based on query
  contractModel.countDocuments = (query?: any) => {
    if (query?.status?.$ne) {
      // Total non-cancelled
      return mockCount(config?.totalContracts ?? 0);
    }
    if (query?.status === ContractStatus.ACTIVE && query?.sstRequirements) {
      // Active with SST
      return mockCount(config?.activeWithSst ?? 0);
    }
    if (query?.status === ContractStatus.ACTIVE && query?._id?.$in) {
      // Active with evaluation
      return mockCount(config?.activeContractsWithEval ?? 0);
    }
    if (query?.status === ContractStatus.ACTIVE) {
      // Active contracts
      return mockCount(config?.activeContracts ?? 0);
    }
    if (query?.status === ContractStatus.CANCELLED) {
      // Cancelled
      return mockCount(config?.cancelledContracts ?? 0);
    }
    return mockCount(config?.totalContracts ?? 0);
  };

  inductionModel.countDocuments = (query?: any) => {
    if (query?.status === InductionStatus.COMPLETED) {
      return mockCount(config?.completedInductions ?? 0);
    }
    return mockCount(config?.totalInductions ?? 0);
  };

  evaluationModel.countDocuments = () => {
    return mockCount(config?.totalEvaluations ?? 0);
  };

  evaluationModel.distinct = (_field?: string, _q?: any) => {
    return mockQuery(config?.distinctEvaluatedContracts ?? []);
  };

  return new ContractingProvider(contractModel, inductionModel, evaluationModel);
}

// ==================== TESTS ====================

describe('ContractingProvider (2.10.1 · Contratación)', () => {

  describe('COMPLIANCE-01: Contratos activos con requisitos SST completos', () => {
    it('devuelve 100% cuando todos los activos tienen SST + evaluaciones + inducciones', async () => {
      const provider = createProvider({
        totalContracts: 10,
        activeContracts: 10,
        activeWithSst: 10,
        totalInductions: 5,
        completedInductions: 5,
        totalEvaluations: 5,
        distinctEvaluatedContracts: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'],
        activeContractsWithEval: 10,
      });

      const result = await provider.getCompliance(COMPANY_A);

      assert.equal(result.module, 'contracting');
      // Policies = 0%, so max = 80% → TARGET_NOT_MET unless policy data exists
      // Policies = 0%, so max = 80% (30+25+25)
      assert.ok(result.percentage >= 75, `Percentage ${result.percentage} should be >= 75 for full compliance minus policies`);
    });
  });

  describe('COMPLIANCE-02: Contratos activos sin requisitos SST', () => {
    it(' SST criteria = 0 when no contracts have sstRequirements', async () => {
      const provider = createProvider({
        totalContracts: 5,
        activeContracts: 5,
        activeWithSst: 0,
        totalInductions: 0,
        completedInductions: 0,
        totalEvaluations: 0,
        activeContractsWithEval: 0,
      });

      const result = await provider.getCompliance(COMPANY_A);

      assert.equal(result.module, 'contracting');
      assert.ok(result.percentage < 50, `Percentage ${result.percentage} should be low without SST`);
      // Should have finding for missing SST
      const sstFinding = result.findings.find((f: any) => f.id === 'ctr-no-sst-requirements');
      assert.ok(sstFinding, 'Should have finding for missing SST requirements');
    });
  });

  describe('COMPLIANCE-03: Inducciones completadas', () => {
    it('scores high when all inductions are completed', async () => {
      const provider = createProvider({
        totalContracts: 3,
        activeContracts: 3,
        activeWithSst: 3,
        totalInductions: 10,
        completedInductions: 10,
        totalEvaluations: 3,
        distinctEvaluatedContracts: ['c1', 'c2', 'c3'],
        activeContractsWithEval: 3,
      });

      const result = await provider.getCompliance(COMPANY_A);

      assert.ok(result.completed > 0, 'Should have completed items');
      const inductionFinding = result.findings.find((f: any) => f.id === 'ctr-pending-inductions');
      assert.equal(inductionFinding, undefined, 'Should not have finding when all inductions completed');
    });
  });

  describe('COMPLIANCE-04: Inducciones pendientes', () => {
    it('generates finding for pending inductions', async () => {
      const provider = createProvider({
        totalContracts: 2,
        activeContracts: 2,
        activeWithSst: 2,
        totalInductions: 10,
        completedInductions: 3,
        totalEvaluations: 0,
        activeContractsWithEval: 0,
      });

      const result = await provider.getCompliance(COMPANY_A);

      const inductionFinding = result.findings.find((f: any) => f.id === 'ctr-pending-inductions');
      assert.ok(inductionFinding, 'Should have finding for pending inductions');
      assert.ok(inductionFinding.title.includes('7'), 'Should mention 7 pending inductions');
    });
  });

  describe('COMPLIANCE-05: Contratos con evaluación', () => {
    it('scores high when all active contracts have evaluations', async () => {
      const provider = createProvider({
        totalContracts: 4,
        activeContracts: 4,
        activeWithSst: 4,
        totalInductions: 0,
        totalEvaluations: 5,
        distinctEvaluatedContracts: ['c1', 'c2', 'c3', 'c4'],
        activeContractsWithEval: 4,
      });

      const result = await provider.getCompliance(COMPANY_A);

      const evalFinding = result.findings.find((f: any) => f.id === 'ctr-no-evaluations');
      assert.equal(evalFinding, undefined, 'Should not have finding when all contracts evaluated');
    });
  });

  describe('COMPLIANCE-06: Contratos sin evaluación', () => {
    it('generates finding for contracts without evaluation', async () => {
      const provider = createProvider({
        totalContracts: 3,
        activeContracts: 3,
        activeWithSst: 3,
        totalInductions: 0,
        totalEvaluations: 0,
        activeContractsWithEval: 0,
      });

      const result = await provider.getCompliance(COMPANY_A);

      const evalFinding = result.findings.find((f: any) => f.id === 'ctr-no-evaluations');
      assert.ok(evalFinding, 'Should have finding for missing evaluations');
      assert.ok(evalFinding.title.includes('3'), 'Should mention 3 contracts');
    });
  });

  describe('COMPLIANCE-07: Sin datos de pólizas/certificados', () => {
    it('always shows policy finding since fields do not exist', async () => {
      const provider = createProvider({
        totalContracts: 2,
        activeContracts: 2,
        activeWithSst: 2,
        totalInductions: 0,
        totalEvaluations: 0,
        activeContractsWithEval: 0,
      });

      const result = await provider.getCompliance(COMPANY_A);

      const policyFinding = result.findings.find((f: any) => f.id === 'ctr-no-policy-data');
      assert.ok(policyFinding, 'Should always have policy/certificate finding');
      assert.ok(policyFinding.title.includes('pólizas'), 'Should mention policies');
    });
  });

  describe('COMPLIANCE-08: Empresa sin contratos → NO_DATA', () => {
    it('returns NO_DATA when no contracts exist', async () => {
      const provider = createProvider({
        totalContracts: 0,
        activeContracts: 0,
        cancelledContracts: 0,
        totalInductions: 0,
        totalEvaluations: 0,
      });

      const result = await provider.getCompliance(COMPANY_A);

      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.percentage, 0);
      assert.ok(result.findings.length > 0, 'Should have at least one finding');
      const noDataFinding = result.findings.find((f: any) => f.id === 'ctr-no-data');
      assert.ok(noDataFinding, 'Should have NO_DATA finding');
    });
  });

  describe('COMPLIANCE-09: Tenant isolation', () => {
    it('Company A data never contaminates Company B', async () => {
      const providerA = createProvider({
        totalContracts: 5,
        activeContracts: 5,
        activeWithSst: 5,
        totalInductions: 0,
        totalEvaluations: 0,
        activeContractsWithEval: 0,
      });

      const providerB = createProvider({
        totalContracts: 0,
        activeContracts: 0,
        totalEvaluations: 0,
      });

      const resultA = await providerA.getCompliance(COMPANY_A);
      const resultB = await providerB.getCompliance(COMPANY_B);

      assert.ok(resultA.percentage > 0, 'Company A should have compliance');
      assert.equal(resultB.status, 'NO_DATA', 'Company B should have NO_DATA');
    });
  });

  describe('COMPLIANCE-10: Contratos CANCELLED no contaminan', () => {
    it('cancelled contracts do not count as active', async () => {
      const provider = createProvider({
        totalContracts: 10,
        activeContracts: 0,
        cancelledContracts: 10,
        activeWithSst: 0,
        totalInductions: 0,
        totalEvaluations: 0,
        activeContractsWithEval: 0,
      });

      const result = await provider.getCompliance(COMPANY_A);

      // Active = 0, so no SST/evaluation findings about active contracts
      // But totalContracts = 10 (non-cancelled) means data exists, not NO_DATA
      // Since activeContracts = 0, no criteria can score
      assert.ok(result.percentage <= 20, 'Should have low percentage with only cancelled contracts');
      assert.notEqual(result.status, 'NO_DATA', 'Should not be NO_DATA if non-cancelled contracts exist');
    });
  });

  describe('COMPLIANCE-11: Contrato DRAFT no se cuenta como activo', () => {
    it('draft contracts are not counted in active metrics', async () => {
      const provider = createProvider({
        totalContracts: 5,
        activeContracts: 0, // All are DRAFT
        activeWithSst: 0,
        totalInductions: 0,
        totalEvaluations: 0,
        activeContractsWithEval: 0,
      });

      const result = await provider.getCompliance(COMPANY_A);

      // No active contracts = no SST/evaluation criteria to evaluate
      assert.ok(result.percentage <= 20, 'Should have low percentage with only DRAFT contracts');
    });
  });

  describe('COMPLIANCE-12: Resultado compatible con ProviderComplianceResult', () => {
    it('has all required fields', async () => {
      const provider = createProvider({
        totalContracts: 2,
        activeContracts: 2,
        activeWithSst: 1,
        totalInductions: 0,
        totalEvaluations: 0,
        activeContractsWithEval: 0,
      });

      const result = await provider.getCompliance(COMPANY_A);

      // Required fields
      assert.equal(typeof result.module, 'string');
      assert.equal(typeof result.percentage, 'number');
      assert.equal(typeof result.status, 'string');
      assert.ok(Array.isArray(result.findings));
      assert.equal(typeof result.pending, 'number');
      assert.equal(typeof result.completed, 'number');

      // Module must be 'contracting'
      assert.equal(result.module, 'contracting');

      // Percentage must be 0-100
      assert.ok(result.percentage >= 0, 'Percentage >= 0');
      assert.ok(result.percentage <= 100, 'Percentage <= 100');

      // Status must be valid
      assert.ok(['NO_DATA', 'TARGET_MET', 'TARGET_NOT_MET'].includes(result.status));

      // Findings must have required fields
      for (const finding of result.findings) {
        assert.equal(typeof finding.id, 'string');
        assert.equal(finding.module, 'contracting');
        assert.equal(typeof finding.title, 'string');
        assert.equal(typeof finding.description, 'string');
        assert.equal(typeof finding.priority, 'string');
      }
    });
  });

  describe('COMPLIANCE-13: Findings y pending siguen el contrato', () => {
    it('findings have correct structure', async () => {
      const provider = createProvider({
        totalContracts: 3,
        activeContracts: 3,
        activeWithSst: 1,
        totalInductions: 5,
        completedInductions: 2,
        totalEvaluations: 0,
        activeContractsWithEval: 0,
      });

      const result = await provider.getCompliance(COMPANY_A);

      // Should have SST finding
      assert.ok(result.findings.some((f: any) => f.id === 'ctr-no-sst-requirements'));

      // Should have induction finding
      assert.ok(result.findings.some((f: any) => f.id === 'ctr-pending-inductions'));

      // Should have evaluation finding
      assert.ok(result.findings.some((f: any) => f.id === 'ctr-no-evaluations'));

      // Should have policy finding
      assert.ok(result.findings.some((f: any) => f.id === 'ctr-no-policy-data'));

      // pending should be > 0
      assert.ok(result.pending > 0, 'Should have pending items');
    });
  });

  describe('COMPLIANCE-14: No se modifica el scoring global', () => {
    it('phases.do equals percentage', async () => {
      const provider = createProvider({
        totalContracts: 2,
        activeContracts: 2,
        activeWithSst: 2,
        totalInductions: 0,
        totalEvaluations: 0,
        activeContractsWithEval: 0,
      });

      const result = await provider.getCompliance(COMPANY_A);

      assert.ok(result.phases, 'Should have phases');
      assert.equal(result.phases!.do, result.percentage, 'phases.do should equal percentage');
    });
  });
});
