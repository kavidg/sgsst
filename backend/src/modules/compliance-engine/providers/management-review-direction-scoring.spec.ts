import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MANAGEMENT_REVIEW_DIRECTION_SCORE_WEIGHTS,
  computeManagementReviewDirectionScore,
  isActionableDecision,
  isDecisionOverdue,
  isEvaluableReview,
  isValidReviewedInput,
  redistributeWeightedScore,
  type ManagementReviewDirectionLike,
} from './management-review-direction-scoring';

/**
 * E2 (6.1.3) — Tests del scoring PURO (sin Mongo/NestJS; fixtures pequeñas).
 * Cubre los 28 casos del diseño: NO_DATA (colección vacía / no evaluables),
 * dimensiones D1–D6, evaluabilidad, overdue dinámico, redistribución, clamp,
 * metadata serializable y findings deterministas.
 */

const NOW = new Date('2026-09-24T12:00:00.000Z');
const ID = '5f1a2b3c4d5e6f7a8b9c0d01';

function buildReview(overrides: Partial<ManagementReviewDirectionLike> = {}): ManagementReviewDirectionLike {
  return {
    _id: ID,
    reviewCode: 'MRD-2026-01',
    title: 'Revisión por la dirección 2026',
    reviewType: 'ORDINARY',
    plannedDate: '2026-03-01',
    location: 'Sala de juntas',
    scope: 'SG-SST completo',
    objectives: 'Evaluar desempeño y definir mejoras',
    responsibleUserId: '5f1a2b3c4d5e6f7a8b9c0d02',
    responsibleNameSnapshot: 'Gerente General',
    participants: [
      { nameSnapshot: 'Gerente', attendance: 'ATTENDED' },
      { nameSnapshot: 'Líder SST', attendance: 'ATTENDED' },
    ],
    actualStartDate: '2026-03-05',
    actualEndDate: '2026-03-05',
    status: 'COMPLETED',
    inputs: [
      { type: 'AUDIT_RESULTS', title: 'Auditoría anual', description: 'Resultados', status: 'REVIEWED' },
      { type: 'INDICATOR_RESULTS', title: 'Indicadores', description: 'Trimestre', status: 'REVIEWED' },
      { type: 'PHVA_COMPLIANCE', title: 'PHVA', description: 'Cumplimiento', status: 'REVIEWED' },
      { type: 'OBJECTIVES', title: 'Objetivos', description: 'Avance', status: 'REVIEWED' },
    ],
    analysis: {
      summary: 'El SG-SST muestra avance sostenido',
      strengths: ['Cumplimiento de capacitaciones'],
      gaps: ['Retraso en inspecciones'],
      priorities: ['Cerrar hallazgos de auditoría'],
      managementObservations: 'Se destinarán recursos adicionales',
    },
    decisions: [
      {
        description: 'Ampliar presupuesto de EPP',
        category: 'RESOURCE',
        status: 'COMPLETED',
        responsibleNameSnapshot: 'Gerente',
        dueDate: '2026-04-30',
      },
      {
        description: 'Plan de mejora de inspecciones',
        category: 'IMPROVEMENT',
        status: 'PENDING',
        responsibleNameSnapshot: 'Líder SST',
        dueDate: '2026-12-31',
      },
    ],
    minutesDocumentId: '5f1a2b3c4d5e6f7a8b9c0d03',
    ...overrides,
  };
}

function evaluate(reviews: ManagementReviewDirectionLike[], now: Date = NOW) {
  return computeManagementReviewDirectionScore({ reviews, now });
}

// ─── NO_DATA ────────────────────────────────────────────────────────────────

