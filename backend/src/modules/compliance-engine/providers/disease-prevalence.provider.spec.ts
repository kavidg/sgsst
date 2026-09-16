import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { DiseasePrevalenceProvider } from './disease-prevalence.provider';
import { ProviderComplianceResult } from './compliance-provider.interface';
import {
  OccupationalDiseaseQualification,
  OccupationalDiseaseCaseStatus,
} from '../../occupational-disease-statistical-case/schemas/occupational-disease-statistical-case.schema';
import { filterScoringEligible, getPhaseWeights, SCORING_EXCLUDED_MODULES, SCORING_INELIGIBLE_MODULES } from '../utils/compliance-weights';

/**
 * FASE 35C-2 — Tests unitarios del DiseasePrevalenceProvider (estándar 3.3.4).
 *
 * Cobertura:
 * - Numerador: QUALIFIED + active + recognitionDate <= cutoff; OPEN/CLOSED
 *   cuentan; UNDER_REVIEW/NOT_QUALIFIED/DISCARDED no; active=false no;
 *   recognitionDate ausente o futura no; firstOccurrence no filtra.
 * - Denominador: Employee tenant-scoped, status 'Activo', admissionDate
 *   <= cutoff, admissionDate ausente incluido (compatibilidad 35C-1).
 * - Fórmula: (numerador/denominador) × 1000 con factor fijo.
 * - Dataset: colección vacía → NO_DATA; registro administrativo + 0 casos
 *   prevalentes → prevalencia 0 válida; denominador 0 → NO_DATA.
 * - Tenant isolation: filtro companyId obligatorio en ambas colecciones.
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
    recognitionDate: new Date('2026-03-15'),
    caseStatus: OccupationalDiseaseCaseStatus.OPEN,
    firstOccurrence: false,
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
  const provider = new DiseasePrevalenceProvider(
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

/* ── Numerador ── */

describe('DiseasePrevalenceProvider — Numerador (3.3.4)', () => {
  it('DP-001: QUALIFIED + active + recognitionDate <= cutoff cuenta', async () => {
    const provider = buildProvider([buildMockCase()], 100);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['numerator'], 1);
  });

  it('DP-002: recognitionDate futura respecto al cutoff NO cuenta', async () => {
    const provider = buildProvider(
      [buildMockCase({ recognitionDate: new Date('2099-01-01') })],
      100,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['numerator'], 0);
    assert.equal(result.metadata['administrativeOnlyRecords'], 1);
  });

  it('DP-003: UNDER_REVIEW NO cuenta', async () => {
    const provider = buildProvider(
      [buildMockCase({ occupationalQualification: OccupationalDiseaseQualification.UNDER_REVIEW })],
      100,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['numerator'], 0);
  });

  it('DP-004: NOT_QUALIFIED NO cuenta', async () => {
    const provider = buildProvider(
      [buildMockCase({ occupationalQualification: OccupationalDiseaseQualification.NOT_QUALIFIED })],
      100,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['numerator'], 0);
  });

  it('DP-005: DISCARDED NO cuenta', async () => {
    const provider = buildProvider(
      [buildMockCase({ occupationalQualification: OccupationalDiseaseQualification.DISCARDED })],
      100,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['numerator'], 0);
  });

  it('DP-006: active=false NO cuenta', async () => {
    const provider = buildProvider([buildMockCase({ active: false })], 100);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['numerator'], 0);
  });

  it('DP-007: caseStatus OPEN cuenta', async () => {
    const provider = buildProvider(
      [buildMockCase({ caseStatus: OccupationalDiseaseCaseStatus.OPEN })],
      100,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['numerator'], 1);
  });

  it('DP-008: caseStatus CLOSED cuenta (existencia ≠ gestión administrativa)', async () => {
    const provider = buildProvider(
      [buildMockCase({ caseStatus: OccupationalDiseaseCaseStatus.CLOSED })],
      100,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['numerator'], 1);
  });

  it('DP-009: recognitionDate ausente NO cuenta y NO se infiere', async () => {
    const provider = buildProvider([buildMockCase({ recognitionDate: undefined })], 100);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['numerator'], 0);
  });

  it('DP-010: firstOccurrence NO filtra la prevalencia (true y false cuentan igual)', async () => {
    const provider = buildProvider(
      [
        buildMockCase({ firstOccurrence: true, statisticalCaseId: 'A' }),
        buildMockCase({ firstOccurrence: false, statisticalCaseId: 'B' }),
      ],
      100,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['numerator'], 2);
  });

  it('DP-011: caso antiguo (reconocido hace años) cuenta — prevalencia de existencia', async () => {
    const provider = buildProvider([buildMockCase({ recognitionDate: new Date('2019-06-01') })], 100);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['numerator'], 1);
  });
});

/* ── Denominador ── */

