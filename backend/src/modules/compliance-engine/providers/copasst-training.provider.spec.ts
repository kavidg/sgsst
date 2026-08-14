import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import { PhvaAdvancedCopasstTrainingService } from '../../phva-advanced/phva-advanced-copasst-training.service';
import { CopasstTrainingProvider } from './copasst-training.provider';
import { ComplianceLevel } from '../enums/compliance-level.enum';

/** Stub del service de dominio 1.1.7 (nunca consulta la colección). */
function buildService(overrides: {
  record?: unknown;
  coverage?: { totalMembers: number; trainedMembers: number; coveragePercentage: number; executedSessions: number };
  period?: unknown;
}) {
  const calls: string[] = [];
  const service = {
    findByCompany: async () => {
      calls.push('findByCompany');
      return overrides.record ?? null;
    },
    calculateCoverage: async () => {
      calls.push('calculateCoverage');
      return (
        overrides.coverage ?? {
          totalMembers: 0,
          trainedMembers: 0,
          coveragePercentage: 0,
          executedSessions: 0,
        }
      );
    },
    getCurrentCopasstPeriod: async () => {
      calls.push('getCurrentCopasstPeriod');
      return overrides.period ?? null;
    },
    getActiveCopasstMembers: async () => [],
    isSessionExecuted: () => false,
  } as unknown as PhvaAdvancedCopasstTrainingService;
  return { service, calls };
}

const COMPANY_A = new Types.ObjectId('64a00000000000000000000a');
const COMPANY_B = new Types.ObjectId('64a00000000000000000000b');

describe('CopasstTrainingProvider (1.1.7 Compliance)', () => {
  it('sin entidad ni periodo → 0% con hallazgos descriptivos', async () => {
    const { service } = buildService({});
    const provider = new CopasstTrainingProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.module, 'copasst-training');
    assert.equal(result.percentage, 0);
    assert.equal(result.status, ComplianceLevel.CRITICAL);
    assert.equal(result.pending, 0);
    assert.equal(result.completed, 0);
    assert.ok(result.findings.some((f) => f.id === 'copasst-training-no-period'));
    assert.ok(result.findings.some((f) => f.id === 'copasst-training-no-program'));
  });

  it('sin periodo pero con entidad → hallazgo de periodo ausente', async () => {
    const { service } = buildService({
      record: { year: 2026 },
      coverage: { totalMembers: 0, trainedMembers: 0, coveragePercentage: 0, executedSessions: 0 },
    });
    const provider = new CopasstTrainingProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.ok(result.findings.some((f) => f.id === 'copasst-training-no-period'));
    assert.ok(!result.findings.some((f) => f.id === 'copasst-training-no-program'));
  });

  it('miembros activos sin capacitación → 0% y hallazgo de cobertura parcial', async () => {
    const { service } = buildService({
      record: { year: 2026 },
      period: { _id: new Types.ObjectId() },
      coverage: { totalMembers: 5, trainedMembers: 0, coveragePercentage: 0, executedSessions: 0 },
    });
    const provider = new CopasstTrainingProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 0);
    assert.equal(result.pending, 5);
    assert.ok(result.findings.some((f) => f.id === 'copasst-training-partial-coverage'));
    assert.ok(result.findings.some((f) => f.id === 'copasst-training-no-executed-sessions'));
  });

  it('cobertura parcial → porcentaje real y findings', async () => {
    const { service } = buildService({
      record: { year: 2026 },
      period: { _id: new Types.ObjectId() },
      coverage: { totalMembers: 10, trainedMembers: 6, coveragePercentage: 60, executedSessions: 3 },
    });
    const provider = new CopasstTrainingProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 60);
    assert.equal(result.status, ComplianceLevel.MEDIUM);
    assert.equal(result.pending, 4);
    assert.equal(result.completed, 6);
    assert.ok(result.findings.some((f) => f.id === 'copasst-training-partial-coverage'));
  });

  it('cobertura completa (100%) → sin hallazgos de cobertura', async () => {
    const { service } = buildService({
      record: { year: 2026 },
      period: { _id: new Types.ObjectId() },
      coverage: { totalMembers: 8, trainedMembers: 8, coveragePercentage: 100, executedSessions: 4 },
    });
    const provider = new CopasstTrainingProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 100);
    assert.equal(result.status, ComplianceLevel.EXCELLENT);
    assert.ok(!result.findings.some((f) => f.id === 'copasst-training-partial-coverage'));
  });

  it('sesiones programadas sin ejecutadas → hallazgo de ejecución (dominio no las cuenta)', async () => {
    const { service } = buildService({
      record: { year: 2026, sessions: [{ status: 'Programada' }] },
      period: { _id: new Types.ObjectId() },
      coverage: { totalMembers: 3, trainedMembers: 0, coveragePercentage: 0, executedSessions: 0 },
    });
    const provider = new CopasstTrainingProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.ok(result.findings.some((f) => f.id === 'copasst-training-no-executed-sessions'));
  });

  it('multi-tenancy: la empresa B no ve datos de la empresa A (service scoped por companyId)', async () => {
    const seen: string[] = [];
    const service = {
      findByCompany: async (companyId: Types.ObjectId) => {
        seen.push(companyId.toString());
        // La entidad existe para A pero NO para B → aislamiento del tenant.
        return companyId.toString() === COMPANY_A.toString()
          ? { year: 2026 }
          : null;
      },
      calculateCoverage: async () => ({ totalMembers: 0, trainedMembers: 0, coveragePercentage: 0, executedSessions: 0 }),
      getCurrentCopasstPeriod: async (companyId: Types.ObjectId) =>
        companyId.toString() === COMPANY_A.toString() ? { _id: new Types.ObjectId() } : null,
      getActiveCopasstMembers: async () => [],
      isSessionExecuted: () => false,
    } as unknown as PhvaAdvancedCopasstTrainingService;
    const provider = new CopasstTrainingProvider(service);

    const resultB = await provider.getCompliance(COMPANY_B.toString());

    // La entidad de A nunca se resuelve para B.
    assert.equal(resultB.percentage, 0);
    assert.ok(resultB.findings.some((f) => f.id === 'copasst-training-no-program'));
    assert.ok(resultB.findings.some((f) => f.id === 'copasst-training-no-period'));
    assert.ok(seen.every((id) => id === COMPANY_B.toString()));
  });

  it('error de infraestructura → resultado 0 controlado sin lanzar', async () => {
    const service = {
      findByCompany: async () => {
        throw new Error('connection timeout');
      },
    } as unknown as PhvaAdvancedCopasstTrainingService;
    const provider = new CopasstTrainingProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 0);
    assert.ok(result.findings.some((f) => f.id === 'copasst-training-error'));
  });

  it('siempre consulta por companyId (nunca entityId sin scope)', async () => {
    const { service, calls } = buildService({});
    const provider = new CopasstTrainingProvider(service);
    await provider.getCompliance(COMPANY_A.toString());

    assert.deepEqual(calls, ['findByCompany', 'calculateCoverage', 'getCurrentCopasstPeriod']);
  });
});
