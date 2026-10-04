import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INCIDENT_713_EVALUABLE_TYPES,
  computeIncidentActionsScore,
  isOverdueInvestigationAction,
} from './incident-actions-scoring';

/**
 * E2 (7.1.3) — Tests del SCORER PURO de las acciones por accidentes
 * (función determinista con `now` inyectable).
 */

const NOW = new Date('2026-09-26T12:00:00.000Z');

function action(overrides: Record<string, unknown> = {}) {
  return {
    actionId: 'ACT-001',
    action: 'Instalar barandas',
    responsible: 'Ana',
    responsibleUserId: '507f1f77bcf86cd7994390aa',
    status: 'PENDING',
    dueDate: '2026-12-31',
    ...overrides,
  };
}

function incidentCase(overrides: Record<string, unknown> = {}) {
  return {
    _id: '507f1f77bcf86cd799439099',
    companyId: '507f1f77bcf86cd799439012',
    type: 'Accidente de trabajo',
    date: new Date('2026-06-15'),
    description: 'Caída en escalera',
    severity: 'Media',
    status: 'Abierto',
    investigationType: 'ACCIDENT',
    investigationDate: new Date('2026-06-16'),
    investigationResponsibleUserId: '507f1f77bcf86cd7994390aa',
    methodology: 'Ivanov',
    investigationTeam: [{ participantSnapshot: 'Ana' }],
    investigationStatus: 'CONCLUDED',
    immediateCauses: ['Superficie mojada'],
    basicCauses: ['Falta de señalización'],
    rootCauses: [],
    relatedFactors: ['Ergonomía'],
    conclusions: 'Reforzar señalización',
    recommendations: 'Capacitar',
    lifecycleStage: 'IN_PROGRESS',
    closureDate: undefined,
    evidence: [],
    investigationEvidence: [{ evidenceUrl: 'https://e.test/acta.pdf' }],
    correctiveActions: [],
    preventiveActions: [],
    ...overrides,
  };
}

describe('IA-SCORING: evaluabilidad y NO_DATA', () => {
  it('1. NO_DATA cuando no hay ningún caso evaluable (vacío)', () => {
    const r = computeIncidentActionsScore({ incidents: [], now: NOW });
    assert.equal(r.noData, true);
    assert.equal(r.noDataReason, 'no-evaluable-cases');
    assert.equal(r.percentage, 0);
    assert.equal(r.findings[0].id, 'incident-actions-no-data');
  });

  it('2. SOLO DISEASE → NO_DATA (exclusión completa de 3.2.2)', () => {
    const r = computeIncidentActionsScore({
      incidents: [incidentCase({ investigationType: 'DISEASE' }), incidentCase({ investigationType: 'DISEASE' })],
      now: NOW,
    });
    assert.equal(r.noData, true);
    assert.equal(r.noDataReason, 'no-evaluable-cases');
    assert.equal(r.counters.diseasesExcluded, 2);
    assert.equal(r.counters.evaluableIncidents, 0);
  });

  it('3. DISEASE excluido en case mix (NO_DATA imposible por DISEASE)', () => {
    const r = computeIncidentActionsScore({
      incidents: [
        incidentCase(),
        incidentCase({ _id: 'd1', investigationType: 'DISEASE', date: new Date('2026-07-01') }),
      ],
      now: NOW,
    });
    assert.equal(r.noData, false);
    assert.equal(r.counters.evaluableIncidents, 1);
    assert.equal(r.counters.diseasesExcluded, 1);
    // El caso DISEASE con fecha más reciente NO contamina evaluatedPeriod.
    assert.equal(r.evaluatedPeriod, '2026');
  });

  it('4. investigationType ausente = ACCIDENT (compatibilidad legacy E1)', () => {
    const r = computeIncidentActionsScore({
      incidents: [incidentCase({ investigationType: undefined })],
      now: NOW,
    });
    assert.equal(r.noData, false);
    assert.equal(r.counters.accidents, 1);
  });
});