describe('MRD-SCORING: NO_DATA', () => {
  it('1. colección vacía → NO_DATA (no-reviews), percentage 0, finding no-data', () => {
    const b = evaluate([]);
    assert.equal(b.noData, true);
    assert.equal(b.noDataReason, 'no-reviews');
    assert.equal(b.percentage, 0);
    assert.ok(b.findings.some((f) => f.id === 'management-review-direction-no-data'));
  });

  it('2. revisiones no evaluables (DRAFT/PLANNED/CANCELLED/IN_PROGRESS) → NO_DATA (no-evaluable-reviews)', () => {
    const b = evaluate([
      buildReview({ status: 'DRAFT' }),
      buildReview({ _id: 'x2', status: 'PLANNED' }),
      buildReview({ _id: 'x3', status: 'IN_PROGRESS' }),
      buildReview({ _id: 'x4', status: 'CANCELLED' }),
    ]);
    assert.equal(b.noData, true);
    assert.equal(b.noDataReason, 'no-evaluable-reviews');
    assert.equal(b.percentage, 0);
    assert.ok(b.findings.some((f) => f.id === 'management-review-direction-no-evaluable-reviews'));
  });

  it('25. score bajo real ≠ NO_DATA: revisión evaluable pero casi vacía → 0% real', () => {
    // Evaluable por definición (COMPLETED + fechas + acta + 1 decisión) pero
    // con planificación/inputs/analysis mínimos → score > 0 pero bajo, y
    // NUNCA NO_DATA.
    const b = evaluate([
      buildReview({
        inputs: [],
        analysis: {},
        decisions: [
          {
            description: 'd',
            category: 'OTHER',
            status: 'PENDING',
            responsibleNameSnapshot: 'r',
            dueDate: '2026-04-01',
          },
        ],
      }),
    ]);
    assert.equal(b.noData, false);
    assert.equal(b.noDataReason, null);
    assert.ok(b.percentage > 0);
    assert.ok(b.percentage < 100);
  });
});

// ─── Evaluabilidad (ítem 5) ─────────────────────────────────────────────────

describe('MRD-SCORING: Evaluabilidad', () => {
  it('19. fechas futuras → NO evaluable (y contador de integridad)', () => {
    const future = buildReview({
      actualStartDate: '2027-01-10',
      actualEndDate: '2027-01-10',
    });
    assert.equal(isEvaluableReview(future, NOW), false);
    const b = evaluate([future]);
    assert.equal(b.noData, true);
    assert.equal(b.counters.futureDateReviews, 1);
  });

  it('20. revisión cancelada → nunca evaluable ni puntúa', () => {
    const b = evaluate([buildReview({ status: 'CANCELLED' })]);
    assert.equal(b.noData, true);
    assert.equal(b.counters.reviewsCancelled, 1);
  });

  it('21. revisión planificada pero no ejecutada → NO evaluable', () => {
    const b = evaluate([buildReview({ status: 'PLANNED' })]);
    assert.equal(b.noData, true);
    assert.equal(b.counters.reviewsPlanned, 1);
  });

  it('evaluable exige acta/evidencia formal y contenido mínimo', () => {
    const sinActa = buildReview({ minutesDocumentId: undefined, minutesEvidenceUrl: undefined, reportTitle: undefined });
    assert.equal(isEvaluableReview(sinActa, NOW), false);
    const sinContenido = buildReview({ analysis: {}, decisions: [] });
    assert.equal(isEvaluableReview(sinContenido, NOW), false);
  });
});

// ─── D1 — Planificación ─────────────────────────────────────────────────────

describe('MRD-SCORING: D1 planificación (15%)', () => {
  it('3. revisión completa de alta calidad → D1 = 1', () => {
    const b = evaluate([buildReview()]);
    assert.equal(b.dimensions.planning.ratio, 1);
  });

  it('4. planificación incompleta (sin objetivos, sin alcance, sin responsable) → ratio parcial', () => {
    const b = evaluate([
      buildReview({
        scope: undefined,
        objectives: undefined,
        responsibleUserId: undefined,
        responsibleNameSnapshot: undefined,
      }),
    ]);
    // 3 de 6 subcondiciones (título, tipo, plannedDate).
    assert.equal(b.dimensions.planning.numerator, 3);
    assert.equal(b.dimensions.planning.denominator, 6);
    assert.ok(b.findings.some((f) => f.id === 'management-review-direction-planning-incomplete'));
  });

  it('reviewType inválido no suma (solo ORDINARY/EXTRAORDINARY)', () => {
    const b = evaluate([buildReview({ reviewType: 'MENSUAL' })]);
    assert.equal(b.dimensions.planning.numerator, 5);
  });
});

