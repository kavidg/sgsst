import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { ConvivenciaService } from '../../convivencia/convivencia.service';
import { ConvivenciaPeriod, ConvivenciaPeriodDocument } from '../../convivencia/schemas/convivencia.schema';
import { ConvivenciaProvider } from './convivencia.provider';

const COMPANY_A = '64b0000000000000000000a1';
const PERIOD_A = '64b0000000000000000000aa';

/** Snapshot del dominio por defecto (PENDING 50%). */
function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    complianceStatus: 'PENDING',
    complianceReason:
      'Avance parcial del Comité de Convivencia: falta aprobación del periodo, reuniones realizadas.',
    percentage: 50,
    exempt: false,
    metCriteria: ['Periodo activo', 'Miembros conformados'],
    missingCriteria: ['Comité aprobado', 'Reuniones realizadas'],
    periodStatus: 'ACTIVO',
    approvalStatus: 'DRAFT',
    evidenceCount: 0,
    ...overrides,
  };
}

/** Stub del service de dominio que solo expone el snapshot. */
function buildStubService(handler: (companyId: Types.ObjectId) => Promise<unknown>) {
  const service = {
    getComplianceSnapshot: async (companyId: Types.ObjectId) => handler(companyId),
  } as unknown as ConvivenciaService;
  return service;
}

// ─────────────────────────────────────────────
// Helpers para la coherencia con el dominio REAL
// ─────────────────────────────────────────────

function buildMember() {
  return {
    userId: new Types.ObjectId('64b0000000000000000000c1'),
    userName: 'Ana López',
    committeeRole: 'PRESIDENTE',
    representationType: 'EMPLEADOR',
    principalType: 'PRINCIPAL',
    startDate: new Date('2025-01-01'),
    endDate: new Date('2027-01-01'),
    status: 'ACTIVO',
  } as never;
}

function buildMeeting(status: string) {
  return {
    meetingDate: new Date('2026-01-15'),
    status,
    agenda: 'Reunión del comité',
    attendees: [],
    topicList: [],
    development: '',
  } as never;
}

function buildPeriod(
  companyId: string,
  periodId: string,
  overrides: Record<string, unknown> = {},
): ConvivenciaPeriodDocument {
  return {
    _id: new Types.ObjectId(periodId),
    companyId: new Types.ObjectId(companyId),
    periodName: 'Comité de Convivencia',
    startDate: new Date('2025-01-01'),
    endDate: new Date('2027-01-01'),
    status: 'ACTIVO',
    members: [],
    meetings: [],
    candidateExtended: [],
    votesExtended: [],
    commitments: [],
    evidence: [],
    cases: [],
    auditHistory: [],
    approvalStatus: 'DRAFT',
    locked: false,
    rejectionReason: '',
    currentVersion: '1.0',
    requiresConvivencia: true,
    itemCode: '1.1.8',
    complianceStatus: 'PENDING',
    complianceReason: '',
    save: async function () {
      return this as unknown as ConvivenciaPeriodDocument;
    },
    ...overrides,
  } as unknown as ConvivenciaPeriodDocument;
}

function buildFullService(seed: ConvivenciaPeriodDocument): ConvivenciaService {
  const store = new Map<string, ConvivenciaPeriodDocument>([[seed._id.toString(), seed]]);
  const periodModel = {
    findById: (id: Types.ObjectId) => ({
      exec: async () => store.get(id.toString()) ?? null,
    }),
    // F7B-11: findPeriodForCompany usa query scoped findOne({ _id, companyId }).
    findOne: (filter: Record<string, unknown>) => ({
      exec: async () => {
        const { _id } = filter as { _id?: Types.ObjectId };
        // F7B-11: un _id que no está en el store NO debe resolver al seed
        // (NotFound real, no un periodo ajeno).
        if (_id) return store.get(_id.toString()) ?? null;
        return seed;
      },
      sort: () => ({ exec: async () => seed }),
    }),
  } as never;
  const employeeModel = { countDocuments: async () => 0 } as never;
  const userModel = { find: () => ({ exec: async () => [] }) } as never;
  const alertsService = { create: async () => ({}) } as never;
  const autoCommService = { generateCommunication: async () => ({}) } as never;
  // F7B-6: secuencia de casos (no usada por el provider; stub mínimo).
  const caseSequenceModel = { findOne: async () => null, findOneAndUpdate: async () => null } as never;
  // F7B-11: infraestructura distribuida (no usada por el provider; stub mínimo).
  const otpRateLimitService = { assertOtpRateLimit: async () => undefined } as never;
  const otpChallengeService = {
    setChallenge: async () => undefined,
    getChallenge: async () => null,
    incrementAttempts: async () => null,
    consumeIfMatches: async () => false,
    deleteChallenge: async () => undefined,
  } as never;
  return new ConvivenciaService(
    periodModel,
    caseSequenceModel,
    employeeModel,
    userModel,
    alertsService,
    autoCommService,
    otpRateLimitService,
    otpChallengeService,
  );
}

