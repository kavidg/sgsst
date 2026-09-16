import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 3.1.8
 * "Agua potable, servicios sanitarios y disposición de basuras"
 * (FASE 34B).
 *
 * Interpreta los datos reales del ComplianceEngine
 * (WorkplaceSanitaryConditionsProvider) y genera un análisis textual
 * accionable.
 *
 * NO recalcula el score.
 * NO inventa datos.
 * NO consulta MongoDB.
 * NO introduce lógica duplicada del provider.
 * NO maneja datos clínicos.
 * Solo interpreta lo que el ComplianceEngine ya evaluó.
 *
 * El Provider genera estos findings:
 * - workplace-sanitary-no-records (HIGH): sin registros activos
 * - workplace-sanitary-missing-types (HIGH): componentes sin cobertura
 * - workplace-sanitary-deficient-conditions (HIGH): condiciones deficientes/fuera de servicio
 * - workplace-sanitary-traceability-pending (MEDIUM): sin fecha+responsable+evidencia
 * - workplace-sanitary-verification-overdue (MEDIUM): verificación vencida
 */
export class WorkplaceSanitaryConditionsStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '3.1.8';
  private static readonly MODULE = 'workplace-sanitary-conditions';

  supports(standardCode: string): boolean {
    return standardCode === WorkplaceSanitaryConditionsStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return WorkplaceSanitaryConditionsStandardAnalyzer.MODULE;
  }

  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = context;
    const percentage = moduleCompliance.compliance;

    // ── NO_DATA ──
    const hasNoDataFinding = findings.some((f) => f.id === 'workplace-sanitary-no-records');
    if (hasNoDataFinding || percentage === 0) {
      return {
        summary:
          'No existen condiciones sanitarias verificadas registradas. ' +
          'El estándar 3.1.8 exige evidencia verificable de agua potable, servicios sanitarios y manejo de basuras en el lugar de trabajo.',
        keyIssues: [],
        quickWins: [
          'Registrar y verificar los tres componentes: agua potable, servicios sanitarios y manejo de basuras.',
        ],
        nextSteps: [
          'Iniciar el registro de condiciones sanitarias con fecha, responsable y evidencia por componente.',
        ],
      };
    }

    // ── Construir keyIssues desde findings reales ──
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const finding of findings) {
      const priority = this.mapPriority(finding.priority);

      if (finding.id === 'workplace-sanitary-missing-types') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Faltan componentes normativos del estándar (agua potable, servicios sanitarios o manejo de basuras) sin registro de verificación. Esto limita la cobertura demostrable de 3.1.8.',
          recommendation:
            'Registrar y verificar los componentes faltantes en el módulo de condiciones sanitarias.',
        });
      } else if (finding.id === 'workplace-sanitary-deficient-conditions') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen condiciones deficientes o fuera de servicio. Un registro deficiente evidencia verificación, pero NO constituye condición adecuada.',
          recommendation:
            'Corregir las condiciones deficientes y actualizar el registro con la nueva verificación.',
        });
      } else if (finding.id === 'workplace-sanitary-traceability-pending') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Algunas verificaciones no tienen trazabilidad completa (fecha, responsable y evidencia). Sin trazabilidad no es posible demostrar la verificación.',
          recommendation:
            'Completar fecha, responsable y evidencia documental de cada verificación.',
        });
      } else if (finding.id === 'workplace-sanitary-verification-overdue') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Verificaciones vencidas según la frecuencia declarada. La vigencia no es indefinida y afecta el criterio de continuidad.',
          recommendation:
            'Re-verificar los componentes vencidos y actualizar las fechas de próxima verificación.',
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

    const hasNoData = findings.some((f) => f.id === 'workplace-sanitary-no-records');
    const hasMissingTypes = findings.some((f) => f.id === 'workplace-sanitary-missing-types');
    const hasDeficient = findings.some((f) => f.id === 'workplace-sanitary-deficient-conditions');
    const hasOverdue = findings.some((f) => f.id === 'workplace-sanitary-verification-overdue');

    if (hasNoData) {
      metrics.hasRecords = 0;
    } else {
      metrics.hasRecords = 1;
      metrics.coverage = hasMissingTypes ? 0.5 : 1;
      metrics.condition = hasDeficient ? 0.5 : 1;
      metrics.hasOverdueVerifications = hasOverdue ? 1 : 0;
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
        'No existen condiciones sanitarias verificadas registradas. ' +
        'El estándar 3.1.8 exige evidencia verificable de agua potable, servicios sanitarios y manejo de basuras.'
      );
    }

    if (percentage >= 90) {
      return (
        `Las condiciones sanitarias presentan un cumplimiento del ${percentage}%, con cobertura de los tres componentes, condición conforme y trazabilidad completa. ` +
        'Se recomienda mantener el calendario de verificaciones según la frecuencia definida.'
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
        `Las condiciones sanitarias presentan avances con un ${percentage}%, aunque existen brechas de cobertura, condición, trazabilidad o vigencia.${issuesText}`
      );
    }

    return (
      `Las condiciones sanitarias requieren atención prioritaria (${percentage}%) debido a brechas significativas. ` +
      'Se recomienda registrar y verificar los tres componentes del estándar 3.1.8 con trazabilidad completa.'
    );
  }

  private buildQuickWins(keyIssues: StandardAnalysisKeyIssue[]): string[] {
    const wins: string[] = [];

    if (keyIssues.some((i) => i.id === 'workplace-sanitary-missing-types')) {
      wins.push('Registrar y verificar los componentes faltantes (agua, servicios sanitarios, basuras).');
    }

    if (keyIssues.some((i) => i.id === 'workplace-sanitary-deficient-conditions') && wins.length < 3) {
      wins.push('Corregir las condiciones deficientes o fuera de servicio.');
    }

    if (keyIssues.some((i) => i.id === 'workplace-sanitary-traceability-pending') && wins.length < 3) {
      wins.push('Completar fecha, responsable y evidencia de cada verificación.');
    }

    if (keyIssues.some((i) => i.id === 'workplace-sanitary-verification-overdue') && wins.length < 3) {
      wins.push('Re-verificar los componentes con verificación vencida.');
    }

    if (wins.length === 0) {
      wins.push('Mantener el calendario de verificaciones sanitarias.');
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
      steps.push('Establecer un calendario de verificaciones según la frecuencia declarada.');
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
