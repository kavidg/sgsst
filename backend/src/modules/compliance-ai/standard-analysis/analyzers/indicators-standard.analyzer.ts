import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * E4-C (6.1.1) — Analyzer oficial de Indicadores SG-SST.
 *
 * Interpreta el resultado OFICIAL del ComplianceEngine (provider `indicators`,
 * formula `dimensions:v1`):
 * - NO calcula el score: el porcentaje oficial es moduleCompliance.compliance.
 * - NO recalcula dimensiones ni pesos; los ratios se transforman a % solo para
 *   el texto narrativo.
 * - NO consulta Mongo: consume exclusivamente el contexto ya resuelto por
 *   StandardAnalysisService (moduleCompliance + findings del módulo).
 * - Tolerante a metadata ausente/inválida, NO_DATA y findings desconocidos:
 *   nunca rompe la respuesta de IA por datos incompletos.
 *
 * Separación de dominios: los indicadores cuyos KPI provienen de incidents/
 * trainings/inspections/risks/documents/absenteeism son KPI del sistema de
 * indicadores; este analyzer interpreta la GESTIÓN de los indicadores (6.1.1)
 * y NO emite juicios de cumplimiento de los estándares fuente (4.2.2, 2.x, 3.x).
 */

/** Claves dimensionales oficiales emitidas por indicators-scoring.ts. */
const DIMENSION_KEYS = [
  'existence',
  'definitionQuality',
  'measurement',
  'targetCompliance',
  'analysisEvidence',
  'history',
] as const;

type DimensionKey = (typeof DIMENSION_KEYS)[number];

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  existence: 'existencia de indicadores activos',
  definitionQuality: 'calidad de las fichas técnicas',
  measurement: 'disponibilidad de mediciones válidas',
  targetCompliance: 'cumplimiento de metas',
  analysisEvidence: 'análisis y evidencia de las mediciones',
  history: 'madurez del historial de períodos',
};

const DIMENSION_RECOMMENDATIONS: Record<DimensionKey, string> = {
  existence: 'Definir y activar los indicadores del SG-SST que el sistema de gestión requiere medir.',
  definitionQuality: 'Completar las fichas técnicas: descripción, meta, frecuencia y responsable de cada indicador.',
  measurement: 'Registrar las mediciones pendientes del período evaluado (automáticas o manuales según la ficha).',
  targetCompliance: 'Revisar los indicadores fuera de meta y definir acciones sobre sus procesos fuente.',
  analysisEvidence: 'Completar notas, análisis y evidencia en las mediciones registradas.',
  history: 'Cerrar y documentar los períodos históricos para consolidar la tendencia de los indicadores.',
};

/** Umbral narrativo de "dimensión débil" (presentación, no scoring). */
const WEAK_DIMENSION_PERCENT = 60;

/** Findings oficiales de 6.1.1 (indicators-scoring.ts) que el analyzer interpreta. */
const OFFICIAL_FINDING_IDS = [
  'indicators-no-active',
  'indicators-no-data',
  'indicators-definition-incomplete',
  'indicators-without-measurement',
  'indicators-target-not-met',
  'indicators-analysis-missing',
  'indicators-history-incomplete',
  'indicators-duplicate-measurements',
] as const;

const RECOMMENDATION_BY_FINDING: Record<string, string> = {
  'indicators-no-active': DIMENSION_RECOMMENDATIONS.existence,
  'indicators-no-data': DIMENSION_RECOMMENDATIONS.measurement,
  'indicators-definition-incomplete': DIMENSION_RECOMMENDATIONS.definitionQuality,
  'indicators-without-measurement': DIMENSION_RECOMMENDATIONS.measurement,
  'indicators-target-not-met': DIMENSION_RECOMMENDATIONS.targetCompliance,
  'indicators-analysis-missing': DIMENSION_RECOMMENDATIONS.analysisEvidence,
  'indicators-history-incomplete': DIMENSION_RECOMMENDATIONS.history,
  'indicators-duplicate-measurements':
    'Revisar el histórico del indicador afectado y depurar las mediciones duplicadas.',
};

