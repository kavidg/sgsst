import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 3.1.3 — Seguimiento a recomendaciones médicas.
 *
 * Interpreta los datos reales del ComplianceEngine (MedicalRecommendationProvider)
 * y genera un análisis textual accionable.
 *
 * NO recalcula el score.
 * NO inventa datos.
 * NO genera claims sobre AI Orchestrator, DocumentMaster o Evidence Adapter.
 * Solo interpreta lo que el ComplianceEngine ya evaluó.
 */
export class MedicalRecommendationStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '3.1.3';
  private static readonly MODULE = 'medical-recommendation';

  supports(standardCode: string): boolean {
    return standardCode === MedicalRecommendationStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return MedicalRecommendationStandardAnalyzer.MODULE;
  }

  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = context;
    const metrics = this.getMetrics(context);
    const percentage = moduleCompliance.compliance;

    // ── NO_DATA ──
    if (metrics.totalRecommendations === 0) {
      return {
        summary:
          'No existen recomendaciones médicas ocupacionales registradas para evaluar el seguimiento del estándar 3.1.3. ' +
          'Registrar recomendaciones médicas ocupacionales para comenzar la evaluación.',
        keyIssues: [],
        quickWins: [
          'Registrar las recomendaciones médicas ocupacionales derivadas de los procesos de vigilancia de la salud.',
        ],
        nextSteps: [
          'Ir al módulo de Empleados para registrar recomendaciones.',
          'Registrar las recomendaciones médicas ocupacionales en el sistema.',
        ],
      };
    }

    // ── Construir keyIssues desde findings reales ──
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const finding of findings) {
      const priority = this.mapPriority(finding.priority);

      if (finding.id === 'recommendation-no-data') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Sin recomendaciones médicas registradas, no es posible evaluar el seguimiento del estándar 3.1.3.',
          recommendation:
            'Registrar las recomendaciones médicas ocupacionales en el sistema para comenzar la evaluación del seguimiento.',
        });
      } else if (finding.id === 'recommendation-overdue') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen recomendaciones con fecha límite vencida que no han sido completadas. ' +
            'Las recomendaciones vencidas afectan negativamente la trazabilidad del seguimiento y el cumplimiento del estándar 3.1.3.',
          recommendation:
            'Priorizar las recomendaciones vencidas, actualizar sus estados y completar las acciones derivadas pendientes.',
        });
      } else if (finding.id === 'recommendation-pending-follow-up') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen recomendaciones en estado pendiente o en progreso que requieren seguimiento continuo. ' +
            'La falta de seguimiento oportuno puede afectar la gestión del estándar 3.1.3.',
          recommendation:
            'Revisar las recomendaciones pendientes, asignar responsables y establecer cronogramas de seguimiento.',
        });
      } else if (finding.id === 'recommendation-actions-pending') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen acciones derivadas de recomendaciones médicas que aún no han sido completadas. ' +
            'La ejecución de acciones es un componente esencial del seguimiento del estándar 3.1.3.',
          recommendation:
            'Gestionar las acciones pendientes, asignar responsables y registrar las acciones ejecutadas en el sistema.',
        });
      } else if (finding.id === 'recommendation-effectiveness-pending') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen recomendaciones sin verificación de efectividad. ' +
            'Completar una acción no equivale a demostrar efectividad; la verificación administrativa es un paso adicional requerido por el estándar 3.1.3.',
          recommendation:
            'Verificar administrativamente la efectividad de las recomendaciones completadas para cerrar el ciclo de seguimiento.',
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
      const overdueMatch = finding.title.match(/^(\d+)\s+recomendación/);
      if (overdueMatch && finding.id === 'recommendation-overdue') {
        metrics.workersWithoutAge = parseInt(overdueMatch[1], 10);
      }

      const pendingMatch = finding.title.match(/^(\d+)\s+recomendación/);
      if (pendingMatch && finding.id === 'recommendation-pending-follow-up') {
        metrics.workersWithoutGender = parseInt(pendingMatch[1], 10);
      }

      const actionsMatch = finding.title.match(/^(\d+)\s+acción/);
      if (actionsMatch && finding.id === 'recommendation-actions-pending') {
        metrics.workersWithoutEducation = parseInt(actionsMatch[1], 10);
      }

      const effectivenessMatch = finding.title.match(/^(\d+)\s+recomendación/);
      if (effectivenessMatch && finding.id === 'recommendation-effectiveness-pending') {
        metrics.workersWithoutMarital = parseInt(effectivenessMatch[1], 10);
      }
    }

    // Si existe el finding 'recommendation-no-data', sabemos que totalRecommendations = 0.
    const hasNoDataFinding = findings.some((f) => f.id === 'recommendation-no-data');
    if (hasNoDataFinding) {
      metrics.totalRecommendations = 0;
    } else {
      // Si hay compliance > 0 o findings existentes, inferimos totalRecommendations > 0
      metrics.totalRecommendations =
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
    if (!metrics.totalRecommendations) {
      return (
        'No existen recomendaciones médicas ocupacionales registradas para evaluar el seguimiento del estándar 3.1.3. ' +
        'Registrar recomendaciones médicas ocupacionales para comenzar la evaluación.'
      );
    }

    if (percentage >= 90) {
      return (
        `El seguimiento a recomendaciones médicas presenta un cumplimiento del ${percentage}%, lo que indica una gestión sólida del seguimiento. ` +
        'Se recomienda mantener actualizados los registros y continuar con la verificación de efectividad.'
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
        `El seguimiento a recomendaciones médicas presenta avances importantes con un ${percentage}%, aunque existen aspectos pendientes que deben ser atendidos.${issuesText}`
      );
    }

    // percentage < 50
    return (
      `El seguimiento a recomendaciones médicas requiere atención prioritaria (${percentage}%) debido a brechas significativas en la gestión del seguimiento. ` +
      'Se recomienda priorizar la completitud de acciones y la verificación de efectividad.'
    );
  }

  private buildQuickWins(
    metrics: StandardAnalysisMetrics,
    keyIssues: StandardAnalysisKeyIssue[],
  ): string[] {
    const wins: string[] = [];

    const hasOverdue = keyIssues.some((i) => i.id === 'recommendation-overdue');
    const hasPending = keyIssues.some((i) => i.id === 'recommendation-pending-follow-up');
    const hasActionsPending = keyIssues.some((i) => i.id === 'recommendation-actions-pending');
    const hasEffectivenessPending = keyIssues.some((i) => i.id === 'recommendation-effectiveness-pending');

    if (hasOverdue) {
      wins.push('Priorizar y completar las recomendaciones vencidas.');
    }

    if (hasActionsPending && wins.length < 3) {
      wins.push('Completar las acciones derivadas pendientes.');
    }

    if (hasEffectivenessPending && wins.length < 3) {
      wins.push('Verificar la efectividad de las recomendaciones completadas.');
    }

    if (hasPending && wins.length < 3) {
      wins.push('Actualizar el estado de las recomendaciones en progreso.');
    }

    // Si no hay issues específicos, dar recomendación genérica
    if (wins.length === 0) {
      wins.push('Mantener actualizado el registro de recomendaciones y seguimientos.');
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
      if (!metrics.totalRecommendations) {
        steps.push('Registrar recomendaciones médicas ocupacionales en el sistema.');
      } else {
        steps.push('Continuar con el seguimiento periódico de las recomendaciones médicas.');
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
