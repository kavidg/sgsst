import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * E4 (6.1.3) — Analyzer oficial de la REVISIÓN POR LA DIRECCIÓN SG-SST.
 *
 * Interpreta el resultado OFICIAL del ComplianceEngine (provider
 * `management-review-direction`, formula `dimensions:v1`):
 * - NO calcula el score: el porcentaje oficial es moduleCompliance.compliance.
 * - NO recalcula dimensiones ni pesos; los ratios se transforman a % solo para
 *   el texto narrativo (0.35 → "35%").
 * - NO consulta Mongo/ManagementReviewDirection/AnnualAudit/Indicators/
 *   Accountability/DocumentMaster: consume exclusivamente el contexto ya
 *   resuelto por StandardAnalysisService (moduleCompliance + findings).
 * - Tolerante a metadata ausente/inválida, NO_DATA y findings desconocidos:
 *   nunca rompe la respuesta de IA por datos incompletos.
 *
 * Separación de dominios: este analyzer interpreta la GESTIÓN de la revisión
 * por la dirección (6.1.3). El analyzer legacy InternalAuditStandardAnalyzer
 * (DocumentMaster AUDIT) NO es fuente de 6.1.3 y fue retirado del registro;
 * el provider `management-review` (AccountabilityMeeting, 6.1.2 legacy)
 * tampoco participa. La narrativa es para ALTA DIRECCIÓN: qué se revisó,
 * qué concluyó, qué decidió y qué está pendiente — no una explicación técnica.
 */

/** Claves dimensionales oficiales emitidas por management-review-direction-scoring.ts. */
const DIMENSION_KEYS = [
  'planning',
  'inputs',
  'analysis',
  'decisions',
  'evidence',
  'closureHistory',
] as const;

type DimensionKey = (typeof DIMENSION_KEYS)[number];

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  planning: 'la planificación de la revisión',
  inputs: 'las entradas de información revisadas',
  analysis: 'el análisis de la dirección',
  decisions: 'las decisiones y acciones de dirección',
  evidence: 'la evidencia y trazabilidad del acto de revisión',
  closureHistory: 'el cierre y la continuidad histórica',
};

const DIMENSION_RECOMMENDATIONS: Record<DimensionKey, string> = {
  planning:
    'Completar la planificación de la revisión: título, tipo (ordinaria/extraordinaria), fecha, responsable, alcance y objetivos.',
  inputs:
    'Incorporar y revisar las entradas relevantes del SG-SST (resultados de auditoría, indicadores, cumplimiento PHVA, objetivos, acciones de mejora, cambios y necesidades de recursos), marcándolas como revisadas y documentando su período y fuente.',
  analysis:
    'Documentar el análisis de la dirección: resumen, fortalezas, brechas, prioridades y observaciones de la dirección.',
  decisions:
    'Formalizar las decisiones de dirección con responsable y fecha límite, y hacer seguimiento a las pendientes y en progreso.',
  evidence:
    'Adjuntar el acta o informe de la revisión (documento, URL o título) y registrar a los participantes con su asistencia.',
  closureHistory:
    'Completar formalmente la ejecución de la revisión (fechas reales) y mantener revisiones completadas en al menos dos períodos para consolidar el historial.',
};

/** Umbral narrativo de "dimensión débil" (presentación, no scoring). */
const WEAK_DIMENSION_PERCENT = 60;

/** Findings oficiales de 6.1.3 (management-review-direction-scoring.ts). */
const OFFICIAL_FINDING_IDS = [
  'management-review-direction-no-data',
  'management-review-direction-no-evaluable-reviews',
  'management-review-direction-planning-incomplete',
  'management-review-direction-inputs-incomplete',
  'management-review-direction-analysis-incomplete',
  'management-review-direction-decisions-incomplete',
  'management-review-direction-evidence-incomplete',
  'management-review-direction-not-completed',
  'management-review-direction-overdue-decisions',
  'management-review-direction-history-incomplete',
] as const;

