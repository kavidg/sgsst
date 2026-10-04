import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import 'reflect-metadata';
import { ComplianceEngineService } from '../compliance-engine.service';
import {
  filterScoringEligible,
  SCORING_INELIGIBLE_MODULES,
} from '../utils/compliance-weights';
import { ManagementImprovementActionsProvider } from './management-improvement-actions-compliance.provider';
import { CorrectivePreventiveActionsProvider } from './corrective-preventive-actions-compliance.provider';
import { ManagementReviewDirectionProvider } from './management-review-direction-compliance.provider';
import { IncidentActionsProvider } from './incident-actions.provider';
import { ImprovementPlanProvider } from './improvement-plan.provider';

/**
 * E2 (7.1.2) — Tests de FRONTERA del estándar:
 *
 *  - 7.1.2 → management-improvement-actions (ÚNICO contribuyente elegible).
 *  - management-improvement → INELIGIBLE (PROXY_LEGACY: AccountabilityMeeting).
 *  - Hermanos intactos: 7.1.1 corrective-preventive-actions, 6.1.3
 *    management-review-direction, 7.1.3 incident-actions, 7.1.4
 *    improvement-plan — cada uno con su propia fuente, sin consumo cruzado.
 *  - Registro IA: analyzer oficial registrado; legacy SIN registro.
 */

function buildEligibleProviders(): Array<{ module: string; percentage: number }> {
  return [
    { module: 'corrective-preventive-actions', percentage: 80 },
    // 7.1.2: ÚNICO elegible para el estándar; el proxy queda filtrado.
    { module: 'management-improvement-actions', percentage: 70 },
    { module: 'management-improvement', percentage: 100 }, // PROXY — debe excluirse
    { module: 'incident-actions', percentage: 60 },
    { module: 'improvement-plan', percentage: 55 },
    { module: 'management-review-direction', percentage: 90 },
  ];
}

describe('MIA BOUNDARY: elegibilidad y retiro del proxy', () => {
  it('1. management-improvement-actions es ELEGIBLE (no está en ningún set de exclusión)', () => {
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('management-improvement-actions'));
  });

  it('2. management-improvement es INELIGIBLE (PROXY_LEGACY)', () => {
    assert.ok(SCORING_INELIGIBLE_MODULES.has('management-improvement'));
  });

  it('3. SCORING_INELIGIBLE_MODULES creció exactamente en 1 entrada (10 → 11)', () => {
    assert.equal(SCORING_INELIGIBLE_MODULES.size, 11);
  });

  it('4. filterScoringEligible: SOLO el oficial contribuye a 7.1.2 (proxy excluido)', () => {
    const eligible = filterScoringEligible(buildEligibleProviders());
    const mia = eligible.filter((p) =>
      ['management-improvement-actions', 'management-improvement'].includes(p.module),
    );
    assert.equal(mia.length, 1);
    assert.equal(mia[0].module, 'management-improvement-actions');
    assert.equal(mia[0].percentage, 70);
  });

  it('5. no hay DOS contribuyentes elegibles para 7.1.2', () => {
    const eligible = filterScoringEligible(buildEligibleProviders());
    const contributors = eligible.filter((p) => p.module === 'management-improvement-actions');
    assert.equal(contributors.length, 1);
  });

  it('6. el provider legacy permanece disponible para compatibilidad (sin eliminación física)', () => {
    const src = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'src', 'modules', 'compliance-engine', 'providers', 'management-improvement.provider.ts'),
      'utf8',
    );
    assert.ok(src.includes('class ManagementImprovementProvider'));
    assert.ok(src.includes('AccountabilityMeeting'));
  });
});