// ─── D2 — Entradas ──────────────────────────────────────────────────────────

describe('MRD-SCORING: D2 entradas (20%)', () => {
  it('5. inputs inexistentes → subchecks 0/3 y finding inputs-incomplete', () => {
    const b = evaluate([buildReview({ inputs: [] })]);
    assert.equal(b.dimensions.inputs.ratio, 0);
    assert.ok(b.findings.some((f) => f.id === 'management-review-direction-inputs-incomplete'));
  });

  it('6. inputs no revisados → 0% en D2 (recibidas ≠ revisadas)', () => {
    const b = evaluate([
      buildReview({
        inputs: buildReview().inputs?.map((i) => ({ ...i, status: 'PENDING' })),
      }),
    ]);
    assert.equal(b.dimensions.inputs.ratio, 0);
    assert.equal(b.counters.inputsReviewed, 0);
  });

  it('7. inputs revisados correctamente con cobertura de tipos → D2 = 1', () => {
    const b = evaluate([buildReview()]);
    assert.equal(b.dimensions.inputs.ratio, 1);
    const sc = b.dimensions.inputs.subchecks as { satisfied: number; total: number };
    assert.equal(sc.satisfied, 3);
  });

  it('8 entradas vacías (sin description) no dan 100%: valid reviewed < revisadas', () => {
    const emptyish = Array.from({ length: 8 }, (_, i) => ({
      type: 'OTHER',
      title: `E${i}`,
      status: 'REVIEWED',
    }));
    const b = evaluate([buildReview({ inputs: emptyish })]);
    assert.equal(b.counters.inputsValidReviewed, 0);
    assert.equal(b.dimensions.inputs.ratio, 0);
  });

  it('8. cobertura de tipos < 3 → subcheck (b) falla aunque haya entradas válidas', () => {
    const b = evaluate([
      buildReview({
        inputs: [
          { type: 'AUDIT_RESULTS', title: 'A', description: 'd', status: 'REVIEWED' },
          { type: 'OTHER', title: 'B', description: 'd', status: 'REVIEWED' },
        ],
      }),
    ]);
    const sc = b.dimensions.inputs.subchecks as { satisfied: number; total: number };
    // (a) hay válidas ✓, (b) cobertura 2 < 3 ✗, (c) mayoría válida ✓ → 2/3.
    assert.equal(sc.satisfied, 2);
    // typesReviewed = tipos con ≥1 entrada válida revisada: AUDIT_RESULTS + OTHER → 2.
    assert.equal((b.dimensions.inputs.typesReviewed as string[]).length, 2);
  });

  it('tipo fuera del enum oficial NO es entrada válida', () => {
    assert.equal(isValidReviewedInput({ type: 'HACKER', title: 't', description: 'd', status: 'REVIEWED' }), false);
    assert.equal(isValidReviewedInput({ type: 'AUDIT_RESULTS', title: 't', status: 'REVIEWED' }), false);
    assert.equal(
      isValidReviewedInput({ type: 'AUDIT_RESULTS', title: 't', description: 'd', status: 'REVIEWED' }),
      true,
    );
  });
});

// ─── D3 — Análisis ──────────────────────────────────────────────────────────