describe('ConvivenciaProvider (1.1.8 Implementation Validator — alineado al dominio)', () => {
  it('COMPLIES → 100 / COMPLETED sin criterios pendientes', async () => {
    const service = buildStubService(async () =>
      snapshot({
        complianceStatus: 'COMPLIES',
        percentage: 100,
        metCriteria: ['Periodo activo', 'Comité aprobado', 'Miembros conformados', 'Reuniones realizadas'],
        missingCriteria: [],
      }),
    );
    const provider = new ConvivenciaProvider(service);
    const result = await provider.getValidation(COMPANY_A);

    assert.equal(result.stepId, 'convivencia_committee');
    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'COMPLETED');
    assert.deepEqual(result.pendingCriteria, []);
    assert.equal(result.data?.complianceStatus, 'COMPLIES');
  });

  it('PENDING (50) → IN_PROGRESS, nunca implementado por completo', async () => {
    const service = buildStubService(async () =>
      snapshot({ complianceStatus: 'PENDING', percentage: 50 }),
    );
    const provider = new ConvivenciaProvider(service);
    const result = await provider.getValidation(COMPANY_A);

    assert.equal(result.status, 'IN_PROGRESS');
    assert.ok(result.percentage < 100);
    assert.deepEqual(result.pendingCriteria, ['Comité aprobado', 'Reuniones realizadas']);
    assert.match(result.details, /PENDING/);
  });

  it('PENDING (75) → IN_PROGRESS (progreso alto pero NO completo)', async () => {
    const service = buildStubService(async () =>
      snapshot({
        complianceStatus: 'PENDING',
        percentage: 75,
        metCriteria: ['Periodo activo', 'Comité aprobado', 'Miembros conformados'],
        missingCriteria: ['Reuniones realizadas'],
      }),
    );
    const provider = new ConvivenciaProvider(service);
    const result = await provider.getValidation(COMPANY_A);

    assert.equal(result.percentage, 75);
    assert.equal(result.status, 'IN_PROGRESS');
  });

  it('NON_COMPLIANT → 0 / PENDING (no implementado)', async () => {
    const service = buildStubService(async () =>
      snapshot({ complianceStatus: 'NON_COMPLIANT', percentage: 0 }),
    );
    const provider = new ConvivenciaProvider(service);
    const result = await provider.getValidation(COMPANY_A);

    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'PENDING');
  });

  it('P22: exención → 100 / COMPLETED sin criterios pendientes', async () => {
    const service = buildStubService(async () =>
      snapshot({ complianceStatus: 'COMPLIES', percentage: 100, exempt: true }),
    );
    const provider = new ConvivenciaProvider(service);
    const result = await provider.getValidation(COMPANY_A);

    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'COMPLETED');
    assert.deepEqual(result.pendingCriteria, []);
    assert.equal(result.data?.exempt, true);
    assert.match(result.details, /exenta/);
  });

  it('sin periodo → 0 / PENDING (tolerante, sin lanzar)', async () => {
    const service = buildStubService(async () => {
      throw new NotFoundException('Periodo no encontrado');
    });
    const provider = new ConvivenciaProvider(service);
    const result = await provider.getValidation(COMPANY_A);

    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'PENDING');
    assert.match(result.details, /no encontrado/);
  });

  it('P21: coherencia real — validator y resolveCompliance() coinciden', async () => {
    // COMPLIES real → validator COMPLETED.
    const periodComplies = buildPeriod(COMPANY_A, PERIOD_A, {
      status: 'ACTIVO',
      approvalStatus: 'APPROVED_AND_SIGNED',
      members: [buildMember()],
      meetings: [buildMeeting('CERRADA')],
    });
    const serviceComplies = buildFullService(periodComplies);
    await serviceComplies.recalculateCompliance(new Types.ObjectId(COMPANY_A), PERIOD_A);
    const v1 = await new ConvivenciaProvider(serviceComplies).getValidation(COMPANY_A);
    assert.equal(periodComplies.complianceStatus, 'COMPLIES');
    assert.equal(v1.status, 'COMPLETED');
    assert.equal(v1.percentage, 100);

    // PENDING real → validator IN_PROGRESS (< 100).
    const periodPending = buildPeriod(COMPANY_A, PERIOD_A, {
      status: 'ACTIVO',
      members: [buildMember()],
    });
    const servicePending = buildFullService(periodPending);
    await servicePending.recalculateCompliance(new Types.ObjectId(COMPANY_A), PERIOD_A);
    const v2 = await new ConvivenciaProvider(servicePending).getValidation(COMPANY_A);
    assert.equal(periodPending.complianceStatus, 'PENDING');
    assert.equal(v2.status, 'IN_PROGRESS');
    assert.ok(v2.percentage < 100);

    // NON_COMPLIANT real → validator PENDING (0).
    const periodEmpty = buildPeriod(COMPANY_A, PERIOD_A);
    const serviceEmpty = buildFullService(periodEmpty);
    await serviceEmpty.recalculateCompliance(new Types.ObjectId(COMPANY_A), PERIOD_A);
    const v3 = await new ConvivenciaProvider(serviceEmpty).getValidation(COMPANY_A);
    assert.equal(periodEmpty.complianceStatus, 'NON_COMPLIANT');
    assert.equal(v3.status, 'PENDING');
    assert.equal(v3.percentage, 0);
  });

  it('P22b: coherencia real — exención del dominio coincide con el validator', async () => {
    const period = buildPeriod(COMPANY_A, PERIOD_A, { requiresConvivencia: false });
    const service = buildFullService(period);
    await service.recalculateCompliance(new Types.ObjectId(COMPANY_A), PERIOD_A);
    const result = await new ConvivenciaProvider(service).getValidation(COMPANY_A);

    assert.equal(period.complianceStatus, 'COMPLIES');
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.percentage, 100);
    assert.equal(result.data?.exempt, true);
  });
});
