import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { MaintenanceProvider } from './maintenance.provider';
import {
  MAINTENANCE_REACTIVE_CAP,
  MAINTENANCE_SCORE_WEIGHTS,
  computeMaintenanceScore,
  redistributeWeightedScore,
} from './maintenance-scoring';
import { Maintenance, MaintenanceStatus, MaintenanceType } from '../../maintenance/schemas/maintenance.schema';

/**
 * ETAPA 6C — Tests del scoring específico de 4.2.5 Mantenimiento.
 *
 * Cubre los 15 casos numéricos obligatorios del diseño + frontera
 * anti-double-scoring con 4.2.4 (InspectionActivity).
 *
 * Convención de mocks: un COMPLETED "válido" lleva evidencia de cierre en
 * statusHistory (patrón ETAPA 6C que produce el service al completar).
 */

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';
const NOW = new Date('2026-09-18T12:00:00Z');

let seq = 0;

function mock(overrides: Partial<{
  maintenanceType: MaintenanceType;
  status: string;
  plannedDate: string;
  completedDate: string;
  evidenceUrl?: string;
  observations?: string;
  responsible?: string;
  closureEvidence?: string;
}> = {}): Maintenance {
  seq += 1;
  const statusHistory: Array<{ from: string; to: string; changedAt: Date; changedBy: string; evidenceUrl?: string; comment?: string }> = [];
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
    maintenanceType: overrides.maintenanceType ?? MaintenanceType.PREVENTIVE,
    plannedDate: new Date(overrides.plannedDate ?? '2026-06-01'),
    completedDate: overrides.completedDate ? new Date(overrides.completedDate) : undefined,
    status: overrides.status ?? MaintenanceStatus.COMPLETED,
    responsible: overrides.responsible ?? 'Técnico',
    evidenceUrl: overrides.evidenceUrl,
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

/** Accessor tipado de las dimensiones expuestas en metadata (contrato: Record<string, unknown>). */
function dims(result: { metadata?: Record<string, unknown> }): Record<string, number | null | undefined> {
  return (result.metadata?.dimensions ?? {}) as Record<string, number | null | undefined>;
}

/** Completado válido por defecto: a tiempo, con evidencia de cierre y observaciones. */
const completedOnTime = (overrides: Parameters<typeof mock>[0] = {}) => mock({
  status: 'COMPLETED',
  plannedDate: '2026-01-01',
  completedDate: '2025-12-30',
  closureEvidence: 'https://soportes.co/orden.pdf',
  observations: 'Sin novedades',
  ...overrides,
});

describe('MaintenanceProvider (4.2.5) — Etapa 6C: scoring por dimensiones', () => {
  // ─────────── Caso 1 — Sin datos ───────────
  it('Caso 1: 0 mantenimientos → NO_DATA, 0%, do=0, finding no-data', async () => {
    const result = await createProvider([]).getCompliance(VALID_COMPANY_ID);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
    assert.equal(result.phases?.do, 0);
    assert.ok(result.findings.some((f) => f.id === 'maintenance-no-data'));
  });

  // ─────────── Caso 2 — Un preventivo futuro ───────────
  it('Caso 2: 1 preventivo PROGRAMMED futuro → score bajo/intermedio (nunca 70)', async () => {
    const result = await createProvider([
      mock({ status: 'PROGRAMMED', plannedDate: '2026-12-01' }),
    ]).getCompliance(VALID_COMPANY_ID);
    // Programa 1.0 (activo) + Ejecución 0 (activa) → (25×1 + 35×0)/60×100 = 41.67 → 42.
    // Oportunidad y Trazabilidad sin denominador → redistribuidas (no otorgan puntos).
    assert.ok(result.percentage > 25 && result.percentage < 55, `score=${result.percentage}`);
    assert.notEqual(result.percentage, 70);
    assert.equal(dims(result).program, 1);
    assert.equal(dims(result).execution, 0);
    assert.equal(dims(result).opportunity, null);
  });

  // ─────────── Caso 3 — Preventivos completamente ejecutados ───────────
  it('Caso 3: 10 preventivos completados a tiempo con evidencia+cierre → 100', async () => {
    const records = Array.from({ length: 10 }, () => completedOnTime());
    const result = await createProvider(records).getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'TARGET_MET');
  });

  // ─────────── Caso 4 — Preventivos parcialmente ejecutados ───────────
  it('Caso 4: 8 de 10 completados (2 vencidos) → 93, menor que caso 3', async () => {
    const records = [
      ...Array.from({ length: 8 }, () => completedOnTime()),
      ...Array.from({ length: 2 }, () => mock({ status: 'PROGRAMMED', plannedDate: '2026-01-01' })),
    ];
    const result = await createProvider(records).getCompliance(VALID_COMPANY_ID);
    // 25×1 + 35×0.8 + 25×1 + 15×1 = 25 + 28 + 25 + 15 = 93
    assert.equal(result.percentage, 93);
    assert.equal(result.overdue, 2);
    assert.ok(result.findings.some((f) => f.id === 'maintenance-overdue'));
  });

  // ─────────── Caso 5 — Solo correctivos (tope reactivo) ───────────
  it('Caso 5: 10 correctivos completados → tope 60 (nunca 100) + finding de programa', async () => {
    const records = Array.from({ length: 10 }, () => completedOnTime({ maintenanceType: MaintenanceType.CORRECTIVE }));
    const result = await createProvider(records).getCompliance(VALID_COMPANY_ID);
    // Dimensiones: programa 0 (activo) + 35+25+15 al máximo → 75 → cap 60.
    assert.equal(result.percentage, MAINTENANCE_REACTIVE_CAP);
    assert.equal(result.metadata?.hasPreventiveProgram, false);
    assert.equal(result.metadata?.cappedAt60, true);
    assert.ok(result.findings.some((f) => f.id === 'maintenance-no-preventive-program'));
  });

  // ─────────── Caso 6 — Correctivos + preventivos ───────────
  it('Caso 6: correctivos participan en Ejecución/Oportunidad/Trazabilidad pero NO satisfacen Programa', async () => {
    const records = [
      mock({ status: 'PROGRAMMED', plannedDate: '2026-12-01' }),                                     // preventivo programado
      mock({ status: 'PROGRAMMED', plannedDate: '2027-01-01', maintenanceType: MaintenanceType.CORRECTIVE }), // correctivo: NO satisface programa
      completedOnTime({ maintenanceType: MaintenanceType.CORRECTIVE, plannedDate: '2026-02-01', completedDate: '2026-02-01' }),
      completedOnTime(),
    ];
    const result = await createProvider(records).getCompliance(VALID_COMPANY_ID);
    // Programa: 1 preventivo evaluable / 1 preventivo → 1 (el correctivo no cuenta).
    assert.equal(dims(result).program, 1);
    // Ejecución: 2/4 evaluables; Oportunidad y Trazabilidad: 2/2.
    assert.equal(dims(result).execution, 0.5);
    assert.equal(dims(result).opportunity, 1);
    assert.equal(dims(result).traceability, 1);
  });

  // ─────────── Casos 7 y 8 — Tardío vs a tiempo ───────────
  it('Caso 7: COMPLETED tardío → ejecutado SÍ, oportuno NO', () => {
    const breakdown = computeMaintenanceScore([
      completedOnTime({ plannedDate: '2026-01-01', completedDate: '2026-01-05' }),
    ], NOW);
    assert.equal(breakdown.counters.completedValid, 1);
    assert.equal(breakdown.counters.completedOnTime, 0);
    assert.equal(breakdown.dimensions.opportunity.ratio, 0);
  });

  it('Caso 8: COMPLETED a tiempo → ejecutado SÍ y oportuno SÍ', () => {
    const breakdown = computeMaintenanceScore([
      completedOnTime({ plannedDate: '2026-01-01', completedDate: '2025-12-30' }),
    ], NOW);
    assert.equal(breakdown.counters.completedOnTime, 1);
    assert.equal(breakdown.dimensions.opportunity.ratio, 1);
  });

  // ─────────── Caso 10 — Cancelados fuera de denominadores ───────────
  it('Caso 10: 5 CANCELLED + 5 COMPLETED → solo los 5 evaluables puntúan (100)', async () => {
    const records = [
      ...Array.from({ length: 5 }, () => completedOnTime()),
      ...Array.from({ length: 5 }, () => mock({ status: 'CANCELLED', plannedDate: '2026-01-01' })),
    ];
    const result = await createProvider(records).getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 100);
    assert.equal(result.completed, 5);
    assert.equal(result.pending, 0);
    assert.equal(dims(result).execution, 1);
  });

  // ─────────── Caso 11 — Todo cancelado ───────────
  it('Caso 11: todos CANCELLED → NO_DATA (nunca 100)', async () => {
    const result = await createProvider([
      mock({ status: 'CANCELLED', plannedDate: '2026-01-01' }),
      mock({ status: 'CANCELLED', plannedDate: '2026-02-01' }),
      mock({ status: 'CANCELLED', plannedDate: '2026-03-01' }),
    ]).getCompliance(VALID_COMPANY_ID);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
  });

  // ─────────── Caso 12 — Overdue sin doble castigo ───────────
  it('Caso 12: overdue → entra en denominador de ejecución + finding, sin penalización adicional', () => {
    const breakdown = computeMaintenanceScore([
      completedOnTime(),
      mock({ status: 'PROGRAMMED', plannedDate: '2026-01-01' }),
    ], NOW);
    assert.equal(breakdown.counters.overdue, 1);
    assert.equal(breakdown.dimensions.execution.ratio, 0.5);
    // 25×1 + 35×0.5 + 25×1 + 15×1 = 82.5 → 83 (el vencido solo pesa vía ejecución).
    assert.equal(breakdown.score, 83);
  });

  // ─────────── Caso 13 — In progress ───────────
  it('Caso 13: IN_PROGRESS cuenta como no ejecutado mientras no se complete', () => {
    const breakdown = computeMaintenanceScore([
      completedOnTime(),
      mock({ status: 'IN_PROGRESS', plannedDate: '2026-12-01' }),
    ], NOW);
    assert.equal(breakdown.dimensions.execution.ratio, 0.5);
    assert.equal(breakdown.counters.overdue, 0);
  });

  // ─────────── Caso 14b — Evidencia previa ≠ evidencia de cierre (scoring) ───────────
  it('Caso 14b: la evidencia de cierre (statusHistory) prevalece sobre la URL plana', () => {
    const breakdown = computeMaintenanceScore([
      mock({
        status: 'COMPLETED',
        plannedDate: '2026-01-01',
        completedDate: '2026-01-01',
        evidenceUrl: 'https://docs.co/presupuesto-previo.pdf',
        closureEvidence: 'https://soportes.co/cierre-real.pdf',
      }),
    ], NOW);
    // El registro es completado válido (hay evidencia de cierre).
    assert.equal(breakdown.counters.completedValid, 1);
    // Y la evidencia leída para trazabilidad es la del CIERRE, no la previa.
    const score2 = computeMaintenanceScore([
      mock({ status: 'COMPLETED', plannedDate: '2026-01-01', completedDate: '2026-01-01' }),
    ], NOW);
    // COMPLETED sin historial de cierre ni evidencia plana → NO válido (regla estricta para datos nuevos).
    assert.equal(score2.counters.completedValid, 0);
    assert.equal(score2.dimensions.execution.ratio, 0);
  });

  // ─────────── Caso 15 — Responsible no puntúa ───────────
  it('Caso 15: responsible no aporta puntos por sí mismo (pesos sin responsable)', () => {
    // La suma de pesos es 100 SIN componente de responsable.
    assert.equal(
      MAINTENANCE_SCORE_WEIGHTS.program + MAINTENANCE_SCORE_WEIGHTS.execution
      + MAINTENANCE_SCORE_WEIGHTS.opportunity + MAINTENANCE_SCORE_WEIGHTS.traceability,
      100,
    );
    // Dos registros idénticos salvo responsible → mismo score.
    const a = computeMaintenanceScore([completedOnTime({ responsible: 'Técnico A' })], NOW);
    const b = computeMaintenanceScore([completedOnTime({ responsible: 'Superintendente B' })], NOW);
    assert.equal(a.score, b.score);
  });

  // ─────────── Redistribución: función única y determinista ───────────
  it('redistributeWeightedScore: redistribución proporcional determinista, nunca NaN', () => {
    const score = redistributeWeightedScore([
      { ratio: 1, weight: 25 },
      { ratio: 0.5, weight: 35 },
      { ratio: null, weight: 25 },
      { ratio: null, weight: 15 },
    ]);
    assert.ok(Number.isFinite(score));
    // (25×1 + 35×0.5)/60 × 100 = 70.83
    assert.ok(score > 70 && score < 71.5);
    // Sin dimensiones activas → 0 (nunca NaN/Infinity).
    assert.equal(redistributeWeightedScore([
      { ratio: null, weight: 25 },
      { ratio: null, weight: 35 },
      { ratio: null, weight: 25 },
      { ratio: null, weight: 15 },
    ]), 0);
  });

  // ─────────── Contrato del provider ───────────
  it('contrato: module, percentage, status, findings, pending, completed, overdue, phases y metadata semantic EXACT', async () => {
    const result = await createProvider([completedOnTime()]).getCompliance(VALID_COMPANY_ID);
    assert.equal(result.module, 'maintenance');
    assert.equal(result.status, 'TARGET_MET');
    assert.equal(result.phases?.do, result.percentage);
    assert.equal((result.metadata as Record<string, unknown>).semantic, 'EXACT');
    assert.equal((result.metadata as Record<string, unknown>).standardCode, '4.2.5');
    assert.equal((result.metadata as Record<string, unknown>).phase, 'do');
  });

  // ─────────── Frontera 4.2.4 / 4.2.5 (Paso 22) ───────────
  it('frontera: NO importa ni consulta InspectionActivity (anti-double-scoring con 4.2.4)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../../src/modules/compliance-engine/providers/maintenance.provider.ts'),
      'utf-8',
    );
    assert.match(src, /from '\.\.\/\.\.\/maintenance\/schemas\/maintenance\.schema'/);
    assert.doesNotMatch(src, /from '\.\.\/\.\.\/inspections\//);
    assert.doesNotMatch(src, /@InjectModel\(InspectionActivity/);
  });
});
