import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * E2 (6.1.4) — Analyzer oficial de la PLANIFICACIÓN DE AUDITORÍAS COPASST.
 *
 * Interpreta el resultado OFICIAL del ComplianceEngine (provider
 * `copasst-audit-planning`, formula `dimensions:v1`):
 * - NO calcula el score: el porcentaje oficial es moduleCompliance.compliance.
 * - NO recalcula dimensiones ni pesos; los ratios se transforman a % solo para
 *   el texto narrativo (0.35 → "35%").
 * - NO consulta Mongo/CopasstAuditPlanning/AccountabilityCommitment/AnnualAudit:
 *   consume exclusivamente el contexto ya resuelto por StandardAnalysisService
 *   (moduleCompliance + findings).
 * - Tolerante a metadata ausente/inválida, NO_DATA y findings desconocidos:
 *   nunca rompe la respuesta de IA por datos incompletos.
 *
 * Separación de dominios: este analyzer interpreta la PLANIFICACIÓN de
 * auditorías COPASST (6.1.4). El analyzer legacy FindingsReviewStandardAnalyzer
 * (AccountabilityCommitment) NO es fuente de 6.1.4 y fue RETIRADO del registro
 * en E2 (wrong-mapping; la clase se conserva en analyzers/ SIN registro, patrón
 * 5.1.1/5.1.2/6.1.1/6.1.3). AnnualAudit es 6.1.2 y NO participa aquí.
 */

/** Claves dimensionales oficiales emitidas por copasst-audit-planning-scoring.ts. */
const DIMENSION_KEYS = [
  'completeness',
  'schedule',
  'copasstParticipation',
  'traceability',
  'recommendations',
] as const;

type DimensionKey = (typeof DIMENSION_KEYS)[number];

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  completeness: 'la completitud de la planificación',
  schedule: 'la programación y cobertura de las auditorías',
  copasstParticipation: 'la participación del COPASST',
  traceability: 'la trazabilidad documental',
  recommendations: 'el seguimiento y la continuidad de la planificación',
};

const DIMENSION_RECOMMENDATIONS: Record<DimensionKey, string> = {
  completeness:
    'Completar la planificación: alcance, objetivos, criterios, metodología, responsable y período válido con al menos una auditoría planificada.',
  schedule:
    'Formalizar el cronograma: fechas dentro del período, auditor/responsable por auditoría planificada y estado PLANNED o superior.',
  copasstParticipation:
    'Documentar la participación del COPASST: declarar la participación con fecha o participantes, y referenciar el período COPASST vigente.',
  traceability:
    'Fortalecer la trazabilidad: identificar cada auditoría planificada con objetivo, alcance/criterios y metodología.',
  recommendations:
    'Mantener la planificación de auditorías COPASST en al menos dos vigencias para consolidar la continuidad del ciclo.',
};

/** Umbral narrativo de "dimensión débil" (presentación, no scoring). */
const WEAK_DIMENSION_PERCENT = 60;

/** Findings oficiales de 6.1.4 (copasst-audit-planning-scoring.ts). */
const OFFICIAL_FINDING_IDS = [
  'copasst-audit-planning-no-data',
  'copasst-audit-planning-no-evaluable-plannings',
  'copasst-audit-planning-completeness-incomplete',
  'copasst-audit-planning-schedule-incomplete',
  'copasst-audit-planning-copasst-participation-incomplete',
  'copasst-audit-planning-traceability-incomplete',
  'copasst-audit-planning-items-without-date',
  'copasst-audit-planning-overdue-items',
  'copasst-audit-planning-copasst-period-ref-missing',
  'copasst-audit-planning-history-limited',
] as const;

const RECOMMENDATION_BY_FINDING: Record<string, string> = {
  'copasst-audit-planning-no-data': DIMENSION_RECOMMENDATIONS.completeness,
  'copasst-audit-planning-no-evaluable-plannings': DIMENSION_RECOMMENDATIONS.completeness,
  'copasst-audit-planning-completeness-incomplete': DIMENSION_RECOMMENDATIONS.completeness,
  'copasst-audit-planning-schedule-incomplete': DIMENSION_RECOMMENDATIONS.schedule,
  'copasst-audit-planning-copasst-participation-incomplete': DIMENSION_RECOMMENDATIONS.copasstParticipation,
  'copasst-audit-planning-traceability-incomplete': DIMENSION_RECOMMENDATIONS.traceability,
  'copasst-audit-planning-items-without-date': DIMENSION_RECOMMENDATIONS.schedule,
  'copasst-audit-planning-overdue-items':
    'Actualizar el estado de las auditorías planificadas vencidas o reprogramar sus fechas dentro del período.',
  'copasst-audit-planning-copasst-period-ref-missing': DIMENSION_RECOMMENDATIONS.copasstParticipation,
  'copasst-audit-planning-history-limited': DIMENSION_RECOMMENDATIONS.recommendations,
};

