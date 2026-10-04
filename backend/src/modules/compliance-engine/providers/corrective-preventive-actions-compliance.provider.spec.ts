import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Model, Types } from 'mongoose';
import { CorrectivePreventiveActionsProvider } from './corrective-preventive-actions-compliance.provider';
import type { CorrectivePreventiveActionDocument } from '../../corrective-preventive-actions/schemas/corrective-preventive-action.schema';

/**
 * E2 (7.1.1) — Tests del provider OFICIAL corrective-preventive-actions.
 *
 * Cobertura: tenant isolation (query capturada con companyId), una sola
 * consulta principal (sin N+1), fuente EXCLUSIVA del dominio nuevo, NO_DATA,
 * phases.act, contrato estándar, metadata dimensions:v1, findings y counters.
 */

const COMPANY_A = new Types.ObjectId();
const COMPANY_B = new Types.ObjectId();

function buildLeanAction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: new Types.ObjectId(),
    companyId: COMPANY_A,
    type: 'CORRECTIVE',
    title: 'Acción correctiva por auditoría',
    description: 'Cerrar la no conformidad',
    origin: 'AUDIT_6_1_2',
    priority: 'HIGH',
    responsibleUserId: new Types.ObjectId(),
    responsibleSnapshot: 'Ana Gómez',
    dueDate: new Date('2026-06-30'),
    status: 'COMPLETED',
    executionDate: new Date('2026-06-01'),
    rootCause: 'Falta de capacitación',
    actionPlan: 'Capacitación Q3',
    evidence: { documentId: new Types.ObjectId(), documentSnapshot: 'DOC-01 — Acta' },
    effectivenessVerification: {
      verified: true,
      result: 'EFECTIVA',
      verifiedByUserId: new Types.ObjectId(),
      verifiedBySnapshot: 'Beto Ruiz',
      verificationDate: new Date('2026-07-15'),
    },
    ...overrides,
  };
}

function buildFakeModel(docs: Record<string, unknown>[] = []) {
  const queries: Array<Record<string, unknown>> = [];
  let findCalls = 0;
  const model = {
    find(query: Record<string, unknown>) {
      findCalls += 1;
      queries.push(query);
      const filtered = docs.filter((d) => String(d.companyId) === String(query.companyId));
      return {
        lean: () => ({
          exec: async () => filtered,
        }),
      };
    },
    // Exposición para asserts (el provider solo debe usar find+lean+exec).
    __state: {
      get findCallCount() {
        return findCalls;
      },
      get queries() {
        return queries;
      },
    },
  } as unknown as Model<CorrectivePreventiveActionDocument> & {
    __state: { findCallCount: number; queries: Array<Record<string, unknown>> };
  };
  return model;
}

function buildProvider(docs: Record<string, unknown>[] = []) {
  const model = buildFakeModel(docs);
  const provider = new CorrectivePreventiveActionsProvider(model);
  return { provider, model };
}

// ─── Contrato / tenant ──────────────────────────────────────────────────────

