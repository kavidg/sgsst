import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import 'reflect-metadata';
import { EmergencyBrigadeStandardAnalyzer } from './emergency-brigade-standard.analyzer';
import { StandardAnalysisService } from '../standard-analysis.service';
import { RecordsDocStandardAnalyzer } from './records-doc-standard.analyzer';
import { EmergencyPlanStandardAnalyzer } from './emergency-plan-standard.analyzer';
import {
  EMERGENCY_BRIGADE_FORMULA,
  EMERGENCY_BRIGADE_MODULE,
  EMERGENCY_BRIGADE_SCORE_WEIGHTS,
  EMERGENCY_BRIGADE_STANDARD_CODE,
} from '../../../compliance-engine/providers/emergency-brigade-scoring';
import type { StandardAnalysisContext } from '../../dto/standard-analysis.dto';
import { CATALOG_60 } from '../../../standard-catalog/constants/catalog-60';
import {
  SCORING_EXCLUDED_MODULES,
  SCORING_INELIGIBLE_MODULES,
  getPhaseWeights,
} from '../../../compliance-engine/utils/compliance-weights';
import { ComplianceEngineService } from '../../../compliance-engine/compliance-engine.service';
import { EmergencyBrigadeProvider } from '../../../compliance-engine/providers/emergency-brigade-compliance.provider';

/**
 * Tests del EmergencyBrigadeStandardAnalyzer — capa de IA del estándar 5.1.2.
 *
 * Contrato: analyzer NARRATIVO (StandardAnalyzer). El porcentaje/level proviene
 * EXCLUSIVAMENTE del ComplianceEngine (EmergencyBrigadeProvider, fórmula
 * dimensions:v1); el analyzer interpreta la metadata oficial transportada en
 * ModuleCompliance (dimensiones/counters/details) y los findings oficiales.
 * Aquí NO se prueba el porcentaje oficial (eso vive en
 * emergency-brigade-compliance.provider.spec.ts / emergency-brigade-scoring.ts).
 */

const COMPANY_A = '507f1f77bcf86cd799439011';
const COMPANY_B = '507f1f77bcf86cd799439022';
const NOW = '2026-09-22T12:00:00.000Z';

// ── Fábricas del módulo emergency-brigade (metadata oficial del provider) ──

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
    module: 'emergency-brigade',
    compliance: 68,
    level: 'MEDIUM',
    lastUpdated: NOW,
    status: 'TARGET_NOT_MET',
    metadata: { formula: 'dimensions:v1', standardCode: '5.1.2' },
    ...overrides,
  };
}

function finding(id: string, title = id, priority = 'MEDIUM'): StandardAnalysisContext['findings'][number] {
  return {
    id, module: 'emergency-brigade', title, description: title,
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
      module: 'emergency-brigade',
      compliance: overrides.compliance ?? 68,
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
  existence: { ratio: 1, numerator: 1, denominator: 1, activeBrigades: 1, namedBrigades: 1, allBrigadesInactive: false },
  composition: { ratio: 1, numerator: 5, denominator: 5, activeMembers: 5, validMembers: 5, membersWithoutEmployee: 0, crossTenantMembers: 0, membersWithInvalidFunction: 0, otherWithoutObservations: 0, duplicateEmployees: 0 },
  functionalCoverage: { ratio: 1, numerator: 4, denominator: 4, coreCoverage: 1, leaderCoverage: 1, leaderPresent: true, coreFunctionsWithTitular: ['EVACUATION', 'FIRST_AID', 'FIREFIGHTING'], missingCoreFunctions: [], communicationMembers: 1, logisticsMembers: 1 },
  training: { ratio: 1, numerator: 8, denominator: 8, trainedRatio: 1, evidenceRatio: 1, activeTitularMembers: 4, trainedMembers: 4, trainedWithEvidence: 4, futureTrainingDates: 0, trainingTypeDocumented: 4 },
  alternates: { ratio: 1, numerator: 3, denominator: 3, alternates: 3, coreFunctionsWithAlternate: ['EVACUATION', 'FIRST_AID', 'FIREFIGHTING'], evacuationAlternates: 1, firstAidAlternates: 1, firefightingAlternates: 1 },
  traceability: { ratio: 1, numerator: 5, denominator: 5, missingSnapshot: 0, otherWithoutObservations: 0, duplicateEmployees: 0 },
  operation: { ratio: 1, numerator: 1, denominator: 1, latestMeetingDate: '2026-08-01T00:00:00.000Z', futureMeetingDates: 0, meetingFrequency: ['MENSUAL'] },
};

const perfectCounters = {
  brigadesPresent: 1, activeBrigades: 1, brigadesNamed: 1,
  activeMembers: 5, validMembers: 5, duplicateEmployees: 0,
  leaders: 1, evacuationMembers: 1, firstAidMembers: 1, firefightingMembers: 1,
  communicationMembers: 1, logisticsMembers: 1, otherMembers: 0,
  alternates: 3, trainedMembers: 4, trainedWithEvidence: 4, membersWithoutTraining: 0,
  membersWithFutureTrainingDate: 0, membersWithoutEmployee: 0, membersWithInvalidFunction: 0,
  coreFunctionsWithAlternate: 3, evacuationAlternates: 1, firstAidAlternates: 1, firefightingAlternates: 1,
  traceableMembers: 5, lastMeetingDatePresent: 1, lastMeetingDateFuture: 0,
};

function buildService(overview: Record<string, unknown>) {
  const complianceEngineService = {
    getOverview: async () => overview,
  } as unknown as ComplianceEngineService;
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
    moduleShape({ compliance: overrides.compliance ?? 68, metadata: overrides.metadata ?? {} }),
    overrides.findings ?? [],
  ));
  return service.analyze('5.1.2', COMPANY_A);
}

