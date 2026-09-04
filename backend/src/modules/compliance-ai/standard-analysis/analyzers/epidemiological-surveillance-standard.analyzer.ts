import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 3.3.1 — Programas de vigilancia epidemiológica.
 *
 * Interpreta los datos reales del ComplianceEngine (EpidemiologicalSurveillanceProvider)
 * y genera un análisis textual accionable.
 *
 * NO recalcula el score.
 * NO inventa datos.
 * NO genera claims sobre AI Orchestrator, DocumentMaster o Evidence Adapter.
 * Solo interpreta lo que el ComplianceEngine ya evaluó.
 */
export class EpidemiologicalSurveillanceStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '3.3.1';
  private static readonly MODULE = 'epidemiological-surveillance';

  supports(standardCode: string): boolean {
    return standardCode === EpidemiologicalSurveillanceStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return EpidemiologicalSurveillanceStandardAnalyzer.MODULE;
  }

  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = context;
    const percentage = moduleCompliance.compliance;

    // ── NO_DATA ──
    const hasNoDataFinding = findings.some((f) => f.id === 'pve-no-data');
    if (hasNoDataFinding || percentage === 0) {
      return {
        summary:
          'No se encontraron programas de vigilancia epidemiológica suficientes para evaluar el estándar 3.3.1. ' +
          'Crear y configurar al menos un programa de vigilancia epidemiológica priorizado según la matriz de peligros.',
        keyIssues: [],
        quickWins: [
          'Crear al menos un programa de vigilancia epidemiológica asociado a los peligros prioritarios.',
        ],
        nextSteps: [
          'Establecer programas de vigilancia epidemiológica alineados con los riesgos identificados en la matriz de peligros.',
        ],
      };
    }

    // ── Construir keyIssues desde findings reales ──
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const finding of findings) {
      const priority = this.mapPriority(finding.priority);

      if (finding.id === 'pve-no-data') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Sin programas de vigilancia epidemiológica, no es posible evaluar el cumplimiento del estándar 3.3.1.',
          recommendation:
            'Crear programas de vigilancia epidemiológica en el sistema para comenzar la evaluación del estándar.',
        });
      } else if (finding.id === 'pve-no-hazards') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen programas de vigilancia epidemiológica sin peligros asociados de la matriz de riesgos. ' +
            'El estándar 3.3.1 requiere que los PVE estén priorizados según la matriz de peligros.',
          recommendation:
            'Asociar cada programa de vigilancia epidemiológica con los peligros prioritarios identificados en la matriz de riesgos.',
        });
      } else if (finding.id === 'pve-no-target-population') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen programas sin población objetivo definida (áreas o cargos). ' +
            'El estándar 3.3.1 requiere identificar la población expuesta a los peligros priorizados.',
          recommendation:
            'Definir las áreas y cargos que conforman la población objetivo de cada programa de vigilancia epidemiológica.',
        });
      } else if (finding.id === 'pve-insufficient-coverage') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'La cobertura de exámenes médicos ocupacionales relacionados con los peligros del PVE es insuficiente. ' +
            'El estándar 3.3.1 requiere evidencia de cobertura adecuada de la población objetivo.',
          recommendation:
            'Completar los exámenes médicos ocupacionales pendientes para aumentar la cobertura de vigilancia.',
        });
      } else if (finding.id === 'pve-overdue-activities') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen actividades de programas de vigilancia epidemiológica con fecha vencida que no han sido completadas. ' +
            'Las actividades vencidas afectan la ejecución y el seguimiento del programa.',
          recommendation:
            'Actualizar y completar las actividades vencidas del programa de vigilancia epidemiológica.',
        });
      } else if (finding.id === 'pve-no-periodicity') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen programas sin periodicidad de actividades definida. ' +
            'El estándar 3.3.1 requiere definir la frecuencia de vigilancia.',
          recommendation:
            'Establecer la periodicidad de las actividades de vigilancia en cada programa.',
        });
      } else if (finding.id === 'pve-no-follow-up') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'No existe evidencia de seguimiento y comunicación de resultados a los trabajadores. ' +
            'El estándar 3.3.1 requiere seguimiento de resultados de la vigilancia epidemiológica.',
          recommendation:
            'Completar la comunicación de resultados y el seguimiento a los trabajadores de la población objetivo.',
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

    // Si existe el finding 'pve-no-data', no hay programas.
    const hasNoDataFinding = findings.some((f) => f.id === 'pve-no-data');
    if (hasNoDataFinding) {
      metrics.totalPrograms = 0;
    } else {
      metrics.totalPrograms =
        (moduleCompliance.compliance ?? 0) > 0 || findings.length > 0 ? 1 : 0;
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
        'No se encontraron programas de vigilancia epidemiológica suficientes para evaluar el estándar 3.3.1. ' +
        'Crear y configurar al menos un programa de vigilancia epidemiológica priorizado según la matriz de peligros.'
      );
    }

    if (percentage >= 90) {
      return (
        `La vigilancia epidemiológica presenta un cumplimiento del ${percentage}%, lo que indica una gestión sólida con PVE priorizados, población objetivo definida, cobertura adecuada y actividades ejecutadas. ` +
        'Se recomienda mantener la periodicidad y continuar con el seguimiento de resultados.'
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
        `La vigilancia epidemiológica presenta avances importantes con un ${percentage}%, aunque existen brechas en la priorización, cobertura de exámenes o ejecución de actividades.${issuesText}`
      );
    }

    // percentage < 50
    return (
      `La vigilancia epidemiológica requiere atención prioritaria (${percentage}%) debido a brechas significativas en la gestión de los programas. ` +
      'Se recomienda priorizar la priorización por matriz de peligros, la definición de población objetivo y la cobertura de exámenes.'
    );
  }

  private buildQuickWins(keyIssues: StandardAnalysisKeyIssue[]): string[] {
    const wins: string[] = [];

    const hasHazardsGap = keyIssues.some((i) => i.id === 'pve-no-hazards');
    const hasTargetGap = keyIssues.some((i) => i.id === 'pve-no-target-population');
    const hasPeriodicityGap = keyIssues.some((i) => i.id === 'pve-no-periodicity');
    const hasOverdueActivities = keyIssues.some((i) => i.id === 'pve-overdue-activities');
    const hasInsufficientCoverage = keyIssues.some((i) => i.id === 'pve-insufficient-coverage');
    const hasNoFollowUp = keyIssues.some((i) => i.id === 'pve-no-follow-up');

    if (hasHazardsGap) {
      wins.push('Asociar cada PVE con los peligros prioritarios identificados en la matriz de riesgos.');
    }

    if (hasTargetGap && wins.length < 3) {
      wins.push('Definir las áreas y cargos que conforman la población objetivo de cada programa.');
    }

    if (hasPeriodicityGap && wins.length < 3) {
      wins.push('Establecer la periodicidad de las actividades de vigilancia en cada programa.');
    }

    if (hasOverdueActivities && wins.length < 3) {
      wins.push('Actualizar y completar las actividades vencidas del programa de vigilancia epidemiológica.');
    }

    if (hasInsufficientCoverage && wins.length < 3) {
      wins.push('Completar los exámenes médicos ocupacionales pendientes para aumentar la cobertura.');
    }

    if (hasNoFollowUp && wins.length < 3) {
      wins.push('Comunicar resultados y completar el seguimiento a los trabajadores de la población objetivo.');
    }

    if (wins.length === 0) {
      wins.push('Mantener la calidad de los programas de vigilancia epidemiológica con cobertura y actividades actualizadas.');
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
      steps.push('Establecer una revisión periódica del estado de los programas de vigilancia epidemiológica.');
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