describe('CPA-PROVIDER (7.1.1)', () => {
  it('1. tenant isolation: la query principal incluye SOLO el companyId recibido', async () => {
    const { provider, model } = buildProvider([buildLeanAction()]);
    const result = await provider.getCompliance(String(COMPANY_A));
    assert.equal(model.__state.findCallCount, 1);
    assert.equal(String(model.__state.queries[0].companyId), String(COMPANY_A));
    assert.ok(result.percentage > 0);
  });

  it('1b. cross-tenant: con companyId de B no se ven acciones de A → NO_DATA', async () => {
    const { provider } = buildProvider([buildLeanAction()]);
    const result = await provider.getCompliance(String(COMPANY_B));
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
    assert.equal(result.phases?.act, 0);
  });

  it('2. una sola consulta principal (sin N+1)', async () => {
    const docs = Array.from({ length: 25 }, (_, i) => buildLeanAction({ _id: new Types.ObjectId() }));
    const { provider, model } = buildProvider(docs);
    await provider.getCompliance(String(COMPANY_A));
    assert.equal(model.__state.findCallCount, 1);
  });

  it('3. usa únicamente el dominio nuevo (module propio, sin módulos legacy)', async () => {
    const { provider } = buildProvider([buildLeanAction()]);
    const result = await provider.getCompliance(String(COMPANY_A));
    assert.equal(result.module, 'corrective-preventive-actions');
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.standardCode, '7.1.1');
    assert.equal(meta.formula, 'dimensions:v1');
    assert.equal(meta.semantic, 'EXACT');
  });

  it('4. sin acciones → NO_DATA con razón no-actions', async () => {
    const { provider } = buildProvider([]);
    const result = await provider.getCompliance(String(COMPANY_A));
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.noDataReason, 'no-actions');
    assert.ok(Array.isArray(result.findings) && result.findings.length === 1);
    assert.equal(result.findings[0].id, 'corrective-preventive-actions-no-data');
  });

  it('5. resultado con phases.act = percentage (contrato ACTUAR)', async () => {
    const { provider } = buildProvider([buildLeanAction()]);
    const result = await provider.getCompliance(String(COMPANY_A));
    assert.equal(result.phases?.act, result.percentage);
    // No toca otras fases.
    assert.equal(result.phases?.plan, undefined);
    assert.equal(result.phases?.do, undefined);
    assert.equal(result.phases?.check, undefined);
  });

  it('6. metadata completa: dimensions + counters + weights + evaluatedPeriod + latestAction', async () => {
    const { provider } = buildProvider([buildLeanAction()]);
    const result = await provider.getCompliance(String(COMPANY_A));
    const meta = result.metadata as Record<string, unknown>;
    assert.ok(meta.dimensions && typeof meta.dimensions === 'object');
    const dims = meta.dimensions as Record<string, unknown>;
    for (const key of ['programming', 'execution', 'evidence', 'effectiveness', 'continuity']) {
      assert.ok(dims[key], `falta dimensión ${key}`);
    }
    const weights = meta.weights as Record<string, number>;
    assert.deepEqual(Object.values(weights), [20, 25, 20, 25, 10]);
    assert.ok(meta.counters);
    assert.ok(meta.evaluatedPeriod);
    const latest = meta.latestAction as Record<string, unknown>;
    assert.equal(latest.title, 'Acción correctiva por auditoría');
  });

  it('7. findings transportados del scorer (ids oficiales, module propio)', async () => {
    const { provider } = buildProvider([
      buildLeanAction({ effectivenessVerification: undefined, evidence: undefined }),
    ]);
    const result = await provider.getCompliance(String(COMPANY_A));
    const ids = result.findings.map((f) => f.id);
    assert.ok(ids.includes('corrective-preventive-actions-effectiveness-unverified'));
    assert.ok(ids.includes('corrective-preventive-actions-no-evidence'));
    for (const f of result.findings) {
      assert.equal(f.module, 'corrective-preventive-actions');
    }
  });

  it('8. counters transportados sin alteración (pending/completed del contrato)', async () => {
    const { provider } = buildProvider([
      buildLeanAction(),
      buildLeanAction({
        _id: new Types.ObjectId(),
        status: 'IN_PROGRESS',
        executionDate: undefined,
        effectivenessVerification: undefined,
        evidence: undefined,
        dueDate: new Date('2026-01-01'), // vencida (IN_PROGRESS no terminal)
      }),
    ]);
    const result = await provider.getCompliance(String(COMPANY_A));
    const meta = result.metadata as Record<string, unknown>;
    const counters = meta.counters as Record<string, number>;
    assert.equal(counters.totalActions, 2);
    assert.equal(counters.overdueActions, 1);
    assert.equal(result.completed, 1); // completedActions
    assert.ok(result.pending >= 1); // overdue + pending
    // Portafolio mayoritariamente íntegro (solo 1 vencida sobre 2): el score
    // baja de 100 (D2 penalizada) pero se mantiene sobre el target 90.
    assert.ok(result.percentage < 100);
    assert.ok(result.percentage >= 90);
    assert.equal(result.status, 'TARGET_MET');
    // La brecha vencida SIEMPRE aparece como finding HIGH (independiente del %).
    assert.ok(result.findings.some((f) => f.id === 'corrective-preventive-actions-overdue' && f.priority === 'HIGH'));
  });

  it('9. score alto con portafolio íntegro en 2 vigencias (TARGET_MET)', async () => {
    const { provider } = buildProvider([
      buildLeanAction(),
      buildLeanAction({ _id: new Types.ObjectId(), dueDate: new Date('2025-11-30') }),
    ]);
    const result = await provider.getCompliance(String(COMPANY_A));
    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'TARGET_MET');
    assert.deepEqual(result.findings, []);
  });
});
