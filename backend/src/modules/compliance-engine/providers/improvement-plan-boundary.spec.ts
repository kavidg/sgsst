import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import 'reflect-metadata';
import {
  filterScoringEligible,
  SCORING_EXCLUDED_MODULES,
  SCORING_INELIGIBLE_MODULES,
} from '../utils/compliance-weights';
import { ImprovementPlanProvider } from './improvement-plan.provider';
import { CorrectivePreventiveActionsProvider } from './corrective-preventive-actions-compliance.provider';
import { ManagementImprovementActionsProvider } from './management-improvement-actions-compliance.provider';
import { IncidentActionsProvider } from './incident-actions.provider';
import { AnnualAuditComplianceProvider } from './annual-audit-compliance.provider';
import { ManagementReviewDirectionProvider } from './management-review-direction-compliance.provider';
import { CopasstAuditPlanningProvider } from './copasst-audit-planning-compliance.provider';
import { ProgramsProvider } from './programs.provider';
import { Model } from 'mongoose';

/** Tipo genérico mínimo para stubs de constructor (patrón de los specs hermanos). */
type AnyModel = Model<any>;

/**
 * E2 (7.1.4) — Tests de FRONTERA del estándar Plan de mejoramiento:
 *
 *  - 7.1.4 → improvement-plan: ÚNICO contribuyente elegible (reemplazo
 *    in-place del proxy; NO está en ineligible — eso bloquearía al oficial).
 *  - Hermanos intactos: 7.1.1 corrective-preventive-actions, 7.1.2
 *    management-improvement-actions, 7.1.3 incident-actions, 6.1.2
 *    annual-audit, 6.1.3 management-review-direction, 6.1.4
 *    copasst-audit-planning, programs (SgstProgram) independiente.
 *  - El provider oficial consulta SOLO ImprovementPlan (source-check sin
 *    comentarios): sin SgstProgram/ProgramActivity ni dominios de 7.1.1/
 *    7.1.2/7.1.3/6.1.x.
 *  - Herencia del estándar: ImprovementPlan extiende la clase padre con la
 *    jerarquía de documentos correcta.
 */

function readSource(relative: string): string {
  // dist-test/modules/compliance-engine/providers → backend/src (4 niveles).
  return readFileSync(
    join(__dirname, '../../../../src/modules/compliance-engine/providers', relative),
    'utf8',
  );
}

function sourceWithoutComments(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

// ── Única contribución a 7.1.4 ──────────────────────────────────────────────

describe('IP714-BOUNDARY — Única contribución a 7.1.4', () => {
  it('improvement-plan es elegible: NO está en ineligible/excluded (el oficial NO debe bloquearse)', () => {
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('improvement-plan'));
    assert.ok(!SCORING_EXCLUDED_MODULES.has('improvement-plan'));
  });

  it('el oficial sobrevive filterScoringEligible y aporta a ACTUAR', () => {
    const eligible = filterScoringEligible([
      { module: 'improvement-plan', percentage: 70 },
      { module: 'corrective-preventive', percentage: 100 }, // legacy ineligible
      { module: 'management-improvement', percentage: 100 }, // legacy ineligible
    ]);
    const modules = eligible.map((e) => e.module);
    assert.ok(modules.includes('improvement-plan'));
    assert.ok(!modules.includes('corrective-preventive'));
    assert.ok(!modules.includes('management-improvement'));
  });

  it('no existe doble scoring: el proxy ejecutable fue reemplazado in-place (source-check)', () => {
    const providerSource = sourceWithoutComments(readSource('improvement-plan.provider.ts'));
    // El provider oficial NO instancia ni referencia el modelo del proxy.
    assert.ok(!providerSource.includes('SgstProgram'));
    assert.ok(!providerSource.includes('ProgramActivity'));
    assert.ok(!providerSource.includes('Accountability'));
    assert.ok(!providerSource.includes('Incident'));
    assert.ok(!providerSource.includes('AnnualAudit'));
    assert.ok(!providerSource.includes('ManagementReviewDirection'));
    assert.ok(!providerSource.includes('CorrectivePreventiveAction'));
    assert.ok(!providerSource.includes('ManagementImprovementAction'));
    // Y consume el scorer puro oficial.
    assert.ok(providerSource.includes('computeImprovementPlanScore'));
  });

  it('el scorer puro no consulta dominios de otros estándares (source-check)', () => {
    const scoringSource = sourceWithoutComments(readSource('improvement-plan-scoring.ts'));
    assert.ok(!scoringSource.includes('SgstProgram'));
    assert.ok(!scoringSource.includes('Accountability'));
    assert.ok(!scoringSource.includes('CorrectivePreventiveAction'));
    assert.ok(!scoringSource.includes('ManagementImprovementAction'));
    assert.ok(!/annualAudit|AnnualAudit/.test(scoringSource));
    assert.ok(!/incident|Incident/.test(scoringSource));
    assert.ok(!/managementReview|ManagementReview/.test(scoringSource));
    // No hay acceso a Mongo ni a Nest en el scorer.
    assert.ok(!scoringSource.includes('@nestjs'));
    assert.ok(!scoringSource.includes('mongoose'));
  });
});

