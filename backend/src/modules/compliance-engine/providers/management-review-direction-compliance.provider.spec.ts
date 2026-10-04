import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types, Model } from 'mongoose';

import { ManagementReviewDirectionProvider } from './management-review-direction-compliance.provider';
import type {
  ManagementReviewDirection,
  ManagementReviewDirectionDocument,
} from '../../management-review-direction/schemas/management-review-direction.schema';

/**
 * E2 (6.1.3) — Tests del provider OFICIAL (patrón annual-audit provider):
 * tenant isolation (companyId), colección vacía, revisión evaluable /
 * no evaluable, delegación al scorer (metadata dimensions:v1), findings,
 * pending/completed/overdue y ausencia de N+1 (UNA llamada al modelo).
 */

const COMPANY_A = new Types.ObjectId();
const COMPANY_B = new Types.ObjectId();

function buildReviewDoc(overrides: Partial<ManagementReviewDirection> = {}): ManagementReviewDirection {
  return {
    ...overrides,
    _id: new Types.ObjectId(),
    companyId: COMPANY_A,
    title: 'Revisión por la dirección 2026',
    reviewType: 'ORDINARY',
    plannedDate: new Date('2026-03-01'),
    status: 'COMPLETED',
    actualStartDate: new Date('2026-03-05'),
    actualEndDate: new Date('2026-03-05'),
    participants: [{ nameSnapshot: 'Gerente', attendance: 'ATTENDED' }] as never,
    inputs: [
      { type: 'AUDIT_RESULTS', title: 'A', description: 'd', status: 'REVIEWED' },
      { type: 'INDICATOR_RESULTS', title: 'B', description: 'd', status: 'REVIEWED' },
      { type: 'PHVA_COMPLIANCE', title: 'C', description: 'd', status: 'REVIEWED' },
    ],
    analysis: {
      summary: 's',
      strengths: ['f'],
      gaps: ['g'],
      priorities: ['p'],
      managementObservations: 'o',
    },
    decisions: [
      {
        description: 'd1',
        category: 'RESOURCE',
        status: 'COMPLETED',
        responsibleNameSnapshot: 'r',
        dueDate: new Date('2026-04-30'),
      },
      {
        description: 'd2',
        category: 'IMPROVEMENT',
        status: 'IN_PROGRESS',
        responsibleNameSnapshot: 'r',
        dueDate: new Date('2026-01-01'),
      },
    ],
    minutesDocumentId: new Types.ObjectId(),
    ...overrides,
  } as unknown as ManagementReviewDirection;
}

function buildFakeModel(initialDocs: ManagementReviewDirection[] = []) {
  const calls: Array<Record<string, unknown>> = [];
  const model = {
    find(query: Record<string, unknown>) {
      calls.push(query);
      const filtered = [...initialDocs].filter(
        (d) => String(d.companyId) === String(query.companyId),
      );
      return {
        lean: () => ({
          exec: async () =>
            filtered.map((d) => ({ ...d, _id: String(d._id) })),
        }),
      };
    },
  } as unknown as Model<ManagementReviewDirectionDocument>;
  return { model, calls };
}

function buildProvider(docs: ManagementReviewDirection[]) {
  const { model, calls } = buildFakeModel(docs);
  const provider = new ManagementReviewDirectionProvider(model);
  return { provider, calls };
}

