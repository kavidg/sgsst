import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * E4 (6.1.2) — Analyzer oficial de Auditoría anual SG-SST.
 *
 * Interpreta el resultado OFICIAL del ComplianceEngine (provider `annual-audit`,
 * formula `dimensions:v1`):
 * - NO calcula el score: el porcentaje oficial es moduleCompliance.compliance.
 * - NO recalcula dimensiones ni pesos; los ratios se transforman a % solo para
 *   el texto narrativo (0.35 → "35%").
 * - NO consulta Mongo ni AnnualAudit: consume exclusivamente el contexto ya
 *   resuelto por StandardAnalysisService (moduleCompliance + findings del módulo).
 * - Tolerante a metadata ausente/inválida, NO_DATA y findings desconocidos:
 *   nunca rompe la respuesta de IA por datos incompletos.
 *
 * Separación de dominios: este analyzer interpreta la GESTIÓN de la auditoría
 * anual (6.1.2). El provider legacy `management-review` (AccountabilityMeeting,
 * revisión por la dirección) NO es fuente de 6.1.2 y sus hallazgos no se
 * interpretan aquí. Tampoco emite juicios sobre DocumentMaster (solo evidencia)
 * ni sobre los hallazgos de otros estándares (6.1.3/6.1.4/7.1.x).
 */

/** Claves dimensionales oficiales emitidas por annual-audit-scoring.ts. */
const DIMENSION_KEYS = [
  'program',
  'executionReport',
  'findingsDocumentation',
  'followUpClosure',
  'evidenceAnalysis',
  'periodicityHistory',
] as const;

type DimensionKey = (typeof DIMENSION_KEYS)[number];

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  program: 'planificación del programa de auditoría',
  executionReport: 'ejecución e informe de la auditoría',
  findingsDocumentation: 'documentación de los hallazgos',
  followUpClosure: 'seguimiento y cierre de acciones',
  evidenceAnalysis: 'evidencia y análisis del resultado',
  periodicityHistory: 'continuidad del historial de auditorías',
};

const DIMENSION_RECOMMENDATIONS: Record<DimensionKey, string> = {
  program:
    'Completar la planificación de la auditoría: alcance, objetivos, criterios, metodología, auditor responsable y fechas planificadas.',
  executionReport:
    'Completar la ejecución de la auditoría (fechas reales) y documentar el informe con su contenido y evidencia.',
  findingsDocumentation:
    'Completar la información de los hallazgos: tipo, descripción, criterio, evidencia, responsable, fecha límite y estado.',
  followUpClosure:
    'Revisar y cerrar las acciones de seguimiento derivadas de los hallazgos, registrando responsables y fechas.',
  evidenceAnalysis:
    'Asociar la evidencia faltante (informe, competencia del auditor, evidencia de hallazgos) para fortalecer la trazabilidad.',
  periodicityHistory:
    'Mantener la continuidad de auditorías completadas entre períodos para consolidar el historial.',
};

/** Umbral narrativo de "dimensión débil" (presentación, no scoring). */
const WEAK_DIMENSION_PERCENT = 60;

/** Findings oficiales de 6.1.2 (annual-audit-scoring.ts) que el analyzer interpreta. */
const OFFICIAL_FINDING_IDS = [
  'annual-audit-no-data',
  'annual-audit-no-evaluable-audits',
  'annual-audit-program-incomplete',
  'annual-audit-not-completed',
  'annual-audit-no-report',
  'annual-audit-findings-incomplete',
  'annual-audit-open-actions',
  'annual-audit-overdue-actions',
  'annual-audit-evidence-missing',
  'annual-audit-history-incomplete',
  'annual-audit-data-integrity',
] as const;