// ── Hermanos intactos ───────────────────────────────────────────────────────

describe('IP714-BOUNDARY — Hermanos intactos', () => {
  it('7.1.1 sigue siendo corrective-preventive-actions (elegible, CorrectivePreventiveAction)', () => {
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('corrective-preventive-actions'));
    assert.ok(!SCORING_EXCLUDED_MODULES.has('corrective-preventive-actions'));
    const p = new CorrectivePreventiveActionsProvider({} as AnyModel);
    void p;
  });

  it('7.1.2 sigue siendo management-improvement-actions (elegible, ManagementImprovementAction)', () => {
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('management-improvement-actions'));
    assert.ok(!SCORING_EXCLUDED_MODULES.has('management-improvement-actions'));
    const p = new ManagementImprovementActionsProvider({} as AnyModel);
    void p;
  });

  it('7.1.3 sigue siendo incident-actions (elegible, Incident)', () => {
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('incident-actions'));
    assert.ok(!SCORING_EXCLUDED_MODULES.has('incident-actions'));
    const p = new IncidentActionsProvider({} as AnyModel);
    void p;
  });

  it('6.1.2/6.1.3/6.1.4 mantienen sus fuentes oficiales', () => {
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('annual-audit'));
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('management-review-direction'));
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('copasst-audit-planning'));
    const audit = new AnnualAuditComplianceProvider({} as AnyModel);
    void audit;
    const review = new ManagementReviewDirectionProvider({} as AnyModel);
    void review;
    const copasst = new CopasstAuditPlanningProvider({} as AnyModel);
    void copasst;
  });

  it('programs (SgstProgram) permanece independiente: NO es fuente de 7.1.4', () => {
    const p = new ProgramsProvider({} as never);
    void p;
    const providerSource = sourceWithoutComments(readSource('improvement-plan.provider.ts'));
    assert.ok(!providerSource.includes('SgstProgram'));
  });
});

// ── Herencia del estándar ───────────────────────────────────────────────────

describe('IP714-BOUNDARY — Herencia del estándar', () => {
  it('ImprovementPlan extiende la clase padre correcta (no SgstProgram)', () => {
    const schemaSource = readFileSync(
      join(__dirname, '../../../../src/modules/improvement-plans/schemas/improvement-plan.schema.ts'),
      'utf8',
    );
    assert.ok(schemaSource.includes("collection: 'improvementplans'"));
    assert.ok(!schemaSource.includes('extends SgstProgram'));
  });

  it('el provider 7.1.4 mantiene module improvement-plan y semantic EXACT', async () => {
    const model = {
      find: () => ({
        lean: () => ({ exec: async () => [] }),
      }),
    };
    const p = new ImprovementPlanProvider(model as unknown as AnyModel);
    const r = await p.getCompliance('507f1f77bcf86cd799439011');
    assert.equal(r.module, 'improvement-plan');
    assert.equal((r.metadata as any).semantic, 'EXACT');
  });
});
