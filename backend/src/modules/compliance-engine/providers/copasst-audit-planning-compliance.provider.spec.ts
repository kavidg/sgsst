import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Types, Model } from 'mongoose';
import { CopasstAuditPlanningProvider } from './copasst-audit-planning-compliance.provider';
import type { CopasstAuditPlanning } from '../../copasst-audit-planning/schemas/copasst-audit-planning.schema';
import type { CopasstAuditPlanningDocument } from '../../copasst-audit-planning/schemas/copasst-audit-planning.schema';

/**
 * E2 (6.1.4) — Tests del provider OFICIAL copasst-audit-planning.
 *
 * Contrato estándar del ComplianceEngine + tenant safety de la consulta
 * (el provider SIEMPRE consulta con el companyId recibido server-side) +
 * metadata dimensions:v1. Patrón: annual-audit-compliance.provider.spec /
 * management-review-direction-compliance.provider.
 */

const COMPANY_A = new Types.ObjectId();
const COMPANY_B = new Types.ObjectId();

function buildPlanningDoc(overrides: Partial<CopasstAuditPlanning> = {}): CopasstAuditPlanning {
  return {
    _id: new Types.ObjectId(),
    companyId: COMPANY_A,
    planningCode: 'PAC-2026-01',
    title: 'Planificación de auditorías COPASST 2026',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2027-12-31'),
    scope: 'SG-SST completo',
    objectives: 'Verificar el cumplimiento del plan anual',
    criteria: 'Resolución 0312 de 2019',
    methodology: 'Auditorías internas con apoyo del COPASST',
    responsibleUserId: new Types.ObjectId(),
    responsibleUserSnapshot: 'Responsable SST',
    copasstPeriodId: new Types.ObjectId(),
    copasstPeriodSnapshot: 'Vigencia 2026-2027',
    status: 'PLANNED',
    items: [
      {
        _id: new Types.ObjectId(),
        title: 'Auditoría interna Q3 con COPASST',
        plannedDate: new Date('2027-03-01'),
        auditorUserId: new Types.ObjectId(),
        auditorUserSnapshot: 'Auditor Uno',
        responsibleUserId: new Types.ObjectId(),
        responsibleUserSnapshot: 'Responsable SST',
        objective: 'Verificar implementación del plan anual',
        scope: 'Todas las sedes',
        criteria: 'Resolución 0312',
        methodology: 'Lista de verificación',
        copasstParticipation: {
          required: true,
          participated: true,
          participationDate: new Date('2026-09-01'),
          participants: [{ nameSnapshot: 'Presidente COPASST' }],
          observations: 'El comité acompañó la verificación.',
        },
        status: 'PLANNED',
      } as never,
    ],
    ...overrides,
  } as CopasstAuditPlanning;
}

function buildModel(docs: CopasstAuditPlanning[], capture?: { lastQuery?: unknown }) {
  return {
    find: (query: Record<string, unknown>) => {
      if (capture) capture.lastQuery = query;
      const filtered = docs.filter((d) => String(d.companyId) === String(query.companyId));
      return {
        lean: () => ({
          exec: async () => filtered.map((d) => ({ ...d, _id: String(d._id) })),
        }),
      };
    },
  } as unknown as Model<CopasstAuditPlanningDocument>;
}

// ── Contrato del provider ───────────────────────────────────────────────────

