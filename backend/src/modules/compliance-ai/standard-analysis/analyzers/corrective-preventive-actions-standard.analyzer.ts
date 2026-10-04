import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * E2 (7.1.1) — Analyzer oficial de las ACCIONES PREVENTIVAS Y CORRECTIVAS.
 *
 * - STANDARD_CODE '7.1.1' / MODULE 'corrective-preventive-actions'.
 * - Consume EXCLUSIVAMENTE el resultado oficial (moduleCompliance.compliance)
 *   y su metadata/findings (dimensions:v1 del provider oficial). NO consulta
 *   Mongo, NO recalcula el score, NO re-cuenta acciones.
 * - El analyzer legacy CorrectivePreventiveStandardAnalyzer (Accountability-
 *   Commitment) deja de ser la fuente de 7.1.1: se conserva físicamente pero
 *   SIN registro (patrón findings-review).
 */

/** Lectura defensiva de la metadata dimensions:v1 del provider oficial. */
interface CpaActionsMetadataView {
  standardCode?: string;
  formula?: string;
  evaluatedPeriod?: string | null;
  noDataReason?: string | null;
  weights?: Record<string, number>;
  dimensions?: Record<string, { ratio?: number | null; subchecks?: { satisfied: number; total: number }; [k: string]: unknown }>;
  counters?: Partial<{
    totalActions: number;
    evaluableActions: number;
    pendingActions: number;
    inProgressActions: number;
    completedActions: number;
    cancelledActions: number;
    overdueActions: number;
    actionsWithEvidence: number;
    actionsWithoutEvidence: number;
    actionsWithEffectiveness: number;
    actionsWithoutEffectiveness: number;
    effectiveActions: number;
    ineffectiveActions: number;
    actionsRequiringNewAction: number;
  }>;
  latestAction?: { title?: string | null; actionCode?: string | null; status?: string | null } | null;
}

function readMetadata(metadata: unknown): CpaActionsMetadataView | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  if (m.formula !== 'dimensions:v1') return null;
  return m as CpaActionsMetadataView;
}

/** Findings oficiales de 7.1.1 (corrective-preventive-actions-scoring.ts). */
const CPA_FINDING_LABELS: Record<string, string> = {
  'corrective-preventive-actions-no-data': 'Registrar la gestión de acciones preventivas y correctivas',
  'corrective-preventive-actions-incomplete-assignment': 'Completar la asignación de las acciones (tipo, origen, responsable, fechas, prioridad)',
  'corrective-preventive-actions-overdue': 'Ejecutar o cerrar las acciones vencidas',
  'corrective-preventive-actions-no-evidence': 'Registrar evidencia de ejecución de las acciones',
  'corrective-preventive-actions-effectiveness-unverified': 'Verificar la eficacia de las acciones completadas',
  'corrective-preventive-actions-traceability-incomplete': 'Documentar causa raíz y plan de acción',
  'corrective-preventive-actions-ineffective': 'Derivar nuevas acciones de las verificadas como no efectivas',
};

export class CorrectivePreventiveActionsStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '7.1.1';
  private static readonly MODULE = 'corrective-preventive-actions';
  /** Título normativo del catálogo (la respuesta lo resuelve getStandardTitle). */
  private static readonly STANDARD_TITLE = 'Acciones preventivas y correctivas';

  supports(standardCode: string): boolean {
    return standardCode === CorrectivePreventiveActionsStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return CorrectivePreventiveActionsStandardAnalyzer.MODULE;
  }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const officialPercentage = moduleCompliance.compliance;
    const status = (moduleCompliance as { status?: string }).status;
    const meta = readMetadata(moduleCompliance.metadata);
    const dims = meta?.dimensions ?? {};
    const counters = meta?.counters ?? {};

    const keyIssues: StandardAnalysisKeyIssue[] = [];
    const findingsById = new Map(findings.map((f) => [f.id, f]));

    // ── Caso A: NO_DATA — no existen acciones registradas ──
    if (status === 'NO_DATA' && meta?.noDataReason === 'no-actions') {
      return {
        summary:
          'No existe gestión registrada de acciones preventivas y correctivas: mientras no se registre al menos una acción, el resultado de 7.1.1 no es evaluable.',
        keyIssues: [],
        quickWins: [
          'Registrar la primera acción preventiva o correctiva con tipo, origen, responsable y fecha compromiso.',
        ],
        nextSteps: [
          'Definir el proceso de registro de acciones derivadas de hallazgos (auditorías, inspecciones, indicadores, matriz legal).',
          'Establecer responsables y fechas compromiso para cada acción registrada.',
        ],
      };
    }

    // ── Key issues derivados de los findings oficiales del provider ──
    for (const f of findings) {
      const dimLabel = CPA_FINDING_LABELS[f.id];
      if (!dimLabel) continue;
      keyIssues.push({
        id: f.id,
        title: f.title,
        priority: f.priority === 'HIGH' ? 'HIGH' : 'MEDIUM',
        impact: f.description,
        recommendation: dimLabel,
      });
    }

    // ── Narrativa basada SOLO en metadata/counters oficiales ──
    const parts: string[] = [];
    const period = meta?.evaluatedPeriod ? ` (vigencia ${meta.evaluatedPeriod})` : '';
    if (keyIssues.length === 0) {
      parts.push(
        `El resultado oficial de 7.1.1 refleja una gestión de acciones preventivas y correctivas consolidada (${officialPercentage}%)${period}.`,
      );
    } else {
      parts.push(
        `El resultado oficial de 7.1.1 refleja la gestión actual de las acciones preventivas y correctivas (${officialPercentage}%)${period}.`,
      );
      const overdue = counters.overdueActions ?? 0;
      if (overdue > 0) {
        parts.push(`Hay ${overdue} acción(es) vencida(s) sin cierre.`);
      }
      const completed = counters.completedActions ?? 0;
      const withoutEff = counters.actionsWithoutEffectiveness ?? 0;
      if (completed > 0 && withoutEff > 0) {
        parts.push(
          `${withoutEff} de ${completed} acción(es) completada(s) aún no tienen verificación de eficacia registrada.`,
        );
      }
      const effective = counters.effectiveActions ?? 0;
      const ineffective = counters.ineffectiveActions ?? 0;
      if (effective + ineffective > 0) {
        parts.push(`Verificaciones de eficacia: ${effective} efectiva(s), ${ineffective} no efectiva(s).`);
      }
    }

    const quickWins = keyIssues
      .slice(0, 2)
      .map((i) => i.recommendation);
    const nextSteps = keyIssues
      .slice(0, 3)
      .map((i) => i.recommendation);
    if (quickWins.length === 0) {
      quickWins.push('Mantener la verificación de eficacia de las acciones nuevas al cerrarlas.');
    }
    if (nextSteps.length === 0) {
      nextSteps.push('Consolidar la continuidad de la gestión de acciones en las próximas vigencias.');
    }

    return {
      summary: parts.join(' '),
      keyIssues,
      quickWins,
      nextSteps,
    };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    const meta = readMetadata(ctx.moduleCompliance.metadata);
    const counters = meta?.counters ?? {};
    const dims = meta?.dimensions ?? {};
    const ratio = (key: string): number | null => {
      const r = dims[key]?.ratio;
      return typeof r === 'number' ? r : null;
    };
    return {
      compliancePercentage: ctx.moduleCompliance.compliance,
      totalActions: counters.totalActions,
      overdueActions: counters.overdueActions,
      actionsWithEvidence: counters.actionsWithEvidence,
      actionsWithEffectiveness: counters.actionsWithEffectiveness,
      effectiveActions: counters.effectiveActions,
      programmingRatio: ratio('programming') ?? undefined,
      executionRatio: ratio('execution') ?? undefined,
      evidenceRatio: ratio('evidence') ?? undefined,
      effectivenessRatio: ratio('effectiveness') ?? undefined,
    } as StandardAnalysisMetrics;
  }
}
