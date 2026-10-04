import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AnnualAuditStandardAnalyzer } from './annual-audit-standard.analyzer';
import {
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
} from '../../dto/standard-analysis.dto';

/**
 * E4 (6.1.2) — Tests de comportamiento del AnnualAuditStandardAnalyzer.
 *
 * Cubre los casos de la FASE 15: NO_DATA por causa, 0% real ≠ NO_DATA,
 * scores real bajo/alto, findings oficiales (11), dimensiones, metadata
 * ausente/inválida/parcialmente corrupta y fronteras conceptuales (no
 * recalcula score, no consulta servicios, no crea findings nuevos).
 */

const COMPANY = '64a0000000000000000000a2';

const analyzer = new AnnualAuditStandardAnalyzer();

function dim(
  ratio: number | null,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ratio, numerator: ratio === null ? null : 1, denominator: ratio === null ? null : 1, weight: 10, ...extra };
}

function metadata(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    semantic: 'EXACT',
    standardCode: '6.1.2',
    phase: 'check',
    formula: 'dimensions:v1',
    evaluatedPeriod: '2026',
    noDataReason: null,
    weights: { program: 15, executionReport: 25, findingsDocumentation: 20, followUpClosure: 20, evidenceAnalysis: 10, periodicityHistory: 10 },
    dimensions: {
      program: dim(1),
      executionReport: dim(1),
      findingsDocumentation: dim(1),
      followUpClosure: dim(1),
      evidenceAnalysis: dim(1),
      periodicityHistory: dim(1),
    },
    counters: {
      totalAudits: 1, evaluableAudits: 1, completedAudits: 1, cancelledAudits: 0,
      draftAudits: 0, plannedAudits: 0, inProgressAudits: 0,
      auditsWithReport: 1, auditsWithEvidence: 1, auditsWithCompetenceEvidence: 1,
      auditsWithFindings: 1, totalFindings: 1, completeFindings: 1, incompleteFindings: 0,
      totalActions: 1, completedActions: 1, openActions: 0, overdueActions: 0,
      actionsWithEvidence: 1, futureDateAudits: 0, auditsWithIntegrityIssues: 0,
      duplicateAuditCodes: 0,
    },
    ...overrides,
  };
}

function context(overrides: {
  compliance?: number;
  status?: string;
  metadata?: Record<string, unknown>;
  findings?: Array<{ id: string; module: string; title: string; description: string; priority: string; status: string; responsible: string; dueDate: string; createdAt: string }>;
} = {}): StandardAnalysisContext {
  return {
    companyId: COMPANY,
    // El engine transporta `status` aditivamente en runtime (no declarado en
    // el DTO base del contexto): cast explícito para simular el payload real.
    moduleCompliance: {
      module: 'annual-audit',
      compliance: overrides.compliance ?? 100,
      level: 'ÓPTIMO',
      lastUpdated: new Date().toISOString(),
      status: overrides.status ?? 'TARGET_MET',
      metadata: 'metadata' in overrides ? overrides.metadata : metadata(),
    } as StandardAnalysisContext['moduleCompliance'],
    findings: overrides.findings ?? [],
    overview: {
      overallCompliance: 80,
      phaseCompliance: { plan: 25, do: 60, check: 5, act: 10 },
      moduleCompliance: [
        { module: 'annual-audit', compliance: overrides.compliance ?? 100, level: 'ÓPTIMO', lastUpdated: new Date().toISOString() },
      ],
    },
  };
}

function finding(id: string, priority = 'MEDIUM'): {
  id: string; module: string; title: string; description: string; priority: string; status: string; responsible: string; dueDate: string; createdAt: string;
} {
  return {
    id,
    module: 'annual-audit',
    title: `Finding ${id}`,
    description: `Descripción del hallazgo ${id}.`,
    priority,
    status: 'OPEN',
    responsible: '',
    dueDate: '',
    createdAt: new Date().toISOString(),
  };
}

// ══════════════ Contrato ══════════════

describe('AAI-01: contrato del analyzer', () => {
  it('soporta exactamente 6.1.2 y el módulo annual-audit', () => {
    assert.equal(analyzer.supports('6.1.2'), true);
    assert.equal(analyzer.supports('6.1.3'), false);
    assert.equal(analyzer.supports('6.1.1'), false);
    assert.equal(analyzer.supports('6.1.4'), false);
    assert.equal(analyzer.getModule(), 'annual-audit');
  });
});