const RECOMMENDATION_BY_FINDING: Record<string, string> = {
  'annual-audit-no-data': DIMENSION_RECOMMENDATIONS.program,
  'annual-audit-no-evaluable-audits': DIMENSION_RECOMMENDATIONS.executionReport,
  'annual-audit-program-incomplete': DIMENSION_RECOMMENDATIONS.program,
  'annual-audit-not-completed': DIMENSION_RECOMMENDATIONS.executionReport,
  'annual-audit-no-report': DIMENSION_RECOMMENDATIONS.executionReport,
  'annual-audit-findings-incomplete': DIMENSION_RECOMMENDATIONS.findingsDocumentation,
  'annual-audit-open-actions': DIMENSION_RECOMMENDATIONS.followUpClosure,
  'annual-audit-overdue-actions':
    'Priorizar el cierre de las acciones vencidas y registrar la evidencia correspondiente.',
  'annual-audit-evidence-missing': DIMENSION_RECOMMENDATIONS.evidenceAnalysis,
  'annual-audit-history-incomplete': DIMENSION_RECOMMENDATIONS.periodicityHistory,
  'annual-audit-data-integrity':
    'Corregir las inconsistencias de datos (fechas futuras, rangos incoherentes o códigos duplicados) para que las auditorías puedan evaluarse.',
};

const FINDING_BY_DIMENSION: Record<DimensionKey, string> = {
  program: 'annual-audit-program-incomplete',
  executionReport: 'annual-audit-no-report',
  findingsDocumentation: 'annual-audit-findings-incomplete',
  followUpClosure: 'annual-audit-open-actions',
  evidenceAnalysis: 'annual-audit-evidence-missing',
  periodicityHistory: 'annual-audit-history-incomplete',
};

function normalizePriority(priority: string): 'HIGH' | 'MEDIUM' | 'LOW' {
  return priority === 'HIGH' ? 'HIGH' : priority === 'LOW' ? 'LOW' : 'MEDIUM';
}

interface DimensionView {
  key: DimensionKey;
  label: string;
  percent: number | null;
  weight: number | null;
}

interface AnnualAuditMetadataView {
  formula: string;
  evaluatedPeriod: string | null;
  noDataReason: string | null;
  dimensions: Partial<Record<DimensionKey, { ratio: unknown; weight: unknown }>>;
  counters: Record<string, unknown>;
}

/** Lectura defensiva de la metadata oficial (dimensions:v1). */
function readMetadata(metadata: unknown): AnnualAuditMetadataView | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  if (m.formula !== 'dimensions:v1') return null;
  const dims = (m.dimensions ?? {}) as Record<string, Record<string, unknown>>;
  const view: AnnualAuditMetadataView = {
    formula: 'dimensions:v1',
    evaluatedPeriod: typeof m.evaluatedPeriod === 'string' ? m.evaluatedPeriod : null,
    noDataReason:
      m.noDataReason === 'no-audits' || m.noDataReason === 'no-evaluable-audits'
        ? m.noDataReason
        : null,
    dimensions: {},
    counters: (m.counters ?? {}) as Record<string, unknown>,
  };
  for (const key of DIMENSION_KEYS) {
    const dim = dims[key];
    if (dim && typeof dim === 'object') {
      view.dimensions[key] = { ratio: dim.ratio, weight: dim.weight };
    }
  }
  return view;
}

/** ratio 0–1 → % entero para narrativa. Cualquier otro valor → null. */
function ratioToPercent(ratio: unknown): number | null {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return null;
  if (ratio < 0 || ratio > 1) return null;
  return Math.round(ratio * 100);
}