const FINDING_BY_DIMENSION: Record<DimensionKey, string> = {
  existence: 'indicators-no-active',
  definitionQuality: 'indicators-definition-incomplete',
  measurement: 'indicators-without-measurement',
  targetCompliance: 'indicators-target-not-met',
  analysisEvidence: 'indicators-analysis-missing',
  history: 'indicators-history-incomplete',
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

interface IndicatorsMetadataView {
  formula: string;
  evaluatedPeriod: string | null;
  noDataReason: string | null;
  dimensions: Partial<Record<DimensionKey, { ratio: unknown; weight: unknown }>>;
  counters: Record<string, unknown>;
}

/** Lectura defensiva de la metadata oficial (dimensions:v1). */
function readMetadata(metadata: unknown): IndicatorsMetadataView | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  if (m.formula !== 'dimensions:v1') return null;
  const dims = (m.dimensions ?? {}) as Record<string, Record<string, unknown>>;
  const view: IndicatorsMetadataView = {
    formula: 'dimensions:v1',
    evaluatedPeriod: typeof m.evaluatedPeriod === 'string' ? m.evaluatedPeriod : null,
    noDataReason:
      m.noDataReason === 'no-active-indicators' || m.noDataReason === 'no-valid-measurements'
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

function dimensionViews(meta: IndicatorsMetadataView | null): DimensionView[] {
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

export class IndicatorsStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '6.1.1';
  private static readonly MODULE = 'indicators';

  supports(standardCode: string): boolean {
    return standardCode === IndicatorsStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return IndicatorsStandardAnalyzer.MODULE;
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

    // ── Caso A: NO_DATA por ausencia de indicadores activos ──
    if (status === 'NO_DATA' && meta?.noDataReason === 'no-active-indicators') {
      return {
        summary:
          'No existen indicadores activos evaluables para 6.1.1: el sistema de indicadores del SG-SST aún no está conformado, por lo que el resultado del estándar no es evaluable en este momento.',
        keyIssues: findingsById.has('indicators-no-active')
          ? [{
              id: 'indicators-no-active',
              title: findingsById.get('indicators-no-active')!.title,
              priority: 'HIGH',
              impact: 'Sin indicadores activos no es posible demostrar la medición y análisis periódicos del SG-SST.',
              recommendation: DIMENSION_RECOMMENDATIONS.existence,
            }]
          : [],
        quickWins: [
          'Definir los primeros indicadores de estructura, proceso y resultado con ficha técnica completa.',
        ],
        nextSteps: [
          'Registrar las horas trabajadas y ejecutar el primer cálculo de período.',
          'Cerrar el primer período para iniciar el historial.',
        ],
      };
    }

    // ── Caso B: NO_DATA por ausencia de mediciones válidas ──
    if (status === 'NO_DATA' && meta?.noDataReason === 'no-valid-measurements') {
      return {
        summary:
          'Existen indicadores definidos, pero no hay mediciones válidas para el período evaluado: el resultado de 6.1.1 no es evaluable hasta que se registre al menos una medición.',
        keyIssues: findingsById.has('indicators-no-data')
          ? [{
              id: 'indicators-no-data',
              title: findingsById.get('indicators-no-data')!.title,
              priority: 'HIGH',
              impact: 'Con indicadores definidos pero sin mediciones, la organización no evidencia seguimiento periódico del desempeño.',
              recommendation: DIMENSION_RECOMMENDATIONS.measurement,
            }]
          : [],
        quickWins: [
          'Ejecutar el cálculo automático del período abierto.',
          'Registrar manualmente las mediciones de los indicadores de tipo manual.',
        ],
        nextSteps: [
          'Verificar que el denominador de horas trabajadas esté registrado para los indicadores que lo requieren.',
          'Programar la frecuencia de medición declarada en cada ficha técnica.',
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
        recommendation: RECOMMENDATION_BY_FINDING[f.id] ?? 'Revisar la gestión de indicadores del período.',
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
        impact: `La dimensión de ${dim.label} muestra un desempeño bajo (${dim.percent}%) en el período evaluado.`,
        recommendation: DIMENSION_RECOMMENDATIONS[dim.key],
      });
    }

    // ── Integridad: duplicados reportados por counters sin finding oficial ──
    const duplicates = num(counters, 'duplicateMeasurementKeys');
    if (duplicates !== null && duplicates > 0 && !seen.has('indicators-duplicate-measurements')) {
      seen.add('indicators-duplicate-measurements');
      keyIssues.push({
        id: 'indicators-duplicate-measurements',
        title: 'Mediciones duplicadas',
        priority: 'LOW',
        impact: `Se detectaron ${duplicates} clave(s) de medición duplicada (indicador + período); el cálculo usa la medición más reciente.`,
        recommendation: RECOMMENDATION_BY_FINDING['indicators-duplicate-measurements'],
      });
    }

    // ── Resumen narrativo ──
    // Caso C: un 0% con datos evaluables es cumplimiento real bajo, no ausencia de datos.
    const summary = this.buildSummary(officialPercentage, status, dims, meta, counters);

    const quickWins = weakDims
      .slice(0, 3)
      .map((d) => DIMENSION_RECOMMENDATIONS[d.key]);
    if (quickWins.length === 0) {
      quickWins.push('Mantener la rutina de medición y cierre de períodos según la frecuencia definida.');
    }

    const nextSteps = [
      weakDims.some((d) => d.key === 'measurement')
        ? 'Ejecutar el cálculo del período y revisar los indicadores que quedaron sin medición.'
        : 'Documentar el análisis del período y prepararlo para la revisión de la dirección (6.1.2).',
      weakDims.some((d) => d.key === 'history')
        ? 'Cerrar los períodos pendientes para consolidar la línea base histórica.'
        : 'Continuar el cierre periódico de períodos para fortalecer la trazabilidad.',
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
    meta: IndicatorsMetadataView | null,
    counters: Record<string, unknown>,
  ): string {
    const period = meta?.evaluatedPeriod ? ` para el período ${meta.evaluatedPeriod}` : '';
    const weakest = dims
      .filter((d) => d.percent !== null)
      .sort((a, b) => (a.percent as number) - (b.percent as number))[0];

    if (status === 'NO_DATA') {
      return `El resultado de 6.1.1 no es evaluable en este momento${period}: no existen datos suficientes para un análisis con fundamento.`;
    }

    const focus =
      weakest && weakest.percent !== null && weakest.percent < 100
        ? ` La principal brecha se concentra en ${weakest.label} (${weakest.percent}%).`
        : '';
    const active = num(counters, 'activeIndicators');
    const withMeasurement = num(counters, 'indicatorsWithMeasurement');
    const scope =
      active !== null && withMeasurement !== null
        ? ` Con ${active} indicador(es) activo(s), ${withMeasurement} cuenta(n) con medición válida.`
        : '';

    if (officialPercentage >= 90) {
      return `El sistema de indicadores del SG-SST muestra un cumplimiento sólido (${officialPercentage}%)${period}.${focus}${scope}`;
    }
    if (officialPercentage >= 50) {
      return `El resultado de 6.1.1 refleja la gestión actual de los indicadores SG-SST (${officialPercentage}%)${period}.${focus}${scope}`;
    }
    return `La gestión de indicadores del SG-SST requiere atención prioritaria (${officialPercentage}%)${period}.${focus}${scope}`;
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    const meta = readMetadata(ctx.moduleCompliance.metadata);
    const metrics: StandardAnalysisMetrics = {
      compliancePercentage: ctx.moduleCompliance.compliance,
    };
    if (meta) {
      if (meta.evaluatedPeriod) {
        // No es numérico: se omite; el período viaja en la narrativa.
      }
      for (const dim of dimensionViews(meta)) {
        if (dim.percent !== null) {
          metrics[`dimension_${dim.key}_percent`] = dim.percent;
        }
      }
      const counterKeys = [
        'totalIndicators', 'activeIndicators', 'inactiveIndicators',
        'completeDefinitions', 'incompleteDefinitions',
        'indicatorsWithMeasurement', 'indicatorsWithoutMeasurement',
        'validMeasurements', 'targetMet', 'targetNotMet',
        'measurementsWithEvidence', 'measurementsWithNotes',
        'distinctMeasuredPeriods', 'closedPeriods', 'openPeriods',
        'duplicateMeasurementKeys',
      ];
      for (const key of counterKeys) {
        const value = num(meta.counters, key);
        if (value !== null) metrics[key] = value;
      }
    }
    return metrics;
  }
}
