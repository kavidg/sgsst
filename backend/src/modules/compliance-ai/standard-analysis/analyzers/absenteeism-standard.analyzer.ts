import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 3.2.1 — Registro de ausentismo.
 *
 * Interpreta los datos reales del ComplianceEngine (AbsenteeismProvider)
 * y genera un análisis textual accionable.
 *
 * NO recalcula el score.
 * NO inventa datos.
 * NO genera claims sobre AI Orchestrator, DocumentMaster o Evidence Adapter.
 * Solo interpreta lo que el ComplianceEngine ya evaluó.
 */
export class AbsenteeismStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '3.2.1';
  private static readonly MODULE = 'absenteeism';

  supports(standardCode: string): boolean {
    return standardCode === AbsenteeismStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return AbsenteeismStandardAnalyzer.MODULE;
  }

  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = context;
    const metrics = this.getMetrics(context);
    const percentage = moduleCompliance.compliance;

    // ── NO_DATA ──
    if (metrics.totalRecords === 0) {
      return {
        summary:
          'No se encontraron registros de ausentismo suficientes para evaluar el estándar 3.2.1. ' +
          'Registrar sistemáticamente los eventos de ausentismo ocurridos durante el período de gestión.',
        keyIssues: [],
        quickWins: [
          'Registrar sistemáticamente los eventos de ausentismo ocurridos durante el período de gestión.',
        ],
        nextSteps: [
          'Ir al módulo de Ausentismos para registrar los eventos.',
          'Establecer un procedimiento de registro periódico de casos de ausentismo.',
        ],
      };
    }

    // ── Construir keyIssues desde findings reales ──
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const finding of findings) {
      const priority = this.mapPriority(finding.priority);

      if (finding.id === 'absenteeism-no-data') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Sin registros de ausentismo, no es posible evaluar el cumplimiento del estándar 3.2.1.',
          recommendation:
            'Registrar los eventos de ausentismo en el sistema para comenzar la evaluación del estándar.',
        });
      } else if (finding.id === 'absenteeism-records-incomplete') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen registros de ausentismo con información administrativa incompleta. ' +
            'La completitud de los campos es necesaria para la trazabilidad del estándar 3.2.1.',
          recommendation:
            'Completar los campos administrativos obligatorios de los registros de ausentismo (tipo, fechaInicio, fechaFin, días).',
        });
      } else if (finding.id === 'absenteeism-no-recent-records') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'No existen registros de ausentismo en los últimos 12 meses. ' +
            'El estándar 3.2.1 requiere un registro sistemático y actualizado.',
          recommendation:
            'Verificar y actualizar el registro de eventos de ausentismo del período actual.',
        });
      } else if (finding.id === 'absenteeism-limited-temporal-coverage') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Los registros de ausentismo están concentrados en un solo período. ' +
            'El estándar 3.2.1 requiere análisis periódico de tendencias, lo cual requiere datos de múltiples períodos.',
          recommendation:
            'Ampliar el registro a los períodos disponibles para permitir comparación temporal.',
        });
      } else if (finding.id === 'absenteeism-low-type-diversity') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'La información disponible presenta baja diversidad de categorías registradas. ' +
            'El estándar 3.2.1 requiere consolidado por causa médica y no médica.',
          recommendation:
            'Verificar que los eventos de ausentismo estén siendo clasificados correctamente según el tipo definido por el sistema.',
        });
      } else if (finding.id === 'absenteeism-insufficient-trend-data') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'No existe suficiente información para un análisis de tendencias confiable. ' +
            'El estándar 3.2.1 requiere análisis periódico de tendencias y variables críticas.',
          recommendation:
            'Consolidar registros de varios períodos para facilitar el análisis de tendencias.',
        });
      }
    }

    // ── Summary basado en porcentaje real ──
    const summary = this.buildSummary(percentage, metrics, keyIssues);

    // ── Quick Wins (máximo 3) ──
    const quickWins = this.buildQuickWins(metrics, keyIssues);

    // ── Next Steps (máximo 3) ──
    const nextSteps = this.buildNextSteps(metrics, keyIssues);

    return { summary, keyIssues, quickWins, nextSteps };
  }

  getMetrics(context: StandardAnalysisContext): StandardAnalysisMetrics {
    const { findings, moduleCompliance } = context;

    const metrics: StandardAnalysisMetrics = {
      compliancePercentage: moduleCompliance.compliance,
    };

    // Parsear métricas de los títulos de findings
    for (const finding of findings) {
      const recordsMatch = finding.title.match(/^(\d+)\s+registro/);
      if (recordsMatch && finding.id === 'absenteeism-records-incomplete') {
        metrics.incompleteRecords = parseInt(recordsMatch[1], 10);
      }
    }

    // Si existe el finding 'absenteeism-no-data', totalRecords = 0.
    const hasNoDataFinding = findings.some((f) => f.id === 'absenteeism-no-data');
    if (hasNoDataFinding) {
      metrics.totalRecords = 0;
    } else {
      metrics.totalRecords =
        (moduleCompliance.compliance ?? 0) > 0 || findings.length > 0 ? 1 : 0;
    }

    return metrics;
  }

  // ── Helpers privados ──

  private buildSummary(
    percentage: number,
    metrics: StandardAnalysisMetrics,
    keyIssues: StandardAnalysisKeyIssue[],
  ): string {
    if (!metrics.totalRecords) {
      return (
        'No se encontraron registros de ausentismo suficientes para evaluar el estándar 3.2.1. ' +
        'Registrar sistemáticamente los eventos de ausentismo ocurridos durante el período de gestión.'
      );
    }

    if (percentage >= 90) {
      return (
        `El registro de ausentismo presenta un cumplimiento del ${percentage}%, lo que indica una trazabilidad administrativa sólida con registros clasificados, completos y con cobertura temporal adecuada. ` +
        'Se recomienda mantener actualizado el registro y continuar con el análisis periódico de tendencias.'
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
        `El registro de ausentismo presenta avances importantes con un ${percentage}%, aunque existen brechas en la completitud, clasificación o cobertura temporal.${issuesText}`
      );
    }

    // percentage < 50
    return (
      `El registro de ausentismo requiere atención prioritaria (${percentage}%) debido a brechas significativas en la trazabilidad administrativa. ` +
      'Se recomienda priorizar la completitud de registros y la cobertura temporal.'
    );
  }

  private buildQuickWins(metrics: StandardAnalysisMetrics, keyIssues: StandardAnalysisKeyIssue[]): string[] {
    const wins: string[] = [];

    const hasIncomplete = keyIssues.some((i) => i.id === 'absenteeism-records-incomplete');
    const hasNoRecent = keyIssues.some((i) => i.id === 'absenteeism-no-recent-records');
    const hasLimitedTemporal = keyIssues.some((i) => i.id === 'absenteeism-limited-temporal-coverage');
    const hasLowDiversity = keyIssues.some((i) => i.id === 'absenteeism-low-type-diversity');
    const hasInsufficientTrend = keyIssues.some((i) => i.id === 'absenteeism-insufficient-trend-data');

    if (hasNoRecent) {
      wins.push('Verificar y actualizar el registro de eventos de ausentismo del período actual.');
    }

    if (hasIncomplete && wins.length < 3) {
      wins.push('Completar los campos administrativos obligatorios de los registros de ausentismo.');
    }

    if (hasLimitedTemporal && wins.length < 3) {
      wins.push('Ampliar el registro a los períodos disponibles para permitir comparación temporal.');
    }

    if (hasLowDiversity && wins.length < 3) {
      wins.push('Revisar la clasificación de causas de ausentismo para asegurar diversidad de categorías.');
    }

    if (hasInsufficientTrend && wins.length < 3) {
      wins.push('Consolidar registros de varios períodos para facilitar el análisis de tendencias.');
    }

    if (wins.length === 0) {
      wins.push('Mantener actualizado el registro de ausentismo con clasificación y cobertura temporal adecuadas.');
    }

    return wins.slice(0, 3);
  }

  private buildNextSteps(metrics: StandardAnalysisMetrics, keyIssues: StandardAnalysisKeyIssue[]): string[] {
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
      if (!metrics.totalRecords) {
        steps.push('Registrar eventos de ausentismo en el sistema.');
      } else {
        steps.push('Establecer una revisión periódica de calidad y completitud de los registros.');
      }
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
