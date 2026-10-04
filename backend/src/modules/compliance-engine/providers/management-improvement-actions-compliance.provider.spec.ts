import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Types, Model } from 'mongoose';
import { ManagementImprovementActionsProvider } from './management-improvement-actions-compliance.provider';
import {
  ManagementImprovementAction,
  ManagementImprovementActionDocument,
} from '../../management-improvement-actions/schemas/management-improvement-action.schema';
import { MiaActionLike } from './management-improvement-actions-scoring';

/**
 * E2 (7.1.2) — Tests del PROVIDER OFICIAL de las acciones de mejora de la
 * alta dirección: una sola query tenant-scoped, sin N+1, sin queries
 * cruzadas, contrato estándar + phases.act + metadata dimensions:v1, y score
 * 100% delegado al scorer puro.
 */

const COMPANY_A = new Types.ObjectId();
const COMPANY_B = new Types.ObjectId();

function buildDoc(overrides: Partial<MiaActionLike> = {}): Partial<ManagementImprovementAction> {
  return {
    _id: new Types.ObjectId(),
    companyId: COMPANY_A,
    title: 'Mejora aprobada por la alta dirección',
    description: 'Fortalecer la gestión de recursos del SG-SST según decisión de la dirección',
    origin: 'MEETING' as never,
    priority: 'MEDIUM' as never,
    responsibleUserId: new Types.ObjectId(),
    responsibleSnapshot: 'Ana Gómez',
    dueDate: new Date('2026-12-31'),
    status: 'PENDING' as never,
    decisionReference: 'Acta 2026-01: aprobar el plan de recursos',
    followUp: {
      lastFollowUpDate: new Date('2026-09-01'),
      implementationStatus: 'ON_TRACK' as never,
      perceivedEffectiveness: 'EFECTIVA' as never,
      requiresContinuedFollowUp: false,
    },
    evidence: { evidenceUrl: 'https://empresa.com/soporte.pdf' } as never,
    ...overrides,
  } as Partial<ManagementImprovementAction>;
}

function buildFakeModel(docs: Array<Partial<ManagementImprovementAction>> = []) {
  const queries: Array<Record<string, unknown>> = [];
  const model = {
    find(query: Record<string, unknown>) {
      queries.push(query);
      const filtered = docs.filter((d) => String(d.companyId) === String(query.companyId));
      return {
        lean: () => ({
          exec: async () => filtered,
        }),
      };
    },
  } as unknown as Model<ManagementImprovementActionDocument>;
  return { model, queries };
}

describe('MIA PROVIDER: consultas y tenant', () => {
  it('1. UNA sola query con {companyId} server-side (sin N+1: 25 acciones = 1 query)', () => {
    const docs = Array.from({ length: 25 }, (_, i) => buildDoc({ _id: new Types.ObjectId() }));
    const { model, queries } = buildFakeModel(docs);
    const provider = new ManagementImprovementActionsProvider(model);
    void provider.getCompliance(String(COMPANY_A));
    assert.equal(queries.length, 1);
    assert.equal(String(queries[0].companyId), String(COMPANY_A));
  });

  it('2. tenant isolation: cross-tenant → NO_DATA (nunca acciones de otra empresa)', async () => {
    const { model } = buildFakeModel([buildDoc()]);
    const provider = new ManagementImprovementActionsProvider(model);
    const result = await provider.getCompliance(String(COMPANY_B));
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
    const meta = result.metadata as { noDataReason?: string };
    assert.equal(meta.noDataReason, 'no-actions');
  });

  it('3. NO consulta dominios prohibidos ( AccountabilityMeeting/Commitment, MRD, 7.1.1, AnnualAudit, Incident, ImprovementPlan)', () => {
    // El provider recibe ÚNICAMENTE el modelo ManagementImprovementAction —
    // no existe inyección de ningún otro modelo (verificado por firma).
    const ctorArgs = ManagementImprovementActionsProvider.length;
    assert.equal(ctorArgs, 1);
  });
});

describe('MIA PROVIDER: contrato y metadata', () => {
  it('4. contrato estándar: module/percentage/status/findings/pending/completed/phases.act', async () => {
    const { model } = buildFakeModel([buildDoc({ status: 'PENDING' as never })]);
    const provider = new ManagementImprovementActionsProvider(model);
    const result = await provider.getCompliance(String(COMPANY_A));
    assert.equal(result.module, 'management-improvement-actions');
    assert.equal(typeof result.percentage, 'number');
    assert.ok(['TARGET_MET', 'TARGET_NOT_MET'].includes(result.status as string));
    assert.ok(Array.isArray(result.findings));
    assert.deepEqual(result.phases, { act: result.percentage });
    assert.equal(result.completed, 0); // PENDING
  });

  it('5. metadata dimensions:v1 completa (code/title/formula/target/weights/dimensions/counters)', async () => {
    const { model } = buildFakeModel([buildDoc()]);
    const provider = new ManagementImprovementActionsProvider(model);
    const result = await provider.getCompliance(String(COMPANY_A));
    const meta = result.metadata as Record<string, unknown>;
    assert.equal(meta.semantic, 'EXACT');
    assert.equal(meta.standardCode, '7.1.2');
    assert.equal(meta.standardTitle, 'Acciones mejora alta dirección');
    assert.equal(meta.formula, 'dimensions:v1');
    assert.equal(meta.target, 90);
    assert.deepEqual(meta.weights, { programming: 20, execution: 25, followUp: 20, evidence: 25, continuity: 10 });
    assert.ok(meta.dimensions);
    assert.ok(meta.counters);
    assert.ok(meta.latestAction);
  });

  it('6. NO_DATA: contract completo con phases.act=0 y finding no-data', async () => {
    const { model } = buildFakeModel([]);
    const provider = new ManagementImprovementActionsProvider(model);
    const result = await provider.getCompliance(String(COMPANY_A));
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
    assert.deepEqual(result.phases, { act: 0 });
    assert.ok(result.findings.some((f) => f.id === 'management-improvement-actions-no-data'));
  });

  it('7. score delegado al scorer puro: portafolio mixto refleja el cálculo de dimensions:v1', async () => {
    const { model } = buildFakeModel([
      buildDoc(),
      buildDoc({
        _id: new Types.ObjectId(),
        dueDate: new Date('2027-01-31'),
        followUp: undefined,
        evidence: undefined,
      }),
    ]);
    const provider = new ManagementImprovementActionsProvider(model);
    const result = await provider.getCompliance(String(COMPANY_A));
    // Sin follow-up ni evidencia en la 2ª acción → findings oficiales presentes.
    assert.ok(result.findings.some((f) => f.id === 'management-improvement-actions-no-evidence'));
    assert.ok(result.findings.some((f) => f.id === 'management-improvement-actions-no-follow-up'));
    const meta = result.metadata as { dimensions: { programming: { ratio: number | null } } };
    assert.equal(meta.dimensions.programming.ratio, 1); // ambas asignadas completas
  });

  it('8. acciones vencidas → pending incluye overdue + finding overdue', async () => {
    const { model } = buildFakeModel([
      buildDoc({ status: 'IN_PROGRESS' as never, dueDate: new Date('2026-02-01') }),
    ]);
    const provider = new ManagementImprovementActionsProvider(model);
    const result = await provider.getCompliance(String(COMPANY_A));
    assert.equal(result.pending, 1); // overdue 1 + pending 0
    assert.ok(result.findings.some((f) => f.id === 'management-improvement-actions-overdue'));
  });
});
