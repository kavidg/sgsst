import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 3.3.2
 * "Medición y análisis de indicadores de salud".
 *
 * Interpreta los datos reales del ComplianceEngine (IndicatorsProvider)
 * y genera un análisis textual accionable.
 *
 * NO recalcula el score.
 * NO inventa datos.
 * NO genera claims sobre AI Orchestrator, DocumentMaster o Evidence Adapter.
 * Solo interpreta lo que el ComplianceEngine ya evaluó.
 *
 * El Provider genera estos findings:
 * - indicators-no-active (HIGH): no hay indicadores configurados
 * - indicators-no-data (HIGH): indicadores sin medición
 * - indicators-target-not-met (MEDIUM): indicadores fuera de rango
 */
export class IndicatorHealthStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '3.3.2';
  private static readonly MODULE = 'indicators';

  supports(standardCode: string): boolean {
    return standardCode === IndicatorHealthStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return IndicatorHealthStandardAnalyzer.MODULE;
  }

  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = context;
    const percentage = moduleCompliance.compliance;

    // ── NO_DATA ──
    const hasNoActiveFinding = findings.some((f) => f.id === 'indicators-no-active');
    const hasNoDataFinding = findings.some((f) => f.id === 'indicators-no-data');
    if (hasNoActiveFinding || (hasNoDataFinding && percentage === 0)) {
      return {
        summary:
          'No existen indicadores de salud configurados para el estándar 3.3.2. ' +
          'Configure los indicadores mínimos de salud laboral (incidencia, prevalencia, severidad, frecuencia y ausentismo) para comenzar la evaluación.',
        keyIssues: [],
        quickWins: [
          'Configurar los indicadores mínimos de salud laboral en el módulo de Indicadores.',
        ],
        nextSteps: [
          'Configurar indicadores de salud en el módulo de Indicadores.',
        ],
      };
    }

    // ── Construir keyIssues desde findings reales ──
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const finding of findings) {
      const priority = this.mapPriority(finding.priority);

      if (finding.id === 'indicators-no-active') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Sin indicadores de salud configurados, no es posible evaluar el cumplimiento del estándar 3.3.2.',
          recommendation:
            'Configurar los indicadores mínimos de salud laboral en el módulo de Indicadores.',
        });
      } else if (finding.id === 'indicators-no-data') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen indicadores configurados pero sin medición registrada para el período actual. ' +
            'El estándar 3.3.2 requiere que los indicadores se calculen periódicamente.',
          recommendation:
            'Ejecutar el cálculo automático de indicadores para el período vigente.',
        });
      } else if (finding.id === 'indicators-target-not-met') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen indicadores con mediciones pero fuera del rango de aceptabilidad. ' +
            'El estándar 3.3.2 requiere que los indicadores alcancen las metas definidas.',
          recommendation:
            'Revisar los indicadores fuera de rango y definir acciones correctivas.',
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
    const hasNoActiveFinding = findings.some((f) => f.id === 'indicators-no-active');
    const hasNoDataFinding = findings.some((f) => f.id === 'indicators-no-data');
    const hasTargetNotMetFinding = findings.some((f) => f.id === 'indicators-target-not-met');

    if (hasNoActiveFinding) {
      metrics.totalIndicators = 0;
      metrics.activeIndicators = 0;
      metrics.withMeasurement = 0;
      metrics.targetMet = 0;
      metrics.targetNotMet = 0;
      metrics.noData = 0;
    } else if (hasNoDataFinding) {
      // Hay indicadores pero sin medición
      metrics.totalIndicators = 1;
      metrics.activeIndicators = 1;
      metrics.withMeasurement = 0;
      metrics.targetMet = 0;
      metrics.targetNotMet = 0;
      metrics.noData = 1;
    } else {
      // Hay mediciones
      metrics.totalIndicators = 1;
      metrics.activeIndicators = 1;
      metrics.withMeasurement = 1;
      metrics.targetMet = hasTargetNotMetFinding ? 0 : 1;
      metrics.targetNotMet = hasTargetNotMetFinding ? 1 : 0;
      metrics.noData = 0;
    }

    return metrics;
  }

  // ── Helpers privados ──

  private buildSummary(
    percentage: number,
    keyIssues: StandardAnalysisKeyIssue[],
  ): string {
    if (percentage === 0) {
      const hasNoActive = keyIssues.some((i) => i.id === 'indicators-no-active');
      if (hasNoActive) {
        return (
          'No existen indicadores de salud configurados para el estándar 3.3.2. ' +
          'Configure los indicadores mínimos de salud laboral (incidencia, prevalencia, severidad, frecuencia y ausentismo) para comenzar la evaluación.'
        );
      }
      return (
        'Los indicadores de salud están configurados pero no tienen mediciones registradas. ' +
        'Ejecute el cálculo automático para el período vigente.'
      );
    }

    if (percentage >= 90) {
      return (
        `Los indicadores de salud presentan un cumplimiento del ${percentage}%, lo que indica que las metas se alcanzan de forma consistente. ` +
        'Se recomienda mantener la periodicidad de cálculo y continuar comunicando resultados.'
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
        `Los indicadores de salud presentan avances con un ${percentage}%, aunque existen metas no alcanzadas o mediciones pendientes.${issuesText}`
      );
    }

    // percentage < 50
    return (
      `Los indicadores de salud requieren atención prioritaria (${percentage}%) debido a brechas significativas en las metas alcanzadas. ` +
      'Se recomienda priorizar el cálculo de indicadores y la definición de acciones correctivas.'
    );
  }

  private buildQuickWins(keyIssues: StandardAnalysisKeyIssue[]): string[] {
    const wins: string[] = [];

    const hasNoActive = keyIssues.some((i) => i.id === 'indicators-no-active');
    const hasNoData = keyIssues.some((i) => i.id === 'indicators-no-data');
    const hasTargetNotMet = keyIssues.some((i) => i.id === 'indicators-target-not-met');

    if (hasNoActive) {
      wins.push('Configurar los indicadores mínimos de salud laboral.');
    }

    if (hasNoData && wins.length < 3) {
      wins.push('Calcular los indicadores de salud para el período vigente.');
    }

    if (hasTargetNotMet && wins.length < 3) {
      wins.push('Revisar los indicadores fuera de rango y definir acciones correctivas.');
    }

    if (wins.length === 0) {
      wins.push('Mantener la periodicidad de cálculo y comunicación de indicadores.');
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
      steps.push('Continuar con el seguimiento periódico de los indicadores de salud.');
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
