import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 3.1.4
 * "Realización de Evaluaciones Médicas Ocupacionales - Peligros - Periodicidad
 *  - Comunicación al Trabajador".
 *
 * Interpreta los datos reales del ComplianceEngine (OccupationalEvaluationProvider)
 * y genera un análisis textual accionable.
 *
 * NO recalcula el score.
 * NO inventa datos.
 * Solo interpreta lo que el ComplianceEngine ya evaluó.
 */
export class OccupationalEvaluationStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '3.1.4';
  private static readonly MODULE = 'occupational-evaluation';

  supports(standardCode: string): boolean {
    return standardCode === OccupationalEvaluationStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return OccupationalEvaluationStandardAnalyzer.MODULE;
  }

  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = context;
    const metrics = this.getMetrics(context);
    const percentage = moduleCompliance.compliance;

    // ── NO_DATA ──
    if (metrics.totalExams === 0) {
      return {
        summary:
          'No existen evaluaciones médicas ocupacionales registradas para evaluar el cumplimiento del estándar 3.1.4. ' +
          'Registrar evaluaciones médicas ocupacionales para comenzar la evaluación de realización, periodicidad, comunicación y relación con peligros.',
        keyIssues: [],
        quickWins: [
          'Registrar las evaluaciones médicas ocupacionales de ingreso, periódicas y de egreso en el sistema.',
        ],
        nextSteps: [
          'Ir al módulo de Empleados para registrar evaluaciones médicas ocupacionales.',
          'Registrar la información de evaluaciones de ingreso, periódicas y de egreso.',
        ],
      };
    }

    // ── Construir keyIssues desde findings reales ──
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const finding of findings) {
      const priority = this.mapPriority(finding.priority);

      if (finding.id === 'occupational-evaluation-no-data') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Sin evaluaciones médicas ocupacionales registradas, no es posible evaluar el cumplimiento del estándar 3.1.4.',
          recommendation:
            'Registrar evaluaciones médicas ocupacionales en el sistema para comenzar la evaluación del estándar.',
        });
      } else if (finding.id === 'occupational-evaluation-entry-pending') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen trabajadores sin evaluación médica ocupacional de ingreso. ' +
            'El estándar 3.1.4 requiere evidencia de evaluaciones de ingreso/preingreso.',
          recommendation:
            'Completar el registro de evaluaciones de ingreso pendientes para mejorar la trazabilidad del estándar.',
        });
      } else if (finding.id === 'occupational-evaluation-periodic-pending') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen trabajadores sin evaluación periódica vigente. ' +
            'El estándar 3.1.4 requiere evaluaciones periódicas con periodicidad establecida y fechas de vigencia actualizadas.',
          recommendation:
            'Verificar y actualizar las evaluaciones periódicas, definiendo la periodicidad y las fechas de próxima evaluación.',
        });
      } else if (finding.id === 'occupational-evaluation-periodicity-pending') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen evaluaciones periódicas sin periodicidad definida. ' +
            'El estándar 3.1.4 requiere definir la frecuencia de las evaluaciones periódicas.',
          recommendation:
            'Definir periodicityMonths para cada evaluación periódica según el cronograma de vigilancia de salud.',
        });
      } else if (finding.id === 'occupational-evaluation-exit-pending') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen trabajadores inactivos sin evaluación de egreso. ' +
            'El estándar 3.1.4 requiere evaluaciones de egreso/retiro para la trazabilidad administrativa.',
          recommendation:
            'Completar las evaluaciones de egreso de los trabajadores inactivos.',
        });
      } else if (finding.id === 'occupational-evaluation-communication-pending') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen evaluaciones sin constancia de comunicación al trabajador. ' +
            'El estándar 3.1.4 requiere comunicación por escrito de los resultados de las evaluaciones médicas ocupacionales.',
          recommendation:
            'Registrar la comunicación de resultados al trabajador (workerAcknowledged) para cada evaluación.',
        });
      } else if (finding.id === 'occupational-evaluation-hazard-coverage-pending') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen evaluaciones sin relación con peligros ocupacionales. ' +
            'El estándar 3.1.4 requiere evidencia de la relación entre evaluaciones y peligros/exposición.',
          recommendation:
            'Asociar los peligros ocupacionales correspondientes (relatedHazards) a cada evaluación médica.',
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
      const entryMatch = finding.title.match(/^(\d+)\s+trabajador/);
      if (entryMatch && finding.id === 'occupational-evaluation-entry-pending') {
        metrics.workersWithoutAge = parseInt(entryMatch[1], 10);
      }

      const periodicMatch = finding.title.match(/^(\d+)\s+trabajador/);
      if (periodicMatch && finding.id === 'occupational-evaluation-periodic-pending') {
        metrics.workersWithoutGender = parseInt(periodicMatch[1], 10);
      }

      const communicationMatch = finding.title.match(/^(\d+)\s+evaluaci/);
      if (communicationMatch && finding.id === 'occupational-evaluation-communication-pending') {
        metrics.workersWithoutEducation = parseInt(communicationMatch[1], 10);
      }

      const hazardMatch = finding.title.match(/^(\d+)\s+evaluaci/);
      if (hazardMatch && finding.id === 'occupational-evaluation-hazard-coverage-pending') {
        metrics.workersWithoutMarital = parseInt(hazardMatch[1], 10);
      }
    }

    // Si existe el finding 'occupational-evaluation-no-data', totalExams = 0.
    const hasNoDataFinding = findings.some((f) => f.id === 'occupational-evaluation-no-data');
    if (hasNoDataFinding) {
      metrics.totalExams = 0;
    } else {
      metrics.totalExams =
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
    if (!metrics.totalExams) {
      return (
        'No existen evaluaciones médicas ocupacionales registradas para evaluar el cumplimiento del estándar 3.1.4. ' +
        'Registrar evaluaciones médicas ocupacionales para comenzar la evaluación.'
      );
    }

    if (percentage >= 90) {
      return (
        `Las evaluaciones médicas ocupacionales presentan un cumplimiento del ${percentage}%, lo que indica una trazabilidad administrativa sólida en realización, periodicidad, comunicación y relación con peligros. ` +
        'Se recomienda mantener actualizados los registros y la documentación de comunicación al trabajador.'
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
        `Las evaluaciones médicas ocupacionales presentan avances importantes con un ${percentage}%, aunque existen registros pendientes en periodicidad, comunicación o relación con peligros.${issuesText}`
      );
    }

    // percentage < 50
    return (
      `Las evaluaciones médicas ocupacionales requieren atención prioritaria (${percentage}%) debido a brechas significativas en la realización, periodicidad, comunicación o relación con peligros. ` +
      'Se recomienda priorizar la completitud de evaluaciones de ingreso y la definición de periodicidad.'
    );
  }

  private buildQuickWins(metrics: StandardAnalysisMetrics, keyIssues: StandardAnalysisKeyIssue[]): string[] {
    const wins: string[] = [];

    const hasEntryPending = keyIssues.some((i) => i.id === 'occupational-evaluation-entry-pending');
    const hasPeriodicPending = keyIssues.some((i) => i.id === 'occupational-evaluation-periodic-pending');
    const hasCommunicationPending = keyIssues.some((i) => i.id === 'occupational-evaluation-communication-pending');
    const hasHazardPending = keyIssues.some((i) => i.id === 'occupational-evaluation-hazard-coverage-pending');

    if (hasEntryPending) {
      wins.push('Completar las evaluaciones de ingreso pendientes.');
    }

    if (hasCommunicationPending && wins.length < 3) {
      wins.push('Registrar la comunicación de resultados al trabajador.');
    }

    if (hasHazardPending && wins.length < 3) {
      wins.push('Asociar peligros ocupacionales a las evaluaciones.');
    }

    if (hasPeriodicPending && wins.length < 3) {
      wins.push('Revisar y actualizar las evaluaciones periódicas.');
    }

    if (wins.length === 0) {
      wins.push('Mantener actualizado el registro de evaluaciones médicas ocupacionales.');
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
      if (!metrics.totalExams) {
        steps.push('Registrar evaluaciones médicas ocupacionales en el sistema.');
      } else {
        steps.push('Continuar con la trazabilidad de las evaluaciones médicas ocupacionales.');
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
