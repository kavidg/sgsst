import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { DiseaseIncidenceProvider } from './disease-incidence.provider';
import { ProviderComplianceResult } from './compliance-provider.interface';
import {
  OccupationalDiseaseQualification,
  OccupationalDiseaseCaseStatus,
} from '../../occupational-disease-statistical-case/schemas/occupational-disease-statistical-case.schema';
import {
  filterScoringEligible,
  getPhaseWeights,
  SCORING_EXCLUDED_MODULES,
  SCORING_INELIGIBLE_MODULES,
} from '../utils/compliance-weights';

/**
 * FASE 35D-2 — Tests unitarios del DiseaseIncidenceProvider (estándar 3.3.5).
 *
 * Cobertura (§15): metadata, tenant isolation, companyId inválido, denominador
 * (admissionDate <= periodEnd / ausente incluido / inactivo excluido),
 * numerador MODEL B (QUALIFIED + active + firstOccurrence + fecha en período),
 * OPEN/CLOSED, zero cases, fórmula, precisión, trazabilidad, duplicidad,
 * períodos UTC y fronteras de fuentes.
 */

const VALID_COMPANY_ID = '507f1f77bcf86cd799439012';

/* ── Mock helpers ── */

function buildMockCase(overrides: Record<string, unknown> = {}) {
  return {
    _id: '507f1f77bcf86cd799439099',
    companyId: VALID_COMPANY_ID,
    statisticalCaseId: 'CASO-2026-001',
    employeeId: '507f1f77bcf86cd799439077',
    occupationalQualification: OccupationalDiseaseQualification.QUALIFIED,
    active: true,
    firstOccurrence: true,
    recognitionDate: new Date('2026-05-10'),
    caseStatus: OccupationalDiseaseCaseStatus.OPEN,
    ...overrides,
  };
}

function createMockCaseModel(cases: unknown[] = [], captured?: { caseQuery?: unknown }) {
  return {
    find: (query: unknown) => {
      if (captured) captured.caseQuery = query;
      return {
        lean: () => ({ exec: () => Promise.resolve(cases) }),
      };
    },
  } as never;
}

function createMockEmployeeModel(count: number, captured?: { employeeQuery?: unknown }) {
  return {
    countDocuments: (query: unknown) => {
      if (captured) captured.employeeQuery = query;
      return { exec: () => Promise.resolve(count) };
    },
  } as never;
}

function buildProvider(
  cases: unknown[],
  employees: number,
  captured?: { caseQuery?: unknown; employeeQuery?: unknown },
) {
  const provider = new DiseaseIncidenceProvider(
    createMockCaseModel(cases, captured),
    createMockEmployeeModel(employees, captured),
  );
  /** El provider SIEMPRE llena metadata; se tipa no-opcional para las aserciones. */
  return {
    get metadata() {
      return provider.metadata;
    },
    async getCompliance(companyId: string): Promise<ProviderComplianceResult & { metadata: Record<string, unknown> }> {
      return (await provider.getCompliance(companyId)) as ProviderComplianceResult & {
        metadata: Record<string, unknown>;
      };
    },
  };
}

/* ── Metadata y períodos ── */

describe('DiseaseIncidenceProvider — Metadata y período (3.3.5)', () => {
  it('DI-001: metadata del provider con standard 3.3.5 / do / EXACT', () => {
    const provider = buildProvider([], 0);
    const meta = provider.metadata;
    assert.equal(meta.module, 'disease-incidence');
    assert.equal(meta.standard, '3.3.5');
    assert.equal(meta.phase, 'do');
    assert.equal(meta.semantic, 'EXACT');
  });

  it('DI-002: metadata completa de la medición (§9)', async () => {
    const provider = buildProvider([buildMockCase()], 100);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    const m = result.metadata;
    assert.equal(m['metric'], 'incidence');
    assert.equal(m['unit'], 'casos nuevos por 1.000 trabajadores');
    assert.equal(m['scaleFactor'], 1000);
    assert.equal(m['numerator'], 1);
    assert.equal(m['newCases'], 1);
    assert.equal(m['denominator'], 100);
    assert.equal(m['referencePopulation'], 100);
    assert.equal(m['denominatorType'], 'census_headcount_proxy');
    assert.ok(m['periodStart'], 'periodStart presente');
    assert.ok(m['periodEnd'], 'periodEnd presente');
    assert.equal(m['zeroDenominator'], false);
    assert.equal(m['invalidCompanyId'], false);
    assert.equal(m['totalRecords'], 1);
    assert.ok('employeeTraceabilityCoverage' in m);
    assert.ok('duplicatePotentialCount' in m);
  });

  it('DI-003: período UTC del año calendario en curso (1 ene 00:00 → 31 dic 23:59:59.999)', async () => {
    const provider = buildProvider([buildMockCase()], 100);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    const m = result.metadata;
    const start = new Date(m['periodStart'] as string);
    const end = new Date(m['periodEnd'] as string);
    const y = new Date().getUTCFullYear();
    assert.equal(start.toISOString(), `${y}-01-01T00:00:00.000Z`);
    assert.equal(end.toISOString(), `${y}-12-31T23:59:59.999Z`);
  });
});

