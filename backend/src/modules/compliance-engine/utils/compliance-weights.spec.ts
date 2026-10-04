import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertValidPhaseWeights,
  DEFAULT_PHASE_WEIGHTS,
  getPhaseWeights,
} from './compliance-weights';
import { calculateWeightedCompliance } from './compliance-calculator';
import { PhaseCompliance } from '../interfaces/compliance-engine.interface';
import { CATALOG_60 } from '../../standard-catalog/constants/catalog-60';
import { computeEffectiveWeights } from '../../standard-catalog/utils/effective-weights';

function phase(plan: number, do_: number, check: number, act: number): PhaseCompliance {
  return { plan, do: do_, check, act };
}

describe('AUDIT-2 — Pesos oficiales PHVA (PHVA-WEIGHTS)', () => {
  it('PHVA-WEIGHTS-01 — los pesos oficiales son PLANEAR 0.25, HACER 0.60, VERIFICAR 0.05, ACTUAR 0.10', () => {
    assert.equal(DEFAULT_PHASE_WEIGHTS.plan, 0.25);
    assert.equal(DEFAULT_PHASE_WEIGHTS.do, 0.6);
    assert.equal(DEFAULT_PHASE_WEIGHTS.check, 0.05);
    assert.equal(DEFAULT_PHASE_WEIGHTS.act, 0.1);
  });

  it('PHVA-WEIGHTS-02 — la suma de los pesos oficiales es exactamente 1', () => {
    const sum = Object.values(DEFAULT_PHASE_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.equal(sum, 1);
  });

  it('PHVA-WEIGHTS-03 — pesos inválidos son rechazados (negativos y suma != 1)', () => {
    assert.throws(
      () => assertValidPhaseWeights({ plan: -0.25, do: 0.6, check: 0.05, act: 0.1 }),
      /negative/,
    );
    assert.throws(
      () => assertValidPhaseWeights({ plan: 0.5, do: 0.6, check: 0.05, act: 0.1 }),
      /expected 1/,
    );
    // NaN tampoco es aceptable.
    assert.throws(
      () => assertValidPhaseWeights({ plan: NaN, do: 0.6, check: 0.05, act: 0.1 }),
      /negative or not a number/,
    );
    // getPhaseWeights() valida la configuración oficial antes de devolverla.
    assert.doesNotThrow(() => getPhaseWeights());
  });

  it('PHVA-WEIGHTS-04 — cálculo ponderado con los pesos oficiales (motor real calculateWeightedCompliance)', () => {
    // Caso A: 100/100/100/100 → 100.
    assert.equal(
      calculateWeightedCompliance(phase(100, 100, 100, 100), getPhaseWeights()),
      100,
    );
    // Caso diferencial: Planear 100, Hacer 50, Verificar 0, Actuar 0 → 55.
    assert.equal(
      calculateWeightedCompliance(phase(100, 50, 0, 0), getPhaseWeights()),
      55,
    );
    // Caso C: solo Hacer 100 → 60.
    assert.equal(
      calculateWeightedCompliance(phase(0, 100, 0, 0), getPhaseWeights()),
      60,
    );
    // Caso D: solo Verificar 100 → 5.
    assert.equal(
      calculateWeightedCompliance(phase(0, 0, 100, 0), getPhaseWeights()),
      5,
    );
    // Caso E: solo Actuar 100 → 10.
    assert.equal(
      calculateWeightedCompliance(phase(0, 0, 0, 100), getPhaseWeights()),
      10,
    );
  });

  it('PHVA-WEIGHTS-05 — los pesos normativos de los estándares 0312 NO cambiaron', () => {
    const normativeSum = CATALOG_60.reduce(
      (sum, standard) => sum + (standard.normativeWeight ?? 0),
      0,
    );
    // Baseline del catálogo: 52 estándares IMPLEMENTED suman 105
    // + 17 PLANNED suman 122 total (documentado en catalog-60.ts).
    // 4 DUPLICATE, 5 COMPLEMENTARY, nuevos oficiales FASE 27.2 + 30A.
    assert.equal(normativeSum, 122);
    // Un estándar representativo conserva su peso normativo.
    const responsible = CATALOG_60.find((s) => s.code === '1.1.1');
    assert.equal(responsible?.normativeWeight, 0.5);
    // Los niveles aplicables del estándar se conservan.
    assert.deepEqual(responsible?.applicableLevels, ['7', '21', '60']);
  });

  it('PHVA-WEIGHTS-06 — los niveles 7/21/60 y los pesos efectivos de estándares siguen funcionando', () => {
    // computeEffectiveWeights normaliza SOLO los estándares activos
    // (IMPLEMENTED/PARTIAL) para que la escala efectiva sume exactamente 100.
    const effective = computeEffectiveWeights(CATALOG_60);
    let sum = 0;
    for (const weight of effective.values()) sum += weight;
    assert.ok(Math.abs(sum - 100) < 1e-6, `escala efectiva debe sumar 100 (actual: ${sum})`);
    // Los niveles aplicables siguen presentes en el catálogo (7/21/60).
    for (const standard of CATALOG_60) {
      assert.ok(standard.applicableLevels.length > 0, `${standard.code} debe declarar niveles`);
    }
  });

  it('PHVA-WEIGHTS-07 — PhvaAnalysisService y Compliance Engine usan la misma definición (una única fuente)', () => {
    // PhvaAnalysisService consume overview.overallCompliance del Compliance
    // Engine, que usa getPhaseWeights(): no existe una segunda copia de pesos.
    // Verificación estructural: no hay literales del conjunto antiguo en phva/.
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const phvaService = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'src', 'modules', 'phva', 'phva-analysis.service.ts'),
      'utf8',
    );
    assert.ok(!phvaService.includes('0.35') && !phvaService.includes('0.15'));
    // El Compliance Engine consume la fuente única (getPhaseWeights) y no
    // tiene literales propios del conjunto antiguo.
    const engineService = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'src',
        'modules',
        'compliance-engine',
        'compliance-engine.service.ts',
      ),
      'utf8',
    );
    assert.ok(engineService.includes('getPhaseWeights'));
    assert.ok(!engineService.includes('0.35') && !engineService.includes('0.15'));
    // La fuente única es compliance-weights.ts.
    const weightsSource = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'src',
        'modules',
        'compliance-engine',
        'utils',
        'compliance-weights.ts',
      ),
      'utf8',
    );
    assert.ok(weightsSource.includes('plan: 0.25') && weightsSource.includes('do: 0.6'));
  });

  it('PHVA-WEIGHTS-08 — el conjunto antiguo 0.35 / check 0.25 / 0.15 ya no existe en la fuente de pesos', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const source = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'src',
        'modules',
        'compliance-engine',
        'utils',
        'compliance-weights.ts',
      ),
      'utf8',
    );
    assert.ok(!source.includes('do: 0.35'));
    assert.ok(!source.includes('check: 0.25'));
    assert.ok(!source.includes('act: 0.15'));
    // 0.15 puede seguir existiendo legítimamente en DEFAULT_MODULE_WEIGHTS
    // (trainings: 0.15) — los pesos de fase y los de módulo son responsabilidades
    // distintas. Verificamos el conjunto antiguo solo a nivel de fase:
    assert.ok(!source.includes('plan: 0.25, do: 0.35'));
  });

  // ── FASE 28: Scoring boundary ──
  it('PHVA-WEIGHTS-09 — ComplianceEngine NO consume normativeWeight para el global compliance score', () => {
    // El motor calcula: Provider% → Phase average → PHASE_WEIGHTS → global score.
    // normativeWeight es exclusivamente metadata del catálogo (display/DTO).
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const engineSource = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'src',
        'modules',
        'compliance-engine',
        'compliance-engine.service.ts',
      ),
      'utf8',
    );
    // El engine NO importa normativeWeight ni lo usa en calculateWeightedCompliance
    assert.ok(
      !engineSource.includes('normativeWeight'),
      'ComplianceEngine must NOT reference normativeWeight',
    );
  });

  it('PHVA-WEIGHTS-10 — ComplianceEngine NO consume classification para el scoring', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const engineSource = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'src',
        'modules',
        'compliance-engine',
        'compliance-engine.service.ts',
      ),
      'utf8',
    );
    assert.ok(
      !engineSource.includes('classification'),
      'ComplianceEngine must NOT reference catalog classification',
    );
  });

  it('PHVA-WEIGHTS-11 — ComplianceEngine NO consume duplicateOf para el scoring', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const engineSource = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'src',
        'modules',
        'compliance-engine',
        'compliance-engine.service.ts',
      ),
      'utf8',
    );
    assert.ok(
      !engineSource.includes('duplicateOf'),
      'ComplianceEngine must NOT reference duplicateOf',
    );
  });

  it('PHVA-WEIGHTS-12 — calculateWeightedCompliance solo depende de PhaseCompliance y phaseWeights', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const calcSource = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'src',
        'modules',
        'compliance-engine',
        'utils',
        'compliance-calculator.ts',
      ),
      'utf8',
    );
    // El calculator solo importa PhaseCompliance y CompliancePhaseKey
    assert.ok(
      !calcSource.includes('normativeWeight'),
      'compliance-calculator must NOT reference normativeWeight',
    );
    assert.ok(
      !calcSource.includes('classification'),
      'compliance-calculator must NOT reference classification',
    );
    assert.ok(
      !calcSource.includes('duplicateOf'),
      'compliance-calculator must NOT reference duplicateOf',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FASE 30B-2: Scoring Boundary Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('FASE 30B-2 — Scoring Boundary', () => {
  const {
    SCORING_EXCLUDED_MODULES,
    SCORING_INELIGIBLE_MODULES,
    filterScoringEligible,
  } = require('./compliance-weights') as typeof import('./compliance-weights');

  // Helper to create mock provider results
  function makeResult(module: string, percentage = 80) {
    return { module, percentage, status: 'TARGET_MET' as const };
  }

  it('BOUNDARY-01: EXACT providers CAN score', () => {
    // A module not in any exclusion set should pass through
    const results = [makeResult('sociodemographic', 90)];
    const eligible = filterScoringEligible(results);
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].module, 'sociodemographic');
  });

  it('BOUNDARY-02: VALID_REUSE providers CAN score', () => {
    // Same as EXACT — not excluded = eligible
    const results = [makeResult('disease-investigation', 85)];
    const eligible = filterScoringEligible(results);
    assert.equal(eligible.length, 1);
  });

  it('BOUNDARY-03: DUPLICATE modules CANNOT score', () => {
    const results = [
      makeResult('emergencies', 90),
      makeResult('control-verification-standard', 80),
    ];
    const eligible = filterScoringEligible(results);
    assert.equal(eligible.length, 0);
  });

  it('BOUNDARY-04: COMPLEMENTARY modules CANNOT score', () => {
    const results = [makeResult('emergency-management', 85)];
    const eligible = filterScoringEligible(results);
    assert.equal(eligible.length, 0);
  });

  it('BOUNDARY-05: PARTIAL modules CANNOT score', () => {
    const results = [
      makeResult('occupational-exam', 95),
      makeResult('medical-recommendation', 88),
      makeResult('health-indicators', 92),
    ];
    const eligible = filterScoringEligible(results);
    assert.equal(eligible.length, 0);
  });

  it('BOUNDARY-06: Mixed results — only eligible pass through', () => {
    const results = [
      makeResult('sociodemographic', 90),           // EXACT → eligible
      makeResult('occupational-exam', 95),           // PARTIAL → excluded
      makeResult('accident-reporting', 85),          // EXACT → eligible
      makeResult('emergencies', 80),                 // DUPLICATE → excluded
      makeResult('disease-investigation', 88),       // VALID_REUSE → eligible
      makeResult('health-indicators', 92),           // PARTIAL → excluded
    ];
    const eligible = filterScoringEligible(results);
    assert.equal(eligible.length, 3);
    const eligibleModules = eligible.map((r) => r.module);
    assert.ok(eligibleModules.includes('sociodemographic'));
    assert.ok(eligibleModules.includes('accident-reporting'));
    assert.ok(eligibleModules.includes('disease-investigation'));
  });

  it('BOUNDARY-07: SCORING_EXCLUDED_MODULES has exactly 3 entries', () => {
    assert.equal(SCORING_EXCLUDED_MODULES.size, 3);
    assert.ok(SCORING_EXCLUDED_MODULES.has('emergencies'));
    assert.ok(SCORING_EXCLUDED_MODULES.has('control-verification-standard'));
    assert.ok(SCORING_EXCLUDED_MODULES.has('emergency-management'));
  });

  it('BOUNDARY-08: SCORING_INELIGIBLE_MODULES has exactly 8 entries', () => {
    assert.equal(SCORING_INELIGIBLE_MODULES.size, 11);
    assert.ok(SCORING_INELIGIBLE_MODULES.has('occupational-exam'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('medical-recommendation'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('health-indicators'));
    // ESTÁNDAR 5.1.1: wrong-mapping retirado del scoring (Plan de emergencias).
    assert.ok(SCORING_INELIGIBLE_MODULES.has('procedures-doc'));
    // ESTÁNDAR 5.1.2: wrong-mapping retirado del scoring (Brigada de emergencia).
    assert.ok(SCORING_INELIGIBLE_MODULES.has('records-doc'));
    // ESTÁNDAR 6.1.1: DUPLICATE retirado del scoring (el provider OFICIAL es 'indicators').
    assert.ok(SCORING_INELIGIBLE_MODULES.has('management-measurement'));
    // ESTÁNDAR 6.1.2: retirado del scoring (el provider OFICIAL es 'annual-audit';
    // management-review representa revisión/rendición de cuentas, no auditoría anual).
    assert.ok(SCORING_INELIGIBLE_MODULES.has('management-review'));
    // ESTÁNDAR 6.1.3: WRONG_MAPPING retirado del scoring (el provider OFICIAL es
    // 'management-review-direction'; internal-audit media DocumentMaster AUDIT,
    // que corresponde a auditoría SG-SST, no a revisión por la dirección).
    assert.ok(SCORING_INELIGIBLE_MODULES.has('internal-audit'));
    // ESTÁNDAR 6.1.4: WRONG_MAPPING retirado del scoring (el provider OFICIAL
    // es 'copasst-audit-planning' sobre el dominio propio E1; findings-review
    // media AccountabilityCommitment — rendición de cuentas — como 6.1.4).
    assert.ok(SCORING_INELIGIBLE_MODULES.has('findings-review'));
    // ESTÁNDAR 7.1.1: PROXY_LEGACY retirado del scoring (el provider OFICIAL
    // es 'corrective-preventive-actions' sobre el dominio propio E1;
    // corrective-preventive media AccountabilityCommitment como proxy).
    assert.ok(SCORING_INELIGIBLE_MODULES.has('corrective-preventive'));
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('corrective-preventive-actions'));
  });

  it('BOUNDARY-09: 3.1.2 (occupational-exam) does NOT score for promoción', () => {
    assert.ok(SCORING_INELIGIBLE_MODULES.has('occupational-exam'));
  });

  it('BOUNDARY-10: 3.1.3 (medical-recommendation) does NOT score for info médico', () => {
    assert.ok(SCORING_INELIGIBLE_MODULES.has('medical-recommendation'));
  });

  it('BOUNDARY-11: 3.3.2 (health-indicators) does NOT score as severidad', () => {
    assert.ok(SCORING_INELIGIBLE_MODULES.has('health-indicators'));
  });

  it('BOUNDARY-12: 3.2.2 (disease-investigation) DOES score for investigación', () => {
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('disease-investigation'));
    assert.ok(!SCORING_EXCLUDED_MODULES.has('disease-investigation'));
  });

  it('BOUNDARY-13: Excluded results remain available for diagnostics', () => {
    const allResults = [
      makeResult('sociodemographic', 90),
      makeResult('occupational-exam', 95),
      makeResult('emergencies', 80),
    ];
    const eligible = filterScoringEligible(allResults);
    // allResults has 3, but only 1 is eligible for scoring
    assert.equal(allResults.length, 3);
    assert.equal(eligible.length, 1);
    // All 3 are still available for findings/diagnostics
  });

  it('BOUNDARY-14: Empty results produce empty eligible set', () => {
    const eligible = filterScoringEligible([]);
    assert.equal(eligible.length, 0);
  });

  it('BOUNDARY-15: No overlap between EXCLUDED and INELIGIBLE sets', () => {
    for (const mod of SCORING_EXCLUDED_MODULES) {
      assert.ok(
        !SCORING_INELIGIBLE_MODULES.has(mod),
        `${mod} should not be in both sets`,
      );
    }
    for (const mod of SCORING_INELIGIBLE_MODULES) {
      assert.ok(
        !SCORING_EXCLUDED_MODULES.has(mod),
        `${mod} should not be in both sets`,
      );
    }
  });

  it('BOUNDARY-16: All active scoring providers are eligible', () => {
    // Verify that the main scoring providers are not in any exclusion set
    const scoringProviders = [
      'sociodemographic',
      'occupational-evaluation',
      'accident-reporting',
      'disease-investigation',
      'accident-frequency',
      'accident-mortality',
      'absenteeism',
      'risk-methodology',
      'worker-participation',
      'hazardous-substance',
      'environmental-measurement',
      'control-implementation',
      'control-verification',
      'procedures',
      'inspection-compliance',
      'maintenance',
      'epp-compliance',
      // ESTÁNDAR 5.1.1: procedures-doc retirado del scoring (wrong-mapping:
      // evaluaba procedimientos genéricos, no el Plan de emergencias). Su
      // evidencia documental propia sigue visible en moduleCompliance, pero
      // NO contribuye al score de fase.
      // 'procedures-doc',
      'emergency-plan',
      // ESTÁNDAR 5.1.2: records-doc retirado del scoring (wrong-mapping:
      // evaluaba registros genéricos de DocumentMaster, no brigadas). Su
      // evidencia documental propia sigue visible en moduleCompliance, pero
      // NO contribuye al score de fase. El provider OFICIAL de 5.1.2 es
      // 'emergency-brigade' (SstEmergencias.brigades[].typedMembers[]).
      // 'records-doc',
      'emergency-brigade',
      // ESTÁNDAR 6.1.1: management-measurement retirado del scoring (DUPLICATE
      // del provider OFICIAL 'indicators'). Su evidencia sigue visible en
      // moduleCompliance para hallazgos/diagnósticos.
      // 'management-measurement',
      // ESTÁNDAR 6.1.2: management-review retirado del scoring (el provider
      // OFICIAL es 'annual-audit' sobre el dominio propio E1; management-review
      // representa revisión/rendición de cuentas, no auditoría anual).
      // 'management-review',
      'annual-audit',
      // ESTÁNDAR 6.1.3: internal-audit retirado del scoring (WRONG_MAPPING:
      // media DocumentMaster AUDIT — auditoría SG-SST — como 6.1.3; el provider
      // OFICIAL de 6.1.3 es 'management-review-direction' sobre el dominio
      // propio E1). Su evidencia documental sigue visible en moduleCompliance
      // para hallazgos/diagnósticos.
      // 'internal-audit',
      'management-review-direction',
      // ESTÁNDAR 6.1.4: findings-review retirado del scoring (WRONG_MAPPING;
      // el provider OFICIAL es 'copasst-audit-planning' sobre el dominio
      // propio E1). Se conserva en moduleCompliance para hallazgos.
      // 'findings-review',
      'copasst-audit-planning',
      // ESTÁNDAR 7.1.1: corrective-preventive retirado del scoring (PROXY_LEGACY;
      // el provider OFICIAL es 'corrective-preventive-actions' sobre el dominio
      // propio E1). Se conserva en moduleCompliance para compatibilidad.
      // 'corrective-preventive',
      'corrective-preventive-actions',
      // ESTÁNDAR 7.1.2: management-improvement retirado del scoring (PROXY_LEGACY;
      // el provider OFICIAL es 'management-improvement-actions' sobre el dominio
      // propio E1). Se conserva en moduleCompliance para compatibilidad.
      // 'management-improvement',
      'management-improvement-actions',
      'incident-actions',
      'improvement-plan',
      'induction-reinduction',
      'annual-work-plan',
      'sst-objectives',
      'initial-evaluation',
      'copasst-training',
      'convivencia',
      'indicators',
      'programs',
      'document-evaluation',
      'acquisitions',
      'contracting',
      'change-management',
      'evaluations',
      'incidents',
      'risks',
      'trainings',
      'inspections',
      'documents',
      'legal-matrix',
      'alerts',
      'dashboard',
    ];
    for (const mod of scoringProviders) {
      assert.ok(
        !SCORING_EXCLUDED_MODULES.has(mod) && !SCORING_INELIGIBLE_MODULES.has(mod),
        `Provider ${mod} should be eligible for scoring`,
      );
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // ESTÁNDAR 5.1.1 — Plan de emergencias: retiro del wrong-mapping
  // ═══════════════════════════════════════════════════════════════════

  it('5.1.1: emergency-plan es elegible para el scoring (provider oficial)', () => {
    assert.ok(!SCORING_EXCLUDED_MODULES.has('emergency-plan'));
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('emergency-plan'));
    const eligible = filterScoringEligible([
      { module: 'emergency-plan', percentage: 80, status: 'TARGET_NOT_MET' as const },
    ]);
    assert.equal(eligible.length, 1);
  });

  it('5.1.1: procedures-doc ya NO puntúa el Plan de emergencias (wrong-mapping retirado)', () => {
    // Se clasifica como WRONG_MAPPING: conserva hallazgos/diagnósticos en
    // moduleCompliance pero NO contribuye al score de fase.
    const eligible = filterScoringEligible([
      { module: 'procedures-doc', percentage: 100, status: 'TARGET_MET' as const },
    ]);
    assert.equal(eligible.length, 0, 'procedures-doc no debe contribuir al scoring');
  });

  it('5.1.1: los providers legacy de emergencias siguen excluidos (sin consolidación)', () => {
    assert.ok(SCORING_EXCLUDED_MODULES.has('emergencies'), 'emergencies (1.1.10 DUPLICATE) sigue excluido');
    assert.ok(SCORING_EXCLUDED_MODULES.has('emergency-management'), 'emergency-management (4.4.1 COMPLEMENTARY) sigue excluido');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FASE 30D-2: 3.1.3 EXACT — JobProfileMedicalInformationProvider
// ═══════════════════════════════════════════════════════════════════════════

describe('FASE 30D-2 — 3.1.3 EXACT entra al scoring', () => {
  const {
    SCORING_EXCLUDED_MODULES,
    SCORING_INELIGIBLE_MODULES,
    filterScoringEligible,
  } = require('./compliance-weights') as typeof import('./compliance-weights');

  it('30D-2-01: job-profile-medical-information NO está excluido del scoring', () => {
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('job-profile-medical-information'));
    assert.ok(!SCORING_EXCLUDED_MODULES.has('job-profile-medical-information'));
  });

  it('30D-2-02: job-profile-medical-information (3.1.3 EXACT) sí puntúa', () => {
    const eligible = filterScoringEligible([
      { module: 'job-profile-medical-information', percentage: 90, status: 'TARGET_MET' as const },
    ]);
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].module, 'job-profile-medical-information');
  });

  it('30D-2-03: medical-recommendation sigue excluido (NO se reutiliza como 3.1.3)', () => {
    assert.ok(SCORING_INELIGIBLE_MODULES.has('medical-recommendation'));
    const eligible = filterScoringEligible([
      { module: 'medical-recommendation', percentage: 95, status: 'TARGET_MET' as const },
    ]);
    assert.equal(eligible.length, 0);
  });

  it('30D-2-04: no hay doble scoring entre el provider EXACT y los módulos legacy', () => {
    const eligible = filterScoringEligible([
      { module: 'job-profile-medical-information', percentage: 90, status: 'TARGET_MET' as const },
      { module: 'medical-recommendation', percentage: 80, status: 'TARGET_MET' as const },
      { module: 'occupational-exam', percentage: 95, status: 'TARGET_MET' as const },
    ]);
    // Solo el provider EXACT de 3.1.3 contribuye; los legacy quedan fuera.
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].module, 'job-profile-medical-information');
  });

  it('30D-2-05: los sets de exclusión conservan sus entradas históricas más procedures-doc (5.1.1), records-doc (5.1.2), management-measurement (6.1.1) y management-review (6.1.2)', () => {
    assert.equal(SCORING_EXCLUDED_MODULES.size, 3);
    assert.equal(SCORING_INELIGIBLE_MODULES.size, 11);
    assert.ok(SCORING_EXCLUDED_MODULES.has('emergencies'));
    assert.ok(SCORING_EXCLUDED_MODULES.has('control-verification-standard'));
    assert.ok(SCORING_EXCLUDED_MODULES.has('emergency-management'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('occupational-exam'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('medical-recommendation'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('health-indicators'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('records-doc'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('management-measurement'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('management-review'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FASE 30E: 3.1.2 EXACT — HealthPromotionProvider
// ═══════════════════════════════════════════════════════════════════════════

describe('FASE 30E — 3.1.2 EXACT entra al scoring', () => {
  const {
    SCORING_EXCLUDED_MODULES,
    SCORING_INELIGIBLE_MODULES,
    filterScoringEligible,
  } = require('./compliance-weights') as typeof import('./compliance-weights');

  it('30E-01: health-promotion NO está excluido del scoring', () => {
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('health-promotion'));
    assert.ok(!SCORING_EXCLUDED_MODULES.has('health-promotion'));
  });

  it('30E-02: health-promotion (3.1.2 EXACT) sí puntúa', () => {
    const eligible = filterScoringEligible([
      { module: 'health-promotion', percentage: 90, status: 'TARGET_MET' as const },
    ]);
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].module, 'health-promotion');
  });

  it('30E-03: occupational-exam (legacy PARTIAL) sigue excluido — no hay doble scoring para 3.1.2', () => {
    assert.ok(SCORING_INELIGIBLE_MODULES.has('occupational-exam'));
    const eligible = filterScoringEligible([
      { module: 'health-promotion', percentage: 90, status: 'TARGET_MET' as const },
      { module: 'occupational-exam', percentage: 95, status: 'TARGET_MET' as const },
      { module: 'medical-recommendation', percentage: 80, status: 'TARGET_MET' as const },
      { module: 'health-indicators', percentage: 85, status: 'TARGET_MET' as const },
    ]);
    // Solo el provider EXACT de 3.1.2 contribuye por este estándar.
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].module, 'health-promotion');
  });

  it('30E-04: los sets de exclusión conservan sus entradas históricas más procedures-doc (5.1.1), records-doc (5.1.2), management-measurement (6.1.1) y management-review (6.1.2)', () => {
    assert.equal(SCORING_EXCLUDED_MODULES.size, 3);
    assert.equal(SCORING_INELIGIBLE_MODULES.size, 11);
    assert.ok(SCORING_INELIGIBLE_MODULES.has('occupational-exam'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('medical-recommendation'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('health-indicators'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('records-doc'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('management-measurement'));
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('job-profile-medical-information'));
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('health-promotion'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FASE 30F: 3.1.5 EXACT — OccupationalMedicalRecordCustodyProvider
// ═══════════════════════════════════════════════════════════════════════════

describe('FASE 30F — 3.1.5 EXACT entra al scoring', () => {
  const {
    SCORING_EXCLUDED_MODULES,
    SCORING_INELIGIBLE_MODULES,
    filterScoringEligible,
  } = require('./compliance-weights') as typeof import('./compliance-weights');

  it('30F-01: occupational-medical-record-custody NO está excluido del scoring', () => {
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('occupational-medical-record-custody'));
    assert.ok(!SCORING_EXCLUDED_MODULES.has('occupational-medical-record-custody'));
  });

  it('30F-02: occupational-medical-record-custody (3.1.5 EXACT) sí puntúa', () => {
    const eligible = filterScoringEligible([
      { module: 'occupational-medical-record-custody', percentage: 90, status: 'TARGET_MET' as const },
    ]);
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].module, 'occupational-medical-record-custody');
  });

  it('30F-03: occupational-exam, medical-recommendation y health-indicators (legacy PARTIAL) sigue excluido — no hay doble scoring para 3.1.5', () => {
    assert.ok(SCORING_INELIGIBLE_MODULES.has('occupational-exam'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('medical-recommendation'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('health-indicators'));
    const eligible = filterScoringEligible([
      { module: 'occupational-medical-record-custody', percentage: 90, status: 'TARGET_MET' as const },
      { module: 'medical-recommendation', percentage: 80, status: 'TARGET_MET' as const },
      { module: 'job-profile-medical-information', percentage: 85, status: 'TARGET_MET' as const },
      { module: 'health-indicators', percentage: 85, status: 'TARGET_MET' as const },
    ]);
    // Solo el provider EXACT de 3.1.5 (occupational-medical-record-custody) y
    // job-profile-medical-information (3.1.3 EXACT) son elegibles.
    // medical-recommendation (3.1.3 PARTIAL) y health-indicators (3.3.2 PARTIAL)
    // están excluidos del scoring.
    assert.equal(eligible.length, 2);
    assert.ok(eligible.some((e) => e.module === 'occupational-medical-record-custody'));
    assert.ok(eligible.some((e) => e.module === 'job-profile-medical-information'));
    assert.ok(!eligible.some((e) => e.module === 'medical-recommendation'));
    assert.ok(!eligible.some((e) => e.module === 'health-indicators'));
  });

  it('30F-03b: occupational-exam (legacy PARTIAL) no se puede añadir a sets de exclusión sin reescanear catálogo', () => {
    // 3 históricos + procedures-doc (retiro del wrong-mapping 5.1.1) +
    // records-doc (retiro del wrong-mapping 5.1.2) + management-measurement
    // (retiro del DUPLICATE 6.1.1; provider oficial 'indicators') +
    // management-review (retiro de 6.1.2; provider oficial 'annual-audit') +
    // internal-audit (retiro del WRONG_MAPPING 6.1.3; provider oficial
    // 'management-review-direction').
    assert.equal(SCORING_INELIGIBLE_MODULES.size, 11);
    assert.equal(SCORING_EXCLUDED_MODULES.size, 3);
  });


  it('30F-04: los sets de exclusión conservan sus entradas históricas más procedures-doc (5.1.1), records-doc (5.1.2), management-measurement (6.1.1) y management-review (6.1.2)', () => {
    assert.equal(SCORING_EXCLUDED_MODULES.size, 3);
    assert.equal(SCORING_INELIGIBLE_MODULES.size, 11);
    assert.ok(SCORING_INELIGIBLE_MODULES.has('occupational-exam'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('medical-recommendation'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('health-indicators'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('records-doc'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('management-measurement'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('management-review'));
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('occupational-medical-record-custody'));
  });
});