describe('DiseasePrevalenceProvider — Denominador (3.3.4)', () => {
  it('DP-012: denominador = empleados activos con admissionDate <= cutoff', async () => {
    const captured: { employeeQuery?: unknown } = {};
    const provider = buildProvider([], 100, captured);
    await provider.getCompliance(VALID_COMPANY_ID);
    const q = captured.employeeQuery as Record<string, unknown>;
    assert.ok(q, 'countDocuments llamado');
    assert.ok('companyId' in q, 'filtro companyId obligatorio');
    assert.equal(q['status'], 'Activo');
    assert.ok(Array.isArray(q['$or']), 'regla admissionDate <= cutoff o ausente');
  });

  it('DP-013: admissionDate ausente se incluye (compatibilidad FASE 35C-1)', async () => {
    const captured: { employeeQuery?: unknown } = {};
    const provider = buildProvider([], 42, captured);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    const q = captured.employeeQuery as Record<string, unknown>;
    const or = q['$or'] as Record<string, unknown>[];
    const missingClause = or.find((c) => 'admissionDate' in c && !('$lte' in (c['admissionDate'] as object)));
    assert.ok(missingClause, 'cláusula admissionDate ausente/null presente');
    assert.equal(result.metadata['denominator'], 42);
  });
});

/* ── Fórmula ── */

describe('DiseasePrevalenceProvider — Fórmula (3.3.4)', () => {
  it('DP-014: numerator=1, denominator=100 → prevalence=10', async () => {
    const provider = buildProvider([buildMockCase()], 100);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['prevalence'], 10);
  });

  it('DP-015: numerator=0, denominator=100 → prevalence=0', async () => {
    const provider = buildProvider([buildMockCase({ occupationalQualification: OccupationalDiseaseQualification.UNDER_REVIEW })], 100);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['prevalence'], 0);
  });

  it('DP-016: numerator=5, denominator=200 → prevalence=25', async () => {
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
    assert.equal(result.metadata['prevalence'], 25);
  });

  it('DP-017: scaleFactor fijo 1000, no configurable', async () => {
    const provider = buildProvider([buildMockCase()], 100);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.metadata['scaleFactor'], 1000);
    assert.equal(result.metadata['unit'], 'casos por 1.000 trabajadores');
  });

  it('DP-018: metadata conserva precisión completa; display 2 decimales en finding', async () => {
    // 17.857142… = 2.5/1000*7000... usar 1/56 = 17.857142857...
    const provider = buildProvider([buildMockCase()], 56);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    const prevalence = result.metadata['prevalence'] as number;
    assert.ok(Math.abs(prevalence - 17.857142857142858) < 1e-9, 'precisión interna completa');
    const finding = result.findings.find((f) => f.id === 'disease-prevalence-rate');
    assert.ok(finding, 'finding de tasa presente');
    assert.match(finding.title, /17\.86/);
  });

  it('DP-019: cutoffDate explícito en metadata', async () => {
    const provider = buildProvider([buildMockCase()], 100);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.ok(result.metadata['cutoffDate'], 'cutoffDate presente');
    assert.match(result.metadata['cutoffDate'] as string, /^\d{4}-\d{2}-\d{2}T/);
  });
});

/* ── Estados del dataset ── */

describe('DiseasePrevalenceProvider — Estados del dataset (3.3.4)', () => {
  it('DP-020: colección completamente vacía + denominador > 0 → NO_DATA (no TARGET_MET)', async () => {
    const provider = buildProvider([], 50);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].id, 'disease-prevalence-no-data');
  });

  it('DP-021: denominador 0 → NO_DATA, sin división, sin TARGET automático', async () => {
    const provider = buildProvider([buildMockCase()], 0);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.findings[0].id, 'disease-prevalence-no-denominator');
    assert.match(result.findings[0].description, /No existe población de referencia/);
  });

  it('DP-022: registros administrativos + 0 casos prevalentes + denominador > 0 → prevalencia 0 VÁLIDA', async () => {
    const provider = buildProvider(
      [
        buildMockCase({ occupationalQualification: OccupationalDiseaseQualification.UNDER_REVIEW }),
        buildMockCase({ occupationalQualification: OccupationalDiseaseQualification.NOT_QUALIFIED }),
        buildMockCase({ active: false }),
      ],
      80,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.notEqual(result.status, 'NO_DATA');
    assert.equal(result.metadata['numerator'], 0);
    assert.equal(result.metadata['prevalence'], 0);
    const zeroFinding = result.findings.find((f) => f.id === 'disease-prevalence-zero-cases');
    assert.ok(zeroFinding, 'finding explicativo de cero casos');
    assert.match(zeroFinding.title, /0 casos cualificados/);
    assert.match(zeroFinding.description, /subregistro/);
  });

  it('DP-023: 0 prevalencia con registro en uso → score máximo según patrón (TARGET_MET)', async () => {
    const provider = buildProvider(
      [buildMockCase({ occupationalQualification: OccupationalDiseaseQualification.UNDER_REVIEW })],
      100,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.status, 'TARGET_MET');
    assert.equal(result.percentage, 100);
  });

  it('DP-024: score evalúa la medición (C1–C4), NO penaliza la magnitud epidemiológica', async () => {
    // 300 casos / 1000 trabajadores = 300 por 1.000 — tasa alta.
    const cases = Array.from({ length: 300 }, (_, i) =>
      buildMockCase({ statisticalCaseId: `C-${i}` }),
    );
    const provider = buildProvider(cases, 1000);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    // C1=100, C2=100, C3=100, C4=100 → 100. La tasa NO es el score.
    assert.equal(result.percentage, 100);
    assert.equal(result.metadata['prevalence'], 300);
  });

  it('DP-025: score < 90 cuando hay brechas de trazabilidad', async () => {
    const provider = buildProvider(
      [
        buildMockCase({ employeeId: undefined }),
        buildMockCase({ employeeId: undefined, statisticalCaseId: 'B' }),
      ],
      100,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.ok(result.percentage < 90, `score ${result.percentage} < 90`);
    assert.equal(result.status, 'TARGET_NOT_MET');
  });

  it('DP-026: PARTIAL trazabilidad documentada como finding, sin bloquear el conteo', async () => {
    const provider = buildProvider(
      [buildMockCase({ employeeId: undefined })],
      100,
    );
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    const traceability = result.findings.find((f) => f.id === 'disease-prevalence-traceability-gap');
    assert.ok(traceability, 'finding de trazabilidad presente');
    assert.equal(result.metadata['numerator'], 1, 'el caso SIN employeeId SÍ cuenta');
  });

  it('DP-027: companyId inválido → NO_DATA (guard de patrón 3.1.8)', async () => {
    const provider = buildProvider([], 10);
    const result = await provider.getCompliance('not-an-object-id');
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.findings[0].id, 'disease-prevalence-invalid-company');
  });
});