/* ── Tenant isolation ── */

describe('DiseaseIncidenceProvider — Tenant isolation (3.3.5)', () => {
  it('DI-004: consulta de casos SIEMPRE filtrada por companyId', async () => {
    const captured: { caseQuery?: unknown } = {};
    const provider = buildProvider([buildMockCase()], 10, captured);
    await provider.getCompliance(VALID_COMPANY_ID);
    const q = captured.caseQuery as Record<string, unknown>;
    assert.ok('companyId' in q, 'filtro companyId en casos');
    assert.ok(q['companyId'] instanceof Types.ObjectId);
  });

  it('DI-005: consulta de empleados SIEMPRE filtrada por companyId', async () => {
    const captured: { employeeQuery?: unknown } = {};
    const provider = buildProvider([], 10, captured);
    await provider.getCompliance(VALID_COMPANY_ID);
    const q = captured.employeeQuery as Record<string, unknown>;
    assert.ok('companyId' in q, 'filtro companyId en empleados');
  });

  it('DI-006: companyId proviene del contexto del engine, nunca del payload', async () => {
    let received: unknown = null;
    const caseModel = {
      find: (query: unknown) => {
        received = (query as Record<string, unknown>)['companyId'];
        return { lean: () => ({ exec: () => Promise.resolve([]) }) };
      },
    } as never;
    const provider = new DiseaseIncidenceProvider(caseModel, createMockEmployeeModel(0));
    await provider.getCompliance(VALID_COMPANY_ID);
    assert.ok(received instanceof Types.ObjectId);
    assert.equal((received as Types.ObjectId).toHexString(), VALID_COMPANY_ID);
  });

  it('DI-007: companyId inválido → NO_DATA (Caso A §6)', async () => {
    const provider = buildProvider([], 10);
    const result = await provider.getCompliance('not-an-object-id');
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.findings[0].id, 'disease-incidence-invalid-company');
    assert.equal(result.metadata['invalidCompanyId'], true);
  });
});

/* ── Denominador ── */

describe('DiseaseIncidenceProvider — Denominador (3.3.5)', () => {
  it('DI-008: denominador = status Activo + admissionDate <= periodEnd (o ausente)', async () => {
    const captured: { employeeQuery?: unknown } = {};
    const provider = buildProvider([], 42, captured);
    await provider.getCompliance(VALID_COMPANY_ID);
    const q = captured.employeeQuery as Record<string, unknown>;
    assert.equal(q['status'], 'Activo');
    const or = q['$or'] as Record<string, unknown>[];
    const lteClause = or.find((c) => {
      const adm = c['admissionDate'] as Record<string, unknown> | undefined;
      return adm && '$lte' in adm;
    });
    assert.ok(lteClause, 'cláusula admissionDate <= periodEnd');
    const missingClause = or.find(
      (c) => 'admissionDate' in c && !('$lte' in (c['admissionDate'] as object)),
    );
    assert.ok(missingClause, 'cláusula admissionDate ausente/null');
    assert.ok('companyId' in (captured.employeeQuery as Record<string, unknown>), 'denominador tenant-scoped');
  });

  it('DI-009: admissionDate ausente → incluido por compatibilidad (§3)', async () => {
    const captured: { employeeQuery?: unknown } = {};
    const provider = buildProvider([], 77, captured);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    const q = captured.employeeQuery as Record<string, unknown>;
    const or = q['$or'] as Record<string, unknown>[];
    assert.ok(or.some((c) => 'admissionDate' in c && !('$lte' in (c['admissionDate'] as object))));
    assert.equal(result.metadata['denominator'], 77);
    assert.equal(result.metadata['referencePopulation'], 77);
  });

  it('DI-010: denominator=0 → NO_DATA, sin división (Caso B §6)', async () => {
    const provider = buildProvider([buildMockCase()], 0);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.findings[0].id, 'disease-incidence-no-denominator');
    assert.match(result.findings[0].description, /No existe población de referencia/);
    assert.equal(result.metadata['zeroDenominator'], true);
  });
});

