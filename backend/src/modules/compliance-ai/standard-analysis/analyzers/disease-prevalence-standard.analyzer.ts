import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 3.3.4 — Prevalencia de enfermedad laboral.
 *
 * Interpreta los datos reales del ComplianceEngine (DiseasePrevalenceProvider)
 * y genera un análisis textual accionable.
 *
 * NO consulta MongoDB.
 * NO recalcula el compliancePercentage (viene del ComplianceEngine).
 * NO convierte texto en evidencia.
 * NO usa información clínica: el registro estadístico es metadata-only.
 * NO genera claims sobre AI Orchestrator, DocumentMaster o Evidence Adapter.
 */
export class DiseasePrevalenceStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '3.3.4';
  private static readonly MODULE = 'disease-prevalence';

  supports(standardCode: string): boolean {
    return standardCode === DiseasePrevalenceStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return DiseasePrevalenceStandardAnalyzer.MODULE;
  }

  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = context;
    const percentage = moduleCompliance.compliance;

    // ── NO_DATA: registro vacío o sin población de referencia ──
    const noDataFinding = findings.find(
      (f) =>
        f.id === 'disease-prevalence-no-data' ||
        f.id === 'disease-prevalence-no-denominator',
    );
    if (noDataFinding) {
      const withoutPopulation = noDataFinding.id === 'disease-prevalence-no-denominator';
      return {
        summary: withoutPopulation
          ? 'No existe población de referencia válida para calcular la prevalencia de enfermedad laboral (3.3.4). ' +
            'Actualizar la nómina de trabajadores activos para habilitar la medición.'
          : 'El registro estadístico de enfermedad laboral no tiene casos registrados, por lo que no es posible ' +
            'distinguir un cero real de la ausencia de información (3.3.4). Registrar los casos de enfermedad ' +
            'laboral para habilitar la medición de prevalencia.',
        keyIssues: [
          {
            id: noDataFinding.id,
            title: noDataFinding.title,
            priority: 'HIGH',
            impact: withoutPopulation
              ? 'Sin población de referencia (denominador) no puede calcularse una prevalencia válida.'
              : 'Sin registro estadístico en uso no puede demostrarse que la prevalencia se mide realmente.',
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

      if (finding.id === 'disease-prevalence-zero-cases') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Una prevalencia de 0 es un resultado válido, pero puede reflejar subregistro si los casos reales ' +
            'no se están calificando o registrando.',
          recommendation:
            'Verificar que los casos de enfermedad laboral reales estén siendo calificados (QUALIFIED) y registrados.',
        });
      } else if (finding.id === 'disease-prevalence-traceability-gap') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Casos válidos sin trabajador asociado: la trazabilidad por trabajador de la prevalencia es parcial.',
          recommendation:
            'Asociar cada caso estadístico al trabajador correspondiente cuando sea posible.',
        });
      } else if (finding.id === 'disease-prevalence-administrative-only') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'El registro contiene solo casos en revisión, no calificados o descartados: ninguno es un caso ' +
            'prevalente confirmado.',
          recommendation:
            'Completar el ciclo de calificación de los casos pendientes de revisión.',
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
        f.id === 'disease-prevalence-no-data' ||
        f.id === 'disease-prevalence-no-denominator',
    );
    // Métricas de dominio sin PII: 0 cuando no hay medición; 1 cuando existe
    // una medición de prevalencia válida (colección en uso y denominador > 0).
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
        `La medición de la prevalencia de enfermedad laboral (3.3.4) alcanza un ${percentage}%: existe un registro ` +
        'estadístico en uso con trazabilidad sobre la población de referencia y la tasa se calcula a fecha de corte. ' +
        'Se recomienda mantener la calificación oportuna de casos y la revisión periódica de la medición.'
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
        `La medición de la prevalencia de enfermedad laboral (3.3.4) avanza con un ${percentage}%, aunque presenta ` +
        `brechas de trazabilidad o de cobertura temporal.${issuesText}`
      );
    }

    return (
      `La medición de la prevalencia de enfermedad laboral (3.3.4) requiere atención (${percentage}%): el registro ` +
      'existe pero la trazabilidad del numerador o la cobertura temporal de la medición son insuficientes. ' +
      'Se recomienda asociar los casos a trabajadores, mantener fechas de reconocimiento válidas y revisar la población de referencia.'
    );
  }

  private buildQuickWins(keyIssues: StandardAnalysisKeyIssue[]): string[] {
    const wins: string[] = [];

    const hasZeroCases = keyIssues.some((i) => i.id === 'disease-prevalence-zero-cases');
    const hasTraceabilityGap = keyIssues.some((i) => i.id === 'disease-prevalence-traceability-gap');
    const hasAdministrativeOnly = keyIssues.some((i) => i.id === 'disease-prevalence-administrative-only');

    if (hasZeroCases) {
      wins.push('Verificar el subregistro: confirmar que los casos reales se califican y registran.');
    }
    if (hasTraceabilityGap && wins.length < 3) {
      wins.push('Asociar los casos estadísticos sin trabajador al empleado correspondiente.');
    }
    if (hasAdministrativeOnly && wins.length < 3) {
      wins.push('Completar la calificación de los casos que permanecen en revisión.');
    }
    if (wins.length === 0) {
      wins.push('Mantener la medición de prevalencia actualizada a la fecha de corte del período.');
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
      steps.push('Revisar periódicamente la prevalencia calculada y sus hallazgos.');
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