describe('IA-SCORING: dimensiones', () => {
  it('5. accidente sin investigación → D1 baja + finding no-investigation', () => {
    const r = computeIncidentActionsScore({
      incidents: [
        incidentCase({
          investigationDate: undefined,
          investigationResponsibleUserId: undefined,
          responsible: undefined,
          lifecycleStage: 'OPEN',
        }),
      ],
      now: NOW,
    });
    assert.equal(r.dimensions.investigation.ratio, 0);
    assert.ok(r.findings.some((f) => f.id === 'incident-actions-no-investigation'));
  });

  it('6. investigación completa sin acciones → D3=0 + finding no-actions (NO es NO_DATA)', () => {
    const r = computeIncidentActionsScore({
      incidents: [incidentCase({ correctiveActions: [], preventiveActions: [] })],
      now: NOW,
    });
    assert.equal(r.noData, false);
    assert.equal(r.dimensions.actions.ratio, 0);
    assert.ok(r.findings.some((f) => f.id === 'incident-actions-no-actions'));
    assert.ok(r.percentage > 0 && r.percentage < 100);
  });

  it('7. acción sin responsable → finding actions-without-responsible y D3 parcial', () => {
    const r = computeIncidentActionsScore({
      incidents: [
        incidentCase({
          correctiveActions: [action({ responsible: undefined, responsibleUserId: undefined })],
        }),
      ],
      now: NOW,
    });
    assert.ok(r.findings.some((f) => f.id === 'incident-actions-actions-without-responsible'));
    assert.ok(r.dimensions.actions.ratio !== null && r.dimensions.actions.ratio < 1);
  });

  it('8. acciones vencidas → counter overdue + finding overdue (OVERDUE derivado, no persistido)', () => {
    const r = computeIncidentActionsScore({
      incidents: [
        incidentCase({
          correctiveActions: [action({ dueDate: '2026-01-01', status: 'PENDING' })],
        }),
      ],
      now: NOW,
    });
    assert.equal(r.counters.overdueActions, 1);
    assert.ok(r.findings.some((f) => f.id === 'incident-actions-overdue'));
  });

  it('9. acciones completadas → subchecks de ejecución suben (ratio 1 sin vencidas)', () => {
    const r = computeIncidentActionsScore({
      incidents: [
        incidentCase({
          correctiveActions: [action({ status: 'COMPLETED', completedDate: '2026-07-01', followUp: { followUpDate: '2026-07-02', implementationStatus: 'IMPLEMENTED', perceivedEffectiveness: 'EFECTIVA' } })],
        }),
      ],
      now: NOW,
    });
    assert.equal(r.counters.completedActions, 1);
    assert.equal(r.counters.overdueActions, 0);
    assert.equal(r.dimensions.execution.ratio, 1);
  });

  it('10. evidencia y cierre completos → D5 subchecks completos', () => {
    const r = computeIncidentActionsScore({
      incidents: [
        incidentCase({
          closureDate: new Date('2026-08-01'),
          closedByUserId: '507f1f77bcf86cd7994390aa',
          correctiveActions: [action({ status: 'COMPLETED', completedDate: '2026-07-01', evidence: { evidenceUrl: 'https://e.test/soporte.pdf' } })],
        }),
      ],
      now: NOW,
    });
    assert.equal(r.dimensions.evidence.ratio, 1);
    assert.equal(r.counters.casesClosed, 1);
  });

  it('11. múltiples casos: promedios por caso auditable', () => {
    const complete = incidentCase();
    const incomplete = incidentCase({
      _id: 'c2',
      investigationDate: undefined,
      investigationResponsibleUserId: undefined,
      immediateCauses: [],
      basicCauses: [],
      relatedFactors: [],
      conclusions: undefined,
      recommendations: undefined,
      correctiveActions: [],
      preventiveActions: [],
    });
    const r = computeIncidentActionsScore({ incidents: [complete, incomplete], now: NOW });
    assert.equal(r.dimensions.investigation.ratio, 0.5);
    assert.equal(r.dimensions.causalAnalysis.ratio, 0.5);
    assert.equal(r.counters.evaluableIncidents, 2);
  });

  it('12. determinismo: mismo input + mismo now = mismo resultado', () => {
    const input = {
      incidents: [incidentCase(), incidentCase({ _id: 'c2', preventiveActions: [action({ actionId: 'ACT-002' })] })],
      now: NOW,
    };
    const a = computeIncidentActionsScore(input);
    const b = computeIncidentActionsScore(input);
    assert.deepEqual(a, b);
  });

  it('13. redistribución: dimensiones con datos no se penalizan por dimensiones nulas', () => {
    // El caso tiene investigación pero SIN acciones y SIN evidencia:
    // solo D1/D2 activas (Ejecución/Evidencia siguen activas por diseño, pero
    // verificamos que el score no genere 100% artificial).
    const r = computeIncidentActionsScore({
      incidents: [incidentCase({ correctiveActions: [], preventiveActions: [], investigationEvidence: [] })],
      now: NOW,
    });
    assert.ok(r.percentage >= 0 && r.percentage <= 100);
    assert.ok(r.percentage < 100);
  });

  it('14. isOverdueInvestigationAction: regla oficial dueDate < now && !terminal', () => {
    assert.equal(isOverdueInvestigationAction({ dueDate: '2026-01-01', status: 'PENDING' }, NOW), true);
    assert.equal(isOverdueInvestigationAction({ dueDate: '2026-01-01', status: 'COMPLETED', completedDate: '2026-02-01' }, NOW), false);
    assert.equal(isOverdueInvestigationAction({ dueDate: '2026-01-01', status: 'CANCELLED' }, NOW), false);
    assert.equal(isOverdueInvestigationAction({ dueDate: '2999-01-01', status: 'PENDING' }, NOW), false);
  });

  it('15. casos legacy mínimos (solo fecha/descripción) no rompen el scorer', () => {
    const r = computeIncidentActionsScore({
      incidents: [
        incidentCase({
          immediateCauses: undefined,
          basicCauses: undefined,
          rootCauses: undefined,
          relatedFactors: undefined,
          conclusions: undefined,
          recommendations: undefined,
          methodology: undefined,
          investigationTeam: undefined,
          investigationStatus: undefined,
          investigationResponsibleUserId: undefined,
          investigationEvidence: undefined,
          lifecycleStage: undefined,
          correctiveActions: undefined,
          preventiveActions: undefined,
        }),
      ],
      now: NOW,
    });
    assert.equal(r.counters.evaluableIncidents, 1);
    assert.ok(r.findings.length > 0);
  });
});