/* ── Tenant isolation ── */

describe('DiseasePrevalenceProvider — Tenant isolation (3.3.4)', () => {
  it('DP-028: consulta de casos SIEMPRE filtrada por companyId', async () => {
    const captured: { caseQuery?: unknown } = {};
    const provider = buildProvider([buildMockCase()], 10, captured);
    await provider.getCompliance(VALID_COMPANY_ID);
    const q = captured.caseQuery as Record<string, unknown>;
    assert.ok('companyId' in q, 'filtro companyId en casos');
  });

  it('DP-029: consulta de empleados SIEMPRE filtrada por companyId', async () => {
    const captured: { employeeQuery?: unknown } = {};
    const provider = buildProvider([], 10, captured);
    await provider.getCompliance(VALID_COMPANY_ID);
    const q = captured.employeeQuery as Record<string, unknown>;
    assert.ok('companyId' in q, 'filtro companyId en empleados');
  });

  it('DP-030: companyId recibido del contexto del engine, no del payload', async () => {
    let received: unknown = null;
    const caseModel = {
      find: (query: unknown) => {
        received = (query as Record<string, unknown>)['companyId'];
        return { lean: () => ({ exec: () => Promise.resolve([]) }) };
      },
    } as never;
    const provider = new DiseasePrevalenceProvider(caseModel, createMockEmployeeModel(0));
    // El engine llama getCompliance(companyId) con el id validado server-side.
    await provider.getCompliance(VALID_COMPANY_ID);
    assert.ok(received instanceof Types.ObjectId);
    assert.equal((received as Types.ObjectId).toHexString(), VALID_COMPANY_ID);
  });
});

/* ── Integración engine / scoring (FASE 29) ── */

describe('DiseasePrevalenceProvider — Integración y scoring (FASE 35C-2)', () => {
  it('DP-031: provider declarado con module disease-prevalence / 3.3.4 / do / EXACT', () => {
    const provider = buildProvider([], 0);
    const meta = provider.metadata;
    assert.equal(meta.module, 'disease-prevalence');
    assert.equal(meta.standard, '3.3.4');
    assert.equal(meta.phase, 'do');
    assert.equal(meta.semantic, 'EXACT');
  });

  it('DP-032: disease-prevalence NO está excluido del scoring (scoring-eligible)', () => {
    assert.equal(SCORING_EXCLUDED_MODULES.has('disease-prevalence'), false);
    assert.equal(SCORING_INELIGIBLE_MODULES.has('disease-prevalence'), false);
  });

  it('DP-033: el resultado conserva contribución do tras filterScoringEligible', () => {
    const providerResult = {
      module: 'disease-prevalence',
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

  it('DP-034: los pesos PHVA no cambiaron (plan .25 / do .6 / check .05 / act .1)', () => {
    const weights = getPhaseWeights();
    assert.equal(weights.plan, 0.25);
    assert.equal(weights.do, 0.6);
    assert.equal(weights.check, 0.05);
    assert.equal(weights.act, 0.1);
  });

  it('DP-035: el provider NO importa fuentes prohibidas (sin double-scoring)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(
      resolve(__dirname, '../../../../src/modules/compliance-engine/providers/disease-prevalence.provider.ts'),
      'utf-8',
    );
    for (const forbidden of ['Incident', 'Absenteeism', 'DiseaseInvestigation', 'AccidentStatistics', 'AccidentSeverity', 'OccupationalExam', 'MedicalRecommendation', 'HealthPromotionActivity', 'WorkRestriction', 'Risk']) {
      assert.doesNotMatch(
        source,
        new RegExp(`import[^;]*\\b${forbidden}\\b`),
        `fuente prohibida: ${forbidden}`,
      );
    }
  });
});