describe('MRD-PROVIDER: tenant y NO_DATA', () => {
  it('tenant correcto: consulta con companyId del tenant (ObjectId)', async () => {
    const { provider, calls } = buildProvider([]);
    await provider.getCompliance(String(COMPANY_A));
    assert.equal(calls.length, 1);
    assert.ok(calls[0].companyId instanceof Types.ObjectId);
    assert.equal(String(calls[0].companyId), String(COMPANY_A));
  });

  it('companyId de otro tenant NO influye: solo se consulta el companyId recibido', async () => {
    const { provider } = buildProvider([buildReviewDoc({ companyId: COMPANY_B })]);
    const result = await provider.getCompliance(String(COMPANY_A));
    // El fake filtra por companyId: los docs de B no son visibles para A.
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
    assert.ok(result.findings.some((f) => f.id === 'management-review-direction-no-data'));
  });

  it('colección vacía → NO_DATA con pending/completed 0', async () => {
    const { provider } = buildProvider([]);
    const result = await provider.getCompliance(String(COMPANY_A));
    assert.equal(result.module, 'management-review-direction');
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
    assert.equal(result.pending, 0);
    assert.equal(result.completed, 0);
    assert.equal((result.phases as Record<string, number>).check, 0);
    assert.equal(result.metadata?.noDataReason, 'no-reviews');
  });

  it('revisión no evaluable → NO_DATA (no-evaluable-reviews)', async () => {
    const { provider } = buildProvider([
      buildReviewDoc({ status: 'DRAFT' as never, actualStartDate: undefined, actualEndDate: undefined }),
    ]);
    const result = await provider.getCompliance(String(COMPANY_A));
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.metadata?.noDataReason, 'no-evaluable-reviews');
  });
});

describe('MRD-PROVIDER: revisión evaluable (delegación al scorer)', () => {
  it('score real, estado por meta 90 y phases.check = percentage', async () => {
    const { provider } = buildProvider([buildReviewDoc()]);
    const result = await provider.getCompliance(String(COMPANY_A));
    assert.equal(result.status, 'TARGET_NOT_MET'); // score < 90 con un solo año (D6 null)
    assert.ok(result.percentage > 0 && result.percentage < 100);
    assert.equal((result.phases as Record<string, number>).check, result.percentage);
    assert.equal(result.metadata?.standardCode, '6.1.3');
    assert.equal(result.metadata?.semantic, 'EXACT');
    assert.equal(result.metadata?.phase, 'check');
    assert.equal(result.metadata?.formula, 'dimensions:v1');
    assert.ok(result.metadata?.weights);
    assert.ok(result.metadata?.counters);
    assert.ok(result.metadata?.latestReview);
  });

  it('findings oficiales mapeados con module del provider', async () => {
    const { provider } = buildProvider([buildReviewDoc()]);
    const result = await provider.getCompliance(String(COMPANY_A));
    for (const f of result.findings) {
      assert.equal(f.module, 'management-review-direction');
      assert.ok(f.id.startsWith('management-review-direction-'));
    }
    assert.ok(result.findings.some((f) => f.id === 'management-review-direction-history-incomplete'));
  });

  it('pending/completed/overdue: decisiones abiertas + revisiones sin completar; overdue dinámico', async () => {
    const { provider } = buildProvider([
      buildReviewDoc(),
      // Revisión en ejecución SIN decisiones propias (no duplica contadores).
      buildReviewDoc({ _id: new Types.ObjectId(), status: 'IN_PROGRESS' as never, decisions: [] as never }),
    ]);
    const result = await provider.getCompliance(String(COMPANY_A));
    // d2 IN_PROGRESS con dueDate pasado (NOW 2026-09-24) → EXACTAMENTE 1 overdue.
    assert.equal(result.overdue, 1);
    // d2 IN_PROGRESS (1) + revisión IN_PROGRESS (1) → EXACTAMENTE 2 pendientes.
    assert.equal(result.pending, 2);
    // d1 COMPLETED (1) + 1 revisión evaluable → EXACTAMENTE 2 completadas.
    assert.equal(result.completed, 2);
  });

  it('sin N+1: exactamente UNA llamada al modelo por getCompliance', async () => {
    const { provider, calls } = buildProvider([buildReviewDoc(), buildReviewDoc({ _id: new Types.ObjectId() })]);
    await provider.getCompliance(String(COMPANY_A));
    assert.equal(calls.length, 1);
  });
});
