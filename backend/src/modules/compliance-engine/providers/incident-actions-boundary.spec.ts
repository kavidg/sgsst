import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  SCORING_EXCLUDED_MODULES,
  SCORING_INELIGIBLE_MODULES,
  filterScoringEligible,
} from '../utils/compliance-weights';
import { Model, Types } from 'mongoose';
import { IncidentActionsProvider } from './incident-actions-compliance.provider';
import { IncidentsProvider } from './incidents.provider';
import { IncidentActionsStandardAnalyzer } from '../../compliance-ai/standard-analysis/analyzers/incident-actions-standard.analyzer';
import { CorrectivePreventiveActionsStandardAnalyzer } from '../../compliance-ai/standard-analysis/analyzers/corrective-preventive-actions-standard.analyzer';
import { ManagementImprovementActionsStandardAnalyzer } from '../../compliance-ai/standard-analysis/analyzers/management-improvement-actions-standard.analyzer';
import { ImprovementPlanStandardAnalyzer } from '../../compliance-ai/standard-analysis/analyzers/improvement-plan-standard.analyzer';
import type { IncidentDocument } from '../../incidents/schemas/incident.schema';

/**
 * E2 (7.1.3) — Tests de frontera del reemplazo in-place del provider proxy.
 *
 * Demuestra:
 *  - 7.1.3 = incident-actions (ÚNICA fuente de scoring; el proxy existencial
 *    fue REEMPLAZADO en el mismo archivo/módulo, no coexiste).
 *  - 3.2.1 sigue siendo 'incidents' (frontera intra-dominio: registro de
 *    accidentalidad vs. cadena documental 7.1.3).
 *  - 7.1.1 = corrective-preventive-actions y 7.1.2 = management-improvement-
 *    actions NO consumen acciones de accidentes (y viceversa).
 *  - 7.1.4 = improvement-plan permanece independiente.
 *  - El registro IA resuelve 7.1.3 al analyzer oficial (first-wins).
 *  - Aislamiento tenant: el provider nunca mezcla incidentes entre empresas.
 */

const COMPANY_A = new Types.ObjectId();
const COMPANY_B = new Types.ObjectId();