// ══════════════ Datos (1–8) ══════════════

describe('AAI-02: NO_DATA — no-audits', () => {
  const result = analyzer.analyze(
    context({
      status: 'NO_DATA',
      compliance: 0,
      metadata: metadata({ noDataReason: 'no-audits' }),
      findings: [finding('annual-audit-no-data', 'HIGH')],
    }),
  );
  it('explica la ausencia de auditorías y NO dice que el cumplimiento sea 0%', () => {
    assert.match(result.summary, /No existen auditorías anuales registradas/);
    assert.doesNotMatch(result.summary, /0%/);
    assert.doesNotMatch(result.summary, /incumplimiento/i);
  });
  it('emite el keyIssue del finding oficial con recomendación de planificación', () => {
    assert.equal(result.keyIssues.length, 1);
    assert.equal(result.keyIssues[0].id, 'annual-audit-no-data');
    assert.match(result.keyIssues[0].recommendation, /[Pp]lanificaci[oó]n|alcance/);
  });
});

describe('AAI-03: NO_DATA — no-evaluable-audits', () => {
  const result = analyzer.analyze(
    context({
      status: 'NO_DATA',
      compliance: 0,
      metadata: metadata({ noDataReason: 'no-evaluable-audits' }),
      findings: [finding('annual-audit-no-evaluable-audits', 'HIGH')],
    }),
  );
  it('explica que hay registros pero ninguno evaluable', () => {
    assert.match(result.summary, /Existen registros de auditoría/);
    assert.match(result.summary, /ninguno cumple/);
  });
  it('no asume qué condición falta exactamente', () => {
    assert.doesNotMatch(result.summary, /falta el informe$/);
  });
});

describe('AAI-04: score real 0% ≠ NO_DATA', () => {
  const result = analyzer.analyze(
    context({
      compliance: 0,
      status: 'TARGET_NOT_MET',
      metadata: metadata({ noDataReason: null }),
      findings: [],
    }),
  );
  it('trata el 0% como resultado evaluable, no como ausencia de datos', () => {
    assert.match(result.summary, /0%/);
    assert.match(result.summary, /brechas/i);
    assert.doesNotMatch(result.summary, /no es evaluable/i);
    assert.doesNotMatch(result.summary, /No existen auditorías/);
  });
});

describe('AAI-05: score real bajo', () => {
  const result = analyzer.analyze(
    context({
      compliance: 35,
      status: 'TARGET_NOT_MET',
      metadata: metadata(),
      findings: [],
    }),
  );
  it('narrativa de brechas con el porcentaje oficial intacto', () => {
    assert.match(result.summary, /35%/);
    assert.match(result.summary, /brechas/i);
  });
});

describe('AAI-06: score alto', () => {
  const result = analyzer.analyze(
    context({
      compliance: 92,
      status: 'TARGET_MET',
      metadata: metadata(),
      findings: [],
    }),
  );
  it('narrativa de cumplimiento sólido', () => {
    assert.match(result.summary, /92%/);
    assert.match(result.summary, /sólido/i);
  });
});

describe('AAI-07: metadata válida con períodos y contadores', () => {
  const result = analyzer.analyze(
    context({
      compliance: 75,
      status: 'TARGET_NOT_MET',
      metadata: metadata(),
      findings: [],
    }),
  );
  it('incluye período evaluado y contexto de counters en la narrativa', () => {
    assert.match(result.summary, /2026/);
    assert.match(result.summary, /evaluable/);
  });
  it('getMetrics expone porcentajes dimensionales y counters oficiales', () => {
    const metrics = analyzer.getMetrics(context({ metadata: metadata() }));
    assert.equal(metrics['dimension_program_percent'], 100);
    assert.equal(metrics['openActions'], 0);
    assert.equal(metrics['totalAudits'], 1);
  });
});

describe('AAI-08: metadata ausente', () => {
  const result = analyzer.analyze(
    context({ compliance: 60, status: 'TARGET_NOT_MET', metadata: undefined, findings: [] }),
  );
  it('no rompe y produce narrativa basada solo en el score oficial', () => {
    assert.match(result.summary, /60%/);
  });
  it('getMetrics devuelve solo el porcentaje oficial', () => {
    const metrics = analyzer.getMetrics(context({ metadata: undefined }));
    assert.deepEqual(Object.keys(metrics), ['compliancePercentage']);
  });
});

