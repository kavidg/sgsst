import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { ImprovementPlanProvider } from './improvement-plan.provider';

/**
 * E2 (7.1.4) — Tests del PROVIDER OFICIAL:
 * tenant isolation, una sola query, metadata completa, NO_DATA, phases.act y
 * neutralidad del origen (ACCIDENT/AUDIT/MANAGEMENT_REVIEW no disparan ni
 * requieren otros dominios). El analyzer IA NO se toca en E2 (pertenece a E3).
 */

const COMPANY_A = '507f1f77bcf86cd799439011';
const COMPANY_B = '507f1f77bcf86cd799439022';
const NOW = new Date('2026-09-26T12:00:00Z');

type AnyPlan = Record<string, unknown>;

function planDoc(overrides: AnyPlan = {}): AnyPlan {
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(COMPANY_A),
    code: 'PM-2026-001',
    title: 'Plan de mejoramiento 2026',
    description: 'Plan consolidado',
    period: '2026',
    year: 2026,
    responsibleUserId: new Types.ObjectId(),
    responsibleUserSnapshot: 'Ana Gómez',
    origin: 'AUDIT',
    originDescription: 'Auditoría interna',
    priority: 'HIGH',
    prioritizationCriteria: 'Riesgo',
    objectives: [{ objectiveId: 'OBJ-001', description: 'Objetivo', target: '-20%', indicator: 'Índice' }],
    activities: [
      {
        activityId: 'ACT-001',
        description: 'Actividad',
        responsibleUserId: new Types.ObjectId(),
        plannedDate: new Date('2026-03-01'),
        dueDate: new Date('2026-06-30'),
        executionDate: new Date('2026-05-01'),
        status: 'COMPLETED',
        progress: 100,
        evidence: { evidenceUrl: 'https://evidencia' },
      },
    ],
    resources: [{ type: 'FINANCIAL', description: 'Presupuesto' }],
    monitoring: [{ monitoringId: 'MON-001', date: new Date('2026-06-01'), progress: 50 }],
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    status: 'IN_PROGRESS',
    createdAt: new Date('2026-01-05'),
    ...overrides,
  };
}

function buildModel(documents: AnyPlan[]) {
  let queryCalls = 0;
  const model = {
    find: (q: { companyId?: unknown }) => {
      queryCalls += 1;
      const list = documents.filter((d) => String(d.companyId) === String(q.companyId));
      return {
        lean: () => ({
          exec: async () => {
            lastQuery = { companyId: q.companyId, calls: queryCalls };
            return list.map((d) => ({ ...d }));
          },
        }),
      };
    },
  };
  let lastQuery: { companyId?: unknown; calls: number } | null = null;
  return {
    model,
    getQueryCount: () => queryCalls,
    getLastQuery: () => lastQuery,
  };
}

function createProvider(documents: AnyPlan[]) {
  const { model, getQueryCount, getLastQuery } = buildModel(documents);
  const provider = new ImprovementPlanProvider(model as any);
  return { provider, getQueryCount, getLastQuery };
}

// ── Tenant isolation ────────────────────────────────────────────────────────