/* ── Numerador MODEL B ── */

describe('DiseaseIncidenceProvider — Numerador MODEL B (3.3.5)', () => {
  it('DI-011: QUALIFIED + active + firstOccurrence + fecha dentro del período → cuenta', async () => {
    const provider = buildProvider([buildMockCase()], 100);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['newCases'], 1);
  });

  it('DI-012: fecha anterior al período → no cuenta', async () => {
    const provider = buildProvider(
      [buildMockCase({ recognitionDate: new Date('2025-06-10') })],
      100,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['newCases'], 0);
  });

  it('DI-013: fecha posterior al período → no cuenta', async () => {
    const provider = buildProvider(
      [buildMockCase({ recognitionDate: new Date('2099-01-15') })],
      100,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['newCases'], 0);
  });

  it('DI-014: UNDER_REVIEW → no cuenta', async () => {
    const provider = buildProvider(
      [buildMockCase({ occupationalQualification: OccupationalDiseaseQualification.UNDER_REVIEW })],
      100,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['newCases'], 0);
  });

  it('DI-015: NOT_QUALIFIED → no cuenta', async () => {
    const provider = buildProvider(
      [buildMockCase({ occupationalQualification: OccupationalDiseaseQualification.NOT_QUALIFIED })],
      100,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['newCases'], 0);
  });

  it('DI-016: DISCARDED → no cuenta', async () => {
    const provider = buildProvider(
      [buildMockCase({ occupationalQualification: OccupationalDiseaseQualification.DISCARDED })],
      100,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['newCases'], 0);
  });

  it('DI-017: active=false → no cuenta', async () => {
    const provider = buildProvider([buildMockCase({ active: false })], 100);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['newCases'], 0);
  });

  it('DI-018: recognitionDate ausente → no cuenta (no se infiere)', async () => {
    const provider = buildProvider([buildMockCase({ recognitionDate: undefined })], 100);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['newCases'], 0);
  });

  it('DI-019: OPEN válido → cuenta', async () => {
    const provider = buildProvider(
      [buildMockCase({ caseStatus: OccupationalDiseaseCaseStatus.OPEN })],
      100,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['newCases'], 1);
  });

  it('DI-020: CLOSED válido → cuenta (cerrar ≠ eliminar del numerador)', async () => {
    const provider = buildProvider(
      [buildMockCase({ caseStatus: OccupationalDiseaseCaseStatus.CLOSED })],
      100,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['newCases'], 1);
  });

  it('DI-021: firstOccurrence=false → no cuenta (recurrencia/episodio posterior)', async () => {
    const provider = buildProvider([buildMockCase({ firstOccurrence: false })], 100);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['newCases'], 0);
  });

  it('DI-022: mezcla de casos — solo los nuevos válidos del período cuentan', async () => {
    const provider = buildProvider(
      [
        buildMockCase({ statisticalCaseId: 'A' }), // nuevo válido
        buildMockCase({ statisticalCaseId: 'B', firstOccurrence: false }), // recurrencia
        buildMockCase({ statisticalCaseId: 'C', recognitionDate: new Date('2024-01-01') }), // previo
        buildMockCase({ statisticalCaseId: 'D', active: false }), // baja
        buildMockCase({
          statisticalCaseId: 'E',
          occupationalQualification: OccupationalDiseaseQualification.UNDER_REVIEW,
        }),
      ],
      200,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['newCases'], 1);
    assert.equal(result.metadata['totalRecords'], 5);
    assert.equal(result.metadata['administrativeOnlyRecords'], undefined, 'flag exclusivo de 3.3.4 no presente');
  });
});

/* ── Estados del dataset ── */

