import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  SCORING_EXCLUDED_MODULES,
  SCORING_INELIGIBLE_MODULES,
  filterScoringEligible,
} from '../utils/compliance-weights';
import { Model } from 'mongoose';
import { CopasstAuditPlanningProvider } from './copasst-audit-planning-compliance.provider';
import { CopasstAuditPlanningStandardAnalyzer } from '../../compliance-ai/standard-analysis/analyzers/copasst-audit-planning-standard.analyzer';
import { FindingsReviewStandardAnalyzer } from '../../compliance-ai/standard-analysis/analyzers/findings-review-standard.analyzer';
import { AnnualAuditComplianceProvider } from './annual-audit-compliance.provider';
import { FindingsReviewProvider } from './findings-review.provider';
import type { CopasstAuditPlanningDocument } from '../../copasst-audit-planning/schemas/copasst-audit-planning.schema';
import type { AnnualAuditDocument } from '../../annual-audit/schemas/annual-audit.schema';
import type { AccountabilityCommitmentDocument } from '../../accountability/schemas/accountability-commitment.schema';

/**
 * E2 (6.1.4) — Tests de frontera del retiro del wrong-mapping.
 *
 * Demuestra:
 *  - 6.1.4 = copasst-audit-planning (ÚNICA fuente de scoring).
 *  - findings-review ya NO participa en el scoring de 6.1.4 (WRONG_MAPPING
 *    retirado formalmente en SCORING_INELIGIBLE_MODULES; se conserva en
 *    moduleCompliance para hallazgos/diagnósticos).
 *  - 6.1.2 sigue siendo annual-audit (frontera anti-double-scoring).
 *  - El registro IA ya no resuelve 6.1.4 al analyzer incorrecto.
 */

// ── Scoring: sets de exclusión ──────────────────────────────────────────────

describe('CAP614-BOUNDARY: retiro del wrong-mapping de 6.1.4', () => {
  it('copasst-audit-planning es ELEGIBLE para el scoring (provider oficial)', () => {
    assert.ok(!SCORING_EXCLUDED_MODULES.has('copasst-audit-planning'));
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('copasst-audit-planning'));
    const eligible = filterScoringEligible([
      { module: 'copasst-audit-planning', percentage: 85, status: 'TARGET_NOT_MET' as const },
    ]);
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].module, 'copasst-audit-planning');
  });

  it('findings-review ya NO puntúa (WRONG_MAPPING retirado del scoring)', () => {
    assert.ok(SCORING_INELIGIBLE_MODULES.has('findings-review'));
    const eligible = filterScoringEligible([
      { module: 'findings-review', percentage: 100, status: 'TARGET_MET' as const },
    ]);
    assert.equal(eligible.length, 0, 'findings-review no debe contribuir al scoring');
  });

  it('no hay double scoring en 6.1.4: solo copasst-audit-planning contribuye', () => {
    const eligible = filterScoringEligible([
      { module: 'copasst-audit-planning', percentage: 85, status: 'TARGET_NOT_MET' as const },
      { module: 'findings-review', percentage: 90, status: 'TARGET_MET' as const },
    ]);
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].module, 'copasst-audit-planning');
  });

  it('los sets de exclusión quedan con 9 entradas INELIGIBLE (8 históricas + findings-review)', () => {
    assert.equal(SCORING_INELIGIBLE_MODULES.size, 9);
    assert.equal(SCORING_EXCLUDED_MODULES.size, 3);
    // Sin overlaps (regla BOUNDARY-15 sigue válida).
    for (const mod of SCORING_INELIGIBLE_MODULES) {
      assert.ok(!SCORING_EXCLUDED_MODULES.has(mod));
    }
  });

  it('6.1.2 sigue siendo annual-audit: annual-audit elegible, management-review excluido', () => {
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('annual-audit'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('management-review'));
    const eligible = filterScoringEligible([
      { module: 'annual-audit', percentage: 80, status: 'TARGET_NOT_MET' as const },
      { module: 'copasst-audit-planning', percentage: 85, status: 'TARGET_NOT_MET' as const },
      { module: 'findings-review', percentage: 90, status: 'TARGET_MET' as const },
    ]);
    assert.equal(eligible.length, 2);
    assert.ok(eligible.some((e) => e.module === 'annual-audit'));
    assert.ok(eligible.some((e) => e.module === 'copasst-audit-planning'));
  });

  it('6.1.3 sigue intacto: management-review-direction elegible, internal-audit excluido', () => {
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('management-review-direction'));
    assert.ok(SCORING_INELIGIBLE_MODULES.has('internal-audit'));
  });
});

