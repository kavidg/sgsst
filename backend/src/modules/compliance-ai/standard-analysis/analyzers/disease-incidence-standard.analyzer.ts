import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 3.3.5 — Incidencia de enfermedad laboral.
 *
 * Interpreta los datos reales del ComplianceEngine (DiseaseIncidenceProvider)
 * y genera un análisis textual accionable.
 *
 * NO consulta MongoDB.
 * NO recalcula el compliancePercentage (viene del ComplianceEngine).
 * NO duplica la lógica del provider.
 * NO manipula PHVA weights.
 * NO convierte texto en evidencia.
 * NO usa información clínica: el registro estadístico es metadata-only.
 */
export class DiseaseIncidenceStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '3.3.5';
  private static readonly MODULE = 'disease-incidence';

  supports(standardCode: string): boolean {
    return standardCode === DiseaseIncidenceStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return DiseaseIncidenceStandardAnalyzer.MODULE;
  }

  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = context;
    const percentage = moduleCompliance.compliance;

    // ── NO_DATA: registro vacío o sin población de referencia ──
    const noDataFinding = findings.find(
      (f) =>
        f.id === 'disease-incidence-no-data' ||
        f.id === 'disease-incidence-no-denominator' ||
        f.id === 'disease-incidence-invalid-company',
    );
    if (noDataFinding) {
      const withoutPopulation = noDataFinding.id === 'disease-incidence-no-denominator';
      return {
        summary: withoutPopulation
          ? 'No existe población de referencia válida para calcular la incidencia de enfermedad laboral (3.3.5). ' +
            'Actualizar la nómina de trabajadores activos para habilitar la medición.'
          : 'El registro estadístico de enfermedad laboral no tiene casos registrados, por lo que no es posible ' +
            'distinguir un cero real de la ausencia de información (3.3.5). Registrar los casos de enfermedad ' +
            'laboral para habilitar la medición de incidencia.',
        keyIssues: [
          {
            id: noDataFinding.id,
            title: noDataFinding.title,
            priority: 'HIGH',
            impact: withoutPopulation
              ? 'Sin población de referencia (denominador) no puede calcularse una incidencia válida.'
              : 'Sin registro estadístico en uso no puede demostrarse que la incidencia se mide realmente.',
            recommendation: withoutPopulation
              ? 'Mantener la nómina de trabajadores activos actualizada en el sistema.'
              : 'Registrar y calificar los casos de enfermedad laboral conforme ocurran.',
          },
        ],
        quickWins: [
          withoutPopulation
            ? 'Actualizar el estado de los trabajadores para obtener una población de referencia válida.'
            : 'Registrar los casos de enfermedad laboral con su calificación ocupacional y fecha de reconocimiento.',
        ],
        nextSteps: [
          'Establecer un mecanismo periódico de registro y calificación de casos de enfermedad laboral.',
        ],
      };
    }

    // ── Construir keyIssues desde findings reales ──
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const finding of findings) {
      const priority = this.mapPriority(finding.priority);

      if (finding.id === 'disease-incidence-zero-cases') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Una incidencia de 0 es un resultado válido, pero puede reflejar subregistro si los casos nuevos ' +
            'reales no se están calificando o registrando.',
          recommendation:
            'Verificar que los casos de enfermedad laboral reales estén siendo calificados (QUALIFIED), ' +
            'registrados como primera ocurrencia estadística y fechados dentro del período.',
        });
      } else if (finding.id === 'disease-incidence-traceability-gap') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Casos nuevos sin trabajador asociado: la trazabilidad por trabajador de la incidencia es parcial.',
          recommendation:
            'Asociar cada caso estadístico al trabajador correspondiente cuando sea posible.',
        });
      } else if (finding.id === 'disease-incidence-duplicate-episodes') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Un mismo trabajador acumula múltiples casos nuevos en el período: la identidad estadística de ' +
            'episodios no equivale necesariamente a la identidad clínica y puede haber ambigüedad estadística.',
          recommendation:
            'Verificar si los episodios registrados para el mismo trabajador corresponden a eventos ' +
            'genuinamente distintos y corregir el registro si es necesario.',
        });
      }
    }

    const summary = this.buildSummary(percentage, keyIssues);
    const quickWins = this.buildQuickWins(keyIssues);
    const nextSteps = this.buildNextSteps(keyIssues);

    return { summary, keyIssues, quickWins, nextSteps };
  }

  getMetrics(context: StandardAnalysisContext): StandardAnalysisMetrics {
    const { findings, moduleCompliance } = context;

    const metrics: StandardAnalysisMetrics = {
      compliancePercentage: moduleCompliance.compliance,
    };

    const noDataFinding = findings.some(
      (f) =>
        f.id === 'disease-incidence-no-data' ||
        f.id === 'disease-incidence-no-denominator' ||
        f.id === 'disease-incidence-invalid-company',
    );
    // Métricas de dominio sin PII: 0 cuando no hay medición; 1 cuando existe
    // una medición de incidencia válida (colección en uso y denominador > 0).
    metrics.hasValidMeasurement = noDataFinding ? 0 : 1;

    return metrics;
  }

  // ── Helpers privados ──

  private buildSummary(
    percentage: number,
    keyIssues: StandardAnalysisKeyIssue[],
  ): string {
    if (percentage >= 90) {
      return (
        `La medición de la incidencia de enfermedad laboral (3.3.5) alcanza un ${percentage}%: existe un registro ` +
        'estadístico en uso con trazabilidad sobre la población de referencia y los casos nuevos se asignan al ' +
        'período por fecha de reconocimiento. Se recomienda mantener la calificación oportuna de casos y la revisión periódica de la medición.'
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
        `La medición de la incidencia de enfermedad laboral (3.3.5) avanza con un ${percentage}%, aunque presenta ` +
        `brechas de trazabilidad o de cobertura temporal.${issuesText}`
      );
    }

    return (
      `La medición de la incidencia de enfermedad laboral (3.3.5) requiere atención (${percentage}%): el registro ` +
      'existe pero la trazabilidad del numerador o la cobertura temporal de la medición son insuficientes. ' +
      'Se recomienda asociar los casos a trabajadores, mantener fechas de reconocimiento válidas y revisar la población de referencia.'
    );
  }

  private buildQuickWins(keyIssues: StandardAnalysisKeyIssue[]): string[] {
    const wins: string[] = [];

    const hasZeroCases = keyIssues.some((i) => i.id === 'disease-incidence-zero-cases');
    const hasTraceabilityGap = keyIssues.some((i) => i.id === 'disease-incidence-traceability-gap');
    const hasDuplicateEpisodes = keyIssues.some((i) => i.id === 'disease-incidence-duplicate-episodes');

    if (hasZeroCases) {
      wins.push('Verificar el subregistro: confirmar que los casos nuevos reales se califican y registran.');
    }
    if (hasTraceabilityGap && wins.length < 3) {
      wins.push('Asociar los casos estadísticos sin trabajador al empleado correspondiente.');
    }
    if (hasDuplicateEpisodes && wins.length < 3) {
      wins.push('Revisar los trabajadores con múltiples episodios nuevos en el período.');
    }
    if (wins.length === 0) {
      wins.push('Mantener la medición de incidencia actualizada al período evaluado.');
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
      steps.push('Revisar periódicamente la incidencia calculada y sus hallazgos.');
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