describe('MRD-SCORING: D3 análisis (20%)', () => {
  it('8. análisis vacío → 0/5', () => {
    const b = evaluate([buildReview({ analysis: {} })]);
    assert.equal(b.dimensions.analysis.ratio, 0);
  });

  it('9. análisis parcial → ratio 2/5 (summary + strengths, sin gaps/priorities/observaciones)', () => {
    const b = evaluate([
      buildReview({
        analysis: {
          summary: 'Resumen',
          strengths: ['F1'],
          gaps: [],
          priorities: [],
          managementObservations: undefined,
        },
      }),
    ]);
    assert.equal(b.dimensions.analysis.numerator, 2);
    assert.equal(b.dimensions.analysis.denominator, 5);
  });

  it('10. análisis completo → 5/5', () => {
    const b = evaluate([buildReview()]);
    assert.equal(b.dimensions.analysis.ratio, 1);
  });

  it('arrays con solo strings vacíos no cuentan como contenido', () => {
    const b = evaluate([
      buildReview({
        analysis: {
          summary: undefined,
          strengths: ['   '],
          gaps: [''],
          priorities: [],
          managementObservations: undefined,
        },
      }),
    ]);
    assert.equal(b.dimensions.analysis.numerator, 0);
  });
});

// ─── D4 — Decisiones ────────────────────────────────────────────────────────

describe('MRD-SCORING: D4 decisiones (20%)', () => {
  it('11. sin decisiones → ratio 0 (brecha real, NO redistribuida)', () => {
    const b = evaluate([buildReview({ decisions: [] })]);
    assert.equal(b.dimensions.decisions.ratio, 0);
    assert.equal(b.dimensions.decisions.notApplicableNoDecisions, false);
    assert.ok(b.findings.some((f) => f.id === 'management-review-direction-decisions-incomplete'));
  });

  it('12. decisiones incompletas (sin responsable/fecha) → calidad < 1', () => {
    const b = evaluate([
      buildReview({
        decisions: [
          { description: 'd1', category: 'OTHER', status: 'PENDING' },
          {
            description: 'd2',
            category: 'OTHER',
            status: 'PENDING',
            responsibleNameSnapshot: 'r',
            dueDate: '2026-04-01',
          },
        ],
      }),
    ]);
    assert.equal(b.dimensions.decisions.actionableDecisions, 1);
    assert.ok((b.dimensions.decisions.ratio as number) < 1);
  });

  it('13. decisiones completadas y accionables → ratio 1', () => {
    const b = evaluate([
      buildReview({
        decisions: [
          {
            description: 'd1',
            category: 'RESOURCE',
            status: 'COMPLETED',
            responsibleNameSnapshot: 'r',
            dueDate: '2026-04-01',
          },
        ],
      }),
    ]);
    assert.equal(b.dimensions.decisions.ratio, 1);
  });

  it('14. decisiones overdue se derivan dinámicamente (sin OVERDUE persistente)', () => {
    const overdue = {
      description: 'd',
      category: 'OTHER',
      status: 'IN_PROGRESS',
      responsibleNameSnapshot: 'r',
      dueDate: '2026-01-01', // pasado respecto a NOW
    };
    const b = evaluate([buildReview({ decisions: [overdue] })]);
    assert.equal(b.counters.decisionsOverdue, 1);
    assert.ok(b.findings.some((f) => f.id === 'management-review-direction-overdue-decisions'));
    // Cancelada vencida NO cuenta (estado terminal).
    const b2 = evaluate([
      buildReview({
        decisions: [
          { ...overdue, status: 'CANCELLED' },
          {
            description: 'x',
            category: 'OTHER',
            status: 'PENDING',
            responsibleNameSnapshot: 'r',
            dueDate: '2026-01-01',
          },
        ],
      }),
    ]);
    assert.equal(b2.counters.decisionsOverdue, 1);
    // Overdue es derivado, no un status válido del DTO/dominio.
    assert.equal(isDecisionOverdue({ status: 'OVERDUE', dueDate: '2020-01-01' }, NOW), true);
  });

  it('isActionableDecision exige descripción, categoría, responsable y fecha', () => {
    assert.equal(isActionableDecision({ description: 'd', category: 'OTHER' }), false);
    assert.equal(
      isActionableDecision({ description: 'd', category: 'OTHER', responsibleNameSnapshot: 'r', dueDate: '2026-01-01' }),
      true,
    );
  });
});

// ─── D5 — Evidencia ─────────────────────────────────────────────────────────

