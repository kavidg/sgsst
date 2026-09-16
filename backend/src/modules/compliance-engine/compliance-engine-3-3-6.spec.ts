import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ComplianceEngineService } from './compliance-engine.service';
import { MedicalAbsenteeismProvider } from './providers/medical-absenteeism.provider';
import { DiseasePrevalenceProvider } from './providers/disease-prevalence.provider';
import { DiseaseIncidenceProvider } from './providers/disease-incidence.provider';
import { CATALOG_60 } from '../standard-catalog/constants/catalog-60';
import { getPhaseWeights, filterScoringEligible, SCORING_EXCLUDED_MODULES, SCORING_INELIGIBLE_MODULES } from './utils/compliance-weights';

/**
 * FASE 35E-2 — Tests arquitectónicos de 3.3.6 en el ComplianceEngine.
 *
 * SCOPE-1: 3.3.6 quedó FUERA DEL ALCANCE aprobado por los socios. Contrato
 * POST-scope-lock: provider NO registrado en el engine (desregistrado del
 * scoring), catálogo PLANNED + OUT_OF_SCOPE con módulo conservado, y
 * arquitectura intacta (sin Applicability Engine, sin segundo engine,
 * PHVA/phase-prefixes intactos).
 */

const BACKEND_ROOT = resolve(__dirname, '../../..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(BACKEND_ROOT, relativePath), 'utf-8');
}

function buildServiceWith(...realProviders: unknown[]): ComplianceEngineService {
  // Aridad real tras SCOPE-1: 64 dependencias. Las instancias reales se pasan
  // al final del arreglo (el constructor solo guarda referencias; los providers
  // no se invocan en estos tests).
  const args: unknown[] = new Array(64 - realProviders.length).fill(null).map(() => ({}));
  args.push(...realProviders);
  return new (ComplianceEngineService as unknown as {
    new (...args: unknown[]): ComplianceEngineService;
  })(...args);
}

describe('FASE 35E-2 — Arquitectura 3.3.6: fuentes y semántica', () => {
  const providerSource = readSource(
    'src/modules/compliance-engine/providers/medical-absenteeism.provider.ts',
  );

  it('ARQ336-001: consume Absenteeism (fuente única del numerador)', () => {
    assert.match(providerSource, /absenteeism\/schemas\/absenteeism\.schema/);
  });

  it('ARQ336-002: consume CompanyPeriodScheduledWorkData (fuente única del denominador)', () => {
    assert.match(providerSource, /company-period-scheduled-work-data\.schema/);
  });

  it('ARQ336-003: NO usa Employee ni census_headcount_proxy (frontera con 3.3.4/3.3.5)', () => {
    assert.doesNotMatch(providerSource, /employees\/schemas\/employee\.schema/);
    assert.doesNotMatch(providerSource, /census_headcount_proxy/);
  });

  it('ARQ336-004: NO usa CompanyPeriodWorkData.hoursWorked (categoría programado ≠ trabajado)', () => {
    assert.doesNotMatch(providerSource, /company-period-work-data\.schema/);
    assert.doesNotMatch(providerSource, /hoursWorked/);
  });

  it('ARQ336-005: NO consume resultados de otros providers (sin double-scoring)', () => {
    for (const forbidden of [
      'DiseasePrevalenceProvider',
      'DiseaseIncidenceProvider',
      'AccidentStatisticsProvider',
      'AbsenteeismProvider',
    ]) {
      assert.doesNotMatch(providerSource, new RegExp(`import[^;]*${forbidden}`));
    }
  });

  it('ARQ336-006: sin datos clínicos (no descripcion/soporte; metadata-only)', () => {
    assert.doesNotMatch(providerSource, /record\.descripcion/);
    assert.doesNotMatch(providerSource, /record\.soporte/);
  });

  it('ARQ336-007: numerador por intersección de rangos (sin doble conteo cross-month)', () => {
    assert.match(providerSource, /Math\.max\(startDay, periodStartDay\)/);
    assert.match(providerSource, /Math\.min\(endDay, periodEndDay\)/);
  });

  it('ARQ336-008: período mensual UTC (sin fallback anual)', () => {
    assert.match(providerSource, /frequency: 'monthly'/);
    assert.match(providerSource, /denominatorType: 'scheduled_work_days'/);
  });

  it('ARQ336-009: tenant isolation — queries con companyId obligatorio', () => {
    assert.match(providerSource, /findOne\(\{ companyId: objectId, period \}\)/);
    assert.match(providerSource, /companyId: objectId/);
  });

  it('ARQ336-010: factor 100 fijo', () => {
    assert.match(providerSource, /FACTOR = 100/);
  });

  it('ARQ336-011: señal estructurada medicalIncapacity (sin inferencias desde texto)', () => {
    assert.match(providerSource, /medicalIncapacity === true/);
    assert.match(providerSource, /PERMISO/);
  });
});

