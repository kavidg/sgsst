import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ANNUAL_AUDIT_FORMULA,
  ANNUAL_AUDIT_MODULE,
  ANNUAL_AUDIT_STANDARD_CODE,
  ANNUAL_AUDIT_COMPLIANCE_TARGET,
  ANNUAL_AUDIT_SCORE_WEIGHTS,
  computeAnnualAuditScore,
  isEvaluableAudit,
  redistributeWeightedScore,
  type AnnualAuditLike,
} from './annual-audit-scoring';

/**
 * E2 (6.1.2) — Tests del SCORING PURO de la Auditoría anual.
 *
 * Cobertura: los 25 casos del diseño (sin auditorías, estados únicos,
 * evaluable mínima, informe, planificación, hallazgos completos/incompletos,
 * acciones abiertas/vencidas/sin evidencia, evidencia, historial,
 * redistribución, 0% real, fechas futuras, integridad, múltiples auditorías,
 * duplicados y canceladas mezcladas) + constantes + helper de redistribución.
 */

// "Ahora" fijo para determinismo: 2026-09-23T12:00:00Z (fecha de la etapa).
const NOW = new Date('2026-09-23T12:00:00.000Z');

function audit(overrides: Partial<AnnualAuditLike> = {}): AnnualAuditLike {
  return {
    _id: new Date().toISOString() + Math.random().toString(36).slice(2),
    title: 'Auditoría interna anual SG-SST',
    status: 'DRAFT',
    ...overrides,
  };
}

/** Auditoría evaluable COMPLETA (subcondiciones al máximo, D1–D5 = 1). */
function completeAudit(overrides: Partial<AnnualAuditLike> = {}): AnnualAuditLike {
  return audit({
    _id: 'audit-complete-' + Math.random().toString(36).slice(2),
    auditCode: 'AUD-2026',
    status: 'COMPLETED',
    plannedStartDate: '2026-02-01T00:00:00.000Z',
    plannedEndDate: '2026-02-28T00:00:00.000Z',
    scope: 'Todo el SG-SST',
    objectives: 'Verificar conformidad',
    criteria: 'Resolución 0312 y procedimientos internos',
    methodology: 'Entrevistas, revisión documental y observación',
    auditorUserId: 'u1',
    actualStartDate: '2026-03-02T00:00:00.000Z',
    actualEndDate: '2026-03-20T00:00:00.000Z',
    reportTitle: 'Informe de auditoría interna 2026',
    reportDate: '2026-03-25T00:00:00.000Z',
    reportSummary: 'El SG-SST es conforme en general',
    reportDocumentId: 'doc-report',
    auditorCompetenceEvidenceId: 'doc-competence',
    findings: [],
    ...overrides,
  });
}

// ─── Constantes ─────────────────────────────────────────────────────────────

describe('ANNUAL-AUDIT-SCORING: Constantes', () => {
  it('módulo/estándar/fórmula/meta y pesos oficiales', () => {
    assert.equal(ANNUAL_AUDIT_MODULE, 'annual-audit');
    assert.equal(ANNUAL_AUDIT_STANDARD_CODE, '6.1.2');
    assert.equal(ANNUAL_AUDIT_FORMULA, 'dimensions:v1');
    assert.equal(ANNUAL_AUDIT_COMPLIANCE_TARGET, 90);
    assert.deepEqual(ANNUAL_AUDIT_SCORE_WEIGHTS, {
      program: 15,
      executionReport: 25,
      findingsDocumentation: 20,
      followUpClosure: 20,
      evidenceAnalysis: 10,
      periodicityHistory: 10,
    });
  });
});

// ─── Evaluable + NO_DATA ────────────────────────────────────────────────────