describe('AAI-09: metadata inválida (formula distinta)', () => {
  const result = analyzer.analyze(
    context({
      compliance: 40,
      status: 'TARGET_NOT_MET',
      metadata: metadata({ formula: 'dimensions:v2' }),
      findings: [],
    }),
  );
  it('no rompe y no usa dimensiones', () => {
    assert.match(result.summary, /40%/);
  });
});

// ══════════════ Findings (9–18) ══════════════

describe('AAI-10: findings oficiales individuales', () => {
  const cases: Array<{ id: string; recommendationMatch: RegExp }> = [
    { id: 'annual-audit-program-incomplete', recommendationMatch: /[Pp]lanificaci[oó]n|alcance/ },
    { id: 'annual-audit-not-completed', recommendationMatch: /ejecuci[oó]n|informe/i },
    { id: 'annual-audit-no-report', recommendationMatch: /ejecuci[oó]n|informe/i },
    { id: 'annual-audit-findings-incomplete', recommendationMatch: /hallazgos/i },
    { id: 'annual-audit-open-actions', recommendationMatch: /acciones/i },
    { id: 'annual-audit-overdue-actions', recommendationMatch: /vencidas/i },
    { id: 'annual-audit-evidence-missing', recommendationMatch: /evidencia/i },
    { id: 'annual-audit-history-incomplete', recommendationMatch: /continuidad|per[ií]odos/i },
    { id: 'annual-audit-data-integrity', recommendationMatch: /fechas|inconsistencias/i },
  ];
  for (const { id, recommendationMatch } of cases) {
    it(`interpreta ${id} con recomendación específica`, () => {
      const result = analyzer.analyze(
        context({ compliance: 50, status: 'TARGET_NOT_MET', findings: [finding(id)] }),
      );
      const issue = result.keyIssues.find((k) => k.id === id);
      assert.ok(issue, `keyIssue ${id} presente`);
      assert.equal(issue.title, `Finding ${id}`);
      assert.match(issue.recommendation, recommendationMatch);
      assert.equal(issue.impact, `Descripción del hallazgo ${id}.`);
    });
  }
});

describe('AAI-11: combinación de múltiples findings (máx 5 issues)', () => {
  const result = analyzer.analyze(
    context({
      compliance: 45,
      status: 'TARGET_NOT_MET',
      findings: [
        finding('annual-audit-program-incomplete', 'HIGH'),
        finding('annual-audit-open-actions', 'MEDIUM'),
        finding('annual-audit-overdue-actions', 'HIGH'),
        finding('annual-audit-evidence-missing', 'LOW'),
        finding('annual-audit-history-incomplete', 'LOW'),
        finding('annual-audit-data-integrity', 'HIGH'),
      ],
    }),
  );
  it('emite keyIssues por cada finding oficial hasta el máximo de 5', () => {
    assert.ok(result.keyIssues.length > 0);
    assert.ok(result.keyIssues.length <= 5);
    const ids = result.keyIssues.map((k) => k.id);
    assert.ok(ids.includes('annual-audit-overdue-actions'));
    assert.ok(ids.includes('annual-audit-program-incomplete'));
  });
});

// ══════════════ Dimensiones / metadata degradada (19–23) ══════════════

describe('AAI-12: seis dimensiones válidas — lectura ejecutiva por ratios oficiales', () => {
  it('identifica la dimensión más débil usando el ratio oficial (sin ranking numérico adicional)', () => {
    const meta = metadata({
      dimensions: {
        program: dim(0.9),
        executionReport: dim(0.8),
        findingsDocumentation: dim(0.7),
        followUpClosure: dim(0.35),
        evidenceAnalysis: dim(0.8),
        periodicityHistory: dim(null), // no evaluable → redistribuida
      },
    });
    const result = analyzer.analyze(
      context({ compliance: 60, status: 'TARGET_NOT_MET', metadata: meta, findings: [] }),
    );
    // La narrativa puede citar el ratio oficial más bajo (0.35 → 35%).
    assert.match(result.summary, /seguimiento y cierre/);
    assert.match(result.summary, /35%/);
  });
  it('genera keyIssue informativo para dimensión débil sin finding oficial', () => {
    const meta = metadata({
      dimensions: {
        program: dim(1),
        executionReport: dim(1),
        findingsDocumentation: dim(0.4),
        followUpClosure: dim(1),
        evidenceAnalysis: dim(1),
        periodicityHistory: dim(1),
      },
    });
    const result = analyzer.analyze(
      context({ compliance: 80, status: 'TARGET_NOT_MET', metadata: meta, findings: [] }),
    );
    const issue = result.keyIssues.find((k) => k.id === 'annual-audit-findings-incomplete');
    assert.ok(issue);
    assert.match(issue.impact, /40%/);
  });
});

