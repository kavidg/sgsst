import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCIDENT_STATISTICS_FORMULA,
  ACCIDENT_STATISTICS_STANDARD_CODE,
  ACCIDENT_STATISTICS_STANDARD_TITLE,
  ACCIDENT_STATISTICS_TARGET,
  computeAccidentStatisticsScore,
} from './accident-statistics-scoring';

/**
 * Tests unitarios del SCORER PURO de accident-statistics (estándar 3.2.3).
 *
 * E2-lite: verifican que la extracción del scoring inline del provider es
 * semánticamente NEUTRA (mismas reglas 25/25/25/25, mismos casos límite).
 * El scorer es puro: sin Mongo, sin NestJS, sin fecha de sistema.
 */

/** Incidente lean de prueba (misma forma que consume el scorer). */
function buildIncident(overrides: Record<string, unknown> = {}) {
  return {
    date: new Date('2026-03-15'),
    description: 'Accidente laboral menor',
    investigationType: 'ACCIDENT',
    daysLost: 2,
    ...overrides,
  };
}

describe('accident-statistics-scoring (3.2.3 · scorer puro)', () => {

  it('SCORE-001: 0 incidentes → NO_DATA con reason no-incident-records', () => {
    const r = computeAccidentStatisticsScore({ incidents: [], workerCount: 0 });
    assert.equal(r.noData, true);
    assert.equal(r.noDataReason, 'no-incident-records');
    assert.equal(r.percentage, 0);
    assert.equal(r.counters.totalEvents, 0);
    for (const key of ['existence', 'classification', 'temporalAnalysis', 'workerPopulation'] as const) {
      assert.equal(r.dimensions[key].ratio, null, `${key} ratio debe ser null en NO_DATA`);
      assert.equal(r.dimensions[key].weight, 25);
    }
  });

  it('SCORE-002: C1 existencia — con fecha y descripción rinde 100', () => {
    const r = computeAccidentStatisticsScore({
      incidents: [buildIncident(), buildIncident()],
      workerCount: 10,
    });
    assert.equal(r.dimensions.existence.ratio, 1);
    assert.equal(r.dimensions.existence.numerator, 2);
    assert.equal(r.dimensions.existence.denominator, 2);
  });

  it('SCORE-003: C1 existencia — sin descripción rinde 50', () => {
    const r = computeAccidentStatisticsScore({
      incidents: [buildIncident({ description: '' })],
      workerCount: 10,
    });
    assert.equal(r.dimensions.existence.ratio, 0.5);
  });

  it('SCORE-004: C2 clasificación — solo AT/EL cuentan; sin tipo no clasifica', () => {
    const r = computeAccidentStatisticsScore({
      incidents: [
        buildIncident({ investigationType: 'ACCIDENT' }),
        buildIncident({ investigationType: 'DISEASE' }),
        buildIncident({ investigationType: undefined }),
      ],
      workerCount: 10,
    });
    assert.equal(r.dimensions.classification.ratio, Math.round((2 / 3) * 100) / 100);
    assert.equal(r.counters.unclassifiedCount, 1);
    assert.equal(r.counters.accidentCount, 1);
    assert.equal(r.counters.diseaseCount, 1);
  });

  it('SCORE-005: C3 análisis temporal — min(100, meses-distintos × 15)', () => {
    // Fechas con constructor LOCAL (año, monthIndex, día): determinísticas sin
    // importar la zona horaria — mismo comportamiento que evalúa el provider.
    const oneMonth = computeAccidentStatisticsScore({
      incidents: [
        buildIncident({ date: new Date(2026, 2, 1) }),
        buildIncident({ date: new Date(2026, 2, 20) }),
      ],
      workerCount: 10,
    });
    assert.equal(oneMonth.dimensions.temporalAnalysis.ratio, 0.15); // 1 mes × 15

    const threeMonths = computeAccidentStatisticsScore({
      incidents: [
        buildIncident({ date: new Date(2026, 0, 10) }),
        buildIncident({ date: new Date(2026, 1, 10) }),
        buildIncident({ date: new Date(2026, 2, 10) }),
      ],
      workerCount: 10,
    });
    assert.equal(threeMonths.dimensions.temporalAnalysis.ratio, Math.min(100, 3 * 15) / 100);
    assert.equal(threeMonths.counters.distinctMonths, 3);
  });

  it('SCORE-006: C4 población — 100 con trabajadores, 0 sin ellos', () => {
    const withWorkers = computeAccidentStatisticsScore({
      incidents: [buildIncident()],
      workerCount: 25,
    });
    assert.equal(withWorkers.dimensions.workerPopulation.ratio, 1);

    const withoutWorkers = computeAccidentStatisticsScore({
      incidents: [buildIncident()],
      workerCount: 0,
    });
    assert.equal(withoutWorkers.dimensions.workerPopulation.ratio, 0);
  });

  it('SCORE-007: fórmula 25/25/25/25 — caso completo (C3 satura con ≥7 meses) rinde 100', () => {
    // C3 = min(100, meses×15): satura en 100 con 7+ meses distintos —
    // comportamiento EXACTO del provider previo (3 meses darían 45, no 100).
    const months = [0, 1, 2, 3, 4, 5, 6];
    const r = computeAccidentStatisticsScore({
      incidents: months.map((m, i) =>
        buildIncident({
          investigationType: i % 2 === 0 ? 'ACCIDENT' : 'DISEASE',
          date: new Date(2026, m, 15),
          daysLost: i,
        })),
      workerCount: 50,
    });
    assert.equal(r.dimensions.temporalAnalysis.ratio, 1);
    assert.equal(r.dimensions.existence.ratio, 1);
    assert.equal(r.dimensions.classification.ratio, 1);
    assert.equal(r.dimensions.workerPopulation.ratio, 1);
    assert.equal(r.percentage, 100);
    assert.equal(r.noData, false);
  });

  it('SCORE-008: score parcial — fórmula ponderada exacta', () => {
    // Descripción >5 chars → C1=100; sin tipo → C2=0; 1 mes → C3=15; C4=100
    // → round(100*.25 + 0*.25 + 15*.25 + 100*.25) = round(53.75) = 54
    const r = computeAccidentStatisticsScore({
      incidents: [buildIncident({ investigationType: undefined, description: 'Accidente' })],
      workerCount: 10,
    });
    assert.equal(r.dimensions.existence.ratio, 1);
    assert.equal(r.dimensions.classification.ratio, 0);
    assert.equal(r.percentage, Math.round(100 * 0.25 + 0 * 0.25 + 15 * 0.25 + 100 * 0.25));
  });

  it('SCORE-009: datos incompletos — sin fecha no aporta a C3 ni C1-fecha', () => {
    const r = computeAccidentStatisticsScore({
      incidents: [buildIncident({ date: null })],
      workerCount: 10,
    });
    assert.equal(r.dimensions.existence.ratio, 0.5); // sin fecha (50) + con desc (50) → 50
    assert.equal(r.dimensions.temporalAnalysis.ratio, 0); // sin fechas → 0 meses
    assert.equal(r.counters.distinctMonths, 0);
  });

  it('SCORE-010: consistencia con el provider previo — resumen de días perdidos y metadata', () => {
    const r = computeAccidentStatisticsScore({
      incidents: [buildIncident({ daysLost: 5 }), buildIncident({ daysLost: 3 }), buildIncident({ daysLost: 0 })],
      workerCount: 10,
    });
    assert.equal(r.counters.totalDaysLost, 8);
    assert.equal(ACCIDENT_STATISTICS_STANDARD_CODE, '3.2.3');
    assert.equal(ACCIDENT_STATISTICS_STANDARD_TITLE, 'Registro y análisis estadístico de accidentes y enfermedades laborales');
    assert.equal(ACCIDENT_STATISTICS_FORMULA, 'dimensions:v1');
    assert.equal(ACCIDENT_STATISTICS_TARGET, 90);
  });
});
