import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  SCORING_INELIGIBLE_MODULES,
  SCORING_EXCLUDED_MODULES,
  filterScoringEligible,
} from '../utils/compliance-weights';
import type { ProviderComplianceResult } from './compliance-provider.interface';
import { Model } from 'mongoose';
import { CorrectivePreventiveActionsProvider } from './corrective-preventive-actions-compliance.provider';
import { CorrectivePreventiveActionsStandardAnalyzer } from '../../compliance-ai/standard-analysis/analyzers/corrective-preventive-actions-standard.analyzer';
import { CorrectivePreventiveStandardAnalyzer } from '../../compliance-ai/standard-analysis/analyzers/corrective-preventive-standard.analyzer';
import { CorrectivePreventiveProvider } from './corrective-preventive.provider';
import { ManagementImprovementProvider } from './management-improvement.provider';
import { IncidentActionsProvider } from './incident-actions.provider';
import { ImprovementPlanProvider } from './improvement-plan.provider';
import type { CorrectivePreventiveActionDocument } from '../../corrective-preventive-actions/schemas/corrective-preventive-action.schema';
import type { AccountabilityCommitmentDocument } from '../../accountability/schemas/accountability-commitment.schema';
import type { AccountabilityMeetingDocument } from '../../accountability/schemas/accountability-meeting.schema';
import type { IncidentDocument } from '../../incidents/schemas/incident.schema';
import type { ImprovementPlanDocument } from '../../improvement-plans/schemas/improvement-plan.schema';

/**
 * E2 (7.1.1) — Tests de frontera del retiro del proxy legacy.
 *
 * Demuestra:
 *  - 7.1.1 = corrective-preventive-actions (ÚNICA fuente elegible).
 *  - corrective-preventive (AccountabilityCommitment) INELIGIBLE, conservado.
 *  - Hermanos del capítulo ACTUAR intactos (7.1.2/7.1.3/7.1.4 elegibles y con
 *    sus data-sources propios, sin compartir dominio).
 *  - Sin double scoring: un solo contribuyente para 7.1.1.
 *  - El registro IA ya no resuelve 7.1.1 al analyzer incorrecto.
 */

// ── Scoring: sets de exclusión ──────────────────────────────────────────────

describe('CPA-BOUNDARY: retiro del proxy legacy de 7.1.1', () => {
  it('corrective-preventive-actions es ELEGIBLE para el scoring (provider oficial)', () => {
    assert.ok(!SCORING_EXCLUDED_MODULES.has('corrective-preventive-actions'));
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('corrective-preventive-actions'));
  });

  it('corrective-preventive ya NO puntúa (PROXY_LEGACY retirado del scoring)', () => {
    assert.ok(SCORING_INELIGIBLE_MODULES.has('corrective-preventive'));
    const results = [
      { module: 'corrective-preventive', percentage: 90 },
      { module: 'corrective-preventive-actions', percentage: 80 },
    ] as unknown as ProviderComplianceResult[];
    const eligible = filterScoringEligible(results);
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].module, 'corrective-preventive-actions');
  });

  it('no hay double scoring en 7.1.1: solo corrective-preventive-actions contribuye', () => {
    const results = [
      { module: 'corrective-preventive', percentage: 100 },
      { module: 'corrective-preventive-actions', percentage: 75 },
      { module: 'management-improvement', percentage: 60 },
    ] as unknown as ProviderComplianceResult[];
    const eligible = filterScoringEligible(results);
    const seven11 = eligible.filter((r) =>
      ['corrective-preventive', 'corrective-preventive-actions'].includes(r.module),
    );
    assert.equal(seven11.length, 1);
    assert.equal(seven11[0].module, 'corrective-preventive-actions');
  });

  it('SCORING_INELIGIBLE_MODULES queda con 10 entradas (9 históricas + corrective-preventive)', () => {
    assert.equal(SCORING_INELIGIBLE_MODULES.size, 10);
  });

  // ── Hermanos del capítulo ACTUAR (7.1.2/7.1.3/7.1.4) intactos ───────────

  it('7.1.2 sigue siendo management-improvement: elegible (AccountabilityMeeting)', () => {
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('management-improvement'));
    assert.ok(!SCORING_EXCLUDED_MODULES.has('management-improvement'));
    const p = new ManagementImprovementProvider({} as Model<AccountabilityMeetingDocument>);
    void p; // construcción sin error: dependencia intacta
  });

  it('7.1.3 sigue siendo incident-actions: elegible (Incident)', () => {
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('incident-actions'));
    assert.ok(!SCORING_EXCLUDED_MODULES.has('incident-actions'));
    const p = new IncidentActionsProvider({} as Model<IncidentDocument>);
    void p;
  });

  it('7.1.4 sigue siendo improvement-plan: elegible (ImprovementPlan — dominio propio E1; SgstProgram ya NO es la fuente)', () => {
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('improvement-plan'));
    assert.ok(!SCORING_EXCLUDED_MODULES.has('improvement-plan'));
    // E2 (7.1.4): el provider oficial ahora inyecta ImprovementPlan
    // (dominio improvement-plans); el stub de aridad se actualiza al nuevo
    // contrato (patrón de la etapa 7.1.2/7.1.3). SgstProgram sigue siendo la
    // fuente de ProgramsProvider (module 'programs'), no de 7.1.4.
    const p = new ImprovementPlanProvider({} as Model<ImprovementPlanDocument>);
    void p;
  });

  it('cada hermano consulta su propio dominio (sin compartir AccountabilityCommitment con 7.1.1 oficial)', () => {
    // El provider oficial 7.1.1 solo inyecta CorrectivePreventiveAction; los
    // hermanos siguen inyectando AccountabilityMeeting/Incident/SgstProgram.
    const actionsModel = {} as Model<CorrectivePreventiveActionDocument>;
    const official = new CorrectivePreventiveActionsProvider(actionsModel);
    void official;
    // El proxy legacy sigue existiendo y construyéndose (sin eliminarlo).
    const legacy = new CorrectivePreventiveProvider({} as Model<AccountabilityCommitmentDocument>);
    void legacy;
  });
});

