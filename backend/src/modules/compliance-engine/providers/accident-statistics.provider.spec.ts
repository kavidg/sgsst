import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AccidentStatisticsProvider } from './accident-statistics.provider';

/**
 * Tests unitarios para AccidentStatisticsProvider (estándar 3.2.3).
 *
 * FASE 30C: verificación de que el provider evalúa correctamente el
 * registro y análisis estadístico de accidentes de trabajo y enfermedades laborales.
 */

const VALID_COMPANY_ID = '507f1f77bcf86cd799439012';

/* ── Mock helpers ── */

function buildMockIncident(overrides: Record<string, unknown> = {}) {
  return {
    _id: '507f1f77bcf86cd799439099',
    companyId: VALID_COMPANY_ID,
    date: new Date('2026-03-15'),
    description: 'Accidente laboral menor',
    severity: 'LEVE',
    status: 'REPORTED',
    investigationType: 'ACCIDENT',
    daysLost: 2,
    ...overrides,
  };
}

function createMockIncidentModel(incidents: unknown[]) {
  const findFn = (_query: unknown) => ({
    sort: () => ({
      lean: () => ({
        exec: () => Promise.resolve(incidents),
      }),
    }),
  });
  return { find: findFn } as never;
}

function createMockEmployeeModel(count: number) {
  return {
    countDocuments: () => ({
      exec: () => Promise.resolve(count),
    }),
  } as never;
}

/* ── Test suite ── */

describe('AccidentStatisticsProvider (3.2.3 · Registro y análisis estadístico)', () => {

  it('STATS-001: retorna NO_DATA cuando no hay incidentes', async () => {
    const provider = new AccidentStatisticsProvider(
      createMockIncidentModel([]),
      createMockEmployeeModel(0),
    );

    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
    assert.equal(result.findings.length, 1);
    assert.match(result.findings[0].title, /Sin registros/);
  });

  it('STATS-002: retorna score con datos completos', async () => {
    const incidents = [
      buildMockIncident({ investigationType: 'ACCIDENT', date: new Date('2026-01-15') }),
      buildMockIncident({ investigationType: 'DISEASE', date: new Date('2026-02-20') }),
      buildMockIncident({ investigationType: 'ACCIDENT', date: new Date('2026-03-10') }),
    ];

    const provider = new AccidentStatisticsProvider(
      createMockIncidentModel(incidents),
      createMockEmployeeModel(50),
    );

    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.ok(result.percentage > 0, `Expected positive score, got ${result.percentage}`);
    assert.ok(result.findings.length > 0);
    const summary = result.findings.find((f: any) => f.id === 'accident-statistics-summary');
    assert.ok(summary, 'Should have summary finding');
    assert.match(summary!.title, /3 eventos/);
  });

  it('STATS-003: clasificación correcta de AT vs EL', async () => {
    const incidents = [
      buildMockIncident({ investigationType: 'ACCIDENT' }),
      buildMockIncident({ investigationType: 'ACCIDENT' }),
      buildMockIncident({ investigationType: 'DISEASE' }),
    ];

    const provider = new AccidentStatisticsProvider(
      createMockIncidentModel(incidents),
      createMockEmployeeModel(30),
    );

    const result = await provider.getCompliance(VALID_COMPANY_ID);
    const summary = result.findings.find((f: any) => f.id === 'accident-statistics-summary');
    assert.match(summary!.title, /2 AT, 1 EL/);
  });

  it('STATS-004: tenant isolation — solo consulta por companyId', async () => {
    let capturedQuery: unknown = null;
    const findFn = (query: unknown) => {
      capturedQuery = query;
      return {
        sort: () => ({
          lean: () => ({
            exec: () => Promise.resolve([buildMockIncident()]),
          }),
        }),
      };
    };

    const provider = new AccidentStatisticsProvider(
      { find: findFn } as never,
      createMockEmployeeModel(10),
    );

    await provider.getCompliance(VALID_COMPANY_ID);

    assert.ok(capturedQuery, 'find() should have been called');
    const q = capturedQuery as Record<string, unknown>;
    assert.ok('companyId' in q, 'Must filter by companyId');
  });

  it('STATS-005: eventos sin clasificación generan hallazgo', async () => {
    const incidents = [
      buildMockIncident({ investigationType: 'ACCIDENT' }),
      buildMockIncident({ investigationType: undefined }),
    ];

    const provider = new AccidentStatisticsProvider(
      createMockIncidentModel(incidents),
      createMockEmployeeModel(10),
    );

    const result = await provider.getCompliance(VALID_COMPANY_ID);
    const unclass = result.findings.find((f: any) => f.id === 'accident-statistics-unclassified');
    assert.ok(unclass, 'Should flag unclassified events');
    assert.match(unclass.title, /1.*sin clasificación/);
  });

  it('STATS-006: módulo es accident-statistics', async () => {
    const provider = new AccidentStatisticsProvider(
      createMockIncidentModel([]),
      createMockEmployeeModel(0),
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.module, 'accident-statistics');
  });

  it('STATS-007: phases.do refleja el porcentaje', async () => {
    const incidents = [
      buildMockIncident({ investigationType: 'ACCIDENT', date: new Date('2026-01-15') }),
    ];

    const provider = new AccidentStatisticsProvider(
      createMockIncidentModel(incidents),
      createMockEmployeeModel(20),
    );

    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.phases!.do, result.percentage);
  });

  it('STATS-008: días perdidos se acumulan correctamente', async () => {
    const incidents = [
      buildMockIncident({ daysLost: 5 }),
      buildMockIncident({ daysLost: 3 }),
      buildMockIncident({ daysLost: 0 }),
    ];

    const provider = new AccidentStatisticsProvider(
      createMockIncidentModel(incidents),
      createMockEmployeeModel(10),
    );

    const result = await provider.getCompliance(VALID_COMPANY_ID);
    const summary = result.findings.find((f: any) => f.id === 'accident-statistics-summary');
    assert.match(summary!.description, /8 días perdidos/);
  });
});