const RECOMMENDATION_BY_FINDING: Record<string, string> = {
  'management-review-direction-no-data': DIMENSION_RECOMMENDATIONS.planning,
  'management-review-direction-no-evaluable-reviews': DIMENSION_RECOMMENDATIONS.closureHistory,
  'management-review-direction-planning-incomplete': DIMENSION_RECOMMENDATIONS.planning,
  'management-review-direction-inputs-incomplete': DIMENSION_RECOMMENDATIONS.inputs,
  'management-review-direction-analysis-incomplete': DIMENSION_RECOMMENDATIONS.analysis,
  'management-review-direction-decisions-incomplete': DIMENSION_RECOMMENDATIONS.decisions,
  'management-review-direction-evidence-incomplete': DIMENSION_RECOMMENDATIONS.evidence,
  'management-review-direction-not-completed': DIMENSION_RECOMMENDATIONS.closureHistory,
  'management-review-direction-overdue-decisions':
    'Priorizar el cierre de las decisiones vencidas: revisar responsable y fecha límite, y registrar la evidencia de su ejecución (sin cambiar su estado automáticamente).',
  'management-review-direction-history-incomplete': DIMENSION_RECOMMENDATIONS.closureHistory,
};

const FINDING_BY_DIMENSION: Record<DimensionKey, string> = {
  planning: 'management-review-direction-planning-incomplete',
  inputs: 'management-review-direction-inputs-incomplete',
  analysis: 'management-review-direction-analysis-incomplete',
  decisions: 'management-review-direction-decisions-incomplete',
  evidence: 'management-review-direction-evidence-incomplete',
  closureHistory: 'management-review-direction-history-incomplete',
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

interface ManagementReviewDirectionMetadataView {
  formula: string;
  evaluatedPeriod: string | null;
  noDataReason: string | null;
  dimensions: Partial<Record<DimensionKey, { ratio: unknown; weight: unknown }>>;
  counters: Record<string, unknown>;
  latestReview: Record<string, unknown> | null;
}

/** Lectura defensiva de la metadata oficial (dimensions:v1). */
function readMetadata(metadata: unknown): ManagementReviewDirectionMetadataView | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  if (m.formula !== 'dimensions:v1') return null;
  const dims = (m.dimensions ?? {}) as Record<string, Record<string, unknown>>;
  const view: ManagementReviewDirectionMetadataView = {
    formula: 'dimensions:v1',
    evaluatedPeriod: typeof m.evaluatedPeriod === 'string' ? m.evaluatedPeriod : null,
    noDataReason:
      m.noDataReason === 'no-reviews' || m.noDataReason === 'no-evaluable-reviews'
        ? m.noDataReason
        : null,
    dimensions: {},
    counters: (m.counters ?? {}) as Record<string, unknown>,
    latestReview:
      m.latestReview && typeof m.latestReview === 'object'
        ? (m.latestReview as Record<string, unknown>)
        : null,
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

function dimensionViews(meta: ManagementReviewDirectionMetadataView | null): DimensionView[] {
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

export class ManagementReviewDirectionStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '6.1.3';
  private static readonly MODULE = 'management-review-direction';

  supports(standardCode: string): boolean {
    return standardCode === ManagementReviewDirectionStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return ManagementReviewDirectionStandardAnalyzer.MODULE;
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

    // ── Caso A: NO_DATA — no existen revisiones registradas ──
    if (status === 'NO_DATA' && meta?.noDataReason === 'no-reviews') {
      return {
        summary:
          'No existen revisiones del SG-SST por la alta dirección registradas: mientras no se realice y documente una revisión formal, el resultado de 6.1.3 no es evaluable.',
        keyIssues: findingsById.has('management-review-direction-no-data')
          ? [{
              id: 'management-review-direction-no-data',
              title: findingsById.get('management-review-direction-no-data')!.title,
              priority: 'HIGH',
              impact:
                'Sin revisiones registradas no es posible demostrar que la alta dirección evalúa el desempeño del SG-SST y decide sobre su mejora.',
              recommendation: RECOMMENDATION_BY_FINDING['management-review-direction-no-data'],
            }]
          : [],
        quickWins: [
          'Registrar la primera revisión por la dirección con su planificación completa (fecha, responsable, alcance y objetivos).',
        ],
        nextSteps: [
          'Ejecutar la revisión con entradas de información relevantes y documentar el análisis de la dirección.',
          'Formalizar las decisiones de dirección y adjuntar el acta como evidencia.',
        ],
      };
    }

    // ── Caso B: NO_DATA — revisiones registradas pero ninguna evaluable ──
    if (status === 'NO_DATA' && meta?.noDataReason === 'no-evaluable-reviews') {
      return {
        summary:
          'Existen registros de revisión por la dirección, pero ninguno cumple actualmente las condiciones mínimas para ser evaluado (ejecución completada con fechas reales válidas, acta/evidencia y contenido de análisis o decisiones). El resultado de 6.1.3 no es evaluable hasta contar con al menos una revisión en esas condiciones.',
        keyIssues: findingsById.has('management-review-direction-no-evaluable-reviews')
          ? [{
              id: 'management-review-direction-no-evaluable-reviews',
              title: findingsById.get('management-review-direction-no-evaluable-reviews')!.title,
              priority: 'HIGH',
              impact:
                'Con registros sin ejecución completa ni evidencia formal, la organización no evidencia el acto de revisión de la alta dirección.',
              recommendation: RECOMMENDATION_BY_FINDING['management-review-direction-no-evaluable-reviews'],
            }]
          : [],
        quickWins: [
          'Completar la ejecución de una revisión existente (fechas reales) y adjuntar su acta o informe.',
        ],
        nextSteps: [
          'Documentar el análisis de la dirección y formalizar las decisiones con responsables y fechas.',
        ],
      };
    }

    // ── Fuente primaria de issues: los findings OFICIALES presentes ──
    const seen = new Set<string>();
    for (const f of findings) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      const isOfficial = (OFFICIAL_FINDING_IDS as readonly string[]).includes(f.id);
      keyIssues.push({
        id: f.id,
        title: f.title,
        priority: normalizePriority(f.priority),
        impact: f.description,
        // Finding desconocido → tratamiento defensivo con recomendación
        // genérica (no rompe el analyzer; no inventa métricas).
        recommendation: RECOMMENDATION_BY_FINDING[f.id]
          ?? (isOfficial
            ? 'Revisar la gestión de la revisión por la dirección.'
            : 'Revisar este hallazgo con el responsable del SG-SST.'),
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
        impact: `La dimensión de ${dim.label} muestra un desempeño bajo (${dim.percent}%) en la revisión evaluada.`,
        recommendation: DIMENSION_RECOMMENDATIONS[dim.key],
      });
    }

    // ── Decisiones vencidas: seguimiento derivado (NUNCA estado persistido) ──
    const overdue = num(counters, 'decisionsOverdue');
    if (overdue !== null && overdue > 0 && !seen.has('management-review-direction-overdue-decisions')) {
      seen.add('management-review-direction-overdue-decisions');
      keyIssues.push({
        id: 'management-review-direction-overdue-decisions',
        title: `${overdue} decisión(es) de dirección con fecha límite vencida`,
        priority: 'HIGH',
        impact:
          'Existen decisiones de la revisión cuya fecha límite ya pasó sin cierre registrado; requieren seguimiento de la alta dirección.',
        recommendation: RECOMMENDATION_BY_FINDING['management-review-direction-overdue-decisions'],
      });
    }

    // ── Resumen narrativo (orientado a alta dirección) ──
    const summary = this.buildSummary(officialPercentage, status, dims, meta, counters);

    const quickWins = weakDims.slice(0, 3).map((d) => DIMENSION_RECOMMENDATIONS[d.key]);
    if (quickWins.length === 0) {
      quickWins.push(
        'Mantener la periodicidad de la revisión por la dirección y el cierre oportuno de sus decisiones.',
      );
    }

    const openDecisions =
      (num(counters, 'decisionsPending') ?? 0) + (num(counters, 'decisionsInProgress') ?? 0);
    const nextSteps = [
      (overdue ?? 0) > 0
        ? 'Priorizar el cierre de las decisiones vencidas de la revisión más reciente.'
        : 'Hacer seguimiento a las decisiones de dirección pendientes y en progreso.',
      weakDims.some((d) => d.key === 'closureHistory')
        ? 'Programar la revisión del siguiente período para consolidar la continuidad histórica.'
        : 'Mantener el calendario de revisiones por la dirección actualizado.',
      openDecisions > 0
        ? `Asignar responsable y fecha a las ${openDecisions} decisión(es) abierta(s) que aún no lo tengan.`
        : 'Documentar el cumplimiento de las decisiones adoptadas en la próxima revisión.',
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
    meta: ManagementReviewDirectionMetadataView | null,
    counters: Record<string, unknown>,
  ): string {
    const period = meta?.evaluatedPeriod ? ` correspondiente a ${meta.evaluatedPeriod}` : '';
    const weakest = dims
      .filter((d) => d.percent !== null)
      .sort((a, b) => (a.percent as number) - (b.percent as number))[0];

    if (status === 'NO_DATA') {
      return `El resultado de 6.1.3 no es evaluable en este momento${period}: no existen datos suficientes para un análisis con fundamento.`;
    }

    const focus =
      weakest && weakest.percent !== null && weakest.percent < 100
        ? ` La principal brecha se concentra en ${weakest.label} (${weakest.percent}%).`
        : '';
    const evaluable = num(counters, 'reviewsEvaluable');
    const decisionsTotal = num(counters, 'decisionsTotal');
    const completedDecisions = num(counters, 'decisionsCompleted');
    const scope =
      evaluable !== null && decisionsTotal !== null && completedDecisions !== null
        ? ` Se evaluó ${evaluable} revisión(es) evaluable(s) con ${decisionsTotal} decisión(es) de dirección, ${completedDecisions} cerrada(s).`
        : '';

    if (officialPercentage >= 90) {
      return `La revisión del SG-SST por la alta dirección muestra un cumplimiento sólido (${officialPercentage}%)${period}.${focus}${scope}`;
    }
    if (officialPercentage >= 50) {
      return `El resultado oficial de 6.1.3 refleja la gestión actual de la revisión por la dirección (${officialPercentage}%)${period}.${focus}${scope}`;
    }
    return `El resultado oficial evidencia brechas relevantes en la revisión del SG-SST por la alta dirección (${officialPercentage}%)${period}.${focus}${scope}`;
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
        'reviewsTotal', 'reviewsEvaluable', 'reviewsCompleted', 'reviewsDraft',
        'reviewsPlanned', 'reviewsInProgress', 'reviewsCancelled',
        'inputsTotal', 'inputsReviewed', 'inputsValidReviewed',
        'inputTypesPresent', 'inputTypesReviewed',
        'decisionsTotal', 'decisionsActionable', 'decisionsCompleted',
        'decisionsPending', 'decisionsInProgress', 'decisionsCancelled',
        'decisionsOverdue', 'participantsTotal', 'participantsPresent',
        'reviewsWithEvidence', 'reviewsWithAnalysis', 'reviewsWithDecisions',
        'reviewsWithHistory', 'futureDateReviews',
      ];
      for (const key of counterKeys) {
        const value = num(meta.counters, key);
        if (value !== null) metrics[key] = value;
      }
    }
    return metrics;
  }
}
