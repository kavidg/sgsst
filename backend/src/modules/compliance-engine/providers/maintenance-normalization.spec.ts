import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { MaintenanceProvider } from './maintenance.provider';
import { Maintenance, MaintenanceStatus } from '../../maintenance/schemas/maintenance.schema';

/**
 * Regresiones de NORMALIZACIÓN de status — Estándar 4.2.5.
 *
 * ETAPA 6C: el provider consume la colección propia `Maintenance` con la
 * fórmula por dimensiones (25/35/25/15 + redistribución + tope reactivo).
 * La lectura tolerante de variantes históricas se conserva
 * ('completada', 'ejecutada', etc.), pero "completado válido" ahora exige
 * completedDate + evidencia asociada al cierre (patrón ETAPA 6C).
 */

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';
const NOW = new Date('2026-09-18T12:00:00Z');

let seq = 0;

function createMockMaintenance(overrides: Partial<{
  status: string;
  plannedDate: string;
  completedDate: string;
  closureEvidence?: string;
  observations?: string;
  maintenanceType: 'PREVENTIVE' | 'CORRECTIVE';
}> = {}): Maintenance {
  seq += 1;
  const statusHistory: Array<{ from: string; to: string; changedAt: Date; changedBy: string; evidenceUrl?: string }> = [];
  if (overrides.closureEvidence) {
    statusHistory.push({
      from: MaintenanceStatus.IN_PROGRESS,
      to: MaintenanceStatus.COMPLETED,
      changedAt: new Date(overrides.completedDate ?? '2026-01-01'),
      changedBy: 'uid',
      evidenceUrl: overrides.closureEvidence,
    });
  }
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(VALID_COMPANY_ID),
    itemName: `Item ${seq}`,
    itemType: 'EQUIPMENT',
    description: 'desc',
    maintenanceType: overrides.maintenanceType ?? 'PREVENTIVE',
    plannedDate: new Date(overrides.plannedDate ?? '2026-01-01'),
    completedDate: overrides.completedDate ? new Date(overrides.completedDate) : undefined,
    status: overrides.status ?? 'COMPLETED',
    responsible: 'Técnico A',
    observations: overrides.observations,
    statusHistory,
  } as unknown as Maintenance;
}

function buildModel(records: Maintenance[]) {
  return {
    find: (_query: unknown) => ({ exec: () => Promise.resolve(records) }),
  };
}

function createProvider(records: Maintenance[]) {
  return new MaintenanceProvider(buildModel(records) as never);
}

describe('MaintenanceProvider (4.2.5) — normalización de status (Etapa 6C)', () => {
  const CASES_COUNT = [
    { status: 'COMPLETED', expected: true },
    { status: 'completed', expected: true },
    { status: 'ejecutada', expected: true },
    { status: 'finalizada', expected: true },
    { status: 'completada', expected: true },
    { status: 'PROGRAMMED', expected: false },
    { status: 'programada', expected: false },
    { status: 'CANCELLED', expected: false },
  ];

  for (const { status, expected } of CASES_COUNT) {
    it(`status "${status}" ${expected ? 'cuenta' : 'NO cuenta'} como completado válido`, async () => {
      const provider = createProvider([
        createMockMaintenance({
          status,
          plannedDate: '2026-01-01',
          completedDate: '2025-12-30',
          closureEvidence: 'https://soportes.co/x.pdf',
          observations: 'ok',
        }),
      ]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const counted = result.completed === 1;
      assert.equal(counted, expected);
    });
  }

  it('fórmula Etapa 6C: 1 de 2 completados válido y a tiempo → 83', async () => {
    const provider = createProvider([
      createMockMaintenance({
        status: 'COMPLETED',
        plannedDate: '2026-01-01',
        completedDate: '2025-12-30',
        closureEvidence: 'https://soportes.co/a.pdf',
        observations: 'ok',
      }),
      createMockMaintenance({ status: 'PROGRAMMED', plannedDate: '2026-12-01' }),
    ]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    // 25×1 + 35×0.5 + 25×1 + 15×1 = 82.5 → 83
    assert.equal(result.percentage, 83);
  });

  it('fase do intacta tras el cambio de fórmula', async () => {
    const provider = createProvider([
      createMockMaintenance({
        status: 'COMPLETED',
        plannedDate: '2026-01-01',
        completedDate: '2025-12-30',
        closureEvidence: 'https://soportes.co/a.pdf',
        observations: 'ok',
      }),
    ]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.ok(result.phases?.do !== undefined);
    assert.equal(result.phases?.check, undefined);
  });

  it('tenant isolation intacta: sin registros → NO_DATA', async () => {
    const provider = createProvider([]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.phases?.do, 0);
  });

  it('todo cancelado → NO_DATA (regla Etapa 6C, nunca 100)', async () => {
    const provider = createProvider([
      createMockMaintenance({ status: 'CANCELLED' }),
      createMockMaintenance({ status: 'CANCELLED' }),
    ]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
  });

  it('COMPLETED sin fecha ni evidencia de cierre NO cuenta como completado válido (regla estricta)', async () => {
    const provider = createProvider([
      createMockMaintenance({ status: 'COMPLETED' }), // sin completedDate ni closureEvidence
    ]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.completed, 0);
    // Programa 1 (preventivo) + Ejecución 0 → redistribución: (25×1 + 35×0)/60×100 = 42.
    // Oportunidad y Trazabilidad no aportan (sin denominador válido).
    assert.equal(result.percentage, 42);
  });
});
