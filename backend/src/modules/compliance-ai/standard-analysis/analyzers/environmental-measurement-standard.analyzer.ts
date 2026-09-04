import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 4.1.4
 * "Mediciones ambientales".
 *
 * Interpreta los datos reales del ComplianceEngine (EnvironmentalMeasurementProvider)
 * y genera un análisis textual accionable.
 *
 * NO recalcula el score.
 * NO inventa datos.
 * NO consulta MongoDB.
 * Solo interpreta lo que el ComplianceEngine ya evaluó.
 *
 * El Provider genera estos findings:
 * - env-measurement-no-data (HIGH): no hay mediciones COMPLETED
 * - env-measurement-missing-types (MEDIUM): faltan tipos esperados
 * - env-measurement-no-results (MEDIUM): mediciones sin resultado
 * - env-measurement-no-comparison (MEDIUM): sin comparación normativa
 * - env-measurement-exceeds-limits (HIGH): valores sobre el límite
 */
export class EnvironmentalMeasurementStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '4.1.4';
  private static readonly MODULE = 'environmental-measurement';

  supports(standardCode: string): boolean {
    return standardCode === EnvironmentalMeasurementStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return EnvironmentalMeasurementStandardAnalyzer.MODULE;
  }

  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = context;
    const percentage = moduleCompliance.compliance;

    // ── NO_DATA ──
    const hasNoDataFinding = findings.some((f) => f.id === 'env-measurement-no-data');
    if (hasNoDataFinding || percentage === 0) {
      return {
        summary:
          'No existen mediciones ambientales ocupacionales registradas. ' +
          'El estándar 4.1.4 requiere mediciones de agentes físicos, químicos y otros factores de riesgo ambiental.',
        keyIssues: [],
        quickWins: [
          'Programar y ejecutar mediciones ambientales para los principales agentes: ruido, iluminación, temperatura y calidad del aire.',
        ],
        nextSteps: [
          'Iniciar el programa de mediciones ambientales conforme al estándar 4.1.4.',
        ],
      };
    }

    // ── Construir keyIssues desde findings reales ──
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const finding of findings) {
      const priority = this.mapPriority(finding.priority);

      if (finding.id === 'env-measurement-missing-types') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'No se han realizado mediciones para todos los agentes ambientales esperados. ' +
            'Esto limita la capacidad de demostrar control sobre la exposición ocupacional.',
          recommendation:
            'Completar las mediciones faltantes para los agentes ambientales no evaluados.',
        });
      } else if (finding.id === 'env-measurement-no-results') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Algunas mediciones no tienen resultado cuantitativo registrado. ' +
            'Sin resultados numéricos no es posible comparar contra límites normativos.',
          recommendation:
            'Registrar el valor numérico y la unidad de medida para cada medición completada.',
        });
      } else if (finding.id === 'env-measurement-no-comparison') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Algunas mediciones no tienen comparación contra el límite normativo. ' +
            'Sin esta comparación no se puede determinar conformidad.',
          recommendation:
            'Comparar cada resultado medido contra el límite normativo aplicable y registrar el resultado.',
        });
      } else if (finding.id === 'env-measurement-exceeds-limits') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen mediciones que exceden el límite normativo. ' +
            'Esto indica exposición fuera de los niveles aceptables y requiere acciones correctivas.',
          recommendation:
            'Implementar medidas de control para reducir la exposición y re-medir para verificar efectividad.',
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

    const hasNoData = findings.some((f) => f.id === 'env-measurement-no-data');
    const hasMissingTypes = findings.some((f) => f.id === 'env-measurement-missing-types');
    const hasNoResults = findings.some((f) => f.id === 'env-measurement-no-results');
    const hasExceeds = findings.some((f) => f.id === 'env-measurement-exceeds-limits');

    if (hasNoData) {
      metrics.hasRecords = 0;
    } else {
      metrics.hasRecords = 1;
      metrics.hasSds = hasMissingTypes ? 0.5 : 1;
      metrics.hasControls = hasNoResults ? 0.5 : 1;
      metrics.hasExpiredSds = hasExceeds ? 1 : 0;
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
        'No existen mediciones ambientales ocupacionales registradas. ' +
        'El estándar 4.1.4 requiere mediciones de agentes físicos, químicos y otros factores de riesgo ambiental.'
      );
    }

    if (percentage >= 90) {
      return (
        `Las mediciones ambientales presentan un cumplimiento del ${percentage}%, lo que indica cobertura sólida de agentes evaluados con resultados documentados. ` +
        'Se recomienda mantener el programa de mediciones periódicas.'
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
        `Las mediciones ambientales presentan avances con un ${percentage}%, aunque existen brechas en cobertura de agentes, resultados o comparación normativa.${issuesText}`
      );
    }

    return (
      `Las mediciones ambientales requieren atención prioritaria (${percentage}%) debido a brechas significativas. ` +
      'Se recomienda iniciar un programa de mediciones para los principales agentes ambientales conforme al estándar 4.1.4.'
    );
  }

  private buildQuickWins(keyIssues: StandardAnalysisKeyIssue[]): string[] {
    const wins: string[] = [];

    const hasMissingTypes = keyIssues.some((i) => i.id === 'env-measurement-missing-types');
    const hasNoResults = keyIssues.some((i) => i.id === 'env-measurement-no-results');
    const hasNoComparison = keyIssues.some((i) => i.id === 'env-measurement-no-comparison');
    const hasExceeds = keyIssues.some((i) => i.id === 'env-measurement-exceeds-limits');

    if (hasMissingTypes) {
      wins.push('Completar las mediciones faltantes para los agentes ambientales no evaluados.');
    }

    if (hasNoResults && wins.length < 3) {
      wins.push('Registrar el resultado cuantitativo y la unidad de medida para cada medición.');
    }

    if (hasNoComparison && wins.length < 3) {
      wins.push('Comparar cada resultado contra el límite normativo aplicable.');
    }

    if (hasExceeds && wins.length < 3) {
      wins.push('Implementar medidas de control para las mediciones que exceden el límite normativo.');
    }

    if (wins.length === 0) {
      wins.push('Mantener el programa de mediciones ambientales periódicas.');
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
      steps.push('Establecer un calendario de mediciones ambientales periódicas.');
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