describe('IA713-BOUNDARY: retiro del proxy existencial de 7.1.3', () => {
  it('incident-actions es ELEGIBLE para el scoring (provider oficial, reemplazo in-place)', () => {
    assert.ok(!SCORING_EXCLUDED_MODULES.has('incident-actions'));
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('incident-actions'));
    const eligible = filterScoringEligible([
      { module: 'incident-actions', percentage: 85, status: 'TARGET_NOT_MET' as const },
    ]);
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].module, 'incident-actions');
  });

  it('NO hay doble scoring en 7.1.3: un solo provider con module incident-actions', () => {
    // El proxy de FASE 20 era ESTE MISMO provider (mismo archivo/módulo),
    // reemplazado in-place: no puede coexistir una segunda implementación.
    const eligible = filterScoringEligible([
      { module: 'incident-actions', percentage: 85, status: 'TARGET_NOT_MET' as const },
      { module: 'incident-actions', percentage: 90, status: 'TARGET_MET' as const },
    ]);
    // Aunque llegara duplicado (hipotético), el engine agrega por módulo:
    // demostramos que filterScoringEligible no introduce terceros módulos.
    assert.ok(eligible.every((e) => e.module === 'incident-actions'));
  });

  it('los sets de exclusión NO cambian con E2 (11 ineligible / 3 excluded)', () => {
    assert.equal(SCORING_INELIGIBLE_MODULES.size, 11);
    assert.equal(SCORING_EXCLUDED_MODULES.size, 3);
    for (const mod of SCORING_INELIGIBLE_MODULES) {
      assert.ok(!SCORING_EXCLUDED_MODULES.has(mod));
    }
  });

  it('3.2.1 sigue siendo incidents: incidents-provider conserva su módulo propio', async () => {
    const service = { findAll: async () => [] };
    const provider = new IncidentsProvider(service as never);
    const result = await provider.getCompliance(COMPANY_A.toString());
    assert.equal(result.module, 'incidents');
    // 'incidents' sigue elegible (no se excluye con E2).
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('incidents'));
    assert.ok(!SCORING_EXCLUDED_MODULES.has('incidents'));
  });

  it('7.1.1/7.1.2/7.1.4 mantienen sus módulos y la frontera con 7.1.3', () => {
    assert.equal(new CorrectivePreventiveActionsStandardAnalyzer().getModule(), 'corrective-preventive-actions');
    assert.equal(new ManagementImprovementActionsStandardAnalyzer().getModule(), 'management-improvement-actions');
    assert.equal(new ImprovementPlanStandardAnalyzer().getModule(), 'improvement-plan');
    assert.equal(new IncidentActionsStandardAnalyzer().getModule(), 'incident-actions');
    // El scorer de 7.1.3 NO puntúa corrective-preventive (7.1.1) ni
    // management-improvement-actions (7.1.2) ni improvement-plan (7.1.4).
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('corrective-preventive-actions'));
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('management-improvement-actions'));
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('improvement-plan'));
  });

  it('el analyzer oficial de 7.1.3 soporta SOLO 7.1.3 (sin colisión de registro)', () => {
    const analyzer = new IncidentActionsStandardAnalyzer();
    assert.equal(analyzer.supports('7.1.3'), true);
    assert.equal(analyzer.supports('3.2.1'), false);
    assert.equal(analyzer.supports('7.1.1'), false);
    assert.equal(analyzer.supports('7.1.2'), false);
    assert.equal(analyzer.supports('7.1.4'), false);
  });

  it('StandardAnalysisService registra el analyzer oficial de 7.1.3 (código fuente)', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const source = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'src', 'modules', 'compliance-ai', 'standard-analysis', 'standard-analysis.service.ts'),
      'utf8',
    );
    assert.ok(
      source.includes('new IncidentActionsStandardAnalyzer()'),
      'el analyzer oficial de 7.1.3 debe estar registrado',
    );
  });

  it('el provider oficial usa el scorer puro y NO el cálculo proxy (código fuente)', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const providerSource = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'src', 'modules', 'compliance-engine', 'providers', 'incident-actions-compliance.provider.ts'),
      'utf8',
    );
    assert.ok(providerSource.includes('computeIncidentActionsScore'), 'debe delegar en el scorer puro');
    assert.ok(!providerSource.includes("status === 'Completado'"), 'sin estado fantasma Completado');
    // rootCause singular NO puede reaparecer en el cálculo oficial y los
    // dominios legacy no pueden importarse (los comentarios JSDoc se toleran:
    // documentan la frontera; el código no los referencia).
    const codeLines = providerSource
      .split('\n')
      .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//') && !l.trim().startsWith('/*'));
    const code = codeLines.join('\n');
    assert.ok(!code.includes('rootCause'), 'sin campo fantasma rootCause en código');
    assert.ok(!code.includes('CorrectivePreventiveAction'), 'sin dominio 7.1.1');
    assert.ok(!code.includes('AccountabilityMeeting'), 'sin dominios legacy');
  });

  it('tenant isolation: empresa A no puede ver score de empresa B (nunca mezcla incidentes)', async () => {
    const docsA = [
      {
        _id: 'inc-a1',
        companyId: COMPANY_A,
        type: 'Accidente A',
        date: new Date('2026-06-15'),
        investigationType: 'ACCIDENT',
        investigationDate: new Date('2026-06-16'),
        investigationResponsibleUserId: 'u1',
      },
    ];
    const model = {
      find(query: Record<string, unknown>) {
        const filtered = docsA.filter((d) => String(d.companyId) === String(query.companyId));
        return {
          lean: () => ({ exec: async () => filtered }),
        };
      },
    } as unknown as Model<IncidentDocument>;
    const provider = new IncidentActionsProvider(model);
    const resultB = await provider.getCompliance(COMPANY_B.toString());
    assert.equal(resultB.status, 'NO_DATA');
    const metaB = resultB.metadata as { counters?: { totalIncidents: number } };
    assert.equal(metaB.counters?.totalIncidents, 0);

    const resultA = await provider.getCompliance(COMPANY_A.toString());
    const metaA = resultA.metadata as { counters?: { totalIncidents: number } };
    assert.equal(metaA.counters?.totalIncidents, 1);
    assert.ok(resultA.findings.every((f) => f.module === 'incident-actions'));
  });
});
