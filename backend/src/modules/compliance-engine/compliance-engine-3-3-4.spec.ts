import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATALOG_60 } from '../standard-catalog/constants/catalog-60';
import { DiseasePrevalenceProvider } from './providers/disease-prevalence.provider';
import { ComplianceEngineService } from './compliance-engine.service';
import { filterScoringEligible, getPhaseWeights } from './utils/compliance-weights';

/**
 * FASE 35C-2 — Pruebas arquitectónicas del estándar 3.3.4
 * (Prevalencia de enfermedad laboral).
 *
 * SCOPE-1: 3.3.4 quedó FUERA DEL ALCANCE aprobado por los socios. Estos tests
 * ahora garantizan el contrato POST-scope-lock:
 * - Frontera de fuentes: DiseasePrevalenceProvider consume EXCLUSIVAMENTE
 *   OccupationalDiseaseStatisticalCase + Employee (infraestructura futura).
 * - Engine: el provider NO está registrado (desregistrado del scoring).
 * - Catálogo: 3.3.4 PLANNED + OUT_OF_SCOPE / HACER / peso 1 / ['60'] /
 *   moduleRoute conservado; sin validationProvider activo.
 * - Frontera 3.3.2: el módulo 'health-indicators' sigue siendo la evidencia de
 *   3.3.2 (severidad) y NO 3.3.4; sin double-scoring entre ambos.
 */

const BACKEND_ROOT = resolve(__dirname, '../../..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(BACKEND_ROOT, relativePath), 'utf-8');
}

describe('FASE 35C-2 — Arquitectura 3.3.4: fuentes', () => {
  const providerSource = readSource(
    'src/modules/compliance-engine/providers/disease-prevalence.provider.ts',
  );

  it('ARQ-001: consume OccupationalDiseaseStatisticalCase (fuente única del numerador)', () => {
    assert.match(
      providerSource,
      /occupational-disease-statistical-case\/schemas\/occupational-disease-statistical-case\.schema/,
    );
  });

  it('ARQ-002: consume Employee (fuente única del denominador)', () => {
    assert.match(providerSource, /employees\/schemas\/employee\.schema/);
  });

  it('ARQ-003: NO importa Incident como fuente', () => {
    assert.doesNotMatch(providerSource, /import[^;]*incidents\/schemas\/incident\.schema/);
  });

  it('ARQ-004: NO importa Absenteeism como fuente', () => {
    assert.doesNotMatch(providerSource, /import[^;]*absenteeism/);
  });

  it('ARQ-005: NO importa DiseaseInvestigation como fuente', () => {
    assert.doesNotMatch(providerSource, /import[^;]*disease-investigation/);
  });

  it('ARQ-006: NO importa OccupationalExam ni MedicalRecommendation como fuentes', () => {
    assert.doesNotMatch(providerSource, /import[^;]*occupational-exam/);
    assert.doesNotMatch(providerSource, /import[^;]*medical-recommendation/);
  });

  it('ARQ-007: NO importa HealthPromotionActivity ni WorkRestriction como fuentes', () => {
    assert.doesNotMatch(providerSource, /import[^;]*health-promotion/);
    assert.doesNotMatch(providerSource, /import[^;]*work-restriction/);
  });

  it('ARQ-008: NO importa Risk como fuente', () => {
    assert.doesNotMatch(providerSource, /import[^;]*risks\/schemas\/risk\.schema/);
  });

  it('ARQ-009: NO usa IndicatorDefinition / IndicatorMeasurement / registries de indicadores', () => {
    assert.doesNotMatch(providerSource, /IndicatorDefinition|IndicatorMeasurement/);
    assert.doesNotMatch(providerSource, /FormulaRegistry|DataSourceResolverRegistry/);
  });

  it('ARQ-010: NO introduce datos clínicos (solo metadata estadística)', () => {
    const forbidden = [
      /diagnos[ti]/i,
      /\bcie\b/i,
      /historiaCl[ií]nica/i,
      /medicalRecord/i,
      /s[ií]ntoma/i,
      /symptom/i,
      /tratamiento/i,
      /treatment/i,
      /medicamento/i,
      /medication/i,
      /incapacidad/i,
    ];
    // Solo sentencias de código (imports, propiedades y consultas), sin comentarios.
    const codeOnly = providerSource
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//') && !line.trim().startsWith('/*'))
      .join('\n');
    for (const pattern of forbidden) {
      assert.doesNotMatch(codeOnly, pattern, `término clínico prohibido: ${pattern}`);
    }
  });
});