describe('IP714-PROVIDER — Tenant isolation', () => {
  it('TN-01: empresa A solo recibe planes de A; B nunca contamina el score de A', async () => {
    const { provider } = createProvider([
      planDoc({ year: 2026 }),
      planDoc({ companyId: new Types.ObjectId(COMPANY_B), code: 'PM-B-1', title: 'Plan B', status: 'CLOSED', closureDate: new Date('2026-12-15'), closedByUserId: new Types.ObjectId(), year: 2025, period: '2025', endDate: new Date('2025-12-31'), startDate: new Date('2025-01-01') }),
      planDoc({ companyId: new Types.ObjectId(COMPANY_B), code: 'PM-B-2', title: 'Plan B2', year: 2024, period: '2024', startDate: new Date('2024-01-01'), endDate: new Date('2024-12-31') }),
    ]);
    const r = await provider.getCompliance(COMPANY_A);
    const counters = (r.metadata as any).counters;
    assert.equal(counters.totalPlans, 1);
    assert.equal((r.metadata as any).latestPlan.year, 2026);
  });

  it('TN-02: planes de B no alteran el resultado de A (comparación A-solo vs A-con-B)', async () => {
    const aPlan = planDoc();
    const bPlan = planDoc({ companyId: new Types.ObjectId(COMPANY_B), code: 'PM-B', title: 'Plan B', year: 2025, period: '2025', startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31') });
    const withB = await createProvider([aPlan, bPlan]).provider.getCompliance(COMPANY_A);
    const onlyA = await createProvider([aPlan]).provider.getCompliance(COMPANY_A);
    assert.equal(withB.percentage, onlyA.percentage);
    assert.deepEqual((withB.metadata as any).counters, (onlyA.metadata as any).counters);
    assert.deepEqual((withB.metadata as any).latestPlan, (onlyA.metadata as any).latestPlan);
  });

  it('TN-03: empresa sin planes → NO_DATA (0%, act=0)', async () => {
    const { provider } = createProvider([]);
    const r = await provider.getCompliance(COMPANY_A);
    assert.equal(r.percentage, 0);
    assert.equal(r.status, 'NO_DATA');
    assert.equal(r.phases?.act, 0);
    assert.equal((r.metadata as any).noDataReason, 'no-evaluable-plans');
  });
});

// ── Query / contrato / metadata ─────────────────────────────────────────────

describe('IP714-PROVIDER — Query, contrato y metadata', () => {
  it('Q-01: UNA sola consulta Mongo, tenant-scoped ({companyId})', async () => {
    const { provider, getQueryCount, getLastQuery } = createProvider([planDoc()]);
    await provider.getCompliance(COMPANY_A);
    assert.equal(getQueryCount(), 1);
    assert.equal(String(getLastQuery()?.companyId), COMPANY_A);
  });

  it('Q-02: contrato completo (module/percentage/status/findings/pending/completed/phases)', async () => {
    const { provider } = createProvider([planDoc()]);
    const r = await provider.getCompliance(COMPANY_A);
    assert.equal(r.module, 'improvement-plan');
    assert.equal(r.status, r.percentage >= 90 ? 'TARGET_MET' : 'TARGET_NOT_MET');
    assert.ok(Array.isArray(r.findings));
    assert.ok(typeof r.pending === 'number' && typeof r.completed === 'number');
    assert.equal(r.phases?.act, r.percentage);
    assert.equal(r.overdue, 0);
  });

  it('Q-03: metadata EXACT completa (semantic/code/title/formula/target/weights/dimensions/counters/latestPlan/evaluatedPeriod)', async () => {
    const { provider } = createProvider([planDoc()]);
    const r = await provider.getCompliance(COMPANY_A);
    const m = r.metadata as any;
    assert.equal(m.semantic, 'EXACT');
    assert.equal(m.standardCode, '7.1.4');
    assert.equal(m.standardTitle, 'Plan de mejoramiento');
    assert.equal(m.formula, 'dimensions:v1');
    assert.equal(m.target, 90);
    assert.deepEqual(m.weights, { structure: 15, planning: 25, execution: 20, monitoring: 15, evidenceAndClosure: 15, continuity: 10 });
    assert.ok(m.dimensions.structure && m.dimensions.planning && m.dimensions.execution && m.dimensions.monitoring && m.dimensions.evidenceAndClosure && m.dimensions.continuity);
    assert.ok(m.counters && typeof m.counters.totalPlans === 'number');
    assert.ok(m.latestPlan && m.latestPlan.id);
    assert.equal(m.evaluatedPeriod, '2026');
  });

  it('Q-04: NO_DATA mantiene metadata con findings (patrón 7.1.2/7.1.3)', async () => {
    const { provider } = createProvider([]);
    const r = await provider.getCompliance(COMPANY_A);
    const m = r.metadata as any;
    assert.equal(m.noDataReason, 'no-evaluable-plans');
    assert.ok(Array.isArray(m.findings));
    assert.ok(m.findings.some((f: any) => f.id === 'improvement-plan-no-data'));
  });

  it('Q-05: latestPlan determinístico (mayor año, no orden accidental de Mongo)', async () => {
    const older = planDoc({ code: 'PM-2025', year: 2025, period: '2025', startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31') });
    const newer = planDoc({ code: 'PM-2026', year: 2026, period: '2026' });
    // Mongo devolvería older primero; el scorer debe elegir por año.
    const { provider } = createProvider([older, newer]);
    const r = await provider.getCompliance(COMPANY_A);
    assert.equal((r.metadata as any).latestPlan.code, 'PM-2026');
  });
});

// ── Orígenes declarativos (frontera inter-estándares) ───────────────────────

describe('IP714-PROVIDER — Orígenes declarativos (sin consultas cruzadas)', () => {
  for (const origin of ['ACCIDENT', 'AUDIT', 'MANAGEMENT_REVIEW']) {
    it(`origin ${origin}: una sola query al dominio ImprovementPlan (sin N+1 ni dominios externos)`, async () => {
      const { provider, getQueryCount } = createProvider([planDoc({ origin })]);
      await provider.getCompliance(COMPANY_A);
      assert.equal(getQueryCount(), 1);
    });
  }
});