describe('DiseaseIncidenceProvider — Estados del dataset (3.3.5)', () => {
  it('DI-023: colección completamente vacía → NO_DATA (Caso C §6)', async () => {
    const provider = buildProvider([], 50);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.findings[0].id, 'disease-incidence-no-data');
    assert.equal(result.metadata['collectionEmpty'], true);
  });

  it('DI-024: registros + 0 casos nuevos + denominador > 0 → incidencia 0 VÁLIDA (Caso D §6)', async () => {
    const provider = buildProvider(
      [
        buildMockCase({ firstOccurrence: false }),
        buildMockCase({
          occupationalQualification: OccupationalDiseaseQualification.UNDER_REVIEW,
        }),
        buildMockCase({ recognitionDate: new Date('2025-01-01') }), // previo al período
      ],
      80,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.notEqual(result.status, 'NO_DATA');
    assert.equal(result.metadata['newCases'], 0);
    assert.equal(result.metadata['incidence'], 0);
    const zeroFinding = result.findings.find((f) => f.id === 'disease-incidence-zero-cases');
    assert.ok(zeroFinding, 'finding de cero casos');
    assert.match(zeroFinding.title, /0 casos nuevos/);
    assert.match(zeroFinding.description, /subregistro/);
  });

  it('DI-025: incidencia 0 con registro en uso → TARGET_MET (§10)', async () => {
    const provider = buildProvider([buildMockCase({ firstOccurrence: false })], 100);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.status, 'TARGET_MET');
    assert.equal(result.percentage, 100);
  });

  it('DI-026: fórmula — newCases=1, denominator=100 → incidence=10', async () => {
    const provider = buildProvider([buildMockCase()], 100);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['incidence'], 10);
  });

  it('DI-027: fórmula — newCases=5, denominator=200 → incidence=25', async () => {
    const provider = buildProvider(
      Array.from({ length: 5 }, (_, i) =>
        buildMockCase({
          statisticalCaseId: `C-${i}`,
          recognitionDate: new Date(`2026-0${(i % 8) + 1}-10`),
        }),
      ),
      200,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['incidence'], 25);
  });

  it('DI-028: SCALE_FACTOR fijo 1000 (no configurable)', async () => {
    const provider = buildProvider([buildMockCase()], 100);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['scaleFactor'], 1000);
  });

  it('DI-029: precisión interna completa y display 2 decimales', async () => {
    // 1/56 = 17.857142857…
    const provider = buildProvider([buildMockCase()], 56);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    const incidence = result.metadata['incidence'] as number;
    assert.ok(Math.abs(incidence - 17.857142857142858) < 1e-9, 'precisión interna completa');
    const finding = result.findings.find((f) => f.id === 'disease-incidence-rate');
    assert.ok(finding);
    assert.match(finding.title, /17\.86/);
  });
});

/* ── Trazabilidad y duplicidad (Casos E/F §6) ── */

describe('DiseaseIncidenceProvider — Trazabilidad y duplicidad (3.3.5)', () => {
  it('DI-030: employeeId ausente → el caso cuenta y degrada la trazabilidad (Caso F)', async () => {
    const provider = buildProvider([buildMockCase({ employeeId: undefined })], 100);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['newCases'], 1, 'el caso SIN employeeId SÍ cuenta');
    assert.equal(result.metadata['employeeTraceabilityCoverage'], 0);
    const gap = result.findings.find((f) => f.id === 'disease-incidence-traceability-gap');
    assert.ok(gap, 'finding de trazabilidad');
  });

  it('DI-031: múltiples firstOccurrence del mismo employeeId → finding de duplicidad, sin bloqueo (Caso E)', async () => {
    const empA = '507f1f77bcf86cd799439077';
    const provider = buildProvider(
      [
        buildMockCase({ statisticalCaseId: 'A', employeeId: empA }),
        buildMockCase({ statisticalCaseId: 'B', employeeId: empA, recognitionDate: new Date('2026-08-01') }),
      ],
      100,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    // El numerador NO se altera (semántica vigente: episodio estadístico).
    assert.equal(result.metadata['newCases'], 2);
    assert.equal(result.metadata['duplicatePotentialCount'], 1);
    const dup = result.findings.find((f) => f.id === 'disease-incidence-duplicate-episodes');
    assert.ok(dup, 'finding de duplicidad');
    assert.match(dup.description, /identidad clínica/);
  });

  it('DI-032: duplicidad degrada C2 y el score (sin bloquear el cálculo)', async () => {
    const empA = '507f1f77bcf86cd799439077';
    const empB = '507f1f77bcf86cd799439078';
    const empC = '507f1f77bcf86cd799439079';
    const empD = '507f1f77bcf86cd799439080';
    const cleanProvider = buildProvider(
      [buildMockCase({ employeeId: empA })],
      100,
    );
    // 4 trabajadores con 2 casos nuevos cada uno → 4 grupos de duplicidad.
    const dupCases = [empA, empB, empC, empD].flatMap((emp, i) => [
      buildMockCase({ employeeId: emp, statisticalCaseId: `A-${i}` }),
      buildMockCase({
        employeeId: emp,
        statisticalCaseId: `B-${i}`,
        recognitionDate: new Date('2026-08-01'),
      }),
    ]);
    const dupProvider = buildProvider(dupCases, 100);
    const clean = await cleanProvider.getCompliance(VALID_COMPANY_ID);
    const dup = await dupProvider.getCompliance(VALID_COMPANY_ID);
    assert.equal(clean.metadata['duplicatePotentialCount'], 0);
    assert.equal(dup.metadata['duplicatePotentialCount'], 4);
    assert.equal(dup.metadata['newCases'], 8, 'el numerador NO se altera por duplicidad');
    assert.ok(
      (dup.percentage as number) < (clean.percentage as number),
      `score con duplicidad ${dup.percentage} < score limpio ${clean.percentage}`,
    );
    assert.equal(dup.status, 'TARGET_NOT_MET');
  });
});

