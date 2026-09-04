import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 3.1.2 — Exámenes médicos ocupacionales.
 *
 * Interpreta los datos reales del ComplianceEngine (OccupationalExamProvider)
 * y genera un análisis textual accionable.
 *
 * NO recalcula el score.
 * NO inventa datos.
 * NO genera claims sobre AI Orchestrator, DocumentMaster o Evidence Adapter.
 * Solo interpreta lo que el ComplianceEngine ya evaluó.
 */
export class OccupationalExamStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '3.1.2';
  private static readonly MODULE = 'occupational-exam';

  supports(standardCode: string): boolean {
    return standardCode === OccupationalExamStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return OccupationalExamStandardAnalyzer.MODULE;
  }

  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = context;
    const metrics = this.getMetrics(context);
    const percentage = moduleCompliance.compliance;

    // ── NO_DATA ──
    if (metrics.totalWorkers === 0) {
      return {
        summary:
          'No existen trabajadores registrados para evaluar el estándar de exámenes médicos ocupacionales (3.1.2). ' +
          'Primero se debe registrar la población trabajadora.',
        keyIssues: [],
        quickWins: [
          'Registrar y mantener actualizada la información de los trabajadores antes de evaluar el cumplimiento de exámenes médicos.',
        ],
        nextSteps: [
          'Ir al módulo de Empleados.',
          'Registrar la información básica de los trabajadores (nombre, documento, cargo, área).',
        ],
      };
    }

    // ── Construir keyIssues desde findings reales ──
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const finding of findings) {
      const priority = this.mapPriority(finding.priority);

      if (finding.id === 'exam-no-data') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Sin registros de exámenes médicos ocupacionales, no es posible evaluar la trazabilidad administrativa del estándar 3.1.2.',
          recommendation:
            'Registrar los exámenes médicos ocupacionales de los trabajadores en el sistema para comenzar la evaluación del estándar.',
        });
      } else if (finding.id === 'exam-missing-entry') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen trabajadores sin examen médico ocupacional de ingreso registrado. ' +
            'El estándar 3.1.2 requiere evidencia de exámenes médicos de ingreso para la trazabilidad administrativa.',
          recommendation:
            'Completar el registro de los exámenes de ingreso pendientes para mejorar la trazabilidad del estándar.',
        });
      } else if (finding.id === 'exam-missing-periodic') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen trabajadores con exámenes periódicos pendientes o no vigentes según los registros disponibles. ' +
            'La trazabilidad de exámenes periódicos es un componente esencial del estándar 3.1.2.',
          recommendation:
            'Verificar los exámenes periódicos registrados y sus fechas de vigencia, y actualizar los registros pendientes.',
        });
      } else if (finding.id === 'exam-missing-follow-up') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen exámenes que requieren seguimiento y no tienen fecha de seguimiento registrada. ' +
            'El seguimiento a resultados es un componente del estándar 3.1.2.',
          recommendation:
            'Registrar las fechas de seguimiento pendientes para completar la trazabilidad de los exámenes.',
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

    // Parsear métricas de los títulos de findings (patrón estable)
    for (const finding of findings) {
      const missingEntryMatch = finding.title.match(/^(\d+)\s+trabajador/);
      if (missingEntryMatch && finding.id === 'exam-missing-entry') {
        metrics.workersWithoutAge = parseInt(missingEntryMatch[1], 10);
      }

      const missingPeriodicMatch = finding.title.match(/^(\d+)\s+trabajador/);
      if (missingPeriodicMatch && finding.id === 'exam-missing-periodic') {
        metrics.workersWithoutGender = parseInt(missingPeriodicMatch[1], 10);
      }

      const missingFollowUpMatch = finding.title.match(/^(\d+)\s+examen/);
      if (missingFollowUpMatch && finding.id === 'exam-missing-follow-up') {
        metrics.workersWithoutEducation = parseInt(missingFollowUpMatch[1], 10);
      }
    }

    // Si existe el finding 'exam-no-data', sabemos que totalWorkers = 0.
    const hasNoDataFinding = findings.some((f) => f.id === 'exam-no-data');
    if (hasNoDataFinding) {
      metrics.totalWorkers = 0;
    } else {
      // Si hay compliance > 0 o findings existentes, inferimos totalWorkers > 0
      metrics.totalWorkers = (moduleCompliance.compliance ?? 0) > 0 || findings.length > 0 ? 1 : 0;
    }

    return metrics;
  }

  // ── Helpers privados ──

  private buildSummary(
    percentage: number,
    metrics: StandardAnalysisMetrics,
    keyIssues: StandardAnalysisKeyIssue[],
  ): string {
    if (!metrics.totalWorkers) {
      return (
        'No existen trabajadores registrados para evaluar el estándar de exámenes médicos ocupacionales (3.1.2). ' +
        'Primero se debe registrar la población trabajadora.'
      );
    }

    if (percentage >= 90) {
      return (
        `La gestión de los exámenes médicos ocupacionales presenta un cumplimiento del ${percentage}%, lo que indica una trazabilidad administrativa sólida. ` +
        'Se recomienda mantener actualizados los registros de exámenes y sus fechas de seguimiento.'
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
        `La gestión de exámenes médicos ocupacionales presenta avances importantes con un ${percentage}%, aunque existen registros pendientes que deben ser atendidos.${issuesText}`
      );
    }

    // percentage < 50
    return (
      `La gestión de exámenes médicos ocupacionales requiere atención prioritaria (${percentage}%) debido a brechas significativas en los registros disponibles. ` +
      'Se recomienda priorizar la completitud de los exámenes de ingreso y periódicos.'
    );
  }

  private buildQuickWins(metrics: StandardAnalysisMetrics, keyIssues: StandardAnalysisKeyIssue[]): string[] {
    const wins: string[] = [];

    // Priorizar por la prioridad de los findings
    const hasMissingEntry = keyIssues.some((i) => i.id === 'exam-missing-entry');
    const hasMissingPeriodic = keyIssues.some((i) => i.id === 'exam-missing-periodic');
    const hasMissingFollowUp = keyIssues.some((i) => i.id === 'exam-missing-follow-up');

    if (hasMissingEntry) {
      wins.push('Completar el registro de los exámenes de ingreso pendientes.');
    }

    if (hasMissingPeriodic && wins.length < 3) {
      wins.push('Revisar los exámenes periódicos pendientes o vencidos.');
    }

    if (hasMissingFollowUp && wins.length < 3) {
      wins.push('Registrar las fechas de seguimiento pendientes.');
    }

    // Si no hay issues específicos, dar recomendación genérica
    if (wins.length === 0) {
      if ((metrics.workersWithoutAge ?? 0) > 0 || (metrics.workersWithoutGender ?? 0) > 0) {
        wins.push('Mantener actualizado el calendario de exámenes y seguimientos.');
      } else {
        wins.push('Mantener actualizado el registro de exámenes y sus fechas de seguimiento.');
      }
    }

    return wins.slice(0, 3);
  }

  private buildNextSteps(
    metrics: StandardAnalysisMetrics,
    keyIssues: StandardAnalysisKeyIssue[],
  ): string[] {
    const steps: string[] = [];

    // Priorizar por la prioridad de los keyIssues
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

    // Si no hay issues suficientes, agregar pasos genéricos
    if (steps.length === 0) {
      if (!metrics.totalWorkers) {
        steps.push('Registrar trabajadores en el módulo de Empleados.');
      } else {
        steps.push('Continuar con el seguimiento periódico de los exámenes ocupacionales.');
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
