import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { ConvivenciaService } from '../../convivencia/convivencia.service';
import { ConvivenciaPeriod, ConvivenciaPeriodDocument } from '../../convivencia/schemas/convivencia.schema';
import { ComplianceLevel } from '../enums/compliance-level.enum';
import { generateRecommendations } from '../utils/recommendation-engine';
import { ConvivenciaProvider } from './convivencia.provider';

const COMPANY_A = '64b0000000000000000000a1';
const COMPANY_B = '64b0000000000000000000b1';
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

/** Stub del service de dominio que solo expone el snapshot (nunca escribe). */
function buildStubService(handler: (companyId: Types.ObjectId) => Promise<unknown>) {
  const calls: string[] = [];
  const service = {
    getComplianceSnapshot: async (companyId: Types.ObjectId) => {
      calls.push(companyId.toString());
      return handler(companyId);
    },
  } as unknown as ConvivenciaService;
  return { service, calls };
}

// ─────────────────────────────────────────────
// Helpers para la coherencia con el dominio REAL
// ─────────────────────────────────────────────

function buildMember(overrides: Record<string, unknown> = {}) {
  return {
    userId: new Types.ObjectId('64b0000000000000000000c1'),
    userName: 'Ana López',
    committeeRole: 'PRESIDENTE',
    representationType: 'EMPLEADOR',
    principalType: 'PRINCIPAL',
    startDate: new Date('2025-01-01'),
    endDate: new Date('2027-01-01'),
    status: 'ACTIVO',
    ...overrides,
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

/** Service REAL con modelo en memoria (resuelve cumplimiento vía el dominio). */
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

describe('ConvivenciaProvider (1.1.8 Compliance)', () => {
  it('P1: requiresConvivencia=false (exención) → 100% EXCELLENT sin findings', async () => {
    const { service } = buildStubService(async () =>
      snapshot({ complianceStatus: 'COMPLIES', percentage: 100, exempt: true }),
    );
    const provider = new ConvivenciaProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.module, 'convivencia');
    assert.equal(result.percentage, 100);
    assert.equal(result.status, ComplianceLevel.EXCELLENT);
    assert.deepEqual(result.findings, []);
    assert.equal(result.pending, 0);
    assert.equal(result.completed, 4);
  });

  it('P2: periodo vacío → NON_COMPLIANT → 0% con hallazgos de no conformación', async () => {
    const { service } = buildStubService(async () =>
      snapshot({
        complianceStatus: 'NON_COMPLIANT',
        percentage: 0,
        metCriteria: [],
        missingCriteria: ['Periodo activo', 'Comité aprobado', 'Miembros conformados', 'Reuniones realizadas'],
        approvalStatus: 'DRAFT',
      }),
    );
    const provider = new ConvivenciaProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 0);
    assert.equal(result.status, ComplianceLevel.CRITICAL);
    assert.ok(result.findings.some((f) => f.id === 'convivencia-not-conformed'));
    assert.ok(result.findings.some((f) => f.id === 'convivencia-no-members'));
    assert.equal(result.pending, 4);
    assert.equal(result.completed, 0);
  });

  it('P3: miembros sin aprobación → PENDING < 100', async () => {
    const { service } = buildStubService(async () =>
      snapshot({
        complianceStatus: 'PENDING',
        percentage: 50,
        metCriteria: ['Periodo activo', 'Miembros conformados'],
        missingCriteria: ['Comité aprobado', 'Reuniones realizadas'],
      }),
    );
    const provider = new ConvivenciaProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 50);
    assert.ok(result.percentage < 100);
    assert.equal(result.status, ComplianceLevel.MEDIUM);
    assert.ok(result.findings.some((f) => f.id === 'convivencia-not-approved'));
  });

  it('P4: aprobado + miembros pero sin reunión CERRADA → PENDING (75%)', async () => {
    const { service } = buildStubService(async () =>
      snapshot({
        complianceStatus: 'PENDING',
        percentage: 75,
        metCriteria: ['Periodo activo', 'Comité aprobado', 'Miembros conformados'],
        missingCriteria: ['Reuniones realizadas'],
        approvalStatus: 'APPROVED_AND_SIGNED',
      }),
    );
    const provider = new ConvivenciaProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 75);
    assert.equal(result.status, ComplianceLevel.HIGH);
    assert.ok(result.findings.some((f) => f.id === 'convivencia-no-meetings'));
  });

  it('P5/P6: reuniones PROGRAMADA o CANCELADA no completan el estándar (coherencia real con el dominio)', async () => {
    for (const meetingStatus of ['PROGRAMADA', 'CANCELADA']) {
      const period = buildPeriod(COMPANY_A, PERIOD_A, {
        status: 'ACTIVO',
        approvalStatus: 'APPROVED_AND_SIGNED',
        members: [buildMember()],
        meetings: [buildMeeting(meetingStatus)],
      });
      const service = buildFullService(period);
      await service.recalculateCompliance(new Types.ObjectId(COMPANY_A), PERIOD_A);
      const result = await new ConvivenciaProvider(service).getCompliance(COMPANY_A.toString());

      assert.equal(
        period.complianceStatus,
        'PENDING',
        `reunión ${meetingStatus} no debe completar el estándar en el dominio`,
      );
      assert.ok(
        result.percentage < 100,
        `reunión ${meetingStatus} no debe reportar cumplimiento completo (obtuvo ${result.percentage})`,
      );
      assert.ok(result.findings.some((f) => f.id === 'convivencia-no-meetings'));
    }
  });

  it('P7: aprobado + miembros + reunión CERRADA → COMPLIES → 100%', async () => {
    const { service } = buildStubService(async () =>
      snapshot({
        complianceStatus: 'COMPLIES',
        percentage: 100,
        metCriteria: ['Periodo activo', 'Comité aprobado', 'Miembros conformados', 'Reuniones realizadas'],
        missingCriteria: [],
        approvalStatus: 'APPROVED_AND_SIGNED',
      }),
    );
    const provider = new ConvivenciaProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 100);
    assert.equal(result.status, ComplianceLevel.EXCELLENT);
    assert.deepEqual(result.findings, []);
  });

  it('P8/P9: APPROVED y APPROVED_AND_SIGNED son estados de aprobación válidos', async () => {
    for (const approvalStatus of ['APPROVED', 'APPROVED_AND_SIGNED']) {
      const { service } = buildStubService(async () =>
        snapshot({
          complianceStatus: 'COMPLIES',
          percentage: 100,
          metCriteria: ['Periodo activo', 'Comité aprobado', 'Miembros conformados', 'Reuniones realizadas'],
          missingCriteria: [],
          approvalStatus,
        }),
      );
      const provider = new ConvivenciaProvider(service);
      const result = await provider.getCompliance(COMPANY_A.toString());
      assert.equal(result.percentage, 100, `${approvalStatus} debe ser válido`);
    }
  });

  it('P10: REJECTED → no cumple (PENDING < 100) con hallazgo de rechazo', async () => {
    const { service } = buildStubService(async () =>
      snapshot({
        complianceStatus: 'PENDING',
        percentage: 75,
        metCriteria: ['Periodo activo', 'Miembros conformados', 'Reuniones realizadas'],
        missingCriteria: ['Comité aprobado'],
        approvalStatus: 'REJECTED',
      }),
    );
    const provider = new ConvivenciaProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.ok(result.percentage < 100);
    assert.ok(result.findings.some((f) => f.id === 'convivencia-rejected'));
  });

  it('P11: evidence[] por sí sola NO produce COMPLIES (hallazgo de evidencia pendiente)', async () => {
    const { service } = buildStubService(async () =>
      snapshot({
        complianceStatus: 'PENDING',
        percentage: 25,
        metCriteria: ['Periodo activo'],
        missingCriteria: ['Comité aprobado', 'Miembros conformados', 'Reuniones realizadas'],
        evidenceCount: 3,
      }),
    );
    const provider = new ConvivenciaProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.ok(result.percentage < 100);
    assert.ok(result.findings.some((f) => f.id === 'convivencia-evidence-pending'));
  });

  it('P13: el provider jamás devuelve 100% cuando el dominio está PENDING', async () => {
    // Progreso PENDING con 0..3 condiciones presentes → 0, 25, 50, 75 (nunca 100).
    const percentages = [0, 25, 50, 75];
    for (const percentage of percentages) {
      const { service } = buildStubService(async () =>
        snapshot({ complianceStatus: 'PENDING', percentage }),
      );
      const provider = new ConvivenciaProvider(service);
      const result = await provider.getCompliance(COMPANY_A.toString());
      assert.ok(
        result.percentage < 100,
        `PENDING con progreso ${percentage} nunca debe reportar 100 (obtuvo ${result.percentage})`,
      );
    }
  });

  it('P14: COMPLIES → cumplimiento completo coherente (100%)', async () => {
    const { service } = buildStubService(async () =>
      snapshot({ complianceStatus: 'COMPLIES', percentage: 100, metCriteria: ['a', 'b', 'c', 'd'], missingCriteria: [] }),
    );
    const provider = new ConvivenciaProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 100);
    assert.equal(result.status, ComplianceLevel.EXCELLENT);
    assert.equal(result.completed, 4);
    assert.equal(result.pending, 0);
  });

  it('P15: NON_COMPLIANT no devuelve cumplimiento positivo (0%)', async () => {
    const { service } = buildStubService(async () =>
      snapshot({ complianceStatus: 'NON_COMPLIANT', percentage: 0 }),
    );
    const provider = new ConvivenciaProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 0);
    assert.equal(result.status, ComplianceLevel.CRITICAL);
  });

  it('P16/P17: multi-tenancy A/B — B recibe 0 controlado sin filtrar el estado de A', async () => {
    const { service, calls } = buildStubService(async (companyId) => {
      if (companyId.toString() === COMPANY_A.toString()) {
        return snapshot({ complianceStatus: 'COMPLIES', percentage: 100 });
      }
      throw new NotFoundException('Periodo no encontrado');
    });
    const provider = new ConvivenciaProvider(service);

    const rA = await provider.getCompliance(COMPANY_A.toString());
    assert.equal(rA.percentage, 100);

    const rB = await provider.getCompliance(COMPANY_B.toString());
    assert.equal(rB.percentage, 0);
    assert.ok(rB.findings.some((f) => f.id === 'convivencia-no-period'));
    assert.ok(!rB.findings.some((f) => f.id === 'convivencia-not-conformed'));

    // Todas las consultas se hicieron con el companyId recibido (nunca el de A).
    assert.deepEqual(calls, [COMPANY_A.toString(), COMPANY_B.toString()]);
  });

  it('P18: findings reales por condición ausente (rechazo, sin miembros, sin reuniones, evidencia pendiente)', async () => {
    const { service } = buildStubService(async () =>
      snapshot({
        complianceStatus: 'PENDING',
        percentage: 25,
        metCriteria: ['Periodo activo'],
        missingCriteria: ['Comité aprobado', 'Miembros conformados', 'Reuniones realizadas'],
        approvalStatus: 'REJECTED',
        evidenceCount: 2,
      }),
    );
    const provider = new ConvivenciaProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    const ids = result.findings.map((f) => f.id);
    assert.ok(ids.includes('convivencia-rejected'));
    assert.ok(ids.includes('convivencia-no-members'));
    assert.ok(ids.includes('convivencia-no-meetings'));
    assert.ok(ids.includes('convivencia-evidence-pending'));
  });

  it('P19: el Recommendation Engine genera recomendación cuando 1.1.8 no está completo y ninguna al 100%', () => {
    const incomplete = generateRecommendations([
      { module: 'convivencia', percentage: 50 } as never,
    ]);
    assert.ok(incomplete.some((r) => r.module === 'convivencia'));

    const complete = generateRecommendations([
      { module: 'convivencia', percentage: 100 } as never,
    ]);
    assert.ok(!complete.some((r) => r.module === 'convivencia'));
  });

  it('P20: la consulta de cumplimiento NO crea ni persiste registros (solo lee el snapshot)', async () => {
    const { service, calls } = buildStubService(async () =>
      snapshot({ complianceStatus: 'COMPLIES', percentage: 100 }),
    );
    const provider = new ConvivenciaProvider(service);
    await provider.getCompliance(COMPANY_A.toString());

    // El provider solo llama getComplianceSnapshot: nunca create/save/findById.
    assert.deepEqual(calls, [COMPANY_A.toString()]);
    assert.deepEqual(Object.keys(service as unknown as object), ['getComplianceSnapshot']);
  });

  it('P20b: sin periodo → resultado 0 con hallazgo descriptivo (no crea la entidad)', async () => {
    const { service } = buildStubService(async () => {
      throw new NotFoundException('Periodo no encontrado');
    });
    const provider = new ConvivenciaProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 0);
    assert.ok(result.findings.some((f) => f.id === 'convivencia-no-period'));
  });

  it('P20c: error de infraestructura → resultado 0 controlado sin lanzar', async () => {
    const { service } = buildStubService(async () => {
      throw new Error('connection timeout');
    });
    const provider = new ConvivenciaProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 0);
    assert.ok(result.findings.some((f) => f.id === 'convivencia-error'));
  });

  // ═════════════════════════════════════════════
  // COHERENCIA REAL provider ↔ dominio (resolveCompliance)
  // ═════════════════════════════════════════════
  it('P12: coherencia real — el provider coincide con el estado resuelto por el dominio', async () => {
    // COMPLIES: activo + aprobado + miembros + reunión CERRADA.
    const periodComplies = buildPeriod(COMPANY_A, PERIOD_A, {
      status: 'ACTIVO',
      approvalStatus: 'APPROVED_AND_SIGNED',
      members: [buildMember()],
      meetings: [buildMeeting('CERRADA')],
    });
    const serviceComplies = buildFullService(periodComplies);
    await serviceComplies.recalculateCompliance(new Types.ObjectId(COMPANY_A), PERIOD_A);
    const rComplies = await new ConvivenciaProvider(serviceComplies).getCompliance(COMPANY_A.toString());
    assert.equal(periodComplies.complianceStatus, 'COMPLIES');
    assert.equal(rComplies.percentage, 100);
    assert.equal(rComplies.status, ComplianceLevel.EXCELLENT);

    // PENDING: miembros sin aprobación ni reuniones.
    const periodPending = buildPeriod(COMPANY_A, PERIOD_A, {
      status: 'ACTIVO',
      members: [buildMember()],
    });
    const servicePending = buildFullService(periodPending);
    await servicePending.recalculateCompliance(new Types.ObjectId(COMPANY_A), PERIOD_A);
    const rPending = await new ConvivenciaProvider(servicePending).getCompliance(COMPANY_A.toString());
    assert.equal(periodPending.complianceStatus, 'PENDING');
    assert.ok(rPending.percentage > 0 && rPending.percentage < 100);

    // NON_COMPLIANT: periodo vacío.
    const periodEmpty = buildPeriod(COMPANY_A, PERIOD_A);
    const serviceEmpty = buildFullService(periodEmpty);
    await serviceEmpty.recalculateCompliance(new Types.ObjectId(COMPANY_A), PERIOD_A);
    const rEmpty = await new ConvivenciaProvider(serviceEmpty).getCompliance(COMPANY_A.toString());
    assert.equal(periodEmpty.complianceStatus, 'NON_COMPLIANT');
    assert.equal(rEmpty.percentage, 0);

    // REJECTED con el resto cumplido → PENDING (< 100) con hallazgo de rechazo.
    const periodRejected = buildPeriod(COMPANY_A, PERIOD_A, {
      status: 'ACTIVO',
      approvalStatus: 'REJECTED',
      members: [buildMember()],
      meetings: [buildMeeting('CERRADA')],
    });
    const serviceRejected = buildFullService(periodRejected);
    await serviceRejected.recalculateCompliance(new Types.ObjectId(COMPANY_A), PERIOD_A);
    const rRejected = await new ConvivenciaProvider(serviceRejected).getCompliance(COMPANY_A.toString());
    assert.equal(periodRejected.complianceStatus, 'PENDING');
    assert.ok(rRejected.percentage < 100);
    assert.ok(rRejected.findings.some((f) => f.id === 'convivencia-rejected'));
  });

  it('P12b: exención real — requiresConvivencia=false resuelve COMPLIES y el provider devuelve 100', async () => {
    const period = buildPeriod(COMPANY_A, PERIOD_A, { requiresConvivencia: false });
    const service = buildFullService(period);
    await service.recalculateCompliance(new Types.ObjectId(COMPANY_A), PERIOD_A);
    const result = await new ConvivenciaProvider(service).getCompliance(COMPANY_A.toString());

    assert.equal(period.complianceStatus, 'COMPLIES');
    assert.equal(result.percentage, 100);
    assert.deepEqual(result.findings, []);
  });
});