// ── Contratos de los providers/analyzer implicados ──────────────────────────

describe('CAP614-BOUNDARY: contratos de módulo y estándar', () => {
  it('el provider oficial expone module copasst-audit-planning (no findings-review)', async () => {
    const model = {
      find: () => ({
        lean: () => ({ exec: async () => [] }),
      }),
    } as unknown as Model<CopasstAuditPlanningDocument>;
    const provider = new CopasstAuditPlanningProvider(model);
    const result = await provider.getCompliance('64a0000000000000000000a3');
    assert.equal(result.module, 'copasst-audit-planning');
    assert.equal(result.status, 'NO_DATA');
  });

  it('findings-review provider conserva su evidencia (module propio) pero ya no es 6.1.4', async () => {
    const model = {
      find: () => ({ exec: async () => [] }),
    } as unknown as Model<AccountabilityCommitmentDocument>;
    const provider = new FindingsReviewProvider(model);
    const result = await provider.getCompliance('64a0000000000000000000a3');
    assert.equal(result.module, 'findings-review'); // sigue existiendo para hallazgos
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('annual-audit'));
  });

  it('annual-audit provider conserva su módulo (6.1.2 intacto)', async () => {
    const model = {
      find: () => ({
        lean: () => ({ exec: async () => [] }),
      }),
    } as unknown as Model<AnnualAuditDocument>;
    const provider = new AnnualAuditComplianceProvider(model);
    const result = await provider.getCompliance('64a0000000000000000000a3');
    assert.equal(result.module, 'annual-audit');
    assert.equal(result.status, 'NO_DATA');
  });

  it('el analyzer oficial de 6.1.4 es copasst-audit-planning; el legacy ya no soporta 6.1.4 en el registro', () => {
    const official = new CopasstAuditPlanningStandardAnalyzer();
    const legacy = new FindingsReviewStandardAnalyzer();
    // El analyzer oficial soporta 6.1.4 con su módulo propio.
    assert.equal(official.supports('6.1.4'), true);
    assert.equal(official.getModule(), 'copasst-audit-planning');
    // La clase legacy se conserva (no se elimina físicamente) pero su registro
    // fue retirado del StandardAnalysisService (verificado a nivel de código
    // fuente por el test de abajo) y el engine nunca la resolverá para 6.1.4
    // porque el registro es FIRST-WINS y el oficial se registra en su lugar.
    assert.equal(legacy.getModule(), 'findings-review');
  });

  it('StandardAnalysisService no registra FindingsReviewStandardAnalyzer (código fuente)', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const source = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'src', 'modules', 'compliance-ai', 'standard-analysis', 'standard-analysis.service.ts'),
      'utf8',
    );
    assert.ok(
      source.includes('new CopasstAuditPlanningStandardAnalyzer()'),
      'el analyzer oficial de 6.1.4 debe estar registrado',
    );
    assert.ok(
      !source.includes('new FindingsReviewStandardAnalyzer()'),
      'el analyzer legacy findings-review NO debe estar registrado',
    );
  });

  // ── E4 (6.1.4) — cierre: residuos del wrong-mapping ─────────────────────

  it('E4: el título IA de 6.1.4 es el normativo del catálogo, NO "Revisión de hallazgos"', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const source = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'src', 'modules', 'compliance-ai', 'standard-analysis', 'standard-analysis.service.ts'),
      'utf8',
    );
    assert.ok(
      source.includes("'6.1.4': 'Planificación auditorías COPASST'"),
      'getStandardTitle debe resolver 6.1.4 al título normativo del catálogo',
    );
    assert.ok(
      !source.includes("'6.1.4': 'Revisión de hallazgos'"),
      'la etiqueta legacy del wrong-mapping NO debe persistir para 6.1.4',
    );
  });

  it('E4: findings-review provider ya no presenta 6.1.4 como su estándar (código fuente)', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const source = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'src', 'modules', 'compliance-engine', 'providers', 'findings-review.provider.ts'),
      'utf8',
    );
    assert.ok(
      !source.includes('Evaluación automática del estándar 6.1.4'),
      'el doc del provider legacy no debe declarar el estándar 6.1.4',
    );
    assert.ok(
      !source.includes('El estándar 6.1.4 requiere'),
      'los findings user-facing del provider legacy no deben citar el estándar 6.1.4',
    );
    assert.ok(
      source.includes("MODULE = 'findings-review'"),
      'el provider legacy conserva su módulo propio (evidencia, sin estándar canónico)',
    );
  });
});
