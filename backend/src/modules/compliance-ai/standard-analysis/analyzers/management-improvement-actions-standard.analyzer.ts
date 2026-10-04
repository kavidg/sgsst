import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * E2 (7.1.2) — Analyzer oficial de las ACCIONES DE MEJORA DE LA ALTA
 * DIRECCIÓN (management-improvement-actions).
 *
 * - STANDARD_CODE '7.1.2' / MODULE 'management-improvement-actions'.
 * - Consume EXCLUSIVAMENTE el resultado oficial (moduleCompliance.compliance)
 *   y su metadata/findings (dimensions:v1 del provider oficial). NO consulta
 *   Mongo, NO recalcula el score, NO re-cuenta acciones, NO consulta
 *   AccountabilityMeeting ni AccountabilityCommitment.
 * - El analyzer legacy ManagementImprovementStandardAnalyzer (reuniones de
 *   rendición de cuentas) deja de ser la fuente de 7.1.2: se conserva
 *   físicamente pero SIN registro (patrón findings-review / corrective-
 *   preventive).
 * - FRONTERA con 7.1.1: la efectividad aquí es la PERCEPCIÓN declarativa del
 *   seguimiento (perceivedEffectiveness) — NO una verificación formal de
 *   eficacia; la narrativa NO debe presentarla como tal.
 */

/** Lectura defensiva de la metadata dimensions:v1 del provider oficial. */
interface MiaActionsMetadataView {
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
    actionsWithFollowUp: number;
    actionsWithoutFollowUp: number;
    effectiveActions: number;
    ineffectiveActions: number;
    indeterminateEffectivenessActions: number;
    actionsRequiringContinuedFollowUp: number;
  }>;
  latestAction?: { title?: string | null; actionCode?: string | null; status?: string | null } | null;
}

function readMetadata(metadata: unknown): MiaActionsMetadataView | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  if (m.formula !== 'dimensions:v1') return null;
  return m as MiaActionsMetadataView;
}

/** Findings oficiales de 7.1.2 (management-improvement-actions-scoring.ts). */
const MIA_FINDING_LABELS: Record<string, string> = {
  'management-improvement-actions-no-data': 'Registrar la gestión de acciones de mejora aprobadas por la alta dirección',
  'management-improvement-actions-incomplete-assignment': 'Completar la programación y trazabilidad de la decisión de origen de las acciones',
  'management-improvement-actions-overdue': 'Ejecutar o cerrar las acciones de mejora vencidas',
  'management-improvement-actions-no-follow-up': 'Registrar seguimiento de implementación con fecha y estado',
  'management-improvement-actions-no-evidence': 'Registrar evidencia de implementación de las acciones',
  'management-improvement-actions-traceability-incomplete': 'Documentar la decisión de alta dirección que originó cada acción',
  'management-improvement-actions-effectiveness-uncertain': 'Concluir la percepción de efectividad de las acciones en seguimiento',
  'management-improvement-actions-ineffective': 'Reorientar o derivar nuevas acciones de las percibidas como no efectivas',
  'management-improvement-actions-continued-follow-up': 'Mantener el seguimiento activo de las acciones que lo requieren',
};

export class ManagementImprovementActionsStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '7.1.2';
  private static readonly MODULE = 'management-improvement-actions';
  /** Título normativo del catálogo (la respuesta lo resuelve getStandardTitle). */
  private static readonly STANDARD_TITLE = 'Acciones mejora alta dirección';

  supports(standardCode: string): boolean {
    return standardCode === ManagementImprovementActionsStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return ManagementImprovementActionsStandardAnalyzer.MODULE;
  }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const officialPercentage = moduleCompliance.compliance;
    const status = (moduleCompliance as { status?: string }).status;
    const meta = readMetadata(moduleCompliance.metadata);
    const counters = meta?.counters ?? {};

    const keyIssues: StandardAnalysisKeyIssue[] = [];

    // ── Caso A: NO_DATA — no existen acciones registradas ──
    if (status === 'NO_DATA' && meta?.noDataReason === 'no-actions') {
      return {
        summary:
          'No existe gestión registrada de acciones de mejora de la alta dirección: mientras no se registre al menos una acción, el resultado de 7.1.2 no es evaluable.',
        keyIssues: [],
        quickWins: [
          'Registrar la primera acción de mejora aprobada por la alta dirección, con origen, responsable y fecha compromiso.',
        ],
        nextSteps: [
          'Documentar la decisión de la alta dirección que origina cada acción (decisionReference u originReferenceId).',
          'Establecer seguimiento de implementación con fecha, estado y percepción de efectividad.',
        ],
      };
    }

    // ── Key issues derivados de los findings oficiales del provider ──
    const findingsById = new Map(findings.map((f) => [f.id, f]));
    for (const f of findings) {
      const dimLabel = MIA_FINDING_LABELS[f.id];
      if (!dimLabel) continue;
      keyIssues.push({
        id: f.id,
        title: findingsById.get(f.id)?.title ?? f.title,
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
        `El resultado oficial de 7.1.2 refleja una gestión de acciones de mejora de la alta dirección consolidada (${officialPercentage}%)${period}.`,
      );
    } else {
      parts.push(
        `El resultado oficial de 7.1.2 refleja la gestión actual de las acciones de mejora de la alta dirección (${officialPercentage}%)${period}.`,
      );
      const overdue = counters.overdueActions ?? 0;
      if (overdue > 0) {
        parts.push(`Hay ${overdue} acción(es) vencida(s) sin cierre.`);
      }
      const withoutFollowUp = counters.actionsWithoutFollowUp ?? 0;
      if (withoutFollowUp > 0) {
        parts.push(`${withoutFollowUp} acción(es) sin seguimiento real de implementación registrado.`);
      }
      const withoutEvidence = counters.actionsWithoutEvidence ?? 0;
      if (withoutEvidence > 0) {
        parts.push(`${withoutEvidence} acción(es) sin evidencia de implementación.`);
      }
      const effective = counters.effectiveActions ?? 0;
      const ineffective = counters.ineffectiveActions ?? 0;
      const indeterminate = counters.indeterminateEffectivenessActions ?? 0;
      if (effective + ineffective + indeterminate > 0) {
        parts.push(
          `Percepción de efectividad en el seguimiento: ${effective} efectiva(s), ${ineffective} no efectiva(s), ${indeterminate} sin concluir.`,
        );
      }
      const requiringContinued = counters.actionsRequiringContinuedFollowUp ?? 0;
      if (requiringContinued > 0) {
        parts.push(`${requiringContinued} acción(es) requieren continuar en seguimiento.`);
      }
    }

    const quickWins = keyIssues
      .slice(0, 2)
      .map((i) => i.recommendation);
    const nextSteps = keyIssues
      .slice(0, 3)
      .map((i) => i.recommendation);
    if (quickWins.length === 0) {
      quickWins.push('Mantener el seguimiento de implementación y la trazabilidad de las decisiones de origen en las acciones nuevas.');
    }
    if (nextSteps.length === 0) {
      nextSteps.push('Consolidar la continuidad de la gestión de acciones de mejora en las próximas vigencias.');
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
      actionsWithFollowUp: counters.actionsWithFollowUp,
      effectiveActions: counters.effectiveActions,
      programmingRatio: ratio('programming') ?? undefined,
      executionRatio: ratio('execution') ?? undefined,
      evidenceRatio: ratio('evidence') ?? undefined,
      followUpRatio: ratio('followUp') ?? undefined,
    } as StandardAnalysisMetrics;
  }
}
