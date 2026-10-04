import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * E2 (7.1.3) — Analyzer OFICIAL de las ACCIONES POR ACCIDENTES
 * (incident-actions — dominio incidents).
 *
 * - STANDARD_CODE '7.1.3' / MODULE 'incident-actions'.
 * - Consume EXCLUSIVAMENTE el resultado oficial (moduleCompliance.compliance)
 *   y su metadata/findings (dimensions:v1 del provider oficial). NO consulta
 *   Mongo, NO recalcula el score, NO re-cuenta casos ni acciones.
 * - Reemplaza IN-PLACE el analyzer mínimo de FASE 20 (mismo archivo, mismo
 *   nombre de clase, misma posición en el registro first-wins del
 *   StandardAnalysisService): continúa siendo el ÚNICO analyzer de 7.1.3.
 * - Responde al contrato E0/E2: narrativa sobre la cadena accidente →
 *   investigación → análisis causal → acciones → seguimiento → evidencia →
 *   cierre. DISEASE (3.2.2) queda fuera de la narrativa (excluido del
 *   scoring; counter diseasesExcluded transparenta la exclusión).
 * - FRONTERA con 7.1.1: la efectividad aquí es la PERCEPCIÓN declarativa del
 *   seguimiento (perceivedEffectiveness) — la narrativa NUNCA la presenta
 *   como "eficacia verificada" ni "efectividad comprobada".
 */

/** Lectura defensiva de la metadata dimensions:v1 del provider oficial. */
interface IncidentActionsMetadataView {
  standardCode?: string;
  formula?: string;
  evaluatedPeriod?: string | null;
  noDataReason?: string | null;
  weights?: Record<string, number>;
  dimensions?: Record<
    string,
    { ratio?: number | null; subchecks?: { satisfied: number; total: number }; [k: string]: unknown }
  >;
  counters?: Partial<{
    totalIncidents: number;
    evaluableIncidents: number;
    accidents: number;
    incidents: number;
    diseasesExcluded: number;
    investigatedCases: number;
    casesWithoutInvestigation: number;
    casesWithCausalAnalysis: number;
    casesWithoutCausalAnalysis: number;
    casesWithActions: number;
    casesWithoutActions: number;
    totalActions: number;
    completedActions: number;
    pendingActions: number;
    overdueActions: number;
    actionsWithEvidence: number;
    actionsWithoutEvidence: number;
    actionsWithFollowUp: number;
    casesClosed: number;
    casesNotClosed: number;
    lastIncidentDate: string | null;
  }>;
  latestIncident?: { type?: string | null; date?: string | null; lifecycleStage?: string | null } | null;
}

function readMetadata(metadata: unknown): IncidentActionsMetadataView | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  if (m.formula !== 'dimensions:v1') return null;
  return m as IncidentActionsMetadataView;
}

/** Findings oficiales de 7.1.3 (incident-actions-scoring.ts). */
const INCIDENT_ACTIONS_FINDING_LABELS: Record<string, string> = {
  'incident-actions-no-data': 'Registrar los accidentes/incidentes y su investigación con acciones derivadas',
  'incident-actions-no-investigation': 'Iniciar la investigación formal de cada accidente/incidente (fecha y responsable)',
  'incident-actions-incomplete-investigation': 'Completar el perfil de investigación (metodología, equipo y conclusiones)',
  'incident-actions-incomplete-causal-analysis': 'Documentar el análisis causal (causas inmediatas, básicas y factores relacionados)',
  'incident-actions-no-actions': 'Derivar acciones correctivas/preventivas de las conclusiones de cada investigación',
  'incident-actions-actions-without-responsible': 'Asignar responsable a cada acción derivada',
  'incident-actions-overdue': 'Ejecutar o cerrar las acciones vencidas',
  'incident-actions-actions-incomplete': 'Llevar las acciones derivadas hasta su cierre',
  'incident-actions-no-evidence': 'Registrar evidencia de la investigación y de la ejecución de las acciones',
  'incident-actions-insufficient-follow-up': 'Registrar seguimiento de las acciones con fecha, estado y percepción de efectividad',
  'incident-actions-closure-not-documented': 'Documentar el cierre de los casos con investigación y acciones completas',
};

