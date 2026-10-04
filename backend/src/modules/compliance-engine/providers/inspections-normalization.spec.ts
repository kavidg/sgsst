import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InspectionsProvider } from './inspections.provider';

/**
 * Regresiones de NORMALIZACIÓN — provider legacy `inspections` (sin código
 * normativo, aporta a fase do). Criterio nuevo: SOLO el status normalizado
 * decide; `completedDate` por sí solo NO convierte una inspección en
 * completada (elimina la divergencia "status=PENDING con completedDate
 * antigua" detectada en la auditoría).
 */

function buildService(activities: any[]) {
  const service = {
    findAll: (_companyId: unknown) => Promise.resolve(activities),
  };
  return new InspectionsProvider(service as never);
}

const COMPANY_ID = '507f1f77bcf86cd799439011';

function activity(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'a1',
    companyId: COMPANY_ID,
    title: 'Inspección X',
    description: 'desc',
    plannedDate: new Date('2020-01-01'),
    status: 'pendiente',
    ...overrides,
  };
}

describe('InspectionsProvider (legacy) — normalización de status', () => {
  const CASES = [
    { status: 'completada', completed: 1 },
    { status: 'Completada', completed: 1 },
    { status: 'COMPLETED', completed: 1 },
    { status: 'completed', completed: 1 },
    { status: 'ejecutada', completed: 1 },
    { status: 'finalizada', completed: 1 },
    { status: 'closed', completed: 1 },
    { status: 'pendiente', completed: 0 },
    { status: 'PENDING', completed: 0 },
    { status: '', completed: 0 },
  ];

  for (const { status, completed } of CASES) {
    it(`status "${status}" → completed=${completed}`, async () => {
      const provider = buildService([activity({ status })]);
      const result = await provider.getCompliance(COMPANY_ID);
      assert.equal(result.completed, completed);
    });
  }

  it('completedDate por sí solo NO completa (status manda)', async () => {
    const provider = buildService([
      activity({ status: 'pendiente', completedDate: new Date('2020-01-02') }),
    ]);
    const result = await provider.getCompliance(COMPANY_ID);
    assert.equal(result.completed, 0);
  });

  it('status PENDING + completedDate antigua NO cuenta (antes divergía del trío 4.2.x)', async () => {
    const provider = buildService([
      activity({ status: 'PENDING', completedDate: new Date('2024-06-01') }),
    ]);
    const result = await provider.getCompliance(COMPANY_ID);
    assert.equal(result.completed, 0);
    assert.ok(result.findings.some((f) => f.title.includes('vencida')));
  });

  it('fase do intacta', async () => {
    const provider = buildService([activity({ status: 'completada' })]);
    const result = await provider.getCompliance(COMPANY_ID);
    assert.ok((result.phases as any)?.do !== undefined);
  });

  it('sin actividades → 0%', async () => {
    const provider = buildService([]);
    const result = await provider.getCompliance(COMPANY_ID);
    assert.equal(result.percentage, 0);
  });
});