describe('FASE 35E-2 — Arquitectura 3.3.6: engine y catálogo', () => {
  it('ARQ336-012: MedicalAbsenteeismProvider NO está registrado en el engine (SCOPE-1)', () => {
    const service = buildServiceWith();
    const providers = (service as unknown as { providers: unknown[] }).providers;
    const matches = providers.filter((p) => p instanceof MedicalAbsenteeismProvider);
    assert.equal(matches.length, 0, '3.3.6 fuera del alcance: no participa del scoring');
  });

  it('ARQ336-013: 3.3.4 / 3.3.5 / 3.3.6 NO están registrados (SCOPE-1)', () => {
    const service = buildServiceWith();
    const providers = (service as unknown as { providers: unknown[] }).providers;
    assert.equal(providers.filter((p) => p instanceof MedicalAbsenteeismProvider).length, 0);
    assert.equal(providers.filter((p) => p instanceof DiseasePrevalenceProvider).length, 0);
    assert.equal(providers.filter((p) => p instanceof DiseaseIncidenceProvider).length, 0);
  });

  it('ARQ336-014: metadata del provider — 3.3.6 / do / EXACT', () => {
    const provider = new MedicalAbsenteeismProvider({} as never, {} as never);
    const meta = provider.metadata;
    assert.equal(meta.module, 'medical-absenteeism');
    assert.equal(meta.standard, '3.3.6');
    assert.equal(meta.phase, 'do');
    assert.equal(meta.semantic, 'EXACT');
  });

  it('ARQ336-015: catálogo — 3.3.6 PLANNED + OUT_OF_SCOPE / HACER / peso 1 / ["60"] (SCOPE-1)', () => {
    const std = CATALOG_60.find((s) => s.code === '3.3.6');
    assert.ok(std, '3.3.6 presente');
    assert.equal(std.implementationStatus, 'PLANNED', 'fuera del alcance aprobado');
    assert.equal(std.classification, 'OUT_OF_SCOPE');
    assert.equal(std.phva, 'HACER');
    assert.equal(std.normativeWeight, 1);
    assert.deepEqual(std.applicableLevels, ['60']);
    assert.equal(std.title, 'Medición del ausentismo por causa médica');
  });

  it('ARQ336-016: catálogo — 3.3.6 conserva moduleRoute/criteria/modeReview y pierde validationProvider (SCOPE-1)', () => {
    const std = CATALOG_60.find((s) => s.code === '3.3.6');
    assert.ok(std);
    assert.equal(std.validationProvider, undefined, 'provider desregistrado del scoring');
    assert.equal(std.moduleRoute, '/absenteeism');
    assert.ok(std.criteria, 'criteria definido (documentación de infraestructura futura)');
    assert.ok(std.modeReview, 'modeReview definido (documentación de infraestructura futura)');
    assert.equal(std.section, undefined, 'sin sección PHVA visible');
  });

  it('ARQ336-017: pesos PHVA intactos (plan .25 / do .6 / check .05 / act .1)', () => {
    const weights = getPhaseWeights();
    assert.deepEqual(weights, { plan: 0.25, do: 0.6, check: 0.05, act: 0.1 });
  });

  it('ARQ336-018: medical-absenteeism es scoring-eligible (una sola vez en el pipeline)', () => {
    assert.equal(SCORING_EXCLUDED_MODULES.has('medical-absenteeism'), false);
    assert.equal(SCORING_INELIGIBLE_MODULES.has('medical-absenteeism'), false);
    const result = {
      module: 'medical-absenteeism',
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

  it('ARQ336-019: resolver/phase-prefixes intactos — sin 3.3.6 en registries de indicadores', () => {
    const registry = readSource('src/modules/indicators/formula/data-source-resolver-registry.ts');
    assert.doesNotMatch(registry, /scheduled-work|CompanyPeriodScheduledWorkData/);
    const phasePrefixes = readSource('src/modules/compliance-engine/utils/phase-prefixes.ts');
    assert.doesNotMatch(phasePrefixes, /medical-absenteeism/);
  });

  it('ARQ336-020: analyzer de 3.3.6 existe como archivo pero NO está registrado en el StandardAnalysisService (SCOPE-1)', () => {
    const analyzerSource = readSource(
      'src/modules/compliance-ai/standard-analysis/analyzers/medical-absenteeism-standard.analyzer.ts',
    );
    assert.match(analyzerSource, /class MedicalAbsenteeismStandardAnalyzer/);
    const serviceSource = readSource(
      'src/modules/compliance-ai/standard-analysis/standard-analysis.service.ts',
    );
    assert.doesNotMatch(serviceSource, /new MedicalAbsenteeismStandardAnalyzer/);
  });

  it('ARQ336-021: controlador del denominador existe con tenant resuelto server-side', () => {
    const controllerSource = readSource(
      'src/modules/incidents/company-period-scheduled-work-data.controller.ts',
    );
    assert.match(controllerSource, /FirebaseAuthGuard/);
    assert.match(controllerSource, /CompanyAccessGuard/);
    assert.match(controllerSource, /request\.companyId/);
    assert.match(controllerSource, /Roles\('owner', 'admin'\)/);
  });

  it('ARQ336-022: el schema del denominador no mezcla horas trabajadas con días programados', () => {
    const schemaSource = readSource(
      'src/modules/incidents/schemas/company-period-scheduled-work-data.schema.ts',
    );
    assert.match(schemaSource, /scheduledWorkDays/);
    assert.doesNotMatch(schemaSource, /hoursWorked/);
    assert.match(schemaSource, /\{ companyId: 1, period: 1 \}/);
    assert.match(schemaSource, /unique: true/);
  });
});