const FINDING_BY_DIMENSION: Record<DimensionKey, string> = {
  completeness: 'copasst-audit-planning-completeness-incomplete',
  schedule: 'copasst-audit-planning-schedule-incomplete',
  copasstParticipation: 'copasst-audit-planning-copasst-participation-incomplete',
  traceability: 'copasst-audit-planning-traceability-incomplete',
  recommendations: 'copasst-audit-planning-history-limited',
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

interface CopasstAuditPlanningMetadataView {
  formula: string;
  evaluatedPeriod: string | null;
  noDataReason: string | null;
  dimensions: Partial<Record<DimensionKey, { ratio: unknown; weight: unknown }>>;
  counters: Record<string, unknown>;
  latestPlanning: Record<string, unknown> | null;
}

/** Lectura defensiva de la metadata oficial (dimensions:v1). */
function readMetadata(metadata: unknown): CopasstAuditPlanningMetadataView | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  if (m.formula !== 'dimensions:v1') return null;
  const dims = (m.dimensions ?? {}) as Record<string, Record<string, unknown>>;
  const view: CopasstAuditPlanningMetadataView = {
    formula: 'dimensions:v1',
    evaluatedPeriod: typeof m.evaluatedPeriod === 'string' ? m.evaluatedPeriod : null,
    noDataReason:
      m.noDataReason === 'no-plannings' || m.noDataReason === 'no-evaluable-plannings'
        ? m.noDataReason
        : null,
    dimensions: {},
    counters: (m.counters ?? {}) as Record<string, unknown>,
    latestPlanning:
      m.latestPlanning && typeof m.latestPlanning === 'object'
        ? (m.latestPlanning as Record<string, unknown>)
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

function dimensionViews(meta: CopasstAuditPlanningMetadataView | null): DimensionView[] {
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

export class CopasstAuditPlanningStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '6.1.4';
  private static readonly MODULE = 'copasst-audit-planning';

  supports(standardCode: string): boolean {
    return standardCode === CopasstAuditPlanningStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return CopasstAuditPlanningStandardAnalyzer.MODULE;
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

    // ── Caso A: NO_DATA — no existen planificaciones registradas ──
    if (status === 'NO_DATA' && meta?.noDataReason === 'no-plannings') {
      return {
        summary:
          'No existe planificación documentada de auditorías o verificaciones con participación del COPASST: mientras no se registre una planificación formal, el resultado de 6.1.4 no es evaluable.',
        keyIssues: findingsById.has('copasst-audit-planning-no-data')
          ? [{
              id: 'copasst-audit-planning-no-data',
              title: findingsById.get('copasst-audit-planning-no-data')!.title,
              priority: 'HIGH',
              impact:
                'Sin planificación registrada no es posible demostrar el cronograma, el alcance ni la participación del COPASST que exige el estándar.',
              recommendation: RECOMMENDATION_BY_FINDING['copasst-audit-planning-no-data'],
            }]
          : [],
        quickWins: [
          'Registrar la planificación de auditorías COPASST de la vigencia con período, alcance, objetivos y responsable.',
        ],
        nextSteps: [
          'Programar al menos una auditoría/verificación con fecha dentro del período y auditor asignado.',
          'Documentar la participación del COPASST y referenciar el período vigente del comité.',
        ],
      };
    }

    // ── Caso B: NO_DATA — planificaciones pero ninguna evaluable ──
    if (status === 'NO_DATA' && meta?.noDataReason === 'no-evaluable-plannings') {
      return {
        summary:
          'Existen registros de planificación de auditorías COPASST, pero ninguno cumple las condiciones mínimas para ser evaluado (período válido, título y al menos una auditoría planificada con fecha, título y objetivo). El resultado de 6.1.4 no es evaluable hasta contar con al menos una planificación en esas condiciones.',
        keyIssues: findingsById.has('copasst-audit-planning-no-evaluable-plannings')
          ? [{
              id: 'copasst-audit-planning-no-evaluable-plannings',
              title: findingsById.get('copasst-audit-planning-no-evaluable-plannings')!.title,
              priority: 'HIGH',
              impact:
                'Con registros incompletos (sin período válido o sin auditorías planificadas con sentido) la organización no evidencia una planificación real.',
              recommendation: RECOMMENDATION_BY_FINDING['copasst-audit-planning-no-evaluable-plannings'],
            }]
          : [],
        quickWins: [
          'Completar una planificación existente: definir el período y agregar al menos una auditoría planificada con fecha y objetivo.',
        ],
        nextSteps: [
          'Asignar responsable y auditor a las auditorías planificadas y formalizar el estado de la planificación.',
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
            ? 'Revisar la planificación de auditorías COPASST.'
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
        impact: `La dimensión de ${dim.label} muestra un desempeño bajo (${dim.percent}%) en la planificación evaluada.`,
        recommendation: DIMENSION_RECOMMENDATIONS[dim.key],
      });
    }

    // ── Resumen narrativo ──
    const summary = this.buildSummary(officialPercentage, status, dims, meta, counters);

    const quickWins = weakDims.slice(0, 3).map((d) => DIMENSION_RECOMMENDATIONS[d.key]);
    if (quickWins.length === 0) {
      quickWins.push(
        'Mantener la planificación de auditorías COPASST actualizada y documentar la participación del comité en cada auditoría.',
      );
    }

    const overdue = num(counters, 'overdueItems') ?? 0;
    const withoutDate = num(counters, 'itemsWithoutDate') ?? 0;
    const nextSteps = [
      overdue > 0
        ? 'Priorizar las auditorías planificadas vencidas: actualizar estado o reprogramar fechas.'
        : 'Hacer seguimiento a las auditorías planificadas del período vigente.',
      withoutDate > 0
        ? `Asignar fecha a las ${withoutDate} auditoría(s) planificada(s) que aún no la tienen.`
        : 'Mantener el cronograma dentro del período de la planificación vigente.',
      (num(counters, 'planningsWithCopasstPeriodRef') ?? 0) === 0
        ? 'Referenciar el período COPASST vigente en la planificación para completar la trazabilidad.'
        : 'Documentar la participación del COPASST en las auditorías planificadas del siguiente período.',
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
    meta: CopasstAuditPlanningMetadataView | null,
    counters: Record<string, unknown>,
  ): string {
    const period = meta?.evaluatedPeriod ? ` correspondiente a ${meta.evaluatedPeriod}` : '';
    const weakest = dims
      .filter((d) => d.percent !== null)
      .sort((a, b) => (a.percent as number) - (b.percent as number))[0];

    if (status === 'NO_DATA') {
      return `El resultado de 6.1.4 no es evaluable en este momento${period}: no existen datos suficientes para un análisis con fundamento.`;
    }

    const focus =
      weakest && weakest.percent !== null && weakest.percent < 100
        ? ` La principal brecha se concentra en ${weakest.label} (${weakest.percent}%).`
        : '';
    const evaluable = num(counters, 'planningsEvaluable');
    const itemsTotal = num(counters, 'itemsTotal');
    const withParticipation = num(counters, 'itemsWithParticipation');
    const scope =
      evaluable !== null && itemsTotal !== null && withParticipation !== null
        ? ` Se evaluó ${evaluable} planificación(es) evaluable(s) con ${itemsTotal} auditoría(s) planificada(s), ${withParticipation} con participación COPASST documentada.`
        : '';

    if (officialPercentage >= 90) {
      return `La planificación de auditorías COPASST muestra un cumplimiento sólido (${officialPercentage}%)${period}.${focus}${scope}`;
    }
    if (officialPercentage >= 50) {
      return `El resultado oficial de 6.1.4 refleja la gestión actual de la planificación de auditorías COPASST (${officialPercentage}%)${period}.${focus}${scope}`;
    }
    return `El resultado oficial evidencia brechas relevantes en la planificación de auditorías COPASST (${officialPercentage}%)${period}.${focus}${scope}`;
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
        'planningsTotal', 'planningsEvaluable', 'planningsDraft',
        'planningsPlanned', 'planningsInProgress', 'planningsCompleted',
        'planningsCancelled', 'itemsTotal', 'itemsCompleted',
        'itemsWithDate', 'itemsWithoutDate', 'itemsWithAuditor',
        'itemsWithResponsible', 'itemsWithParticipation',
        'planningsWithCopasstPeriodRef', 'overdueItems',
      ];
      for (const key of counterKeys) {
        const value = num(meta.counters, key);
        if (value !== null) metrics[key] = value;
      }
    }
    return metrics;
  }
}