describe('AAI-13: dimensión faltante / ratio inválido / counters ausentes', () => {
  it('tolera una dimensión faltante sin romper', () => {
    const meta = metadata({
      dimensions: {
        program: dim(1),
        executionReport: dim(1),
        findingsDocumentation: dim(1),
        followUpClosure: dim(1),
        evidenceAnalysis: dim(1),
        // periodicityHistory ausente
      },
    });
    const result = analyzer.analyze(
      context({ compliance: 70, status: 'TARGET_NOT_MET', metadata: meta, findings: [] }),
    );
    assert.match(result.summary, /70%/);
  });
  it('ignora ratios inválidos (fuera de 0–1, no finitos) sin recalcul', () => {
    const meta = metadata({
      dimensions: {
        program: dim(2.5),
        executionReport: dim(1),
        findingsDocumentation: dim(1),
        followUpClosure: dim(Number.NaN),
        followUpClosure2: dim(1),
        evidenceAnalysis: dim(1),
        periodicityHistory: dim(1),
      },
    });
    const result = analyzer.analyze(
      context({ compliance: 65, status: 'TARGET_NOT_MET', metadata: meta, findings: [] }),
    );
    assert.match(result.summary, /65%/);
    assert.doesNotMatch(result.summary, /250%/);
  });
  it('tolera counters ausentes o corruptos', () => {
    const meta = metadata({ counters: { totalAudits: 'no-soy-número', openActions: null } });
    const result = analyzer.analyze(
      context({ compliance: 55, status: 'TARGET_NOT_MET', metadata: meta, findings: [] }),
    );
    assert.match(result.summary, /55%/);
  });
});

describe('AAI-14: metadata parcialmente corrupta (formula válida, dims basura)', () => {
  it('no rompe', () => {
    const meta = metadata({ dimensions: null });
    const result = analyzer.analyze(
      context({ compliance: 30, status: 'TARGET_NOT_MET', metadata: meta, findings: [] }),
    );
    assert.match(result.summary, /30%/);
  });
});

// ══════════════ Seguridad conceptual (24–27) ══════════════

describe('AAI-15: fronteras conceptuales', () => {
  it('no interpreta findings de management-review ni crea IDs nuevos (6.1.2 → annual-audit)', () => {
    const result = analyzer.analyze(
      context({
        compliance: 80,
        status: 'TARGET_NOT_MET',
        findings: [finding('management-review-no-data'), finding('annual-audit-open-actions')],
      }),
    );
    const ids = result.keyIssues.map((k) => k.id);
    assert.ok(!ids.includes('management-review-no-data'));
    assert.ok(ids.includes('annual-audit-open-actions'));
    // El análisis solo contiene IDs oficiales de 6.1.2.
    const OFFICIAL = [
      'annual-audit-no-data', 'annual-audit-no-evaluable-audits', 'annual-audit-program-incomplete',
      'annual-audit-not-completed', 'annual-audit-no-report', 'annual-audit-findings-incomplete',
      'annual-audit-open-actions', 'annual-audit-overdue-actions', 'annual-audit-evidence-missing',
      'annual-audit-history-incomplete', 'annual-audit-data-integrity',
    ];
    for (const id of ids) assert.ok((OFFICIAL as string[]).includes(id), `id oficial: ${id}`);
  });
  it('es determinista (dos ejecuciones → misma salida)', () => {
    const ctx = context({ compliance: 48, status: 'TARGET_NOT_MET', findings: [finding('annual-audit-no-report')] });
    const a = analyzer.analyze(ctx);
    const b = analyzer.analyze(ctx);
    assert.deepEqual(a, b);
  });
});