describe('MRD-SCORING: D5 evidencia (15%)', () => {
  it('15. evidencia ausente: sin acta/informe NO es evaluable → NO_DATA (definición de evaluable)', () => {
    const b = evaluate([
      buildReview({
        minutesDocumentId: undefined,
        minutesEvidenceUrl: undefined,
        reportTitle: undefined,
      }),
    ]);
    assert.equal(b.noData, true);
    assert.equal(b.noDataReason, 'no-evaluable-reviews');
  });

  it('15b. evidencia parcial (acta por título, sin participantes) → evaluable con finding', () => {
    const b = evaluate([
      buildReview({
        minutesDocumentId: undefined,
        minutesEvidenceUrl: undefined,
        reportTitle: 'Acta de revisión 2026',
        participants: [],
      }),
    ]);
    // acta (reportTitle) ✓ + análisis documentado ✓ = 2 de 4.
    assert.equal(b.dimensions.evidence.numerator, 2);
    assert.ok(b.findings.some((f) => f.id === 'management-review-direction-evidence-incomplete'));
  });

  it('16. evidencia presente → D5 = 1 (documento y URL no duplican)', () => {
    const b = evaluate([
      buildReview({
        minutesDocumentId: 'doc1',
        minutesEvidenceUrl: 'https://empresa.com/acta.pdf',
      }),
    ]);
    assert.equal(b.dimensions.evidence.ratio, 1);
  });
});

// ─── D6 — Cierre/periodicidad/historial ─────────────────────────────────────

describe('MRD-SCORING: D6 cierre/periodicidad/historial (10%)', () => {
  it('17. participantes ausentes → fallan subchecks de participantes/asistencia en D5 (acta y análisis sí suman)', () => {
    const b = evaluate([buildReview({ participants: [] })]);
    // acta ✓, participantes ✗, asistencia ✗, análisis ✓ → 2 de 4.
    assert.equal(b.dimensions.evidence.numerator, 2);
  });

  it('18. historial insuficiente (un solo año) → D6 null y finding history-incomplete', () => {
    const b = evaluate([buildReview()]);
    assert.equal(b.dimensions.closureHistory.ratio, null);
    assert.ok(b.findings.some((f) => f.id === 'management-review-direction-history-incomplete'));
  });

  it('22. varias revisiones históricas (2 años) → D6 = 1 (continuidad, no volumen)', () => {
    const b = evaluate([
      buildReview(),
      buildReview({
        _id: 'x2',
        reviewCode: 'MRD-2025-01',
        actualStartDate: '2025-03-05',
        actualEndDate: '2025-03-05',
      }),
      // 2 revisiones del MISMO año 2026 no añaden nada a D6:
      buildReview({
        _id: 'x3',
        reviewCode: 'MRD-2026-02',
        actualStartDate: '2026-06-05',
        actualEndDate: '2026-06-05',
      }),
    ]);
    assert.equal(b.dimensions.closureHistory.ratio, 1);
    assert.equal(b.dimensions.closureHistory.distinctCompletedYears, 2);
  });
});

// ─── Cálculo global ─────────────────────────────────────────────────────────

