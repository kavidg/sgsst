import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATALOG_60 } from '../standard-catalog/constants/catalog-60';
import { DiseaseIncidenceProvider } from './providers/disease-incidence.provider';
import { DiseasePrevalenceProvider } from './providers/disease-prevalence.provider';
import { ComplianceEngineService } from './compliance-engine.service';
import { filterScoringEligible, getPhaseWeights } from './utils/compliance-weights';

/**
 * FASE 35D-2 — Pruebas arquitectónicas del estándar 3.3.5
 * (Incidencia de enfermedad laboral).
 *
 * SCOPE-1: 3.3.5 quedó FUERA DEL ALCANCE aprobado por los socios. Contrato
 * POST-scope-lock:
 * - Provider NO registrado en el engine (desregistrado del scoring); la clase
 *   y sus fronteras de fuentes se conservan como infraestructura futura.
 * - Catálogo: 3.3.5 PLANNED + OUT_OF_SCOPE / HACER / peso 1 / ['60'] /
 *   moduleRoute conservado; sin validationProvider activo.
 * - Integridad de la infraestructura: PHVA weights, resolver y
 *   phase-prefixes intactos.
 */

const BACKEND_ROOT = resolve(__dirname, '../../..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(BACKEND_ROOT, relativePath), 'utf-8');
}

const providerSource = readSource(
  'src/modules/compliance-engine/providers/disease-incidence.provider.ts',
);