export class IncidentActionsStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '7.1.3';
  private static readonly MODULE = 'incident-actions';
  /** Título normativo del catálogo (la respuesta lo resuelve getStandardTitle). */
  private static readonly STANDARD_TITLE = 'Acciones por accidentes';

  supports(standardCode: string): boolean {
    return standardCode === IncidentActionsStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return IncidentActionsStandardAnalyzer.MODULE;
  }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const officialPercentage = moduleCompliance.compliance;
    const status = (moduleCompliance as { status?: string }).status;
    const meta = readMetadata(moduleCompliance.metadata);
    const counters = meta?.counters ?? {};

    const keyIssues: StandardAnalysisKeyIssue[] = [];

    // ── Caso A: NO_DATA — sin casos evaluables (DISEASE u otros excluidos) ──
    if (status === 'NO_DATA' && meta?.noDataReason === 'no-evaluable-cases') {
      const excluded = counters.diseasesExcluded ?? 0;
      return {
        summary:
          'No existen casos evaluable de accidentes o incidentes de trabajo registrados: mientras no se registre al menos un caso, el resultado de 7.1.3 no es evaluable' +
          (excluded > 0
            ? ` (se excluyeron ${excluded} caso(s) de enfermedad laboral, que corresponden al estándar 3.2.2 y no puntúan 7.1.3).`
            : '.'),
        keyIssues: [],
        quickWins: [
          'Registrar el accidente/incidente e iniciar su investigación formal con responsable y metodología.',
        ],
        nextSteps: [
          'Documentar el análisis causal (causas inmediatas, básicas y factores relacionados) de cada caso.',
          'Derivar acciones con responsable y fechas, y darles seguimiento hasta el cierre documentado.',
        ],
      };
    }

    // ── Key issues derivados de los findings oficiales del provider ──
    const findingsById = new Map(findings.map((f) => [f.id, f]));
    for (const f of findings) {
      const recommendation = INCIDENT_ACTIONS_FINDING_LABELS[f.id];
      if (!recommendation) continue;
      keyIssues.push({
        id: f.id,
        title: findingsById.get(f.id)?.title ?? f.title,
        priority: f.priority === 'HIGH' ? 'HIGH' : 'MEDIUM',
        impact: f.description,
        recommendation,
      });
    }

    // ── Narrativa basada SOLO en metadata/counters oficiales ──
    const parts: string[] = [];
    const period = meta?.evaluatedPeriod ? ` (vigencia ${meta.evaluatedPeriod})` : '';
    const evaluable = counters.evaluableIncidents ?? 0;
    const accidents = counters.accidents ?? 0;
    const incidentsCount = counters.incidents ?? 0;

    if (keyIssues.length === 0) {
      parts.push(
        `El resultado oficial de 7.1.3 refleja una gestión consolidada de la cadena accidente → investigación → análisis causal → acciones → cierre (${officialPercentage}%)${period}.`,
      );
    } else {
      parts.push(
        `El resultado oficial de 7.1.3 refleja la gestión de los casos de accidente e incidente registrados (${officialPercentage}%)${period}.`,
      );
      if (evaluable > 0) {
        parts.push(
          `Portafolio evaluable: ${accidents} accidente(s) y ${incidentsCount} incidente(s)` +
            (counters.diseasesExcluded
              ? `; se excluyen ${counters.diseasesExcluded} caso(s) de enfermedad laboral (3.2.2) del alcance de este estándar.`
              : '.'),
        );
      }
      const withoutInvestigation = counters.casesWithoutInvestigation ?? 0;
      if (withoutInvestigation > 0) {
        parts.push(`${withoutInvestigation} caso(s) sin investigación formal registrada.`);
      }
      const withoutCausal = counters.casesWithoutCausalAnalysis ?? 0;
      if (withoutCausal > 0) {
        parts.push(`${withoutCausal} caso(s) sin análisis causal documentado.`);
      }
      const withoutActions = counters.casesWithoutActions ?? 0;
      if (withoutActions > 0) {
        parts.push(`${withoutActions} caso(s) sin acciones derivadas.`);
      }
      const overdue = counters.overdueActions ?? 0;
      if (overdue > 0) {
        parts.push(`Hay ${overdue} acción(es) vencida(s) sin cierre.`);
      }
      const pending = counters.pendingActions ?? 0;
      if (pending > 0) {
        parts.push(`${pending} acción(es) permanecen pendientes o en ejecución.`);
      }
      const withoutEvidence = counters.actionsWithoutEvidence ?? 0;
      if (withoutEvidence > 0) {
        parts.push(`${withoutEvidence} acción(es) sin evidencia de implementación.`);
      }
      const closed = counters.casesClosed ?? 0;
      const notClosed = counters.casesNotClosed ?? 0;
      if (closed + notClosed > 0) {
        parts.push(`Cierre de casos: ${closed} cerrado(s), ${notClosed} pendiente(s) de cierre documentado.`);
      }
    }

    const quickWins = keyIssues
      .slice(0, 2)
      .map((i) => i.recommendation);
    const nextSteps = keyIssues
      .slice(0, 3)
      .map((i) => i.recommendation);
    if (quickWins.length === 0) {
      quickWins.push('Mantener la trazabilidad accidente → investigación → acciones → cierre en los casos nuevos.');
    }
    if (nextSteps.length === 0) {
      nextSteps.push('Consolidar la cadena de investigación y acciones por accidentes en las próximas vigencias.');
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
      totalIncidents: counters.totalIncidents,
      evaluableIncidents: counters.evaluableIncidents,
      overdueActions: counters.overdueActions,
      actionsWithEvidence: counters.actionsWithEvidence,
      actionsWithFollowUp: counters.actionsWithFollowUp,
      investigationRatio: ratio('investigation') ?? undefined,
      causalAnalysisRatio: ratio('causalAnalysis') ?? undefined,
      actionsRatio: ratio('actions') ?? undefined,
      executionRatio: ratio('execution') ?? undefined,
      evidenceRatio: ratio('evidence') ?? undefined,
    } as StandardAnalysisMetrics;
  }
}