describe('MRD-SCORING: cálculo global', () => {
  it('23-24. combinación de dimensiones aplicables/no aplicables y redistribución', () => {
    // Con 2 años evaluables, D6 = 1 (aplicable). Quitar plannedDate/location
    // no anula dimensiones: todas tienen latest → todas aplicables. Para
    // probar redistribución real usamos un tenant con 1 solo año: D6 = null
    // y su 10% se redistribuye entre las demás.
    const oneYear = evaluate([buildReview()]);
    assert.equal(oneYear.dimensions.closureHistory.ratio, null);
    const manual = redistributeWeightedScore([
      { ratio: oneYear.dimensions.planning.ratio, weight: 15 },
      { ratio: oneYear.dimensions.inputs.ratio, weight: 20 },
      { ratio: oneYear.dimensions.analysis.ratio, weight: 20 },
      { ratio: oneYear.dimensions.decisions.ratio, weight: 20 },
      { ratio: oneYear.dimensions.evidence.ratio, weight: 15 },
      { ratio: null, weight: 10 },
    ]);
    assert.equal(oneYear.percentage, manual);
    assert.ok(oneYear.percentage > 0);
  });

  it('redistributeWeightedScore: determinista, clamp 0–100, descarta ratios inválidos', () => {
    assert.equal(redistributeWeightedScore([{ ratio: 1, weight: 50 }, { ratio: null, weight: 50 }]), 100);
    assert.equal(redistributeWeightedScore([{ ratio: 0.5, weight: 40 }, { ratio: null, weight: 60 }]), 50);
    assert.equal(redistributeWeightedScore([{ ratio: null, weight: 100 }]), 0);
    assert.equal(redistributeWeightedScore([{ ratio: 2, weight: 100 }]), 0);
    assert.equal(redistributeWeightedScore([{ ratio: -1, weight: 100 }]), 0);
  });

  it('26. clamp 0–100: ningún input artificial produce >100 o <0', () => {
    const b = evaluate([buildReview()]);
    assert.ok(b.percentage >= 0 && b.percentage <= 100);
    const empty = evaluate([buildReview({ inputs: [], analysis: {}, decisions: [] })]);
    assert.ok(empty.percentage >= 0 && empty.percentage <= 100);
  });
});

// ─── Metadata y determinismo ────────────────────────────────────────────────

describe('MRD-SCORING: metadata y determinismo', () => {
  it('27. metadata serializable: JSON.stringify sin pérdida, sin funciones ni círculos', () => {
    const b = evaluate([buildReview()]);
    const roundtrip = JSON.parse(JSON.stringify({ percentage: b.percentage, dimensions: b.dimensions, counters: b.counters, latestReview: b.latestReview, findings: b.findings }));
    assert.equal(roundtrip.percentage, b.percentage);
    assert.equal(Object.keys(roundtrip.dimensions).length, 6);
    for (const key of ['planning', 'inputs', 'analysis', 'decisions', 'evidence', 'closureHistory']) {
      const d = roundtrip.dimensions[key];
      assert.equal(typeof d.weight, 'number');
      assert.ok('ratio' in d);
      assert.ok('numerator' in d && 'denominator' in d);
    }
    assert.equal(b.latestReview?.status, 'COMPLETED');
    assert.equal(b.latestReview?.id, ID);
  });

  it('28. findings deterministas: mismo input → mismo output (estables)', () => {
    const reviews = [buildReview({ inputs: buildReview().inputs?.slice(0, 2) })];
    const a = JSON.stringify(evaluate(reviews).findings);
    const c = JSON.stringify(evaluate(structuredClone(reviews)).findings);
    assert.equal(a, c);
    const ids = evaluate(reviews).findings.map((f) => f.id);
    assert.ok(new Set(ids).size === ids.length, 'ids de findings únicos');
    for (const expected of [
      'management-review-direction-inputs-incomplete',
      'management-review-direction-history-incomplete',
    ]) {
      assert.ok(ids.includes(expected), `finding esperado: ${expected}`);
    }
  });

  it('weights suman exactamente 100', () => {
    const w = MANAGEMENT_REVIEW_DIRECTION_SCORE_WEIGHTS;
    const total = Object.values(w).reduce((s, v) => s + v, 0);
    assert.equal(total, 100);
  });

  it('latestReview refleja la evaluable más reciente (fecha desc)', () => {
    const b = evaluate([
      buildReview({
        _id: 'old',
        reviewCode: 'MRD-2025-01',
        actualStartDate: '2025-03-05',
        actualEndDate: '2025-03-05',
      }),
      buildReview({
        _id: 'new',
        reviewCode: 'MRD-2026-02',
        actualStartDate: '2026-06-05',
        actualEndDate: '2026-06-05',
      }),
    ]);
    assert.equal(b.latestReview?.id, 'new');
    assert.equal(b.counters.lastReviewDate, new Date('2026-06-05T00:00:00.000Z').toISOString());
    assert.equal(b.counters.lastReviewStatus, 'COMPLETED');
    assert.equal(b.evaluatedPeriod, '2026');
  });
});