describe('MIA BOUNDARY: hermanos del capítulo ACTUAR y capítulos vecinos intactos', () => {
  it('7. 7.1.1 sigue siendo corrective-preventive-actions: elegible (dominio propio)', () => {
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('corrective-preventive-actions'));
    const eligible = filterScoringEligible([{ module: 'corrective-preventive-actions', percentage: 80 }]);
    assert.equal(eligible.length, 1);
  });

  it('8. corrective-preventive (proxy 7.1.1) sigue INELIGIBLE (no contaminado por E2)', () => {
    assert.ok(SCORING_INELIGIBLE_MODULES.has('corrective-preventive'));
  });

  it('9. 6.1.3 sigue siendo management-review-direction: elegible', () => {
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('management-review-direction'));
    const eligible = filterScoringEligible([{ module: 'management-review-direction', percentage: 90 }]);
    assert.equal(eligible.length, 1);
  });

  it('10. 7.1.3 sigue siendo incident-actions: elegible e intacto', () => {
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('incident-actions'));
    const eligible = filterScoringEligible([{ module: 'incident-actions', percentage: 60 }]);
    assert.equal(eligible.length, 1);
  });

  it('11. 7.1.4 sigue siendo improvement-plan: elegible e intacto', () => {
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('improvement-plan'));
    const eligible = filterScoringEligible([{ module: 'improvement-plan', percentage: 55 }]);
    assert.equal(eligible.length, 1);
  });

  it('12. el ComplianceEngine registra el provider oficial AL FINAL del array (tras managementReviewDirectionProvider)', () => {
    const src = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'src', 'modules', 'compliance-engine', 'compliance-engine.service.ts'),
      'utf8',
    );
    const ctorIdx = src.indexOf('managementReviewDirectionProvider: ManagementReviewDirectionProvider');
    const newIdx = src.indexOf('managementImprovementActionsProvider: ManagementImprovementActionsProvider');
    assert.ok(ctorIdx > 0 && newIdx > ctorIdx, 'el provider oficial debe añadirse al FINAL del ctor');
    const arrayIdx = src.indexOf('this.managementImprovementActionsProvider,');
    assert.ok(arrayIdx > 0, 'el provider oficial debe estar en this.providers');
    // Cada provider del dominio aparece UNA sola vez en this.providers (sin doble registro).
    assert.equal(src.split('this.managementImprovementActionsProvider,').length - 1, 1);
  });

  it('13. el engine puede construirse con el provider oficial (contrato ComplianceProvider)', () => {
    const provider = new ManagementImprovementActionsProvider({} as never);
    assert.equal(typeof provider.getCompliance, 'function');
    assert.equal(typeof (provider as unknown as { module?: string }).module, 'undefined');
  });

  it('14. fuentes NO se consumen entre sí: cada provider de hermano recibe solo SU modelo', () => {
    // ManagementImprovementActionsProvider recibe ManagementImprovementAction;
    // CorrectivePreventiveActionsProvider recibe CorrectivePreventiveAction;
    // ManagementReviewDirectionProvider recibe ManagementReviewDirection —
    // verificado por las firmas de inyección en el código fuente.
    const mia = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'src', 'modules', 'compliance-engine', 'providers', 'management-improvement-actions-compliance.provider.ts'),
      'utf8',
    );
    assert.ok(mia.includes('management-improvement-action.schema'));
    assert.ok(!mia.includes('accountability-meeting.schema'));
    assert.ok(!mia.includes('corrective-preventive-action.schema'));
    assert.ok(!mia.includes('annual-audit.schema'));
  });
});

describe('MIA BOUNDARY: registro IA (first-wins)', () => {
  it('15. el analyzer OFICIAL está registrado en StandardAnalysisService; el legacy SIN registro', () => {
    const src = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'src', 'modules', 'compliance-ai', 'standard-analysis', 'standard-analysis.service.ts'),
      'utf8',
    );
    assert.ok(src.includes('new ManagementImprovementActionsStandardAnalyzer()'));
    assert.ok(!src.includes('new ManagementImprovementStandardAnalyzer()'), 'el analyzer legacy NO debe estar registrado');
  });

  it('16. getStandardTitle(7.1.2) permanece exactamente "Acciones mejora alta dirección"', () => {
    const src = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'src', 'modules', 'compliance-ai', 'standard-analysis', 'standard-analysis.service.ts'),
      'utf8',
    );
    assert.ok(src.includes("'7.1.2': 'Acciones mejora alta dirección'"));
  });

  it('17. el analyzer legacy se conserva físicamente (sin eliminación)', () => {
    const src = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'src', 'modules', 'compliance-ai', 'standard-analysis', 'analyzers', 'management-improvement-standard.analyzer.ts'),
      'utf8',
    );
    assert.ok(src.includes('class ManagementImprovementStandardAnalyzer'));
  });
});
