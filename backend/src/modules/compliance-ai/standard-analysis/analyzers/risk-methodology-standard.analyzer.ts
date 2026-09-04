import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 4.1.1
 * "Metodología para la identificación de peligros,
 *  evaluación y valoración de los riesgos".
 *
 * Interpreta los datos reales del ComplianceEngine (RiskMethodologyProvider)
 * y genera un análisis textual accionable.
 *
 * NO recalcula el score.
 * NO inventa datos.
 * Solo interpreta lo que el ComplianceEngine ya evaluó.
 *
 * El Provider genera estos findings:
 * - methodology-no-data (HIGH): no hay metodologías registradas
 * - methodology-no-active (HIGH): no hay metodología ACTIVE
 * - methodology-incomplete (MEDIUM): campos críticos faltantes
 * - methodology-review-overdue (MEDIUM): revisión vencida
 */
export class RiskMethodologyStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '4.1.1';
  private static readonly MODULE = 'risk-methodology';

  supports(standardCode: string): boolean {
    return standardCode === RiskMethodologyStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return RiskMethodologyStandardAnalyzer.MODULE;
  }

  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = context;
    const percentage = moduleCompliance.compliance;

    // ── NO_DATA ──
    const hasNoDataFinding = findings.some((f) => f.id === 'methodology-no-data');
    if (hasNoDataFinding || percentage === 0) {
      return {
        summary:
          'No existen metodologías de identificación de peligros, evaluación y valoración de riesgos registradas. ' +
          'El estándar 4.1.1 requiere una metodología documentada y aplicada.',
        keyIssues: [],
        quickWins: [
          'Formalizar y registrar una metodología documentada para la identificación de peligros.',
        ],
        nextSteps: [
          'Definir la metodología de identificación, evaluación y valoración de riesgos de la organización.',
        ],
      };
    }

    // ── Construir keyIssues desde findings reales ──
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const finding of findings) {
      const priority = this.mapPriority(finding.priority);

      if (finding.id === 'methodology-no-active') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen metodologías registradas pero ninguna está en estado ACTIVE. ' +
            'Sin una metodología activa, no se puede demostrar cumplimiento del estándar 4.1.1.',
          recommendation:
            'Revisar las metodologías disponibles y activar al menos una para la organización.',
        });
      } else if (finding.id === 'methodology-incomplete') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'La metodología tiene campos críticos incompletos. ' +
            'Los criterios de identificación, evaluación y valoración son componentes esenciales del estándar 4.1.1.',
          recommendation:
            'Completar los campos críticos de la metodología, especialmente los criterios de identificación, evaluación y valoración.',
        });
      } else if (finding.id === 'methodology-review-overdue') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'La metodología tiene una fecha de revisión vencida. ' +
            'El estándar 4.1.1 requiere que la metodología se mantenga actualizada y revisada periódicamente.',
          recommendation:
            'Realizar la revisión de la metodología, actualizar la fecha de revisión y documentar la actualización.',
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
    const hasNoDataFinding = findings.some((f) => f.id === 'methodology-no-data');
    const hasNoActive = findings.some((f) => f.id === 'methodology-no-active');
    const hasIncomplete = findings.some((f) => f.id === 'methodology-incomplete');
    const hasReviewOverdue = findings.some((f) => f.id === 'methodology-review-overdue');

    if (hasNoDataFinding) {
      metrics.totalMethodologies = 0;
      metrics.activeMethodologies = 0;
      metrics.completeMethodologies = 0;
      metrics.reviewOverdue = 0;
    } else {
      metrics.totalMethodologies = 1;
      metrics.activeMethodologies = hasNoActive ? 0 : 1;
      metrics.completeMethodologies = hasIncomplete ? 0 : 1;
      metrics.reviewOverdue = hasReviewOverdue ? 1 : 0;
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
        'No existen metodologías de identificación de peligros, evaluación y valoración de riesgos registradas. ' +
        'El estándar 4.1.1 requiere una metodología documentada y aplicada.'
      );
    }

    if (percentage >= 90) {
      return (
        `La metodología de identificación de peligros presenta un cumplimiento del ${percentage}%, lo que indica una metodología formal, activa y completa. ` +
        'Se recomienda mantener la metodología actualizada y continuar con las revisiones periódicas.'
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
        `La metodología de identificación de peligros presenta avances con un ${percentage}%, aunque existen campos incompletos, revisión vencida o falta una metodología activa.${issuesText}`
      );
    }

    // percentage < 50
    return (
      `La metodología de identificación de peligros requiere atención prioritaria (${percentage}%) debido a brechas significativas. ` +
      'Se recomienda registrar, activar y completar la metodología del estándar 4.1.1.'
    );
  }

  private buildQuickWins(keyIssues: StandardAnalysisKeyIssue[]): string[] {
    const wins: string[] = [];

    const hasNoActive = keyIssues.some((i) => i.id === 'methodology-no-active');
    const hasIncomplete = keyIssues.some((i) => i.id === 'methodology-incomplete');
    const hasReviewOverdue = keyIssues.some((i) => i.id === 'methodology-review-overdue');

    if (hasNoActive) {
      wins.push('Activar al menos una metodología de identificación de peligros.');
    }

    if (hasIncomplete && wins.length < 3) {
      wins.push('Completar los campos críticos de la metodología.');
    }

    if (hasReviewOverdue && wins.length < 3) {
      wins.push('Actualizar la fecha de revisión de la metodología.');
    }

    if (wins.length === 0) {
      wins.push('Mantener la metodología actualizada y revisada periódicamente.');
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
      steps.push('Establecer revisiones periódicas de la metodología.');
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
