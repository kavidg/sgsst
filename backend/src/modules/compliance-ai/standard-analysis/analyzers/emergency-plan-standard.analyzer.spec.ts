import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import 'reflect-metadata';
import { EmergencyPlanStandardAnalyzer } from './emergency-plan-standard.analyzer';
import { StandardAnalysisService } from '../standard-analysis.service';
import { ProceduresDocStandardAnalyzer } from './procedures-doc-standard.analyzer';
import { ComplianceEngineService } from '../../../compliance-engine/compliance-engine.service';
import { EmergencyPlanProvider } from '../../../compliance-engine/providers/emergency-plan-compliance.provider';
import {
  EMERGENCY_PLAN_FORMULA,
  EMERGENCY_PLAN_SCORE_WEIGHTS,
  EMERGENCY_PLAN_STANDARD_CODE,
} from '../../../compliance-engine/providers/emergency-plan-scoring';
import {
  CANONICAL_EMERGENCY_ITEM_CODE,
  EMERGENCY_LEGACY_ITEM_CODES,
  isSstEmergenciesItemCode,
} from '../../../phva-advanced/schemas/phva-advanced-emergencies.schema';
import type { StandardAnalysisContext } from '../../dto/standard-analysis.dto';
import { CATALOG_60 } from '../../../standard-catalog/constants/catalog-60';
import { SCORING_EXCLUDED_MODULES, SCORING_INELIGIBLE_MODULES, getPhaseWeights } from '../../../compliance-engine/utils/compliance-weights';

/**
 * Tests del EmergencyPlanStandardAnalyzer — capa de IA del estándar 5.1.1.
 *
 * Contrato: analyzer NARRATIVO (StandardAnalyzer). El porcentaje/level proviene
 * EXCLUSIVAMENTE del ComplianceEngine (EmergencyPlanProvider, fórmula
 * dimensions:v1); el analyzer interpreta la metadata oficial transportada en
 * ModuleCompliance (dimensiones/counters/details) y los findings oficiales.
 * Aquí NO se prueba el porcentaje oficial (eso vive en
 * emergency-plan-compliance.provider.spec.ts / emergency-plan-scoring.ts).
 */

const COMPANY_A = '507f1f77bcf86cd799439011';
const COMPANY_B = '507f1f77bcf86cd799439022';
const NOW = '2026-09-22T12:00:00.000Z';

// ── Fábricas del módulo emergency-plan (metadata oficial del provider) ──

