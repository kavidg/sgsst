import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 4.1.2
 * "Participación de trabajadores en la identificación de peligros,
 *  evaluación y valoración de riesgos, y toma de decisiones sobre
 *  medidas de prevención y establecimiento de controles".
 *
 * Interpreta los datos reales del ComplianceEngine (WorkerParticipationProvider)
 * y genera un análisis textual accionable.
 *
 * NO recalcula el score.
 * NO inventa datos.
 * NO consulta MongoDB.
 * Solo interpreta lo que el ComplianceEngine ya evaluó.
 *
 * El Provider genera estos findings:
 * - worker-participation-no-data (HIGH): no hay registros de participación
 * - worker-participation-no-completed (HIGH): registros existen pero ninguno COMPLETED
 * - worker-participation-no-participants (HIGH): COMPLETED sin participantes
 * - worker-participation-partial-participants (MEDIUM): algunos COMPLETED sin participantes
 * - worker-participation-incomplete-coverage (MEDIUM): faltan categorías esenciales
 */
export class WorkerParticipationStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '4.1.2';
  private static readonly MODULE = 'worker-participation';

  supports(standardCode: string): boolean {
    return standardCode === WorkerParticipationStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return WorkerParticipationStandardAnalyzer.MODULE;
  }

  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = context;
    const percentage = moduleCompliance.compliance;

    // ── NO_DATA ──
    const hasNoDataFinding = findings.some((f) => f.id === 'worker-participation-no-data');
    if (hasNoDataFinding || percentage === 0) {
      return {
        summary:
          'No existen registros de participación de trabajadores en la identificación de peligros, ' +
          'evaluación y valoración de riesgos. El estándar 4.1.2 requiere evidencia documentada de participación activa.',
        keyIssues: [],
        quickWins: [
          'Registrar las primeras actividades de participación de trabajadores en la gestión de peligros y riesgos.',
        ],
        nextSteps: [
          'Iniciar el registro de actividades de participación de trabajadores conforme al estándar 4.1.2.',
        ],
      };
    }

    // ── Construir keyIssues desde findings reales ──
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const finding of findings) {
      const priority = this.mapPriority(finding.priority);

      if (finding.id === 'worker-participation-no-completed') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen registros de participación pero ninguno está completado. ' +
            'Sin actividades en estado COMPLETED, no existe evidencia efectiva de participación de trabajadores.',
          recommendation:
            'Completar las actividades de participación registradas para generar evidencia efectiva del estándar 4.1.2.',
        });
      } else if (finding.id === 'worker-participation-no-participants') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Las actividades completadas no tienen participantes registrados. ' +
            'Sin identificar quiénes participaron, no se puede demostrar participación efectiva de trabajadores.',
          recommendation:
            'Identificar y registrar los trabajadores que participaron en cada actividad completada.',
        });
      } else if (finding.id === 'worker-participation-partial-participants') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Algunas actividades completadas tienen participantes registrados, pero otras no. ' +
            'La evidencia de participación es parcial e inconsistente.',
          recommendation:
            'Completar la identificación de participantes en las actividades que aún no la tienen registrada.',
        });
      } else if (finding.id === 'worker-participation-incomplete-coverage') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'No existe evidencia de participación en todas las categorías esenciales del estándar 4.1.2: ' +
            'identificación de peligros, evaluación de riesgos, valoración de riesgos, ' +
            'decisiones sobre medidas de prevención/control y establecimiento de controles.',
          recommendation:
            'Registrar actividades de participación en las categorías esenciales que aún no tienen evidencia.',
        });
      }
    }

    // ── Summary basado en porcentaje real ──
    const summary = this.buildSummary(percentage, keyIssues);

    // ── Quick Wins (máximo 3) ──
    const quickWins = this.buildQuickWins(keyIssues);

    // ── Next Steps (máximo 3) ──
    const nextSteps = this.buildNextSteps(keyIssues);

    return { summary, keyIssues, quickWins, nextSteps };
  }

  getMetrics(context: StandardAnalysisContext): StandardAnalysisMetrics {
    const { findings, moduleCompliance } = context;

    const metrics: StandardAnalysisMetrics = {
      compliancePercentage: moduleCompliance.compliance,
    };

    // Inferir métricas desde findings
    const hasNoData = findings.some((f) => f.id === 'worker-participation-no-data');
    const hasNoCompleted = findings.some((f) => f.id === 'worker-participation-no-completed');
    const hasNoParticipants = findings.some((f) => f.id === 'worker-participation-no-participants');
    const hasPartialParticipants = findings.some((f) => f.id === 'worker-participation-partial-participants');
    const hasIncompleteCoverage = findings.some((f) => f.id === 'worker-participation-incomplete-coverage');

    if (hasNoData) {
      metrics.hasRecords = 0;
      metrics.hasCompleted = 0;
      metrics.hasParticipants = 0;
      metrics.hasCoverage = 0;
    } else {
      metrics.hasRecords = 1;
      metrics.hasCompleted = hasNoCompleted ? 0 : 1;
      metrics.hasParticipants = hasNoParticipants ? 0 : (hasPartialParticipants ? 0.5 : 1);
      metrics.hasCoverage = hasIncompleteCoverage ? 0 : 1;
    }

    return metrics;
  }

  // ── Helpers privados ──

  private buildSummary(
    percentage: number,
    keyIssues: StandardAnalysisKeyIssue[],
  ): string {
    if (percentage === 0) {
      return (
        'No existen registros de participación de trabajadores en la identificación de peligros, ' +
        'evaluación y valoración de riesgos. El estándar 4.1.2 requiere evidencia documentada de participación activa.'
      );
    }

    if (percentage >= 90) {
      return (
        `La participación de trabajadores presenta un cumplimiento del ${percentage}%, lo que indica evidencia sólida de participación en la gestión de peligros y riesgos. ` +
        'Se recomienda mantener la calidad de los registros y la cobertura de categorías esenciales.'
      );
    }

    if (percentage >= 50) {
      const issuesText =
        keyIssues.length > 0
          ? ` Las principales oportunidades de mejora son: ${keyIssues
              .slice(0, 2)
              .map((issue) => issue.title.toLowerCase())
              .join(' y ')}.`
          : '';
      return (
        `La participación de trabajadores presenta avances con un ${percentage}%, aunque existen brechas en participantes, cobertura de categorías o actividades sin completar.${issuesText}`
      );
    }

    // percentage < 50
    return (
      `La participación de trabajadores requiere atención prioritaria (${percentage}%) debido a brechas significativas. ` +
      'Se recomienda registrar, completar y documentar la participación de trabajadores conforme al estándar 4.1.2.'
    );
  }

  private buildQuickWins(keyIssues: StandardAnalysisKeyIssue[]): string[] {
    const wins: string[] = [];

    const hasNoCompleted = keyIssues.some((i) => i.id === 'worker-participation-no-completed');
    const hasNoParticipants = keyIssues.some((i) => i.id === 'worker-participation-no-participants');
    const hasPartialParticipants = keyIssues.some((i) => i.id === 'worker-participation-partial-participants');
    const hasIncompleteCoverage = keyIssues.some((i) => i.id === 'worker-participation-incomplete-coverage');

    if (hasNoCompleted) {
      wins.push('Completar las actividades de participación registradas para generar evidencia efectiva.');
    }

    if ((hasNoParticipants || hasPartialParticipants) && wins.length < 3) {
      wins.push('Identificar explícitamente los trabajadores participantes en cada actividad.');
    }

    if (hasIncompleteCoverage && wins.length < 3) {
      wins.push('Completar las categorías de participación que aún no tienen evidencia.');
    }

    if (wins.length === 0) {
      wins.push('Mantener actualizados los registros de participación de trabajadores.');
    }

    return wins.slice(0, 3);
  }

  private buildNextSteps(keyIssues: StandardAnalysisKeyIssue[]): string[] {
    const steps: string[] = [];

    const highIssues = keyIssues.filter((issue) => issue.priority === 'HIGH');
    const mediumIssues = keyIssues.filter((issue) => issue.priority === 'MEDIUM');

    for (const issue of highIssues.slice(0, 2)) {
      steps.push(issue.recommendation);
    }

    for (const issue of mediumIssues.slice(0, 1)) {
      if (steps.length < 3) {
        steps.push(issue.recommendation);
      }
    }

    if (steps.length === 0) {
      steps.push('Establecer revisiones periódicas de los registros de participación.');
    }

    return steps.slice(0, 3);
  }

  private mapPriority(priority: string): 'HIGH' | 'MEDIUM' | 'LOW' {
    const normalized = priority.toUpperCase();
    if (normalized === 'HIGH' || normalized === 'CRITICAL') return 'HIGH';
    if (normalized === 'MEDIUM') return 'MEDIUM';
    return 'LOW';
  }
}