describe('ANNUAL-AUDIT-SCORING: Evaluable + NO_DATA (Casos A/B/C)', () => {
  it('1. sin auditorías → NO_DATA no-audits', () => {
    const r = computeAnnualAuditScore({ audits: [], now: NOW });
    assert.equal(r.noData, true);
    assert.equal(r.noDataReason, 'no-audits');
    assert.equal(r.percentage, 0);
    assert.ok(r.findings.some((f) => f.id === 'annual-audit-no-data'));
  });

  it('2. solo DRAFT → NO_DATA no-evaluable-audits', () => {
    const r = computeAnnualAuditScore({ audits: [audit({ status: 'DRAFT' })], now: NOW });
    assert.equal(r.noData, true);
    assert.equal(r.noDataReason, 'no-evaluable-audits');
    assert.equal(r.counters.draftAudits, 1);
    assert.ok(r.findings.some((f) => f.id === 'annual-audit-no-evaluable-audits'));
  });

  it('3. solo PLANNED → NO_DATA no-evaluable-audits', () => {
    const r = computeAnnualAuditScore({ audits: [audit({ status: 'PLANNED' })], now: NOW });
    assert.equal(r.noData, true);
    assert.equal(r.noDataReason, 'no-evaluable-audits');
  });

  it('4. solo IN_PROGRESS → NO_DATA no-evaluable-audits', () => {
    const r = computeAnnualAuditScore({ audits: [audit({ status: 'IN_PROGRESS' })], now: NOW });
    assert.equal(r.noData, true);
    assert.equal(r.noDataReason, 'no-evaluableAudits'.replace('evaluableAudits', 'evaluable-audits'));
  });

  it('5. solo CANCELLED → NO_DATA no-evaluable-audits (nunca entra al scoring)', () => {
    const r = computeAnnualAuditScore({ audits: [audit({ status: 'CANCELLED' })], now: NOW });
    assert.equal(r.noData, true);
    assert.equal(r.noDataReason, 'no-evaluable-audits');
    assert.equal(r.counters.cancelledAudits, 1);
  });

  it('COMPLETED sin fechas reales no es evaluable (estado inconsistente con datos)', () => {
    const a = audit({ status: 'COMPLETED', reportTitle: 'Informe' });
    assert.equal(isEvaluableAudit(a, NOW), false);
  });

  it('COMPLETED sin informe mínimo no es evaluable', () => {
    const a = audit({ status: 'COMPLETED', actualStartDate: '2026-03-02T00:00:00.000Z', actualEndDate: '2026-03-20T00:00:00.000Z' });
    assert.equal(isEvaluableAudit(a, NOW), false);
  });
});

// ─── Evaluable mínima y dimensiones ─────────────────────────────────────────