describe('CAP614-PROVIDER: contrato', () => {
  it('module === copasst-audit-planning y fase check (VERIFICAR)', async () => {
    const provider = new CopasstAuditPlanningProvider(buildModel([]));
    const result = await provider.getCompliance(String(COMPANY_A));
    assert.equal(result.module, 'copasst-audit-planning');
    assert.equal(result.phases?.check, result.percentage);
    assert.equal(result.phases?.plan, undefined);
    assert.equal(result.phases?.do, undefined);
    assert.equal(result.phases?.act, undefined);
  });

  it('sin planificaciones → NO_DATA con percentage 0 y finding no-data', async () => {
    const provider = new CopasstAuditPlanningProvider(buildModel([]));
    const result = await provider.getCompliance(String(COMPANY_A));
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
    assert.ok(result.findings.some((f) => f.id === 'copasst-audit-planning-no-data'));
    assert.equal(result.pending, 0);
    assert.equal(result.completed, 0);
    assert.equal(result.overdue, undefined);
  });

  it('planificación completa → TARGET_NOT_MET/TARGET_MET con porcentaje, pendientes y completados', async () => {
    const provider = new CopasstAuditPlanningProvider(buildModel([buildPlanningDoc()]));
    const result = await provider.getCompliance(String(COMPANY_A));
    assert.ok(result.percentage > 0 && result.percentage <= 100);
    assert.ok(['TARGET_MET', 'TARGET_NOT_MET'].includes(String(result.status)));
    assert.ok(result.findings.every((f) => f.module === 'copasst-audit-planning'));
    assert.ok(typeof result.completed === 'number' && result.completed >= 1);
    // Items con fecha futura dentro del período → sin vencidos.
    assert.equal(result.overdue, 0);
  });

  it('items vencidos sin cierre → overdue > 0 y finding HIGH', async () => {
    const provider = new CopasstAuditPlanningProvider(
      buildModel([buildPlanningDoc({
        items: [{
          _id: new Types.ObjectId(),
          title: 'Auditoría Q1',
          plannedDate: new Date('2026-02-01'),
          objective: 'Verificar',
          copasstParticipation: { required: true, participated: true, participationDate: new Date('2026-02-01'), participants: [{ nameSnapshot: 'P' }] },
          status: 'PLANNED',
        } as never],
      })]),
    );
    // now fijo post-vencimiento vía Date real (el scorer usa new Date() por defecto;
    // 2026-02-01 ya pasó respecto de la fecha actual del runner).
    const result = await provider.getCompliance(String(COMPANY_A));
    assert.ok((result.overdue ?? 0) >= 1);
    assert.ok(result.findings.some((f) => f.id === 'copasst-audit-planning-overdue-items'));
  });

  it('metadata dimensions:v1 con standardCode 6.1.4 y pesos oficiales', async () => {
    const provider = new CopasstAuditPlanningProvider(buildModel([buildPlanningDoc()]));
    const result = await provider.getCompliance(String(COMPANY_A));
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.semantic, 'EXACT');
    assert.equal(meta.standardCode, '6.1.4');
    assert.equal(meta.formula, 'dimensions:v1');
    assert.deepEqual(meta.weights, { completeness: 25, schedule: 20, copasstParticipation: 25, traceability: 15, recommendations: 15 });
    assert.ok(meta.dimensions);
    assert.ok(meta.counters);
  });
});

// ── Tenant safety ───────────────────────────────────────────────────────────

describe('CAP614-PROVIDER: tenant safety', () => {
  it('la consulta SIEMPRE incluye el companyId recibido (server-side)', async () => {
    const capture: { lastQuery?: unknown } = {};
    const provider = new CopasstAuditPlanningProvider(buildModel([buildPlanningDoc()], capture));
    await provider.getCompliance(String(COMPANY_A));
    assert.ok(capture.lastQuery);
    assert.equal(String((capture.lastQuery as { companyId: Types.ObjectId }).companyId), String(COMPANY_A));
  });

  it('empresa A nunca usa planificaciones de empresa B (cross-tenant → NO_DATA)', async () => {
    const docB = buildPlanningDoc({ companyId: COMPANY_B });
    const provider = new CopasstAuditPlanningProvider(buildModel([docB]));
    const result = await provider.getCompliance(String(COMPANY_A));
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
  });

  it('el score de B no contamina el de A (cada tenant se evalúa por sus datos)', async () => {
    const docA = buildPlanningDoc();
    const docB = buildPlanningDoc({ companyId: COMPANY_B, scope: undefined, criteria: undefined, methodology: undefined });
    const providerA = new CopasstAuditPlanningProvider(buildModel([docA]));
    const providerB = new CopasstAuditPlanningProvider(buildModel([docB]));
    const rA = await providerA.getCompliance(String(COMPANY_A));
    const rB = await providerB.getCompliance(String(COMPANY_B));
    assert.ok(rA.percentage > rB.percentage);
  });
});