// ═══════════════════════════════════════════════════════════════════════════
// Analyzer (unidad): contrato e identidad
// ═══════════════════════════════════════════════════════════════════════════

describe('EmergencyBrigadeStandardAnalyzer — contrato e identidad', () => {
  const analyzer = new EmergencyBrigadeStandardAnalyzer();

  it('soporta 5.1.2 y rechaza otros códigos', () => {
    assert.equal(analyzer.supports('5.1.2'), true);
    assert.equal(analyzer.supports('5.1.1'), false);
    assert.equal(analyzer.supports('1.1.10'), false);
    assert.equal(analyzer.supports('4.4.1'), false);
    assert.equal(analyzer.supports(''), false);
  });

  it('declara el módulo oficial emergency-brigade', () => {
    assert.equal(analyzer.getModule(), 'emergency-brigade');
  });

  it('no usa módulos wrong-mapping ni excluidos como fuente', () => {
    const module = analyzer.getModule();
    for (const forbidden of ['records-doc', 'procedures-doc', 'emergency-plan', 'emergencies', 'emergency-management']) {
      assert.notEqual(module, forbidden);
    }
  });

  it('la identidad oficial del scoring 5.1.2 no cambió (runtime)', () => {
    assert.equal(EMERGENCY_BRIGADE_STANDARD_CODE, '5.1.2');
    assert.equal(EMERGENCY_BRIGADE_MODULE, 'emergency-brigade');
    assert.equal(EMERGENCY_BRIGADE_FORMULA, 'dimensions:v1');
    assert.deepEqual(EMERGENCY_BRIGADE_SCORE_WEIGHTS, {
      existence: 10, composition: 20, functionalCoverage: 25,
      training: 20, alternates: 15, traceability: 5, operation: 5,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Estados globales: favorable / bajo / NO_DATA
// ═══════════════════════════════════════════════════════════════════════════

describe('EmergencyBrigadeStandardAnalyzer — estados de cumplimiento', () => {
  const analyzer = new EmergencyBrigadeStandardAnalyzer();

  it('score alto (compliance 95): narrativa favorable sin issues inventados', () => {
    const result = analyzer.analyze(buildContext({
      compliance: 95,
      metadata: { dimensions: perfectDimensions, counters: perfectCounters, details: {} },
    }));
    assert.ok(result.summary.includes('95%'));
    assert.equal(result.keyIssues.length, 0);
    assert.equal(result.quickWins.length, 0);
    assert.equal(result.nextSteps.length, 0);
    const metrics = analyzer.getMetrics(buildContext({
      metadata: { dimensions: perfectDimensions, counters: perfectCounters, details: {} },
    }));
    assert.equal(metrics.leaders, 1);
    assert.equal(metrics.activeMembers, 5);
  });

  it('score bajo (compliance 20): narrativa de atención prioritaria', () => {
    const result = analyzer.analyze(buildContext({
      compliance: 20,
      metadata: { dimensions: perfectDimensions, counters: perfectCounters, details: {} },
    }));
    assert.ok(result.summary.includes('20%'));
    assert.ok(result.summary.includes('atención prioritaria'));
  });

  it('NO_DATA (finding oficial no-data): sin key issues y narrativa de creación', () => {
    const result = analyzer.analyze(buildContext({
      compliance: 0,
      findings: [finding('emergency-brigade-no-data', 'Sin brigada registrada', 'HIGH')],
      metadata: { noData: true },
    }));
    assert.ok(result.summary.includes('No existe una brigada'));
    assert.ok(!result.summary.includes('incumple'), 'no afirma incumplimiento por ausencia de datos');
    assert.equal(result.keyIssues.length, 0);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.nextSteps.length >= 3);
    assert.ok(result.nextSteps.some((s) => s.toLowerCase().includes('funciones')));
  });

  it('NO_DATA variante no-active-brigade: narrativa específica de activación', () => {
    const result = analyzer.analyze(buildContext({
      compliance: 0,
      findings: [finding('emergency-brigade-no-active-brigade', 'Brigadas existentes pero ninguna activa', 'HIGH')],
      metadata: { noData: true, allBrigadesInactive: true },
    }));
    assert.ok(result.summary.includes('ninguna está activa'));
    assert.ok(result.quickWins[0].toLowerCase().includes('active'));
  });

  it('NO_DATA por metadata.noData=true aunque falte el finding (defensa en profundidad)', () => {
    const result = analyzer.analyze(buildContext({
      compliance: 0,
      metadata: { noData: true },
    }));
    assert.ok(result.summary.includes('No existe una brigada'));
    assert.equal(result.keyIssues.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Interpretación de cada finding oficial (metadata del provider)
// ═══════════════════════════════════════════════════════════════════════════

describe('EmergencyBrigadeStandardAnalyzer — no-members e integridad', () => {
  const analyzer = new EmergencyBrigadeStandardAnalyzer();

  it('brigada activa sin integrantes (activeMembers=0) → issue HIGH no-members', () => {
    const dims = {
      ...perfectDimensions,
      composition: { ...perfectDimensions.composition, ratio: 0, numerator: null, denominator: null },
    };
    const result = analyzer.analyze(buildContext({
      compliance: 5,
      metadata: { dimensions: dims, counters: { ...perfectCounters, activeMembers: 0, validMembers: 0 }, details: {} },
    }));
    const issue = result.keyIssues.find((i) => i.id === 'emergency-brigade-no-members');
    assert.ok(issue);
    assert.equal(issue.priority, 'HIGH');
  });

  it('integrantes inválidos (composition < 1) → issue con números exactos', () => {
    const dims = {
      ...perfectDimensions,
      composition: { ...perfectDimensions.composition, ratio: 0.8, numerator: 4, denominator: 5 },
    };
    const result = analyzer.analyze(buildContext({
      metadata: { dimensions: dims, counters: { ...perfectCounters, validMembers: 4 }, details: {} },
    }));
    const issue = result.keyIssues.find((i) => i.id === 'emergency-brigade-invalid-members');
    assert.ok(issue);
    assert.ok(issue.impact.includes('5') && issue.impact.includes('4'));
  });

  it('duplicados → issue LOW que no promete puntos adicionales', () => {
    const dims = {
      ...perfectDimensions,
      traceability: { ...perfectDimensions.traceability, duplicateEmployees: 2 },
    };
    const result = analyzer.analyze(buildContext({
      metadata: { dimensions: dims, counters: { ...perfectCounters, duplicateEmployees: 2 }, details: {} },
    }));
    const issue = result.keyIssues.find((i) => i.id === 'emergency-brigade-duplicates');
    assert.ok(issue);
    assert.equal(issue.priority, 'LOW');
    assert.ok(issue.impact.includes('2'));
  });

  it('trazabilidad incompleta → issue integrity LOW', () => {
    const dims = {
      ...perfectDimensions,
      traceability: { ...perfectDimensions.traceability, ratio: 0.8, numerator: 4, denominator: 5 },
    };
    const result = analyzer.analyze(buildContext({
      metadata: { dimensions: dims, counters: { ...perfectCounters, traceableMembers: 4 }, details: {} },
    }));
    const issue = result.keyIssues.find((i) => i.id === 'emergency-brigade-integrity');
    assert.ok(issue);
    assert.equal(issue.priority, 'LOW');
  });
});

describe('EmergencyBrigadeStandardAnalyzer — cobertura funcional', () => {
  const analyzer = new EmergencyBrigadeStandardAnalyzer();

  it('sin líder → issue HIGH que explica la autoridad por función tipada', () => {
    const dims = {
      ...perfectDimensions,
      functionalCoverage: { ...perfectDimensions.functionalCoverage, ratio: 0.5, numerator: 3, denominator: 4, leaderCoverage: 0, leaderPresent: false },
    };
    const result = analyzer.analyze(buildContext({
      metadata: {
        dimensions: dims,
        counters: { ...perfectCounters, leaders: 0 },
        details: { functionalCoverage: { leaderPresent: false, missingCoreFunctions: [] } },
      },
    }));
    const issue = result.keyIssues.find((i) => i.id === 'emergency-brigade-no-leader');
    assert.ok(issue);
    assert.equal(issue.priority, 'HIGH');
    assert.ok(issue.impact.includes('LEADER'));
  });

  it('función núcleo faltante → issue que nombra las funciones oficiales', () => {
    const result = analyzer.analyze(buildContext({
      metadata: {
        dimensions: perfectDimensions,
        counters: perfectCounters,
        details: { functionalCoverage: { leaderPresent: true, missingCoreFunctions: ['FIRST_AID'] } },
      },
    }));
    const issue = result.keyIssues.find((i) => i.id === 'emergency-brigade-core-functions-incomplete');
    assert.ok(issue);
    assert.ok(issue.impact.includes('primeros auxilios'));
  });

  it('las tres funciones núcleo faltantes → issue HIGH', () => {
    const dims = {
      ...perfectDimensions,
      functionalCoverage: { ...perfectDimensions.functionalCoverage, ratio: 0, numerator: 1, denominator: 4, coreCoverage: 0, leaderPresent: true },
    };
    const result = analyzer.analyze(buildContext({
      metadata: {
        dimensions: dims,
        counters: { ...perfectCounters, leaders: 1 },
        details: { functionalCoverage: { leaderPresent: true, missingCoreFunctions: ['EVACUATION', 'FIRST_AID', 'FIREFIGHTING'] } },
      },
    }));
    const issue = result.keyIssues.find((i) => i.id === 'emergency-brigade-core-functions-incomplete');
    assert.ok(issue);
    assert.equal(issue.priority, 'HIGH');
  });

  it('cobertura funcional completa → sin issues de líder ni funciones', () => {
    const result = analyzer.analyze(buildContext({
      metadata: { dimensions: perfectDimensions, counters: perfectCounters, details: { functionalCoverage: { leaderPresent: true, missingCoreFunctions: [] } } },
    }));
    assert.equal(result.keyIssues.find((i) => i.id === 'emergency-brigade-no-leader'), undefined);
    assert.equal(result.keyIssues.find((i) => i.id === 'emergency-brigade-core-functions-incomplete'), undefined);
  });
});

describe('EmergencyBrigadeStandardAnalyzer — capacitación', () => {
  const analyzer = new EmergencyBrigadeStandardAnalyzer();

  it('capacitación incompleta → issue con titulares pendientes y fechas futuras', () => {
    const dims = {
      ...perfectDimensions,
      training: { ...perfectDimensions.training, ratio: 0.5, numerator: 4, denominator: 8, trainedRatio: 0.5, evidenceRatio: 0.5 },
    };
    const result = analyzer.analyze(buildContext({
      metadata: {
        dimensions: dims,
        counters: { ...perfectCounters, trainedMembers: 2, trainedWithEvidence: 2, membersWithoutTraining: 2, membersWithFutureTrainingDate: 1 },
        details: { training: { activeTitularMembers: 4, futureTrainingDates: 1 } },
      },
    }));
    const issue = result.keyIssues.find((i) => i.id === 'emergency-brigade-training-incomplete');
    assert.ok(issue);
    assert.ok(issue.impact.includes('2'));
    assert.ok(issue.impact.includes('futuras'));
  });

  it('capacitación con ratio 0 → issue HIGH', () => {
    const dims = {
      ...perfectDimensions,
      training: { ...perfectDimensions.training, ratio: 0, numerator: 0, denominator: 8, trainedRatio: 0, evidenceRatio: 0 },
    };
    const result = analyzer.analyze(buildContext({
      metadata: {
        dimensions: dims,
        counters: { ...perfectCounters, trainedMembers: 0, trainedWithEvidence: 0, membersWithoutTraining: 4 },
        details: { training: { activeTitularMembers: 4, futureTrainingDates: 0 } },
      },
    }));
    const issue = result.keyIssues.find((i) => i.id === 'emergency-brigade-training-incomplete');
    assert.ok(issue);
    assert.equal(issue.priority, 'HIGH');
  });

  it('capacitados sin evidencia → issue específico de evidencia', () => {
    const dims = {
      ...perfectDimensions,
      training: { ...perfectDimensions.training, ratio: 0.75, numerator: 6, denominator: 8, trainedRatio: 1, evidenceRatio: 0.5 },
    };
    const result = analyzer.analyze(buildContext({
      metadata: {
        dimensions: dims,
        counters: { ...perfectCounters, trainedMembers: 4, trainedWithEvidence: 2, membersWithoutTraining: 0 },
        details: { training: { activeTitularMembers: 4, futureTrainingDates: 0 } },
      }},
    ));
    const issue = result.keyIssues.find((i) => i.id === 'emergency-brigade-training-evidence-missing');
    assert.ok(issue);
    assert.ok(issue.impact.includes('4') && issue.impact.includes('2'));
  });

  it('capacitación completa → sin issues de capacitación ni evidencia', () => {
    const result = analyzer.analyze(buildContext({
      metadata: { dimensions: perfectDimensions, counters: perfectCounters, details: {} },
    }));
    assert.equal(result.keyIssues.find((i) => i.id === 'emergency-brigade-training-incomplete'), undefined);
    assert.equal(result.keyIssues.find((i) => i.id === 'emergency-brigade-training-evidence-missing'), undefined);
  });
});

describe('EmergencyBrigadeStandardAnalyzer — alternos y operación', () => {
  const analyzer = new EmergencyBrigadeStandardAnalyzer();

  it('sin alternos → issue MEDIUM; con cobertura parcial → LOW', () => {
    const zero = analyzer.analyze(buildContext({
      metadata: {
        dimensions: { ...perfectDimensions, alternates: { ...perfectDimensions.alternates, ratio: 0, numerator: 0, denominator: 3, alternates: 0, coreFunctionsWithAlternate: [], evacuationAlternates: 0, firstAidAlternates: 0, firefightingAlternates: 0 } },
        counters: { ...perfectCounters, alternates: 0, coreFunctionsWithAlternate: 0, evacuationAlternates: 0, firstAidAlternates: 0, firefightingAlternates: 0 },
        details: {},
      },
    }));
    assert.equal(zero.keyIssues.find((i) => i.id === 'emergency-brigade-alternates-incomplete')?.priority, 'MEDIUM');

    const partial = analyzer.analyze(buildContext({
      metadata: {
        dimensions: { ...perfectDimensions, alternates: { ...perfectDimensions.alternates, ratio: 2 / 3, numerator: 2, denominator: 3, alternates: 2, coreFunctionsWithAlternate: ['EVACUATION', 'FIRST_AID'], firefightingAlternates: 0 } },
        counters: { ...perfectCounters, alternates: 2, coreFunctionsWithAlternate: 2, firefightingAlternates: 0 },
        details: {},
      },
    }));
    assert.equal(partial.keyIssues.find((i) => i.id === 'emergency-brigade-alternates-incomplete')?.priority, 'LOW');
  });

  it('alternos completos → sin issue de alternos', () => {
    const result = analyzer.analyze(buildContext({
      metadata: { dimensions: perfectDimensions, counters: perfectCounters, details: {} },
    }));
    assert.equal(result.keyIssues.find((i) => i.id === 'emergency-brigade-alternates-incomplete'), undefined);
  });

  it('reunión sin registro → issue MEDIUM meeting-overdue', () => {
    const dims = {
      ...perfectDimensions,
      operation: { ...perfectDimensions.operation, ratio: 0, numerator: 0, denominator: 1, latestMeetingDate: null },
    };
    const result = analyzer.analyze(buildContext({
      metadata: {
        dimensions: dims,
        counters: { ...perfectCounters, lastMeetingDatePresent: 0 },
        details: { operation: { latestMeetingDate: null, futureMeetingDates: 0 } },
      },
    }));
    const issue = result.keyIssues.find((i) => i.id === 'emergency-brigade-meeting-overdue');
    assert.ok(issue);
    assert.equal(issue.priority, 'MEDIUM');
    assert.ok(issue.impact.includes('lastMeetingDate'));
  });

  it('reunión con fecha futura → issue que lo aclara', () => {
    const dims = {
      ...perfectDimensions,
      operation: { ...perfectDimensions.operation, ratio: 0, numerator: 0, denominator: 1, latestMeetingDate: null, futureMeetingDates: 2 },
    };
    const result = analyzer.analyze(buildContext({
      metadata: {
        dimensions: dims,
        counters: { ...perfectCounters, lastMeetingDatePresent: 2, lastMeetingDateFuture: 2 },
        details: { operation: { latestMeetingDate: null, futureMeetingDates: 2 } },
      },
    }));
    const issue = result.keyIssues.find((i) => i.id === 'emergency-brigade-meeting-overdue');
    assert.ok(issue);
    assert.ok(issue.impact.includes('futura'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Metadata/counters robustos, no-recálculo y frontera 5.1.1
// ═══════════════════════════════════════════════════════════════════════════

describe('EmergencyBrigadeStandardAnalyzer — robustez de metadata y métricas', () => {
  const analyzer = new EmergencyBrigadeStandardAnalyzer();

  it('metadata ausente (respuesta parcial): degrada sin crash ni NaN', () => {
    const result = analyzer.analyze(buildContext({}));
    assert.equal(typeof result.summary, 'string');
    assert.ok(result.summary.length > 0);
    const metrics = analyzer.getMetrics(buildContext({}));
    for (const value of Object.values(metrics)) {
      assert.equal(typeof value, 'number');
      assert.ok(Number.isFinite(value));
    }
  });

  it('counters con basura/strings no rompen getMetrics', () => {
    const metrics = analyzer.getMetrics(buildContext({
      metadata: { counters: { activeMembers: 'x', leaders: null, alternates: undefined, duplicateEmployees: NaN } },
    }));
    assert.equal(metrics.activeMembers, 0);
    assert.equal(metrics.leaders, 0);
    assert.equal(metrics.alternates, 0);
    assert.equal(metrics.duplicateEmployees, 0);
  });

  it('employeeStatusContext se trata solo como contexto (no altera el análisis)', () => {
    const withCtx = analyzer.analyze(buildContext({
      metadata: { dimensions: perfectDimensions, counters: perfectCounters, details: {}, employeeStatusContext: { ACTIVO: 4, RETIRADO: 1 } },
    }));
    const withoutCtx = analyzer.analyze(buildContext({
      metadata: { dimensions: perfectDimensions, counters: perfectCounters, details: {} },
    }));
    assert.deepEqual(withCtx.keyIssues, withoutCtx.keyIssues);
    assert.equal(withCtx.summary, withoutCtx.summary);
  });

  it('el analyzer no recalcula el percentage (sin aritmética de score en analyze)', () => {
    const source = analyzer.analyze.toString();
    assert.ok(!source.includes('* 100'), 'no multiplica por 100');
    assert.ok(!source.includes('/ 100'), 'no divide por 100');
    assert.ok(!/Math\.round\(/.test(source), 'no redondea');
    assert.ok(!/Math\.min\(/.test(source) && !/Math\.max\(/.test(source), 'no aplica caps');
  });

  it('el compliancePercentage narrado coincide con el oficial del engine', () => {
    for (const pct of [0, 33, 68, 95]) {
      const result = analyzer.analyze(buildContext({
        compliance: pct,
        metadata: { dimensions: perfectDimensions, counters: perfectCounters, details: {} },
      }));
      assert.ok(result.summary.includes(`${pct}%`), `summary debe citar el porcentaje oficial ${pct}`);
    }
  });

  it('no mezcla recomendaciones de 5.1.1 (simulacros, rutas, extintores, puntos de encuentro)', () => {
    const result = analyzer.analyze(buildContext({
      compliance: 25,
      metadata: {
        dimensions: {
          ...perfectDimensions,
          functionalCoverage: { ...perfectDimensions.functionalCoverage, ratio: 0.5, numerator: 3, denominator: 4, leaderCoverage: 0 },
          training: { ...perfectDimensions.training, ratio: 0.5, numerator: 4, denominator: 8 },
        },
        counters: { ...perfectCounters, leaders: 0, trainedMembers: 2, trainedWithEvidence: 1, membersWithoutTraining: 2 },
        details: { functionalCoverage: { leaderPresent: false, missingCoreFunctions: ['FIREFIGHTING'] } },
      },
    }));
    const allText = [
      result.summary,
      ...result.quickWins,
      ...result.nextSteps,
      ...result.keyIssues.map((i) => `${i.title} ${i.impact} ${i.recommendation}`),
    ].join(' ').toLowerCase();
    for (const forbidden of ['simulacro', 'ruta de evacuación', 'extintor', 'punto de encuentro', 'contacto de emergencia', 'plan de emergencias', 'socializació']) {
      assert.ok(!allText.includes(forbidden), `5.1.2 no debe recomendar: ${forbidden}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Registro, decoupling de records-doc y protecciones de regresión
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-5.1.2-REG — registro y decoupling del analyzer records-doc', () => {
  it('STD-AI-REG-01: el análisis de 5.1.2 usa el módulo emergency-brigade (no records-doc)', async () => {
    const response = await analyzeWith({
      metadata: { dimensions: perfectDimensions, counters: perfectCounters, details: {} },
      findings: [],
    });
    assert.equal(response.module, 'emergency-brigade');
    assert.equal(response.standardTitle, 'Brigada de emergencia');
    assert.equal(response.compliancePercentage, 68);
    assert.equal(response.complianceStatus, 'MEDIUM');
    assert.equal(response.dataAvailable, true);
  });

  it('STD-AI-REG-02: NO_DATA de 5.1.2 se detecta con el finding oficial del engine', async () => {
    const response = await analyzeWith({
      compliance: 0,
      metadata: { noData: true },
      findings: [finding('emergency-brigade-no-data', 'Sin brigada registrada', 'HIGH')],
    });
    assert.equal(response.dataAvailable, false);
    assert.ok(response.analysis.summary.includes('No existe una brigada'));
  });

  it('STD-AI-REG-02b: la variante no-active-brigade también marca dataAvailable=false', async () => {
    const response = await analyzeWith({
      compliance: 0,
      metadata: { noData: true, allBrigadesInactive: true },
      findings: [finding('emergency-brigade-no-active-brigade', 'Brigadas existentes pero ninguna activa', 'HIGH')],
    });
    assert.equal(response.dataAvailable, false);
    assert.ok(response.analysis.summary.includes('ninguna está activa'));
  });

  it('STD-AI-REG-03: records-doc queda SIN registro (su único uso era 5.1.2)', () => {
    const service = buildService(buildOverviewWith(moduleShape()));
    const registry = (service as unknown as { analyzers: Map<string, unknown> }).analyzers;
    assert.equal(registry.has('5.1.2'), true, '5.1.2 tiene analyzer registrado');
    const analyzerFor512 = registry.get('5.1.2') as object;
    assert.equal(analyzerFor512 instanceof EmergencyBrigadeStandardAnalyzer, true, '5.1.2 usa EmergencyBrigadeStandardAnalyzer');
    assert.equal(analyzerFor512 instanceof RecordsDocStandardAnalyzer, false, 'records-doc ya no analiza 5.1.2');
    const claimedByRecordsDoc = [...registry.entries()].filter(([, a]) => a instanceof RecordsDocStandardAnalyzer);
    assert.equal(claimedByRecordsDoc.length, 0, 'ningún estándar usa hoy el analyzer records-doc');
  });

  it('STD-AI-REG-04: 5.1.1 permanece intacto con EmergencyPlanStandardAnalyzer', () => {
    const service = buildService(buildOverviewWith(moduleShape()));
    const registry = (service as unknown as { analyzers: Map<string, unknown> }).analyzers;
    const analyzerFor511 = registry.get('5.1.1') as object;
    assert.equal(analyzerFor511 instanceof EmergencyPlanStandardAnalyzer, true, '5.1.1 sigue usando EmergencyPlanStandardAnalyzer');
    const claimedByBrigade = [...registry.entries()].filter(([, a]) => a instanceof EmergencyBrigadeStandardAnalyzer);
    assert.deepEqual(claimedByBrigade.map(([code]) => code), ['5.1.2'], 'el analyzer de brigada solo reclama 5.1.2');
  });

  it('STD-AI-REG-05: el analyzer records-doc conserva su comportamiento original (sin registro)', () => {
    const analyzer = new RecordsDocStandardAnalyzer();
    assert.equal(analyzer.supports('5.1.2'), true, 'la clase conserva su código histórico');
    assert.equal(analyzer.getModule(), 'records-doc');
  });
});

describe('AI-5.1.2-REG — protecciones de regresión del dominio 5.1.2', () => {
  it('REG-06: EmergencyBrigadeProvider sigue registrado como provider del engine (runtime)', () => {
    const engineParamTypes: unknown[] = Reflect.getMetadata(
      'design:paramtypes',
      ComplianceEngineService,
    ) ?? [];
    assert.ok(
      engineParamTypes.includes(EmergencyBrigadeProvider),
      'EmergencyBrigadeProvider sigue en el constructor del engine',
    );
  });

  it('REG-07: el analyzer no consulta modelos de Mongo (sin dependencias de infraestructura)', () => {
    const source = EmergencyBrigadeStandardAnalyzer.toString();
    assert.doesNotMatch(source, /@InjectModel|mongoose|Model<|findEmergencies|employeeModel/);
  });

  it('REG-08: el catálogo 5.1.2 apunta al provider oficial y 5.1.1 sigue intacto', () => {
    const brigade = CATALOG_60.find((item) => item.code === '5.1.2');
    assert.equal(brigade?.validationProvider, 'emergency-brigade.provider');
    assert.equal(brigade?.semantic, 'EXACT');
    const plan = CATALOG_60.find((item) => item.code === '5.1.1');
    assert.equal(plan?.validationProvider, 'emergency-plan.provider', '5.1.1 intacto');
  });

  it('REG-09: exclusiones de double scoring vigentes', () => {
    assert.equal(SCORING_EXCLUDED_MODULES.has('emergencies'), true);
    assert.equal(SCORING_EXCLUDED_MODULES.has('emergency-management'), true);
    assert.equal(SCORING_INELIGIBLE_MODULES.has('records-doc'), true, 'records-doc fuera del scoring');
    assert.equal(SCORING_INELIGIBLE_MODULES.has('emergency-brigade'), false, 'emergency-brigade es elegible');
  });

  it('REG-10: PHASE_WEIGHTS no cambió', () => {
    const weights = getPhaseWeights();
    assert.deepEqual(weights, { plan: 0.25, do: 0.6, check: 0.05, act: 0.1 });
  });

  it('REG-11: tenant isolation — cada empresa consume su propio overview del engine', async () => {
    const overviewA = buildOverviewWith(moduleShape({ compliance: 80 }));
    const overviewB = buildOverviewWith(moduleShape({ compliance: 20 }));
    const complianceEngineService = {
      getOverview: async (companyId: string) => (companyId === COMPANY_A ? overviewA : overviewB),
    } as unknown as ComplianceEngineService;
    const service = new StandardAnalysisService(complianceEngineService);
    const responseA = await service.analyze('5.1.2', COMPANY_A);
    const responseB = await service.analyze('5.1.2', COMPANY_B);
    assert.equal(responseA.compliancePercentage, 80);
    assert.equal(responseB.compliancePercentage, 20, 'la empresa B no consume los datos de la empresa A');
  });
});