describe('FASE 35C-2 — Arquitectura 3.3.4: engine y catálogo', () => {
  it('ARQ-011: DiseasePrevalenceProvider NO está registrado en el engine (SCOPE-1)', () => {
    const args: unknown[] = new Array(64).fill(null).map(() => ({}));
    const service = new (ComplianceEngineService as unknown as {
      new (...args: unknown[]): ComplianceEngineService;
    })(...args);
    const providers = (service as unknown as { providers: unknown[] }).providers;
    const matches = providers.filter((p) => p instanceof DiseasePrevalenceProvider);
    assert.equal(matches.length, 0, '3.3.4 fuera del alcance: no participa del scoring');
  });

  it('ARQ-012: catálogo — 3.3.4 PLANNED + OUT_OF_SCOPE / HACER / peso 1 / ["60"] (SCOPE-1)', () => {
    const std = CATALOG_60.find((s) => s.code === '3.3.4');
    assert.ok(std, '3.3.4 presente');
    assert.equal(std.implementationStatus, 'PLANNED', 'fuera del alcance aprobado');
    assert.equal(std.classification, 'OUT_OF_SCOPE');
    assert.equal(std.phva, 'HACER');
    assert.equal(std.normativeWeight, 1);
    assert.deepEqual(std.applicableLevels, ['60']);
  });

  it('ARQ-013: catálogo — 3.3.4 conserva moduleRoute/criteria/modeReview y pierde validationProvider (SCOPE-1)', () => {
    const std = CATALOG_60.find((s) => s.code === '3.3.4');
    assert.ok(std);
    assert.equal(std.validationProvider, undefined, 'provider desregistrado del scoring');
    assert.equal(std.moduleRoute, '/occupational-disease-statistical-cases');
    assert.ok(std.criteria, 'criteria definido (documentación de infraestructura futura)');
    assert.ok(std.modeReview, 'modeReview definido (documentación de infraestructura futura)');
  });

  it('ARQ-014: catálogo — 3.3.5 también PLANNED + OUT_OF_SCOPE con módulo conservado (SCOPE-1)', () => {
    const std = CATALOG_60.find((s) => s.code === '3.3.5');
    assert.ok(std, '3.3.5 presente');
    assert.equal(std.implementationStatus, 'PLANNED', 'fuera del alcance aprobado');
    assert.equal(std.classification, 'OUT_OF_SCOPE');
    assert.equal(std.validationProvider, undefined);
    assert.equal(std.moduleRoute, '/occupational-disease-statistical-cases');
  });

  it('ARQ-015: pesos PHVA intactos (plan .25 / do .6 / check .05 / act .1)', () => {
    const weights = getPhaseWeights();
    assert.deepEqual(weights, { plan: 0.25, do: 0.6, check: 0.05, act: 0.1 });
  });

  it('ARQ-016: disease-prevalence no está en los sets de exclusión (su no-puntuación se garantiza por desregistro)', () => {
    const result = {
      module: 'disease-prevalence',
      percentage: 90,
      status: 'TARGET_MET',
      findings: [],
      pending: 0,
      completed: 1,
      phases: { do: 90 },
    };
    const filtered = filterScoringEligible([result]);
    assert.equal(filtered.length, 1, 'sin exclusión por sets: el desregistro del engine es la frontera');
  });
});

describe('FASE 35C-2 — Frontera 3.3.2 / 3.3.4 / 3.3.5 (anti double-scoring)', () => {
  it('ARQ-017: 3.3.2 sigue anclada a health-indicators (severidad), no al registro estadístico', () => {
    const std = CATALOG_60.find((s) => s.code === '3.3.2');
    assert.ok(std, '3.3.2 presente');
    assert.equal(std.validationProvider, undefined, '3.3.2 sin provider EXACT propio (deuda conocida)');
    assert.notEqual(std.moduleRoute, '/occupational-disease-statistical-cases');
  });

  it('ARQ-018: 3.3.4 → prevalencia; 3.3.5 → incidencia; ambos desregistrados del scoring (SCOPE-1)', () => {
    const std334 = CATALOG_60.find((s) => s.code === '3.3.4');
    const std335 = CATALOG_60.find((s) => s.code === '3.3.5');
    assert.ok(std334 && std335);
    assert.match(std334.title, /prevalencia/i);
    assert.match(std335.title, /incidencia/i);
    assert.equal(std334.validationProvider, undefined, '3.3.4 sin provider activo');
    assert.equal(std335.validationProvider, undefined, '3.3.5 sin provider activo');
    assert.notEqual(std334.moduleRoute, '');
    assert.notEqual(std335.moduleRoute, '');
  });

  it('ARQ-019: el analyzer de 3.3.4 existe como archivo pero NO está registrado en el StandardAnalysisService (SCOPE-1)', () => {
    const analyzerSource = readSource(
      'src/modules/compliance-ai/standard-analysis/analyzers/disease-prevalence-standard.analyzer.ts',
    );
    assert.match(analyzerSource, /class DiseasePrevalenceStandardAnalyzer/);
    const serviceSource = readSource(
      'src/modules/compliance-ai/standard-analysis/standard-analysis.service.ts',
    );
    assert.doesNotMatch(serviceSource, /new DiseasePrevalenceStandardAnalyzer/);
  });

  it('ARQ-020: 3.2.3 (accident-statistics) y 3.3.4 consumen módulos distintos (sin double-scoring)', () => {
    const statsProvider = readSource(
      'src/modules/compliance-engine/providers/accident-statistics.provider.ts',
    );
    assert.doesNotMatch(
      statsProvider,
      /occupational-disease-statistical-case/,
      '3.2.3 no consume el registro estadístico',
    );
    const prevalenceProvider = readSource(
      'src/modules/compliance-engine/providers/disease-prevalence.provider.ts',
    );
    assert.doesNotMatch(
      prevalenceProvider,
      /import[^;]*incidents\/schemas\/incident\.schema/,
      '3.3.4 no consume Incident (fuente de 3.2.3)',
    );
  });
});