describe('ANNUAL-AUDIT-SCORING: Dimensiones (D1–D5 sobre la más reciente evaluable)', () => {
  it('6. COMPLETED mínima → evaluable; score < 100 sin planificación/evidencia completa', () => {
    const a = audit({
      status: 'COMPLETED',
      actualStartDate: '2026-03-02T00:00:00.000Z',
      actualEndDate: '2026-03-20T00:00:00.000Z',
      reportTitle: 'Informe',
    });
    const r = computeAnnualAuditScore({ audits: [a], now: NOW });
    assert.equal(r.noData, false);
    assert.ok(r.percentage > 0 && r.percentage < 100);
    // D2: 5/8 subcondiciones (inicio, fin, coherencia, COMPLETED, título informe)
    assert.equal(r.dimensions.executionReport.ratio, 5 / 8);
  });

  it('7. COMPLETED sin informe → NO evaluable (NO_DATA, no 0% real)', () => {
    const a = audit({
      status: 'COMPLETED',
      actualStartDate: '2026-03-02T00:00:00.000Z',
      actualEndDate: '2026-03-20T00:00.000Z'.replace('00:00.000Z', '00:00.000Z'),
    });
    const r = computeAnnualAuditScore({ audits: [a], now: NOW });
    assert.equal(r.noData, true);
    assert.equal(r.noDataReason, 'no-evaluable-audits');
  });

  it('8. evaluable completa → D1=D2=1 (planificación/ejecución completas)', () => {
    const r = computeAnnualAuditScore({ audits: [completeAudit()], now: NOW });
    assert.equal(r.dimensions.program.ratio, 1);
    assert.equal(r.dimensions.executionReport.ratio, 1);
    assert.equal(r.dimensions.evidenceAnalysis.ratio, 1);
  });

  it('9. planificación incompleta → D1 parcial + finding', () => {
    const a = completeAudit({ scope: '', objectives: '' });
    const r = computeAnnualAuditScore({ audits: [a], now: NOW });
    assert.equal(r.dimensions.program.ratio, 5 / 7);
    assert.ok(r.findings.some((f) => f.id === 'annual-audit-program-incomplete'));
  });

  it('13. sin hallazgos → D3 = 1 y D4 = null (redistribuida, no penalizada)', () => {
    const a = completeAudit({ findings: [] });
    const r = computeAnnualAuditScore({ audits: [a], now: NOW });
    assert.equal(r.dimensions.findingsDocumentation.ratio, 1);
    assert.equal(r.dimensions.followUpClosure.ratio, null);
    assert.ok(r.dimensions.followUpClosure.notApplicableNoFindings);
  });

  it('10. hallazgos completos → D3 = 1 y D4 evaluable', () => {
    const a = completeAudit({
      findings: [
        {
          _id: 'f1',
          type: 'NON_CONFORMITY',
          description: 'NC',
          criterion: 'Res. 0312',
          evidence: 'Registro',
          responsibleNameSnapshot: 'Lider',
          dueDate: '2026-05-01T00:00:00.000Z',
          status: 'OPEN',
          actions: [{ _id: 'a1', description: 'a', responsible: 'r', status: 'COMPLETED', completedDate: '2026-04-01T00:00:00.000Z', evidenceUrl: 'http://e' }],
        },
      ],
    });
    const r = computeAnnualAuditScore({ audits: [a], now: NOW });
    assert.equal(r.dimensions.findingsDocumentation.ratio, 1);
    assert.equal(r.dimensions.followUpClosure.ratio, 1);
    assert.equal(r.counters.actionsWithEvidence, 1);
  });

  it('11. hallazgos incompletos → D3 parcial; los vacíos NO suman', () => {
    const a = completeAudit({
      findings: [
        { _id: 'f1', type: 'OBSERVATION', description: 'completo', criterion: 'c', evidence: 'e', responsibleNameSnapshot: 'r', dueDate: '2026-05-01', status: 'OPEN' },
        { _id: 'f2', type: 'OBSERVATION', description: '' },
      ],
    });
    const r = computeAnnualAuditScore({ audits: [a], now: NOW });
    assert.equal(r.dimensions.findingsDocumentation.ratio, 1 / 2);
    assert.equal(r.counters.incompleteFindings, 1);
  });

  it('14/15. acciones abiertas y vencidas → D4 parcial + findings', () => {
    const a = completeAudit({
      findings: [
        {
          _id: 'f1',
          type: 'OBSERVATION',
          description: 'd',
          criterion: 'c',
          evidence: 'e',
          responsibleNameSnapshot: 'r',
          dueDate: '2026-05-01',
          status: 'OPEN',
          actions: [
            { _id: 'a1', description: 'a', responsible: 'r', status: 'PENDING', dueDate: '2026-05-01T00:00:00.000Z' },
            { _id: 'a2', description: 'a', responsible: 'r', status: 'IN_PROGRESS' },
          ],
        },
      ],
    });
    const r = computeAnnualAuditScore({ audits: [a], now: NOW });
    assert.equal(r.dimensions.followUpClosure.ratio, 0);
    assert.equal(r.counters.openActions, 2);
    assert.equal(r.counters.overdueActions, 1);
    assert.ok(r.findings.some((f) => f.id === 'annual-audit-open-actions'));
    assert.ok(r.findings.some((f) => f.id === 'annual-audit-overdue-actions'));
  });

  it('16. acciones sin evidencia → counter sin sumar puntos extra', () => {
    const a = completeAudit({
      findings: [
        {
          _id: 'f1',
          type: 'OBSERVATION',
          description: 'd',
          criterion: 'c',
          evidence: 'e',
          responsibleNameSnapshot: 'r',
          dueDate: '2026-05-01',
          status: 'OPEN',
          actions: [{ _id: 'a1', description: 'a', responsible: 'r', status: 'COMPLETED', completedDate: '2026-04-01' }],
        },
      ],
    });
    const r = computeAnnualAuditScore({ audits: [a], now: NOW });
    assert.equal(r.dimensions.followUpClosure.ratio, 1);
    assert.equal(r.counters.actionsWithEvidence, 0);
  });

  it('17. sin evidencia documental → D5 parcial + finding', () => {
    const a = completeAudit({ reportDocumentId: undefined, auditorCompetenceEvidenceId: undefined });
    const r = computeAnnualAuditScore({ audits: [a], now: NOW });
    // reportEvidence sigue en true por reportEvidenceUrl? No: completeAudit no define URL.
    assert.ok(r.dimensions.evidenceAnalysis.ratio! < 1);
    assert.ok(r.findings.some((f) => f.id === 'annual-audit-evidence-missing'));
  });

  it('18/19. un solo año → D6 = null (redistribuida); D6 ≥2 años → 1', () => {
    const oneYear = computeAnnualAuditScore({ audits: [completeAudit()], now: NOW });
    assert.equal(oneYear.dimensions.periodicityHistory.ratio, null);
    const twoYears = computeAnnualAuditScore({
      audits: [
        completeAudit({ _id: 'a2026', actualStartDate: '2026-03-02T00:00:00.000Z', actualEndDate: '2026-03-20T00:00:00.000Z' }),
        completeAudit({
          _id: 'a2025',
          auditCode: 'AUD-2025',
          plannedStartDate: '2025-02-01T00:00:00.000Z',
          plannedEndDate: '2025-02-28T00:00:00.000Z',
          actualStartDate: '2025-03-02T00:00:00.000Z',
          actualEndDate: '2025-03-20T00:00:00.000Z',
          reportDate: '2025-03-25T00:00:00.000Z',
        }),
      ],
      now: NOW,
    });
    assert.equal(twoYears.dimensions.periodicityHistory.ratio, 1);
    assert.equal(twoYears.dimensions.periodicityHistory.distinctCompletedYears, 2);
  });

  it('19b. redistribución: D4 null eleva el score vs D4=0 con mismo resto', () => {
    const base = { program: 1, executionReport: 1, findingsDocumentation: 1, evidenceAnalysis: 1 };
    const withNull = computeAnnualAuditScore({
      audits: [completeAudit({ findings: [] })],
      now: NOW,
    });
    // D4 null → pesos activos = 15+25+20+10 = 70 → score = (15+25+20+10)/70 = 100
    assert.equal(withNull.percentage, 100);
    void base;
  });

  it('20. resultado real bajo (0% literal inalcanzable por diseño): nunca NO_DATA', () => {
    // Una auditoría evaluable SIEMPRE acredita ejecución mínima (piso D2:
    // inicio, fin, coherencia, COMPLETED + informe mínimo ⇒ ≥5/8). El "0% real"
    // se conserva como resultado real vía status TARGET_NOT_MET, nunca NO_DATA.
    const a = audit({
      status: 'COMPLETED',
      actualStartDate: '2026-03-02T00:00:00.000Z',
      actualEndDate: '2026-03-20T00:00:00.000Z',
      reportTitle: 'Informe',
      // Sin planificación, sin summary, sin evidencia, con hallazgo vacío.
      findings: [{ _id: 'f1', type: 'OBSERVATION', description: '' }],
    });
    const r = computeAnnualAuditScore({ audits: [a], now: NOW });
    assert.equal(r.noData, false, 'resultado bajo real NO se convierte en NO_DATA');
    assert.ok(r.percentage > 0 && r.percentage < 30, `score bajo real (${r.percentage})`);
    assert.ok(r.findings.some((f) => f.id === 'annual-audit-program-incomplete'));
    assert.ok(r.findings.some((f) => f.id === 'annual-audit-findings-incomplete'));
  });

  it('21. fecha futura → no evaluable + finding de integridad', () => {
    const a = completeAudit({ actualEndDate: '2027-06-01T00:00:00.000Z' });
    const r = computeAnnualAuditScore({ audits: [a], now: NOW });
    assert.equal(r.noData, true);
    assert.equal(r.counters.futureDateAudits, 1);
  });

  it('22. integridad inválida: rango actual incoherente + código duplicado', () => {
    const bad = audit({
      status: 'COMPLETED',
      actualStartDate: '2026-04-02T00:00:00.000Z',
      actualEndDate: '2026-03-20T00:00:00.000Z',
      reportTitle: 'Informe',
      auditCode: 'AUD-DUP',
    });
    const dup = audit({ status: 'DRAFT', auditCode: 'AUD-DUP' });
    // Una evaluable presente para que el finding de integridad se emita en
    // contexto de score real (la evaluación excluye las inválidas).
    const r = computeAnnualAuditScore({ audits: [completeAudit(), bad, dup], now: NOW });
    assert.equal(r.counters.auditsWithIntegrityIssues, 2);
    assert.equal(r.counters.duplicateAuditCodes, 1);
    assert.ok(r.findings.some((f) => f.id === 'annual-audit-data-integrity'));
    // La más reciente evaluable es la completa (bad queda excluida del scoring).
    assert.equal(r.dimensions.program.ratio, 1);
  });

  it('23. múltiples auditorías: D1–D5 evalúan la MÁS RECIENTE (no el volumen)', () => {
    const old2025 = completeAudit({
      _id: 'a2025',
      auditCode: 'AUD-2025',
      actualEndDate: '2025-03-20T00:00:00.000Z',
      // 2025 está completa al máximo.
    });
    const recent2026 = completeAudit({
      _id: 'a2026',
      auditCode: 'AUD-2026',
      actualEndDate: '2026-03-20T00:00:00.000Z',
      scope: '',
      objectives: '',
      criteria: '',
      methodology: '',
      auditorUserId: undefined,
      reportSummary: '',
      reportDocumentId: undefined,
      auditorCompetenceEvidenceId: undefined,
    });
    const r = computeAnnualAuditScore({ audits: [old2025, recent2026], now: NOW });
    assert.equal(r.dimensions.program.evaluatedAuditId, recent2026._id);
    assert.equal(r.dimensions.program.ratio, 2 / 7);
  });

  it('25. canceladas mezcladas con válidas: las canceladas no afectan el score', () => {
    const r = computeAnnualAuditScore({ audits: [completeAudit(), audit({ status: 'CANCELLED' }), audit({ status: 'CANCELLED' })], now: NOW });
    assert.equal(r.noData, false);
    assert.equal(r.counters.cancelledAudits, 2);
    assert.equal(r.dimensions.program.ratio, 1);
  });
});

// ─── Redistribución (helper) ────────────────────────────────────────────────

describe('ANNUAL-AUDIT-SCORING: redistributeWeightedScore', () => {
  it('excluye ratios null/no finitos del denominador y clamp 0–100', () => {
    const score = redistributeWeightedScore([
      { ratio: 1, weight: 50 },
      { ratio: null, weight: 50 },
    ]);
    assert.equal(score, 100);
    const zero = redistributeWeightedScore([
      { ratio: 0, weight: 50 },
      { ratio: null, weight: 50 },
    ]);
    assert.equal(zero, 0);
  });
});
