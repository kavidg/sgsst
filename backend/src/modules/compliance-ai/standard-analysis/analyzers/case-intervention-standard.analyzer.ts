import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 3.3.3
 * "Intervención y seguimiento de casos".
 *
 * Interpreta los datos reales del ComplianceEngine (CaseInterventionProvider)
 * y genera un análisis textual accionable.
 *
 * NO recalcula el score.
 * NO inventa datos.
 * Solo interpreta lo que el ComplianceEngine ya evaluó.
 *
 * El Provider genera estos findings:
 * - case-intervention-no-data (HIGH): no hay casos registrados
 * - case-intervention-no-intervention (HIGH): casos sin acciones
 * - case-intervention-overdue-actions (HIGH): acciones vencidas
 * - case-intervention-no-closure (MEDIUM): casos sin cierre
 * - case-intervention-no-follow-up (MEDIUM): casos sin seguimiento
 */
export class CaseInterventionStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '3.3.3';
  private static readonly MODULE = 'incidents';

  supports(standardCode: string): boolean {
    return standardCode === CaseInterventionStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return CaseInterventionStandardAnalyzer.MODULE;
  }

  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = context;
    const percentage = moduleCompliance.compliance;

    // ── NO_DATA ──
    const hasNoDataFinding = findings.some((f) => f.id === 'case-intervention-no-data');
    if (hasNoDataFinding || percentage === 0) {
      return {
        summary:
          'No existen casos de salud laboral registrados para el estándar 3.3.3. ' +
          'Registrar y gestionar los casos de salud laboral identificados para comenzar la evaluación.',
        keyIssues: [],
        quickWins: [
          'Registrar y gestionar los casos de salud laboral identificados.',
        ],
        nextSteps: [
          'Implementar el proceso de intervención y seguimiento de casos de salud laboral.',
        ],
      };
    }

    // ── Construir keyIssues desde findings reales ──
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const finding of findings) {
      const priority = this.mapPriority(finding.priority);

      if (finding.id === 'case-intervention-no-intervention') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen casos de salud laboral sin acciones correctivas ni preventivas registradas. ' +
            'La intervención documentada es fundamental para el seguimiento del estándar 3.3.3.',
          recommendation:
            'Definir acciones correctivas y preventivas para los casos que aún no las tengan.',
        });
      } else if (finding.id === 'case-intervention-overdue-actions') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen acciones con fecha vencida que no han sido completadas. ' +
            'Las acciones vencidas afectan la efectividad de la intervención y el seguimiento.',
          recommendation:
            'Revisar y priorizar las acciones vencidas, actualizando su estado o reprogramándolas.',
        });
      } else if (finding.id === 'case-intervention-no-closure') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen casos sin fecha de cierre formal. ' +
            'El cierre documentado es necesario para completar el ciclo de intervención.',
          recommendation:
            'Revisar el estado de los casos abiertos y proceder al cierre cuando corresponda.',
        });
      } else if (finding.id === 'case-intervention-no-follow-up') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen casos sin seguimiento documentado con acciones completadas. ' +
            'La evidencia de seguimiento es necesaria para demostrar la intervención efectiva.',
          recommendation:
            'Documentar el seguimiento de los casos completando las acciones y registrando evidencias.',
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
    const hasNoDataFinding = findings.some((f) => f.id === 'case-intervention-no-data');
    const hasNoIntervention = findings.some((f) => f.id === 'case-intervention-no-intervention');
    const hasOverdue = findings.some((f) => f.id === 'case-intervention-overdue-actions');
    const hasNoClosure = findings.some((f) => f.id === 'case-intervention-no-closure');
    const hasNoFollowUp = findings.some((f) => f.id === 'case-intervention-no-follow-up');

    if (hasNoDataFinding) {
      metrics.totalCases = 0;
      metrics.casesWithIntervention = 0;
      metrics.openActions = 0;
      metrics.completedActions = 0;
      metrics.overdueActions = 0;
    } else {
      // Hay datos: inferir desde findings
      metrics.totalCases = hasNoIntervention ? 1 : 1;
      metrics.casesWithIntervention = hasNoIntervention ? 0 : 1;
      metrics.openActions = hasOverdue ? 1 : 0;
      metrics.completedActions = hasNoFollowUp ? 0 : 1;
      metrics.overdueActions = hasOverdue ? 1 : 0;
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
        'No existen casos de salud laboral registrados para el estándar 3.3.3. ' +
        'Registrar y gestionar los casos de salud laboral identificados para comenzar la evaluación.'
      );
    }

    if (percentage >= 90) {
      return (
        `La intervención y seguimiento de casos presenta un cumplimiento del ${percentage}%, lo que indica una gestión integral con trazabilidad adecuada de acciones, responsables y cierre. ` +
        'Se recomienda mantener la calidad del seguimiento y continuar con revisiones periódicas.'
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
        `La intervención y seguimiento de casos presenta avances con un ${percentage}%, aunque existen acciones pendientes, vencidas o casos sin cierre.${issuesText}`
      );
    }

    // percentage < 50
    return (
      `La intervención y seguimiento de casos requiere atención prioritaria (${percentage}%) debido a brechas significativas en la gestión de casos. ` +
      'Se recomienda priorizar la intervención sobre casos, la ejecución de acciones y el cierre formal.'
    );
  }

  private buildQuickWins(keyIssues: StandardAnalysisKeyIssue[]): string[] {
    const wins: string[] = [];

    const hasOverdue = keyIssues.some((i) => i.id === 'case-intervention-overdue-actions');
    const hasNoIntervention = keyIssues.some((i) => i.id === 'case-intervention-no-intervention');
    const hasNoClosure = keyIssues.some((i) => i.id === 'case-intervention-no-closure');
    const hasNoFollowUp = keyIssues.some((i) => i.id === 'case-intervention-no-follow-up');

    if (hasOverdue) {
      wins.push('Revisar y priorizar las acciones vencidas, actualizando su estado.');
    }

    if (hasNoIntervention && wins.length < 3) {
      wins.push('Definir acciones correctivas y preventivas para los casos sin intervención.');
    }

    if (hasNoClosure && wins.length < 3) {
      wins.push('Formalizar el cierre de los casos con acciones completadas.');
    }

    if (hasNoFollowUp && wins.length < 3) {
      wins.push('Documentar el seguimiento de los casos completando evidencias.');
    }

    if (wins.length === 0) {
      wins.push('Mantener la trazabilidad de acciones y el cierre oportuno de casos.');
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
      steps.push('Establecer revisiones periódicas del estado de casos y acciones.');
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
