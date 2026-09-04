import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 3.1.1 — Perfil sociodemográfico.
 *
 * Interpreta los datos reales del ComplianceEngine (SociodemographicProvider)
 * y genera un análisis textual accionable.
 *
 * NO recalcula el score.
 * NO inventa datos.
 * NO genera claims sobre AI Orchestrator, DocumentMaster o Evidence Adapter.
 * Solo interpreta lo que el ComplianceEngine ya evaluó.
 */
export class SociodemographicStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '3.1.1';
  private static readonly MODULE = 'sociodemographic';

  supports(standardCode: string): boolean {
    return standardCode === SociodemographicStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return SociodemographicStandardAnalyzer.MODULE;
  }

  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = context;
    const metrics = this.getMetrics(context);
    const percentage = moduleCompliance.compliance;

    // ── NO_DATA ──
    if (metrics.totalWorkers === 0) {
      return {
        summary:
          'No existen trabajadores registrados para construir el perfil sociodemográfico del estándar 3.1.1. ' +
          'Primero se debe registrar la población trabajadora.',
        keyIssues: [],
        quickWins: [
          'Registrar y mantener actualizada la información de los trabajadores antes de evaluar el cumplimiento sociodemográfico.',
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

      if (finding.id === 'socio-no-data') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Sin trabajadores registrados, no es posible evaluar el perfil sociodemográfico del estándar 3.1.1.',
          recommendation:
            'Registrar la información de los trabajadores en el sistema para comenzar la evaluación del perfil sociodemográfico.',
        });
      } else if (finding.id === 'socio-missing-age') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen trabajadores sin fecha de nacimiento registrada. ' +
            'La edad es un dato fundamental para la caracterización sociodemográfica y el análisis de riesgos por grupo etario.',
          recommendation:
            'Completar la fecha de nacimiento de los trabajadores que no la tienen registrada para mantener actualizado el perfil sociodemográfico.',
        });
      } else if (finding.id === 'socio-missing-gender') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen trabajadores sin información de género registrada. ' +
            'El género es necesario para la caracterización de la población trabajadora según el estándar 3.1.1.',
          recommendation:
            'Completar el registro de género de los trabajadores pendientes y mantener actualizada la información sociodemográfica.',
        });
      } else if (finding.id === 'socio-missing-education') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen trabajadores sin nivel educativo registrado. ' +
            'La escolaridad es un componente esencial del perfil sociodemográfico requerido por el estándar 3.1.1.',
          recommendation:
            'Completar el nivel educativo de los trabajadores pendientes para disponer de un perfil sociodemográfico actualizado.',
        });
      } else if (finding.id === 'socio-missing-marital') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen trabajadores sin estado civil registrado. ' +
            'El estado civil contribuye a la caracterización sociodemográfica completa del personal.',
          recommendation:
            'Completar el estado civil de los trabajadores pendientes y mantener actualizada la información sociodemográfica.',
        });
      }
    }

    // ── Summary basado en porcentaje real ──
    const summary = this.buildSummary(percentage, metrics, keyIssues);

    // ── Quick Wins (máximo 3) ──
    const quickWins = this.buildQuickWins(metrics);

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
      const missingAgeMatch = finding.title.match(/^(\d+)\s+trabajador/);
      if (missingAgeMatch && finding.id === 'socio-missing-age') {
        metrics.workersWithoutAge = parseInt(missingAgeMatch[1], 10);
      }

      const missingGenderMatch = finding.title.match(/^(\d+)\s+trabajador/);
      if (missingGenderMatch && finding.id === 'socio-missing-gender') {
        metrics.workersWithoutGender = parseInt(missingGenderMatch[1], 10);
      }

      const missingEducationMatch = finding.title.match(/^(\d+)\s+trabajador/);
      if (missingEducationMatch && finding.id === 'socio-missing-education') {
        metrics.workersWithoutEducation = parseInt(missingEducationMatch[1], 10);
      }

      const missingMaritalMatch = finding.title.match(/^(\d+)\s+trabajador/);
      if (missingMaritalMatch && finding.id === 'socio-missing-marital') {
        metrics.workersWithoutMarital = parseInt(missingMaritalMatch[1], 10);
      }
    }

    // Si existe el finding 'socio-no-data', sabemos que totalWorkers = 0.
    const hasNoDataFinding = findings.some((f) => f.id === 'socio-no-data');
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
        'No existen trabajadores registrados para construir el perfil sociodemográfico del estándar 3.1.1. ' +
        'Primero se debe registrar la población trabajadora.'
      );
    }

    if (percentage >= 90) {
      return (
        `El cumplimiento del perfil sociodemográfico es del ${percentage}%, lo que indica una gestión sólida. ` +
        'Se recomienda mantener actualizada la información y verificar periódicamente la completitud de los perfiles.'
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
        `El cumplimiento del perfil sociodemográfico presenta oportunidades de mejora con un ${percentage}%.${issuesText}`
      );
    }

    // percentage < 50
    return (
      `El cumplimiento del perfil sociodemográfico es bajo (${percentage}%). ` +
      'Se requiere atención prioritaria para completar la información de los trabajadores registrados.'
    );
  }

  private buildQuickWins(metrics: StandardAnalysisMetrics): string[] {
    const wins: string[] = [];

    if ((metrics.workersWithoutAge ?? 0) > 0) {
      wins.push('Registrar las fechas de nacimiento de los trabajadores que no la tienen.');
    }

    if ((metrics.workersWithoutGender ?? 0) > 0 && wins.length < 3) {
      wins.push('Completar el registro de género de los trabajadores pendientes.');
    }

    if ((metrics.workersWithoutEducation ?? 0) > 0 && wins.length < 3) {
      wins.push('Registrar el nivel educativo de los trabajadores pendientes.');
    }

    if ((metrics.workersWithoutMarital ?? 0) > 0 && wins.length < 3) {
      wins.push('Completar el estado civil de los trabajadores pendientes.');
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