/* ── Scoring e integración (§10/§12) ── */

describe('DiseaseIncidenceProvider — Scoring e integración (3.3.5)', () => {
  it('DI-033: score evalúa la medición, NO la magnitud epidemiológica', async () => {
    // 300 casos nuevos / 1000 trabajadores = 300 por 1.000 — tasa alta.
    // employeeId distinto por caso: sin duplicidades, C2 = 100.
    const cases = Array.from({ length: 300 }, (_, i) =>
      buildMockCase({
        statisticalCaseId: `C-${i}`,
        employeeId: `507f1f77bcf86cd799439${String(1000 + i).slice(-4)}`,
      }),
    );
    const provider = buildProvider(cases, 1000);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 100);
    assert.equal(result.metadata['incidence'], 300);
    assert.equal(result.metadata['duplicatePotentialCount'], 0);
  });

  it('DI-034: estados del provider — NO se usa NON_COMPLIANT (§10)', async () => {
    const okProvider = buildProvider([buildMockCase()], 100);
    const gapProvider = buildProvider([buildMockCase({ employeeId: undefined })], 100);
    const ok = await okProvider.getCompliance(VALID_COMPANY_ID);
    const gap = await gapProvider.getCompliance(VALID_COMPANY_ID);
    assert.ok(['TARGET_MET', 'TARGET_NOT_MET', 'NO_DATA'].includes(ok.status));
    assert.ok(['TARGET_MET', 'TARGET_NOT_MET', 'NO_DATA'].includes(gap.status));
    assert.equal(gap.status, 'TARGET_NOT_MET', 'brechas → TARGET_NOT_MET (no NON_COMPLIANT)');
  });

  it('DI-035: disease-incidence es scoring-eligible (no excluido)', () => {
    assert.equal(SCORING_EXCLUDED_MODULES.has('disease-incidence'), false);
    assert.equal(SCORING_INELIGIBLE_MODULES.has('disease-incidence'), false);
  });

  it('DI-036: el resultado conserva contribución do tras filterScoringEligible', () => {
    const providerResult = {
      module: 'disease-incidence',
      percentage: 90,
      status: 'TARGET_MET',
      findings: [],
      pending: 0,
      completed: 1,
      phases: { do: 90 },
    };
    const filtered = filterScoringEligible([providerResult]);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].phases?.do, 90);
  });

  it('DI-037: pesos PHVA intactos (plan .25 / do .6 / check .05 / act .1)', () => {
    const weights = getPhaseWeights();
    assert.deepEqual(weights, { plan: 0.25, do: 0.6, check: 0.05, act: 0.1 });
  });

  it('DI-038: NO importa fuentes prohibidas (sin double-scoring) (§15.34-37)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(
      resolve(__dirname, '../../../../src/modules/compliance-engine/providers/disease-incidence.provider.ts'),
      'utf-8',
    );
    for (const forbidden of [
      'Incident',
      'Absenteeism',
      'DiseaseInvestigation',
      'AccidentStatistics',
      'AccidentSeverity',
      'EpidemiologicalSurveillance',
      'CompanyPeriodWorkData',
      'hoursWorked',
      'Risk',
    ]) {
      assert.doesNotMatch(
        source,
        new RegExp(`import[^;]*\\b${forbidden}\\b`),
        `fuente prohibida: ${forbidden}`,
      );
    }
    // Sin datos clínicos (§15.38).
    const codeOnly = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//') && !line.trim().startsWith('/*'))
      .join('\n');
    for (const pattern of [/diagnos[ti]/i, /\bcie\b/i, /historiaCl/i, /s[ií]ntoma/i, /tratamiento/i, /medicamento/i]) {
      assert.doesNotMatch(codeOnly, pattern, `término clínico prohibido: ${pattern}`);
    }
  });
});
