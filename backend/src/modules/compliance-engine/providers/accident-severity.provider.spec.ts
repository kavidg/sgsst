import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AccidentSeverityProvider } from './accident-severity.provider';

/**
 * Tests unitarios para AccidentSeverityProvider (estándar 3.3.2).
 *
 * FASE 30C: verificación de que el provider calcula correctamente la
 * severidad de la accidentalidad: días perdidos / horas trabajadas × 200,000.
 */

const VALID_COMPANY_ID = '507f1f77bcf86cd799439012';

/* ── Mock helpers ── */

function buildMockAccident(overrides: Record<string, unknown> = {}) {
  return {
    _id: '507f1f77bcf86cd799439099',
    companyId: VALID_COMPANY_ID,
    date: new Date('2026-03-15'),
    incidentDate: new Date('2026-03-15'),
    description: 'Accidente laboral',
    severity: 'LEVE',
    status: 'REPORTED',
    investigationType: 'ACCIDENT',
    daysLost: 5,
    ...overrides,
  };
}

/**
 * The provider calls:
 *   this.incidentModel.find({...}).lean().exec()   — current year
 *   this.incidentModel.find({...}).lean().exec()   — previous year
 */
function createMockIncidentModel(impl: () => Promise<unknown[]>) {
  return {
    find: () => ({
      lean: () => ({
        exec: impl,
      }),
    }),
  } as never;
}

function createMockEmployeeModel(count: number) {
  return {
    countDocuments: () => ({
      exec: () => Promise.resolve(count),
    }),
  } as never;
}

/* ── Test suite ── */

describe('AccidentSeverityProvider (3.3.2 · Severidad de la accidentalidad)', () => {

  it('SEV-001: retorna NO_DATA cuando no hay accidentes ni empleados', async () => {
    const provider = new AccidentSeverityProvider(
      createMockIncidentModel(() => Promise.resolve([])),
      createMockEmployeeModel(0),
    );

    const result = await provider.getCompliance(VALID_COMPANY_ID);

    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
    assert.equal(result.findings.length, 1);
    assert.match(result.findings[0].title, /Sin datos/);
  });

  it('SEV-002: calcula severidad correctamente', async () => {
    const accidents = [
      buildMockAccident({ daysLost: 10, incidentDate: new Date('2026-01-15') }),
      buildMockAccident({ daysLost: 5, incidentDate: new Date('2026-02-20') }),
    ];

    let callCount = 0;
    const provider = new AccidentSeverityProvider(
      createMockIncidentModel(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(accidents);
        return Promise.resolve([]);
      }),
      createMockEmployeeModel(50),
    );

    const result = await provider.getCompliance(VALID_COMPANY_ID);

    // Severity = (15 days × 200,000) / (50 × 2000) = 30
    const severityFinding = result.findings.find(
      (f: any) => f.id === 'accident-severity-rate',
    );
    assert.ok(severityFinding, 'Should have severity rate finding');
    assert.match(severityFinding.title, /30\.00/);
  });

  it('SEV-003: sin días perdidos → no severidad finding', async () => {
    const accidents = [
      buildMockAccident({ daysLost: 0, incidentDate: new Date('2026-01-15') }),
      buildMockAccident({ daysLost: 0, incidentDate: new Date('2026-02-20') }),
    ];

    let callCount = 0;
    const provider = new AccidentSeverityProvider(
      createMockIncidentModel(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(accidents);
        return Promise.resolve([]);
      }),
      createMockEmployeeModel(50),
    );

    const result = await provider.getCompliance(VALID_COMPANY_ID);
    const severityFinding = result.findings.find(
      (f: any) => f.id === 'accident-severity-rate',
    );
    assert.ok(!severityFinding, 'Should not have severity finding when daysLost = 0');
  });

  it('SEV-004: módulo es accident-severity', async () => {
    const provider = new AccidentSeverityProvider(
      createMockIncidentModel(() => Promise.resolve([])),
      createMockEmployeeModel(0),
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.module, 'accident-severity');
  });

  it('SEV-005: phases.do refleja el porcentaje', async () => {
    const accidents = [
      buildMockAccident({ daysLost: 3, incidentDate: new Date('2026-01-15') }),
    ];

    let callCount = 0;
    const provider = new AccidentSeverityProvider(
      createMockIncidentModel(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(accidents);
        return Promise.resolve([]);
      }),
      createMockEmployeeModel(20),
    );

    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.phases!.do, result.percentage);
  });

  it('SEV-006: señala accidentes sin días perdidos', async () => {
    const accidents = [
      buildMockAccident({ daysLost: 5, incidentDate: new Date('2026-01-15') }),
      buildMockAccident({ daysLost: undefined, incidentDate: new Date('2026-02-20') }),
    ];

    let callCount = 0;
    const provider = new AccidentSeverityProvider(
      createMockIncidentModel(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(accidents);
        return Promise.resolve([]);
      }),
      createMockEmployeeModel(30),
    );

    const result = await provider.getCompliance(VALID_COMPANY_ID);
    const missingDays = result.findings.find(
      (f: any) => f.id === 'accident-severity-missing-days',
    );
    assert.ok(missingDays, 'Should flag accidents without daysLost');
    assert.match(missingDays.title, /1.*sin días perdidos/);
  });

  it('SEV-007: tenant isolation — filtro por companyId', async () => {
    let capturedQuery: unknown = null;
    const findFn = (query: unknown) => {
      capturedQuery = query;
      return {
        lean: () => ({
          exec: () => Promise.resolve([buildMockAccident()]),
        }),
      };
    };

    const provider = new AccidentSeverityProvider(
      { find: findFn } as never,
      createMockEmployeeModel(10),
    );

    await provider.getCompliance(VALID_COMPANY_ID);

    assert.ok(capturedQuery, 'find() should have been called');
    const q = capturedQuery as Record<string, unknown>;
    assert.ok('companyId' in q, 'Must filter by companyId');
  });

  it('SEV-008: tendencia se calcula comparando años', async () => {
    let callCount = 0;
    const provider = new AccidentSeverityProvider(
      createMockIncidentModel(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([
            buildMockAccident({ daysLost: 10, incidentDate: new Date('2026-01-15') }),
          ]);
        }
        return Promise.resolve([
          buildMockAccident({ daysLost: 5, incidentDate: new Date('2025-06-15') }),
        ]);
      }),
      createMockEmployeeModel(20),
    );

    const result = await provider.getCompliance(VALID_COMPANY_ID);
    const trend = result.findings.find((f: any) => f.id === 'accident-severity-trend');
    assert.ok(trend, 'Should have trend finding');
    assert.match(trend.title, /Tendencia severidad/);
  });

  it('SEV-009: score sube con datos completos', async () => {
    const accidents = [
      buildMockAccident({ daysLost: 5, incidentDate: new Date('2026-01-15') }),
      buildMockAccident({ daysLost: 3, incidentDate: new Date('2026-02-20') }),
    ];

    let callCount = 0;
    const provider = new AccidentSeverityProvider(
      createMockIncidentModel(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(accidents);
        return Promise.resolve([
          buildMockAccident({ daysLost: 2, incidentDate: new Date('2025-03-10') }),
        ]);
      }),
      createMockEmployeeModel(40),
    );

    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.ok(result.percentage >= 70, `Expected >= 70, got ${result.percentage}`);
  });
});