interface ModuleShape {
  module: string;
  compliance: number;
  level: string;
  lastUpdated: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

function moduleShape(overrides: Partial<ModuleShape> = {}): ModuleShape {
  return {
    module: 'emergency-plan',
    compliance: 72,
    level: 'MEDIUM',
    lastUpdated: NOW,
    status: 'TARGET_NOT_MET',
    metadata: { formula: 'dimensions:v1', standardCode: '5.1.1' },
    ...overrides,
  };
}

function finding(id: string, title = id, priority = 'MEDIUM'): StandardAnalysisContext['findings'][number] {  return {
    id, module: 'emergency-plan', title, description: title,
    priority, status: 'OPEN', responsible: '', dueDate: '', createdAt: NOW,
  };
}

type AnalyzerOverrides = {
  compliance?: number;
  metadata?: Record<string, unknown>;
  findings?: StandardAnalysisContext['findings'];
};

function buildContext(overrides: AnalyzerOverrides = {}): StandardAnalysisContext {
  return {
    companyId: COMPANY_A,
    moduleCompliance: {
      module: 'emergency-plan',
      compliance: overrides.compliance ?? 72,
      level: 'MEDIUM',
      lastUpdated: NOW,
      status: 'TARGET_NOT_MET',
      metadata: overrides.metadata ?? {},
    } as StandardAnalysisContext['moduleCompliance'],
    findings: overrides.findings ?? [],
    overview: {
      overallCompliance: 60,
      phaseCompliance: { plan: 60, do: 60, check: 50, act: 40 },
      moduleCompliance: [],
    },
  };
}

/** Dimensiones "todo bien" (ratio 1) para escenarios que aíslan una sola brecha. */
const perfectDimensions = {
  plan: { ratio: 1, numerator: 4, denominator: 4, namePresent: true, validityValid: true, approved: true, documentOk: true },
  threats: { ratio: 1, numerator: 2, denominator: 2, activeThreats: 2, completeThreats: 2 },
  resources: { ratio: 1, numerator: 3, denominator: 3, activeResources: 3, operativeResources: 3, partialResources: 0, inoperativeResources: 0 },
  evacuation: { ratio: 1, numerator: 2, denominator: 2, operativeRoutes: 1, operativeMeetingPoints: 1 },
  contacts: { ratio: 1, numerator: 6, denominator: 6, missingRequiredGroups: [] as string[] },
  drills: { ratio: 1, numerator: 1, denominator: 1, executed12m: 1, avgCoverage: 1 },
  socialization: { ratio: 1, numerator: 3, denominator: 3 },
};

const perfectCounters = {
  activeThreats: 2, completeThreats: 2,
  activeResources: 3, operativeResources: 3, partialResources: 0, inoperativeResources: 0,
  operativeRoutes: 1, operativeMeetingPoints: 1,
  requiredContacts: 6, validRequiredContacts: 6, complementaryContacts: 1,
  executedDrills12m: 1, expectedParticipants: 40, participants: 40,
  drillsLinkedToAnnualPlan: 1, socializationCoverage: 95, socializationEvidence: 1,
  documentPresent: true, planApproved: true, planCurrent: true,
  brigadesPresent: false,
};

function buildService(overview: Record<string, unknown>) {
  const complianceEngineService = {
    getOverview: async () => overview,
  } as unknown as import('../../../compliance-engine/compliance-engine.service').ComplianceEngineService;
  return new StandardAnalysisService(complianceEngineService);
}

function buildOverviewWith(module: ModuleShape, findings: StandardAnalysisContext['findings'] = []) {
  return {
    overallCompliance: 60,
    phaseCompliance: { plan: 60, do: 60, check: 50, act: 40 },
    moduleCompliance: [module],
    findings,
    recommendations: [],
    alerts: [],
    prediction: null,
    trend: null,
    executiveSummary: 'Test summary',
    lastUpdated: NOW,
  };
}

/** Ejecuta analyze() de punta a punta con el analyzer registrado. */
async function analyzeWith(overrides: AnalyzerOverrides = {}) {
  const service = buildService(buildOverviewWith(
    moduleShape({ compliance: overrides.compliance ?? 72, metadata: overrides.metadata ?? {} }),
    overrides.findings ?? [],
  ));
  return service.analyze('5.1.1', COMPANY_A);
}

// ═══════════════════════════════════════════════════════════════════════════
// Analyzer (unidad)
// ═══════════════════════════════════════════════════════════════════════════

describe('EmergencyPlanStandardAnalyzer — contrato y unidad', () => {
  const analyzer = new EmergencyPlanStandardAnalyzer();

  it('soporta 5.1.1 y declara el módulo emergency-plan del provider oficial', () => {
    assert.equal(analyzer.supports('5.1.1'), true);
    assert.equal(analyzer.supports('5.1.2'), false);
    assert.equal(analyzer.supports('1.1.10'), false);
    assert.equal(analyzer.getModule(), 'emergency-plan');
  });

  it('plan completo: sin brechas y sinbrigada en la narrativa', () => {
    const ctx = buildContext({ metadata: { dimensions: perfectDimensions, counters: perfectCounters, details: {} } });
    const result = analyzer.analyze(ctx);
    assert.equal(result.keyIssues.length, 0);
    assert.ok(result.summary.includes('72'));
    assert.ok(!result.summary.includes('brigada'));
    const metrics = analyzer.getMetrics(ctx);
    assert.equal(metrics.documentPresent, 1);
    assert.equal(metrics.planApproved, 1);
    assert.equal(metrics.validRequiredContacts, 6);
  });

  it('NO_DATA (finding oficial): sin crash y narrativa de diligenciamiento', () => {
    const result = analyzer.analyze(buildContext({
      compliance: 0,
      findings: [finding('emergency-plan-no-data', 'Sin registro de emergencias', 'HIGH')],
      metadata: { noData: true },
    }));
    assert.equal(result.keyIssues.length, 0);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.summary.includes('No existe registro'));
  });

  it('NO_DATA con registro vacío (emptyRecord): mensaje específico', () => {
    const result = analyzer.analyze(buildContext({
      compliance: 0,
      findings: [finding('emergency-plan-no-data', 'Registro de emergencias vacío', 'HIGH')],
      metadata: { noData: true, emptyRecord: true },
    }));
    assert.ok(result.summary.includes('vacío'));
  });

  it('metadata ausente (respuesta parcial): degrada sin crash ni NaN', () => {
    const result = analyzer.analyze(buildContext({}));
    assert.equal(typeof result.summary, 'string');
    assert.ok(result.keyIssues.length > 0); // degrada a análisis genérico por findings
    const metrics = analyzer.getMetrics(buildContext({}));
    for (const value of Object.values(metrics)) {
      assert.equal(typeof value, 'number');
      assert.ok(Number.isFinite(value));
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Interpretación por dimensión (metadata oficial del provider)
// ═══════════════════════════════════════════════════════════════════════════

describe('EmergencyPlanStandardAnalyzer — plan', () => {
  const analyzer = new EmergencyPlanStandardAnalyzer();

  it('plan no aprobado → recomendación de aprobación', () => {
    const dims = { ...perfectDimensions, plan: { ...perfectDimensions.plan, ratio: 0.75, numerator: 3, approved: false } };
    const result = analyzer.analyze(buildContext({
      metadata: { dimensions: dims, counters: { ...perfectCounters, planApproved: false }, details: {} },
    }));
    const issue = result.keyIssues.find((i) => i.id === 'emergency-plan-not-approved');
    assert.ok(issue);
    assert.equal(issue.priority, 'HIGH');
    assert.ok(issue.recommendation.includes('aprobación'));
  });

  it('plan vencido → recomendación de actualización de vigencia', () => {
    const dims = { ...perfectDimensions, plan: { ...perfectDimensions.plan, ratio: 0.75, numerator: 3, validityValid: false } };
    const result = analyzer.analyze(buildContext({
      metadata: { dimensions: dims, counters: { ...perfectCounters, planCurrent: false }, details: {} },
    }));
    const issue = result.keyIssues.find((i) => i.id === 'emergency-plan-expired');
    assert.ok(issue);
    assert.ok(issue.recommendation.toLowerCase().includes('vigencia'));
  });

  it('plan sin documento oficial → recomendación de vínculo EMERGENCY_PLAN', () => {
    const dims = { ...perfectDimensions, plan: { ...perfectDimensions.plan, ratio: 0.75, numerator: 3, documentOk: false } };
    const result = analyzer.analyze(buildContext({
      metadata: { dimensions: dims, counters: { ...perfectCounters, documentPresent: false }, details: {} },
    }));
    const issue = result.keyIssues.find((i) => i.id === 'emergency-plan-document-missing');
    assert.ok(issue);
    assert.ok(issue.recommendation.includes('EMERGENCY_PLAN'));
  });
});

describe('EmergencyPlanStandardAnalyzer — amenazas', () => {
  const analyzer = new EmergencyPlanStandardAnalyzer();

  it('amenazas completas → sin issues de amenazas', () => {
    const result = analyzer.analyze(buildContext({ metadata: { dimensions: perfectDimensions, counters: perfectCounters, details: {} } }));
    assert.equal(result.keyIssues.find((i) => i.id === 'emergency-threat-matrix-incomplete'), undefined);
  });

  it('amenazas incompletas → issue con campos faltantes', () => {
    const dims = { ...perfectDimensions, threats: { ratio: 0.5, numerator: 1, denominator: 2, activeThreats: 2, completeThreats: 1 } };
    const result = analyzer.analyze(buildContext({
      metadata: { dimensions: dims, counters: { ...perfectCounters, completeThreats: 1 }, details: { threats: { missingFields: ['probability', 'impact'] } } },
    }));
    const issue = result.keyIssues.find((i) => i.id === 'emergency-threat-matrix-incomplete');
    assert.ok(issue);
    assert.ok(issue.impact.includes('probability'));
  });

  it('matriz vacía (ratio null) → issue HIGH de matriz vacía', () => {
    const dims = { ...perfectDimensions, threats: { ratio: null, numerator: null, denominator: null, activeThreats: 0, completeThreats: 0 } };
    const result = analyzer.analyze(buildContext({
      metadata: { dimensions: dims, counters: { ...perfectCounters, activeThreats: 0, completeThreats: 0 }, details: {} },
    }));
    const issue = result.keyIssues.find((i) => i.id === 'emergency-threat-matrix-incomplete');
    assert.ok(issue);
    assert.equal(issue.priority, 'HIGH');
  });
});

describe('EmergencyPlanStandardAnalyzer — recursos y evacuación', () => {
  const analyzer = new EmergencyPlanStandardAnalyzer();

  it('recursos operativos/parciales/inoperativos → métricas y recomendación de reposición', () => {
    const dims = { ...perfectDimensions, resources: { ratio: 0.75, numerator: 2.5, denominator: 4, activeResources: 4, operativeResources: 2, partialResources: 1, inoperativeResources: 1 } };
    const ctx = buildContext({ metadata: { dimensions: dims, counters: { ...perfectCounters, operativeResources: 2, partialResources: 1, inoperativeResources: 1 }, details: {} } });
    const issue = analyzer.analyze(ctx).keyIssues.find((i) => i.id === 'emergency-resources-incomplete');
    assert.ok(issue);
    assert.ok(issue.recommendation.includes('Repon'));
    const metrics = analyzer.getMetrics(ctx);
    assert.equal(metrics.operativeResources, 2);
    assert.equal(metrics.partialResources, 1);
    assert.equal(metrics.inoperativeResources, 1);
  });

  it('ruta/punto incompletos → issue que identifica lo faltante', () => {
    const dims = { ...perfectDimensions, evacuation: { ratio: 0.5, numerator: 1, denominator: 2, operativeRoutes: 1, operativeMeetingPoints: 0 } };
    const result = analyzer.analyze(buildContext({
      metadata: { dimensions: dims, counters: { ...perfectCounters, operativeMeetingPoints: 0 }, details: {} },
    }));
    const issue = result.keyIssues.find((i) => i.id === 'emergency-evacuation-incomplete');
    assert.ok(issue);
    assert.ok(issue.recommendation.includes('punto de encuentro'));
  });
});

describe('EmergencyPlanStandardAnalyzer — contactos', () => {
  const analyzer = new EmergencyPlanStandardAnalyzer();

  const run = (missing: string[]) => {
    const valid = 6 - missing.length;
    const dims = { ...perfectDimensions, contacts: { ratio: valid / 6, numerator: valid, denominator: 6, missingRequiredGroups: missing } };
    return analyzer.analyze(buildContext({
      metadata: { dimensions: dims, counters: { ...perfectCounters, validRequiredContacts: valid }, details: {} },
    }));
  };

  it('cadena completa → sin issues de contactos', () => {
    assert.equal(run([]).keyIssues.find((i) => i.id === 'emergency-contacts-incomplete'), undefined);
  });

  for (const missing of [['ARL'], ['BOMBEROS'], ['AMBULANCIA'], ['POLICIA'], ['HOSPITAL'], ['INTERNO']]) {
    it(`faltante ${missing[0]} → issue que nombra la categoría`, () => {
      const issue = run(missing).keyIssues.find((i) => i.id === 'emergency-contacts-incomplete');
      assert.ok(issue, `esperaba issue por ${missing[0]}`);
      const label = ({ ARL: 'ARL', BOMBEROS: 'Bomberos', AMBULANCIA: 'Ambulancia', POLICIA: 'Policía', HOSPITAL: 'Hospital o IPS', INTERNO: 'Contacto interno' } as Record<string, string>)[missing[0]] ?? missing[0];
      assert.ok(issue.recommendation.includes(label) || issue.impact.includes(label));
    });
  }
});

describe('EmergencyPlanStandardAnalyzer — simulacros y socialización', () => {
  const analyzer = new EmergencyPlanStandardAnalyzer();

  it('simulacro vigente (ratio 1) → sin issues; trazabilidad AWP en métricas', () => {
    const ctx = buildContext({ metadata: { dimensions: perfectDimensions, counters: perfectCounters, details: { drills: { evaluable: 1, avgCoverage: 1 } } } });
    const result = analyzer.analyze(ctx);
    assert.equal(result.keyIssues.find((i) => i.id === 'emergency-drill-missing'), undefined);
    const metrics = analyzer.getMetrics(ctx);
    assert.equal(metrics.executedDrills12m, 1);
    assert.equal(metrics.drillsLinkedToAnnualPlan, 1);
  });

  it('sin simulacros ejecutados en 12 meses → issue HIGH', () => {
    const dims = { ...perfectDimensions, drills: { ratio: null, numerator: null, denominator: null, executed12m: 0, avgCoverage: null } };
    const result = analyzer.analyze(buildContext({
      metadata: { dimensions: dims, counters: { ...perfectCounters, executedDrills12m: 0 }, details: {} },
    }));
    const issue = result.keyIssues.find((i) => i.id === 'emergency-drill-missing');
    assert.ok(issue);
    assert.equal(issue.priority, 'HIGH');
  });

  it('cobertura de participantes < 1 → issue MEDIUM de cobertura', () => {
    const dims = { ...perfectDimensions, drills: { ratio: 0.5, numerator: 0.5, denominator: 1, executed12m: 1, avgCoverage: 0.5 } };
    const result = analyzer.analyze(buildContext({
      metadata: { dimensions: dims, counters: { ...perfectCounters, expectedParticipants: 40, participants: 20 }, details: { drills: { evaluable: 1, avgCoverage: 0.5 } } },
    }));
    const issue = result.keyIssues.find((i) => i.id === 'emergency-drill-missing');
    assert.ok(issue);
    assert.ok(issue.impact.includes('40') && issue.impact.includes('20'));
  });

  it('socialización vigente → sin issues; socialización incompleta → issue con dato pendiente', () => {
    const ok = analyzer.analyze(buildContext({ metadata: { dimensions: perfectDimensions, counters: perfectCounters, details: { socialization: { dateValid: true, coverageOk: true, evidenceOk: true } } } }));
    assert.equal(ok.keyIssues.find((i) => i.id === 'emergency-socialization-missing'), undefined);

    const dims = { ...perfectDimensions, socialization: { ratio: 2 / 3, numerator: 2, denominator: 3 } };
    const issue = analyzer.analyze(buildContext({
      metadata: { dimensions: dims, counters: { ...perfectCounters, socializationCoverage: 60 }, details: { socialization: { dateValid: true, coverageOk: false, evidenceOk: true } } },
    })).keyIssues.find((i) => i.id === 'emergency-socialization-missing');
    assert.ok(issue);
    assert.ok(issue.impact.includes('cobertura'));
  });

  it('socialización no registrada (ratio null) → issue específico', () => {
    const dims = { ...perfectDimensions, socialization: { ratio: null, numerator: null, denominator: null } };
    const issue = analyzer.analyze(buildContext({
      metadata: { dimensions: dims, counters: { ...perfectCounters, socializationCoverage: 0, socializationEvidence: 0 }, details: {} },
    })).keyIssues.find((i) => i.id === 'emergency-socialization-missing');
    assert.ok(issue);
    assert.ok(issue.title.includes('no registrada'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Frontera 5.1.2 y recomendaciones accionables
// ═══════════════════════════════════════════════════════════════════════════

describe('EmergencyPlanStandardAnalyzer — frontera 5.1.2', () => {
  const analyzer = new EmergencyPlanStandardAnalyzer();

  it('brigada con 100% integrantes/capacitación NO genera indicador puntuable de 5.1.1', () => {
    const ctx = buildContext({
      metadata: {
        dimensions: perfectDimensions,
        counters: { ...perfectCounters, brigadesPresent: true, drillsLinkedToAnnualPlan: 0 },
        details: { drills: { evaluable: 1, avgCoverage: 1 } },
      },
    });
    const result = analyzer.analyze(ctx);
    assert.ok(result.summary.includes('5.1.2'), 'la brigada se menciona solo como contexto de 5.1.2');
    const brigadeIssue = result.keyIssues.find((i) => i.title.toLowerCase().includes('brigada') && !i.title.includes('5.1.2'));
    assert.equal(brigadeIssue, undefined, 'ninguna key issue puntúa brigada en 5.1.1');
  });
});

describe('EmergencyPlanStandardAnalyzer — recomendaciones accionables', () => {
  const analyzer = new EmergencyPlanStandardAnalyzer();

  it('recomendaciones específicas y priorizadas (HIGH primero, máx 5)', () => {
    const dims = {
      plan: { ratio: 0.5, numerator: 2, denominator: 4, namePresent: true, validityValid: false, approved: false, documentOk: false },
      threats: { ratio: 0, numerator: 0, denominator: 1, activeThreats: 1, completeThreats: 0 },
      resources: perfectDimensions.resources,
      evacuation: perfectDimensions.evacuation,
      contacts: perfectDimensions.contacts,
      drills: { ratio: null, numerator: null, denominator: null, executed12m: 0, avgCoverage: null },
      socialization: perfectDimensions.socialization,
    };
    const result = analyzer.analyze(buildContext({
      compliance: 25,
      metadata: { dimensions: dims, counters: { ...perfectCounters, planApproved: false, planCurrent: false, documentPresent: false }, details: {} },
    }));
    assert.ok(result.keyIssues.length <= 5);
    assert.equal(result.keyIssues[0].priority, 'HIGH');
    const first = result.keyIssues[0].recommendation;
    assert.ok(first.length > 20, 'la recomendación es accionable, no genérica');
    assert.ok(!/mejore la gestión de emergencias/i.test(first), 'sin lenguaje genérico');
    assert.ok(result.quickWins.length > 0 && result.nextSteps.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Registro, decoupling de procedures-doc y protecciones de regresión
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-5.1.1-REG — registro y decoupling del analyzer procedures-doc', () => {
  it('STD-AI-REG-01: el análisis de 5.1.1 usa el módulo emergency-plan (no procedures-doc)', async () => {
    const response = await analyzeWith({
      metadata: { dimensions: perfectDimensions, counters: perfectCounters, details: {} },
      findings: [],
    });
    assert.equal(response.module, 'emergency-plan');
    assert.equal(response.standardTitle, 'Plan de prevención, preparación y respuesta ante emergencias');
    assert.equal(response.compliancePercentage, 72);
    assert.equal(response.complianceStatus, 'MEDIUM');
  });

  it('STD-AI-REG-02: NO_DATA de 5.1.1 se detecta con el finding oficial del engine', async () => {
    const response = await analyzeWith({
      compliance: 0,
      metadata: { noData: true },
      findings: [finding('emergency-plan-no-data', 'Sin registro de emergencias', 'HIGH')],
    });
    assert.equal(response.dataAvailable, false);
    assert.ok(response.analysis.summary.includes('No existe registro'));
  });

  it('STD-AI-REG-03: procedures-doc queda SIN registro (su único uso era 5.1.1)', () => {
    const service = buildService(buildOverviewWith(moduleShape()));
    const registry = (service as unknown as { analyzers: Map<string, unknown> }).analyzers;
    assert.equal(registry.has('5.1.1'), true, '5.1.1 tiene analyzer registrado');
    const analyzerFor511 = registry.get('5.1.1') as object;
    assert.equal(analyzerFor511 instanceof EmergencyPlanStandardAnalyzer, true, '5.1.1 usa EmergencyPlanStandardAnalyzer');
    assert.equal(analyzerFor511 instanceof ProceduresDocStandardAnalyzer, false, 'procedures-doc ya no analiza 5.1.1');
    const claimedByProceduresDoc = [...registry.entries()].filter(([, a]) => a instanceof ProceduresDocStandardAnalyzer);
    assert.equal(claimedByProceduresDoc.length, 0, 'ningún estándar usa hoy el analyzer procedures-doc');
  });

  it('STD-AI-REG-04: el analyzer procedures-doc conserva su comportamiento original (disponible para reasignación)', () => {
    const analyzer = new ProceduresDocStandardAnalyzer();
    assert.equal(analyzer.supports('5.1.1'), true, 'la clase conserva su código histórico');
    assert.equal(analyzer.getModule(), 'procedures-doc');
    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'procedures-doc', compliance: 40, level: 'LOW', lastUpdated: NOW } as StandardAnalysisContext['moduleCompliance'],
      findings: [],
      overview: { overallCompliance: 40, phaseCompliance: { plan: 40, do: 40, check: 40, act: 40 }, moduleCompliance: [] },
    });
    assert.ok(typeof result.summary === 'string' && result.summary.length > 0);
  });
});

describe('AI-5.1.1-REG — protecciones de regresión del scoring 5.1.1', () => {
  it('REG-05: EmergencyPlanProvider sigue registrado como provider del engine (runtime)', () => {
    const engineParamTypes: unknown[] = Reflect.getMetadata(
      'design:paramtypes',
      ComplianceEngineService,
    ) ?? [];
    assert.ok(
      engineParamTypes.includes(EmergencyPlanProvider),
      'EmergencyPlanProvider sigue en el constructor del engine',
    );
  });

  it('REG-06: EmergencyPlanProvider sigue leyendo SstEmergencias vía PhvaAdvancedService legacy-aware', () => {
    // Fuente compilada de la clase en runtime (sin lecturas frágiles de rutas):
    // debe usar la resolución legacy-aware y NUNCA consultar itemCode directo.
    const compiledSource = EmergencyPlanProvider.toString();
    assert.ok(/phvaAdvancedService\.findEmergenciesByCompany/.test(compiledSource), 'usa la resolución legacy-aware del PhvaAdvancedService');
    assert.doesNotMatch(
      compiledSource,
      /itemCode\s*:\s*['"](?:5\.1\.1|1\.1\.10)['"]/,
      'no consulta itemCode directo',
    );
  });

  it('REG-07: el scoring oficial 5.1.1 no cambió (fórmula y pesos 7 dimensiones, runtime)', () => {
    assert.equal(EMERGENCY_PLAN_STANDARD_CODE, '5.1.1');
    assert.equal(EMERGENCY_PLAN_FORMULA, 'dimensions:v1');
    assert.deepEqual(EMERGENCY_PLAN_SCORE_WEIGHTS, {
      plan: 25, threats: 20, resources: 10, evacuation: 10,
      contacts: 10, drills: 15, socialization: 10,
    });
  });

  it('REG-08: PHASE_WEIGHTS no cambió', () => {
    const weights = getPhaseWeights();
    assert.deepEqual(weights, { plan: 0.25, do: 0.6, check: 0.05, act: 0.1 });
  });

  it('REG-09: 5.1.2 tiene provider propio de scoring (emergency-brigade) y 5.1.1 sigue con emergency-plan', () => {
    // Actualizado en la etapa 5.1.2: la brigada ya tiene provider oficial.
    const catalogBrigade = CATALOG_60.find((item) => item.code === '5.1.2');
    assert.ok(catalogBrigade, '5.1.2 existe en el catálogo');
    assert.equal(catalogBrigade.validationProvider, 'emergency-brigade.provider');
    const catalogPlan = CATALOG_60.find((item) => item.code === '5.1.1');
    assert.equal(catalogPlan?.validationProvider, 'emergency-plan.provider', '5.1.1 intacto');
  });

  it('REG-10: emergencies y emergency-management mantienen sus exclusiones actuales', () => {
    assert.equal(SCORING_EXCLUDED_MODULES.has('emergencies'), true);
    assert.equal(SCORING_EXCLUDED_MODULES.has('emergency-management'), true);
    assert.equal(SCORING_INELIGIBLE_MODULES.has('emergency-plan'), false, 'emergency-plan es elegible');
  });

  it('REG-11: 1.1.10 continúa físicamente sin migrar (identidad legacy intacta en runtime)', () => {
    // La migración física 1.1.10 → 5.1.1 es una etapa futura dedicada: aquí se
    // protege el CONTRATO de identidad canónica/legacy que la hace innecesaria.
    assert.equal(CANONICAL_EMERGENCY_ITEM_CODE, '5.1.1');
    assert.ok((EMERGENCY_LEGACY_ITEM_CODES as readonly string[]).includes('1.1.10'));
    assert.equal(isSstEmergenciesItemCode('5.1.1'), true);
    assert.equal(isSstEmergenciesItemCode('1.1.10'), true, 'los registros legacy siguen siendo legibles');
  });

  it('REG-12: tenant isolation — cada empresa consume su propio overview del engine', async () => {
    const service = buildServiceWithTwoCompanies();
    const responseA = await service.analyze('5.1.1', COMPANY_A);
    const responseB = await service.analyze('5.1.1', COMPANY_B);
    assert.equal(responseA.module, 'emergency-plan');
    assert.equal(responseB.module, 'emergency-plan');
    assert.equal(responseA.compliancePercentage, 80);
    assert.equal(responseB.compliancePercentage, 20, 'la empresa B no consume los datos de la empresa A');
  });
});

/** Servicio con overviews distintos por empresa (tenant isolation de punta a punta). */
function buildServiceWithTwoCompanies() {
  const complianceEngineService = {
    getOverview: async (companyId: string) =>
      buildOverviewWith(moduleShape({ compliance: companyId === COMPANY_A ? 80 : 20 })),
  } as unknown as import('../../../compliance-engine/compliance-engine.service').ComplianceEngineService;
  return new StandardAnalysisService(complianceEngineService);
}