function num(counter: Record<string, unknown>, key: string): number | null {
  const value = counter[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function dimensionViews(meta: AnnualAuditMetadataView | null): DimensionView[] {
  return DIMENSION_KEYS.map((key) => {
    const dim = meta?.dimensions[key];
    return {
      key,
      label: DIMENSION_LABELS[key],
      percent: dim ? ratioToPercent(dim.ratio) : null,
      weight: dim && typeof dim.weight === 'number' ? dim.weight : null,
    };
  });
}

export class AnnualAuditStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '6.1.2';
  private static readonly MODULE = 'annual-audit';

  supports(standardCode: string): boolean {
    return standardCode === AnnualAuditStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return AnnualAuditStandardAnalyzer.MODULE;
  }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const officialPercentage = moduleCompliance.compliance;
    const status = (moduleCompliance as { status?: string }).status;
    const meta = readMetadata(moduleCompliance.metadata);
    const dims = dimensionViews(meta);
    const counters = meta?.counters ?? {};

    const keyIssues: StandardAnalysisKeyIssue[] = [];
    const findingsById = new Map(findings.map((f) => [f.id, f]));

    // ── Caso A: NO_DATA — no existen auditorías registradas ──
    if (status === 'NO_DATA' && meta?.noDataReason === 'no-audits') {
      return {
        summary:
          'No existen auditorías anuales registradas que permitan evaluar este estándar: mientras no se registre y ejecute una auditoría al SG-SST, el resultado de 6.1.2 no es evaluable.',
        keyIssues: findingsById.has('annual-audit-no-data')
          ? [{
              id: 'annual-audit-no-data',
              title: findingsById.get('annual-audit-no-data')!.title,
              priority: 'HIGH',
              impact:
                'Sin auditorías registradas no es posible demostrar la verificación periódica del SG-SST que exige el ciclo de mejora.',
              recommendation: RECOMMENDATION_BY_FINDING['annual-audit-no-data'],
            }]
          : [],
        quickWins: [
          'Registrar la primera auditoría con su planificación completa (alcance, objetivos, criterios, metodología y auditor).',
        ],
        nextSteps: [
          'Ejecutar la auditoría planificada y documentar su informe con fechas reales.',
          'Registrar los hallazgos y sus acciones de seguimiento al cierre.',
        ],
      };
    }

    // ── Caso B: NO_DATA — auditorías registradas pero ninguna evaluable ──
    if (status === 'NO_DATA' && meta?.noDataReason === 'no-evaluable-audits') {
      return {
        summary:
          'Existen registros de auditoría, pero ninguno cumple actualmente las condiciones mínimas para ser evaluado (ejecución completada con fechas reales válidas e informe). El resultado de 6.1.2 no es evaluable hasta contar con al menos una auditoría en esas condiciones.',
        keyIssues: findingsById.has('annual-audit-no-evaluable-audits')
          ? [{
              id: 'annual-audit-no-evaluable-audits',
              title: findingsById.get('annual-audit-no-evaluable-audits')!.title,
              priority: 'HIGH',
              impact:
                'Con registros sin ejecución completa ni informe, la organización no evidencia el resultado de la auditoría anual.',
              recommendation: RECOMMENDATION_BY_FINDING['annual-audit-no-evaluable-audits'],
            }]
          : [],
        quickWins: [
          'Completar la ejecución de una auditoría existente (fechas reales) y documentar su informe.',
        ],
        nextSteps: [
          'Registrar los hallazgos detectados y sus acciones de seguimiento.',
          'Adjuntar la evidencia documental del informe y de la competencia del auditor.',
        ],
      };
    }

    // ── Fuente primaria de issues: los findings OFICIALES presentes ──
    // (cada finding oficial conocido recibe interpretación y recomendación;
    // los desconocidos se ignoran sin romper el análisis).
    const seen = new Set<string>();
    for (const f of findings) {
      if (!(OFFICIAL_FINDING_IDS as readonly string[]).includes(f.id) || seen.has(f.id)) continue;
      seen.add(f.id);
      keyIssues.push({
        id: f.id,
        title: f.title,
        priority: normalizePriority(f.priority),
        impact: f.description,
        recommendation: RECOMMENDATION_BY_FINDING[f.id] ?? 'Revisar la gestión de la auditoría anual.',
      });
    }

    // ── Dimensiones débiles sin finding oficial correspondiente (informativas) ──
    const weakDims = dims.filter((d) => d.percent !== null && d.percent < WEAK_DIMENSION_PERCENT);
    for (const dim of weakDims) {
      const findingId = FINDING_BY_DIMENSION[dim.key];
      if (seen.has(findingId)) continue;
      seen.add(findingId);
      keyIssues.push({
        id: findingId,
        title: `Brecha en ${dim.label}`,
        priority: 'MEDIUM',
        impact: `La dimensión de ${dim.label} muestra un desempeño bajo (${dim.percent}%) en la auditoría evaluada.`,
        recommendation: DIMENSION_RECOMMENDATIONS[dim.key],
      });
    }

    // ── Integridad: incidencias reportadas por counters sin finding oficial ──
    const integrity = num(counters, 'auditsWithIntegrityIssues');
    if (integrity !== null && integrity > 0 && !seen.has('annual-audit-data-integrity')) {
      seen.add('annual-audit-data-integrity');
      keyIssues.push({
        id: 'annual-audit-data-integrity',
        title: 'Incidencias de integridad de datos',
        priority: 'HIGH',
        impact: `Se detectaron ${integrity} auditoría(s) con fechas futuras, rangos incoherentes o códigos duplicados; quedaron fuera de la evaluación hasta corregir sus datos.`,
        recommendation: RECOMMENDATION_BY_FINDING['annual-audit-data-integrity'],
      });
    }

    // ── Resumen narrativo ──
    // Caso C: un 0% con datos evaluables es cumplimiento real bajo, no ausencia de datos.
    const summary = this.buildSummary(officialPercentage, status, dims, meta, counters);

    const quickWins = weakDims
      .slice(0, 3)
      .map((d) => DIMENSION_RECOMMENDATIONS[d.key]);
    if (quickWins.length === 0) {
      quickWins.push(
        'Mantener la continuidad anual de la auditoría y el cierre oportuno de sus acciones de seguimiento.',
      );
    }

    const overdue = num(counters, 'overdueActions');
    const nextSteps = [
      (overdue ?? 0) > 0
        ? 'Priorizar el cierre de las acciones vencidas de la auditoría más reciente.'
        : 'Documentar el análisis del resultado de la auditoría y presentarlo en la revisión por la dirección.',
      weakDims.some((d) => d.key === 'periodicityHistory')
        ? 'Programar la auditoría del siguiente período para consolidar la continuidad anual.'
        : 'Mantener el programa de auditorías anual actualizado.',
    ];

    return {
      summary,
      keyIssues: keyIssues.slice(0, 5),
      quickWins: quickWins.slice(0, 3),
      nextSteps: nextSteps.slice(0, 3),
    };
  }

  private buildSummary(
    officialPercentage: number,
    status: string | undefined,
    dims: DimensionView[],
    meta: AnnualAuditMetadataView | null,
    counters: Record<string, unknown>,
  ): string {
    const period = meta?.evaluatedPeriod ? ` correspondiente a ${meta.evaluatedPeriod}` : '';
    const weakest = dims
      .filter((d) => d.percent !== null)
      .sort((a, b) => (a.percent as number) - (b.percent as number))[0];

    if (status === 'NO_DATA') {
      return `El resultado de 6.1.2 no es evaluable en este momento${period}: no existen datos suficientes para un análisis con fundamento.`;
    }

    const focus =
      weakest && weakest.percent !== null && weakest.percent < 100
        ? ` La principal brecha se concentra en ${weakest.label} (${weakest.percent}%).`
        : '';
    const evaluable = num(counters, 'evaluableAudits');
    const openActions = num(counters, 'openActions');
    const scope =
      evaluable !== null && openActions !== null
        ? ` Se evaluó ${evaluable} auditoría(s) evaluable(s) con ${openActions} acción(es) de seguimiento abierta(s).`
        : '';

    if (officialPercentage >= 90) {
      return `La gestión de la auditoría anual al SG-SST muestra un cumplimiento sólido (${officialPercentage}%)${period}.${focus}${scope}`;
    }
    if (officialPercentage >= 50) {
      return `El resultado oficial de 6.1.2 refleja la gestión actual de la auditoría anual (${officialPercentage}%)${period}.${focus}${scope}`;
    }
    return `El resultado oficial evidencia brechas relevantes en la gestión de auditorías anuales (${officialPercentage}%)${period}.${focus}${scope}`;
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    const meta = readMetadata(ctx.moduleCompliance.metadata);
    const metrics: StandardAnalysisMetrics = {
      compliancePercentage: ctx.moduleCompliance.compliance,
    };
    if (meta) {
      for (const dim of dimensionViews(meta)) {
        if (dim.percent !== null) {
          metrics[`dimension_${dim.key}_percent`] = dim.percent;
        }
      }
      const counterKeys = [
        'totalAudits', 'evaluableAudits', 'completedAudits', 'cancelledAudits',
        'draftAudits', 'plannedAudits', 'inProgressAudits',
        'auditsWithReport', 'auditsWithEvidence', 'auditsWithCompetenceEvidence',
        'auditsWithFindings', 'totalFindings', 'completeFindings', 'incompleteFindings',
        'totalActions', 'completedActions', 'openActions', 'overdueActions',
        'actionsWithEvidence', 'futureDateAudits', 'auditsWithIntegrityIssues',
        'duplicateAuditCodes',
      ];
      for (const key of counterKeys) {
        const value = num(meta.counters, key);
        if (value !== null) metrics[key] = value;
      }
    }
    return metrics;
  }
}