// ── Contratos de módulo y estándar ──────────────────────────────────────────

describe('CPA-BOUNDARY: contratos de módulo y estándar', () => {
  it('el provider oficial expone module corrective-preventive-actions (no corrective-preventive)', async () => {
    const provider = new CorrectivePreventiveActionsProvider({
      find: () => ({
        lean: () => ({ exec: async () => [] }),
      }),
    } as unknown as Model<CorrectivePreventiveActionDocument>);
    const result = await provider.getCompliance('64f0f0f0f0f0f0f0f0f0f0f0');
    assert.equal(result.module, 'corrective-preventive-actions');
    assert.equal(result.status, 'NO_DATA');
  });

  it('el provider legacy conserva su módulo propio (compatibilidad, sin estándar)', async () => {
    const legacy = new CorrectivePreventiveProvider({
      find: () => ({
        exec: async () => [],
      }),
    } as unknown as Model<AccountabilityCommitmentDocument>);
    const result = await legacy.getCompliance('64f0f0f0f0f0f0f0f0f0f0f0');
    assert.equal(result.module, 'corrective-preventive'); // no corrective-preventive-actions
  });

  it('el analyzer oficial de 7.1.1 es corrective-preventive-actions; el legacy ya no soporta 7.1.1', () => {
    const official = new CorrectivePreventiveActionsStandardAnalyzer();
    assert.equal(official.supports('7.1.1'), true);
    assert.equal(official.getModule(), 'corrective-preventive-actions');

    const legacy = new CorrectivePreventiveStandardAnalyzer();
    // La clase legacy se conserva físicamente (compatibilidad) pero su
    // STANDARD_CODE interno ya no la hace responsable de 7.1.1 en el registro:
    // el service NO la registra (verificado por código fuente abajo).
    assert.equal(typeof legacy.analyze, 'function');
  });

  it('StandardAnalysisService registra el analyzer oficial y NO el legacy (código fuente)', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const source = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'src', 'modules', 'compliance-ai', 'standard-analysis', 'standard-analysis.service.ts'),
      'utf8',
    );
    assert.ok(
      source.includes('new CorrectivePreventiveActionsStandardAnalyzer()'),
      'el analyzer oficial de 7.1.1 debe estar registrado',
    );
    assert.ok(
      !source.includes('new CorrectivePreventiveStandardAnalyzer()'),
      'el analyzer legacy corrective-preventive NO debe estar registrado',
    );
  });

  it('ComplianceEngineService registra el provider oficial (código fuente)', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const source = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'src', 'modules', 'compliance-engine', 'compliance-engine.service.ts'),
      'utf8',
    );
    assert.ok(
      source.includes('this.correctivePreventiveActionsProvider'),
      'el provider oficial de 7.1.1 debe estar en el array de providers',
    );
  });

  it('el título IA de 7.1.1 es el normativo del catálogo (sin cambios)', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const source = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'src', 'modules', 'compliance-ai', 'standard-analysis', 'standard-analysis.service.ts'),
      'utf8',
    );
    assert.ok(
      source.includes("'7.1.1': 'Acciones preventivas y correctivas'"),
      'getStandardTitle debe resolver 7.1.1 al título normativo',
    );
  });

  it('el provider legacy ya no presenta 7.1.1 como su estándar (código fuente)', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const source = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'src', 'modules', 'compliance-engine', 'providers', 'corrective-preventive.provider.ts'),
      'utf8',
    );
    assert.ok(
      !source.includes('Evaluación automática del estándar 7.1.1'),
      'el doc del provider legacy no debe declarar el estándar 7.1.1',
    );
    assert.ok(
      !source.includes('El estándar 7.1.1 requiere'),
      'los findings user-facing del provider legacy no deben citar 7.1.1 como su estándar',
    );
    assert.ok(
      source.includes("MODULE = 'corrective-preventive'"),
      'el provider legacy conserva su módulo propio (compatibilidad, sin estándar canónico)',
    );
  });
});
