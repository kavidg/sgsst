import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import { SstObjectivesProvider } from './sst-objectives.provider';
import { PhvaAdvancedService } from '../../phva-advanced/phva-advanced.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

const COMPANY_A = new Types.ObjectId('64b0000000000000000000a1');

function buildRecord(overrides?: { objectives?: unknown[]; companyId?: Types.ObjectId }) {
  return {
    _id: new Types.ObjectId(),
    companyId: overrides?.companyId ?? COMPANY_A,
    itemCode: '2.2.1',
    objectives: overrides?.objectives ?? [],
    alerts: [],
    history: [],
    complianceStatus: 'NON_COMPLIANT',
    complianceReason: '',
  };
}

function buildService(overrides: {
  record?: ReturnType<typeof buildRecord> | null;
  methodCalls?: string[];
}) {
  const calls = overrides.methodCalls ?? [];
  const service = {
    findSstObjectives: async (companyId: Types.ObjectId) => {
      calls.push('findSstObjectives');
      return overrides.record ?? null;
    },
    findOrCreateSstObjectives: async () => {
      calls.push('findOrCreateSstObjectives');
      throw new Error('findOrCreateSstObjectives should NOT be called');
    },
  } as unknown as PhvaAdvancedService;
  return { service, calls };
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 2 — Compliance provider no escribe
// ═══════════════════════════════════════════════════════════════════════════

describe('SstObjectivesProvider usa findSstObjectives (read-only)', () => {
  it('llama findSstObjectives y NO findOrCreateSstObjectives', async () => {
    const calls: string[] = [];
    const { service } = buildService({
      record: buildRecord({ objectives: [{ objectiveId: '1', name: 'Test', targetProgress: 100, currentProgress: 50 }] }),
      methodCalls: calls,
    });

    const provider = new SstObjectivesProvider(service);
    await provider.getCompliance(COMPANY_A.toString());

    assert.ok(calls.includes('findSstObjectives'), 'should call findSstObjectives');
    assert.ok(!calls.includes('findOrCreateSstObjectives'), 'should NOT call findOrCreateSstObjectives');
  });

  it('cuando findSstObjectives retorna null → NO_DATA con 0%', async () => {
    const { service } = buildService({ record: null });

    const provider = new SstObjectivesProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.module, 'sst-objectives');
    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
    assert.ok(result.findings.some((f) => f.id === 'sst-obj-0'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Scoring behavior (sin cambios en fórmulas)
// ═══════════════════════════════════════════════════════════════════════════

describe('SstObjectivesProvider scoring', () => {
  it('objetivos vacíos → 0%', async () => {
    const { service } = buildService({ record: buildRecord({ objectives: [] }) });

    const provider = new SstObjectivesProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
  });

  it('objetivo al 100% → 100%', async () => {
    const { service } = buildService({
      record: buildRecord({
        objectives: [{ objectiveId: '1', name: 'A', targetProgress: 100, currentProgress: 100 }],
      }),
    });

    const provider = new SstObjectivesProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 100);
    assert.equal(result.completed, 1);
    assert.equal(result.pending, 0);
  });

  it('objetivo al 50% → 50%', async () => {
    const { service } = buildService({
      record: buildRecord({
        objectives: [{ objectiveId: '1', name: 'A', targetProgress: 100, currentProgress: 50 }],
      }),
    });

    const provider = new SstObjectivesProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 50);
  });

  it('dos objetivos: uno al 100% y otro al 0% → 50%', async () => {
    const { service } = buildService({
      record: buildRecord({
        objectives: [
          { objectiveId: '1', name: 'A', targetProgress: 100, currentProgress: 100 },
          { objectiveId: '2', name: 'B', targetProgress: 100, currentProgress: 0 },
        ],
      }),
    });

    const provider = new SstObjectivesProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.percentage, 50);
    assert.equal(result.completed, 1);
    assert.equal(result.pending, 1);
  });

  it('contribution al phases.plan es igual al percentage', async () => {
    const { service } = buildService({
      record: buildRecord({
        objectives: [{ objectiveId: '1', name: 'A', targetProgress: 100, currentProgress: 75 }],
      }),
    });

    const provider = new SstObjectivesProvider(service);
    const result = await provider.getCompliance(COMPANY_A.toString());

    assert.equal(result.phases?.plan, 75);
  });
});
