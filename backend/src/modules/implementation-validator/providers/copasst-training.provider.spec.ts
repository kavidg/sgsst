import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import { PhvaAdvancedCopasstTrainingService } from '../../phva-advanced/phva-advanced-copasst-training.service';
import { CopasstTrainingProvider } from './copasst-training.provider';

const COMPANY_A = new Types.ObjectId('64a00000000000000000000a');
const COMPANY_B = new Types.ObjectId('64a00000000000000000000b');

const MEMBER = (id: string) => ({ userId: new Types.ObjectId(id), status: 'ACTIVO' });
const MEMBER_ID = '1'.repeat(24);

function buildService(overrides: {
  record?: unknown;
  members?: unknown[];
  executed?: boolean;
  onLookup?: (companyId: string) => void;
}) {
  const service = {
    findByCompany: async (companyId: Types.ObjectId) => {
      overrides.onLookup?.(companyId.toString());
      return overrides.record ?? null;
    },
    getActiveCopasstMembers: async () => overrides.members ?? [],
    isSessionExecuted: () => overrides.executed ?? false,
    getCurrentCopasstPeriod: async () => ({ _id: new Types.ObjectId() }),
    calculateCoverage: async () => ({ totalMembers: 0, trainedMembers: 0, coveragePercentage: 0, executedSessions: 0 }),
  } as unknown as PhvaAdvancedCopasstTrainingService;
  return service;
}

describe('CopasstTrainingProvider (1.1.7 Implementation Validator)', () => {
  it('sin entidad → 0% PENDING', async () => {
    const provider = new CopasstTrainingProvider(buildService({}));
    const result = await provider.getValidation(COMPANY_A.toString());

    assert.equal(result.stepId, 'copasst_training');
    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'PENDING');
    assert.ok(result.pendingCriteria?.some((c) => c.includes('1.1.7')));
  });

  it('entidad vacía (sin programa, sesiones ni miembros) → 30% (entidad + membresía)', async () => {
    const provider = new CopasstTrainingProvider(
      buildService({ record: { year: 2026 }, members: [MEMBER(MEMBER_ID)] }),
    );
    const result = await provider.getValidation(COMPANY_A.toString());

    // entidad 15 + miembros 15 = 30
    assert.equal(result.percentage, 30);
    assert.equal(result.status, 'IN_PROGRESS');
  });

  it('programa anual presente → +20', async () => {
    const provider = new CopasstTrainingProvider(
      buildService({ record: { year: 2026, annualProgram: [{ title: 'Peligros' }] }, members: [MEMBER(MEMBER_ID)] }),
    );
    const result = await provider.getValidation(COMPANY_A.toString());

    assert.equal(result.percentage, 50);
  });

  it('sesiones presentes → +20 (sin participantes ni ejecución)', async () => {
    const provider = new CopasstTrainingProvider(
      buildService({
        record: { year: 2026, annualProgram: [{ title: 'Peligros' }], sessions: [{ title: 'S1' }] },
        members: [MEMBER(MEMBER_ID)],
      }),
    );
    const result = await provider.getValidation(COMPANY_A.toString());

    // entidad 15 + miembros 15 + programa 20 + sesiones 20 = 70
    assert.equal(result.percentage, 70);
    assert.ok(result.pendingCriteria?.some((c) => c.includes('participantes')));
  });

  it('participantes con snapshot → +15', async () => {
    const provider = new CopasstTrainingProvider(
      buildService({
        record: {
          year: 2026,
          annualProgram: [{ title: 'Peligros' }],
          sessions: [{ title: 'S1', copasstParticipants: [{ userId: new Types.ObjectId('1'.repeat(24)), name: 'A' }] }],
        },
        members: [MEMBER('1'.repeat(24))],
      }),
    );
    const result = await provider.getValidation(COMPANY_A.toString());

    // 15 + 15 + 20 + 20 + 15 = 85
    assert.equal(result.percentage, 85);
    assert.equal(result.status, 'COMPLETED');
  });

  it('implementación válida (todo completo) → 100% COMPLETED con criterios reales', async () => {
    const provider = new CopasstTrainingProvider(
      buildService({
        record: {
          year: 2026,
          annualProgram: [{ title: 'Peligros' }],
          sessions: [
            {
              title: 'S1',
              status: 'Ejecutada',
              completionDate: new Date(),
              copasstParticipants: [{ userId: new Types.ObjectId('1'.repeat(24)), name: 'A' }],
            },
          ],
        },
        members: [MEMBER('1'.repeat(24))],
        executed: true,
      }),
    );
    const result = await provider.getValidation(COMPANY_A.toString());

    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.criteria?.length, 6);
    assert.deepEqual(result.pendingCriteria, []);
  });

  it('implementación incompleta: sin sesión ejecutada → pendingCriteria de ejecución', async () => {
    const provider = new CopasstTrainingProvider(
      buildService({
        record: {
          year: 2026,
          annualProgram: [{ title: 'Peligros' }],
          sessions: [{ title: 'S1', copasstParticipants: [{ userId: new Types.ObjectId('1'.repeat(24)), name: 'A' }] }],
        },
        members: [MEMBER('1'.repeat(24))],
      }),
    );
    const result = await provider.getValidation(COMPANY_A.toString());

    assert.ok(result.pendingCriteria?.some((c) => c.includes('Ejecutar')));
  });

  it('multi-tenancy: entidad de otra empresa se comporta como inexistente', async () => {
    const lookups: string[] = [];
    const service = {
      findByCompany: async (companyId: Types.ObjectId) => {
        lookups.push(companyId.toString());
        // La entidad existe para A pero NO para B → aislamiento del tenant.
        return companyId.toString() === COMPANY_A.toString() ? { year: 2026 } : null;
      },
      getActiveCopasstMembers: async () => [],
      isSessionExecuted: () => false,
      getCurrentCopasstPeriod: async () => ({ _id: new Types.ObjectId() }),
      calculateCoverage: async () => ({ totalMembers: 0, trainedMembers: 0, coveragePercentage: 0, executedSessions: 0 }),
    } as unknown as PhvaAdvancedCopasstTrainingService;
    const provider = new CopasstTrainingProvider(service);
    const result = await provider.getValidation(COMPANY_B.toString());

    assert.equal(lookups[0], COMPANY_B.toString());
    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'PENDING');
    assert.ok(result.pendingCriteria?.some((c) => c.includes('1.1.7')));
  });

  it('excepción interna → 0% PENDING sin lanzar (contrato del provider)', async () => {
    // Stub COMPLETO: Promise.all consume todas las promesas (evita unhandled
    // rejections de promesas huérfanas cuando un método falla).
    const service = {
      findByCompany: async () => {
        throw new Error('boom');
      },
      getActiveCopasstMembers: async () => [],
      isSessionExecuted: () => false,
      getCurrentCopasstPeriod: async () => ({ _id: new Types.ObjectId() }),
      calculateCoverage: async () => ({ totalMembers: 0, trainedMembers: 0, coveragePercentage: 0, executedSessions: 0 }),
    } as unknown as PhvaAdvancedCopasstTrainingService;
    const provider = new CopasstTrainingProvider(service);
    const result = await provider.getValidation(COMPANY_A.toString());

    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'PENDING');
  });
});