describe('FASE 35D-2 — Arquitectura 3.3.5: fuentes y fronteras', () => {
  it('ARQ335-001: consume OccupationalDiseaseStatisticalCase (fuente única del numerador)', () => {
    assert.match(
      providerSource,
      /occupational-disease-statistical-case\/schemas\/occupational-disease-statistical-case\.schema/,
    );
  });

  it('ARQ335-002: consume Employee (fuente única del denominador)', () => {
    assert.match(providerSource, /employees\/schemas\/employee\.schema/);
  });

  it('ARQ335-003: NO importa Incident como fuente', () => {
    assert.doesNotMatch(providerSource, /import[^;]*incidents\/schemas\/incident\.schema/);
  });

  it('ARQ335-004: NO importa DiseaseInvestigation como fuente', () => {
    assert.doesNotMatch(providerSource, /import[^;]*disease-investigation/);
  });

  it('ARQ335-005: NO importa Absenteeism como fuente', () => {
    assert.doesNotMatch(providerSource, /import[^;]*absenteeism/);
  });

  it('ARQ335-006: NO usa hoursWorked / person-time / CompanyPeriodWorkData', () => {
    const codeOnly = providerSource
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//') && !line.trim().startsWith('/*'))
      .join('\n');
    assert.doesNotMatch(codeOnly, /hoursWorked|personTime|person-time|CompanyPeriodWorkData/);
  });

  it('ARQ335-007: NO usa IndicatorDefinition / IndicatorMeasurement / registries', () => {
    assert.doesNotMatch(providerSource, /IndicatorDefinition|IndicatorMeasurement/);
    assert.doesNotMatch(providerSource, /FormulaRegistry|DataSourceResolverRegistry/);
  });

  it('ARQ335-008: NO introduce datos clínicos (solo metadata estadística)', () => {
    const codeOnly = providerSource
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//') && !line.trim().startsWith('/*'))
      .join('\n');
    for (const pattern of [
      /diagnos[ti]/i,
      /\bcie\b/i,
      /historiaCl[ií]nica/i,
      /medicalRecord/i,
      /s[ií]ntoma/i,
      /symptom/i,
      /tratamiento/i,
      /medicamento/i,
      /incapacidad/i,
    ]) {
      assert.doesNotMatch(codeOnly, pattern, `término clínico prohibido: ${pattern}`);
    }
  });

  it('ARQ335-009: numerador MODEL B — filtra firstOccurrence y ventana de período', () => {
    assert.match(providerSource, /firstOccurrence !== true/);
    assert.match(providerSource, /periodStartDay/);
    assert.match(providerSource, /periodEndDay/);
    assert.match(providerSource, /Date\.UTC\(year, 0, 1\)/);
    assert.match(providerSource, /Date\.UTC\(year, 11, 31/);
  });

  it('ARQ335-010: SCALE_FACTOR fijo 1000 (constante privada, no configurable)', () => {
    assert.match(providerSource, /SCALE_FACTOR = 1000/);
  });

  it('ARQ335-011: denominador census_headcount_proxy documentado en metadata', () => {
    assert.match(providerSource, /census_headcount_proxy/);
  });
});

describe('FASE 35D-2 — Arquitectura 3.3.5: engine y catálogo', () => {
  it('ARQ335-012: DiseaseIncidenceProvider NO está registrado en el engine (SCOPE-1)', () => {
    const args: unknown[] = new Array(64).fill(null).map(() => ({}));
    const service = new (ComplianceEngineService as unknown as {
      new (...args: unknown[]): ComplianceEngineService;
    })(...args);
    const providers = (service as unknown as { providers: unknown[] }).providers;
    const matches = providers.filter((p) => p instanceof DiseaseIncidenceProvider);
    assert.equal(matches.length, 0, '3.3.5 fuera del alcance: no participa del scoring');
  });

  it('ARQ335-013: DiseasePrevalenceProvider y DiseaseIncidenceProvider tampoco están registrados (SCOPE-1)', () => {
    const args: unknown[] = new Array(64).fill(null).map(() => ({}));
    const service = new (ComplianceEngineService as unknown as {
      new (...args: unknown[]): ComplianceEngineService;
    })(...args);
    const providers = (service as unknown as { providers: unknown[] }).providers;
    assert.equal(
      providers.filter((p) => p instanceof DiseasePrevalenceProvider).length,
      0,
      '3.3.4 fuera del alcance',
    );
    assert.equal(
      providers.filter((p) => p instanceof DiseaseIncidenceProvider).length,
      0,
      '3.3.5 fuera del alcance',
    );
  });

  it('ARQ335-014: metadata del provider — 3.3.5 / do / EXACT', () => {
    const provider = new DiseaseIncidenceProvider({} as never, {} as never);
    const meta = provider.metadata;
    assert.equal(meta.module, 'disease-incidence');
    assert.equal(meta.standard, '3.3.5');
    assert.equal(meta.phase, 'do');
    assert.equal(meta.semantic, 'EXACT');
  });

  it('ARQ335-015: catálogo — 3.3.5 PLANNED + OUT_OF_SCOPE / HACER / peso 1 / ["60"] (SCOPE-1)', () => {
    const std = CATALOG_60.find((s) => s.code === '3.3.5');
    assert.ok(std, '3.3.5 presente');
    assert.equal(std.implementationStatus, 'PLANNED', 'fuera del alcance aprobado');
    assert.equal(std.classification, 'OUT_OF_SCOPE');
    assert.equal(std.phva, 'HACER');
    assert.equal(std.normativeWeight, 1);
    assert.deepEqual(std.applicableLevels, ['60']);
    assert.equal(std.title, 'Medición de la incidencia de enfermedad laboral');
    assert.match(std.description, /nuevos casos por 1\.000 trabajadores expuestos en un período/);
  });

  it('ARQ335-016: catálogo — 3.3.5 conserva moduleRoute/criteria/modeReview y pierde validationProvider (SCOPE-1)', () => {
    const std = CATALOG_60.find((s) => s.code === '3.3.5');
    assert.ok(std);
    assert.equal(std.validationProvider, undefined, 'provider desregistrado del scoring');
    assert.equal(std.moduleRoute, '/occupational-disease-statistical-cases');
    assert.ok(std.criteria, 'criteria definido (documentación de infraestructura futura)');
    assert.ok(std.modeReview, 'modeReview definido (documentación de infraestructura futura)');
    assert.equal(std.section, undefined, 'sin sección PHVA visible');
  });

  it('ARQ335-017: pesos PHVA intactos (plan .25 / do .6 / check .05 / act .1)', () => {
    const weights = getPhaseWeights();
    assert.deepEqual(weights, { plan: 0.25, do: 0.6, check: 0.05, act: 0.1 });
  });

  it('ARQ335-018: disease-incidence es scoring-eligible (una sola vez en el pipeline)', () => {
    const result = {
      module: 'disease-incidence',
      percentage: 90,
      status: 'TARGET_MET',
      findings: [],
      pending: 0,
      completed: 1,
      phases: { do: 90 },
    };
    const filtered = filterScoringEligible([result]);
    assert.equal(filtered.length, 1, 'sin exclusión de scoring ni doble conteo');
    assert.equal(filtered[0].phases?.do, 90);
  });

  it('ARQ335-019: resolver/phase-prefixes intactos — sin 3.3.5 en registries de indicadores', () => {
    const registry = readSource('src/modules/indicators/formula/data-source-resolver-registry.ts');
    assert.doesNotMatch(registry, /occupational-disease|OccupationalDiseaseStatisticalCase/);
    // phase-prefixes.ts no menciona disease-incidence.
    const phasePrefixes = readSource('src/modules/compliance-engine/utils/phase-prefixes.ts');
    assert.doesNotMatch(phasePrefixes, /disease-incidence/);
  });

  it('ARQ335-020: analyzer de 3.3.5 existe como archivo pero NO está registrado en el StandardAnalysisService (SCOPE-1)', () => {
    const analyzerSource = readSource(
      'src/modules/compliance-ai/standard-analysis/analyzers/disease-incidence-standard.analyzer.ts',
    );
    assert.match(analyzerSource, /class DiseaseIncidenceStandardAnalyzer/);
    const serviceSource = readSource(
      'src/modules/compliance-ai/standard-analysis/standard-analysis.service.ts',
    );
    assert.doesNotMatch(serviceSource, /new DiseaseIncidenceStandardAnalyzer/);
  });

  it('ARQ335-021: tenant isolation en el provider — queries con companyId obligatorio', () => {
    assert.match(providerSource, /find\(\{ companyId: objectId \}\)/);
    assert.match(providerSource, /countDocuments\(\{\s*companyId: objectId/);
  });
});
