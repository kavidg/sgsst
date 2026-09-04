import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 2.11.1 — Gestión del cambio.
 *
 * Interpreta los datos reales del ComplianceEngine (ChangeManagementProvider)
 * y genera un análisis textual accionable.
 *
 * NO recalcula el score.
 * NO inventa datos.
 * NO genera claims sobre AI Orchestrator, DocumentMaster o Evidence Adapter.
 * Solo interpreta lo que el ComplianceEngine ya evaluó.
 */
export class ChangeManagementStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '2.11.1';
  private static readonly MODULE = 'change-management';

  supports(standardCode: string): boolean {
    return standardCode === ChangeManagementStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return ChangeManagementStandardAnalyzer.MODULE;
  }

  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = context;
    const metrics = this.getMetrics(context);
    const percentage = moduleCompliance.compliance;

    // ── NO_DATA ──
    if (metrics.totalChanges === 0) {
      return {
        summary:
          'No existen datos suficientes para realizar un análisis de Gestión del cambio. ' +
          'Registrar al menos una solicitud de cambio para comenzar la evaluación del estándar 2.11.1.',
        keyIssues: [],
        quickWins: [
          'Formular el procedimiento de gestión del cambio.',
          'Registrar la primera solicitud de cambio.',
        ],
        nextSteps: [
          'Ir al módulo de Gestión del cambio.',
          'Crear solicitudes de cambio para evaluar el cumplimiento del estándar 2.11.1.',
        ],
      };
    }

    // ── Construir keyIssues desde findings reales ──
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const finding of findings) {
      const priority = this.mapPriority(finding.priority);

      if (finding.id === 'change-missing-impact-analysis') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen cambios de impacto MEDIUM, HIGH o CRITICAL sin análisis de riesgos/impacto SST suficiente. ' +
            'El estándar 2.11.1 requiere evaluación de impactos para cambios significativos.',
          recommendation:
            'Realizar y documentar la evaluación de impacto SST antes de implementar cambios de impacto significativo.',
        });
      } else if (finding.id === 'change-missing-control-actions') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen cambios que requieren controles SST pero no tienen acciones de control documentadas. ' +
            'Sin controles definidos, no es posible verificar la mitigación de riesgos.',
          recommendation:
            'Definir y documentar las medidas de control SST necesarias antes de implementar el cambio.',
        });
      } else if (finding.id === 'change-pending-approval') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen solicitudes de cambio pendientes de aprobación formal. ' +
            'Un cambio sin aprobación no puede considerarse parte del proceso documentado.',
          recommendation:
            'Completar el flujo de aprobación antes de implementar los cambios pendientes.',
        });
      } else if (finding.id === 'change-rejected') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen solicitudes de cambio rechazadas. Un cambio rechazado no debe interpretarse como incumplimiento crítico, ' +
            'sino como una solicitud que requiere ajuste, nueva evaluación o cierre justificado.',
          recommendation:
            'Revisar las razones de rechazo, ajustar la solicitud y presentar una nueva versión corregida si aplica.',
        });
      } else if (finding.id === 'change-missing-follow-up') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen cambios implementados sin evidencia suficiente de seguimiento posterior a la implementación. ' +
            'El estándar 2.11.1 requiere verificar la efectividad del cambio.',
          recommendation:
            'Completar el seguimiento post-implementación y documentar los resultados, hallazgos y acciones correctivas cuando corresponda.',
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
      const impactMatch = finding.title.match(/^(\d+)\s+cambio\(s\)\s+sin\s+análisis/);
      if (impactMatch && finding.id === 'change-missing-impact-analysis') {
        metrics.changesWithoutImpactAnalysis = parseInt(impactMatch[1], 10);
      }

      const controlMatch = finding.title.match(/^(\d+)\s+cambio\(s\)\s+sin\s+acciones/);
      if (controlMatch && finding.id === 'change-missing-control-actions') {
        metrics.changesWithoutControlActions = parseInt(controlMatch[1], 10);
      }

      const pendingMatch = finding.title.match(/^(\d+)\s+cambio\(s\)\s+pendiente\(s\)/);
      if (pendingMatch && finding.id === 'change-pending-approval') {
        metrics.pendingApprovalChanges = parseInt(pendingMatch[1], 10);
      }

      const rejectedMatch = finding.title.match(/^(\d+)\s+cambio\(s\)\s+rechazado\(s\)/);
      if (rejectedMatch && finding.id === 'change-rejected') {
        metrics.rejectedChanges = parseInt(rejectedMatch[1], 10);
      }

      const followUpMatch = finding.title.match(/^(\d+)\s+cambio\(s\)\s+implementado\(s\)/);
      if (followUpMatch && finding.id === 'change-missing-follow-up') {
        metrics.changesWithoutFollowUp = parseInt(followUpMatch[1], 10);
      }
    }

    // Si existe el finding 'change-no-data', sabemos que totalChanges = 0.
    const hasNoDataFinding = findings.some((f) => f.id === 'change-no-data');
    if (hasNoDataFinding) {
      metrics.totalChanges = 0;
    } else if (findings.length > 0 || (moduleCompliance.compliance ?? 0) > 0) {
      // Si hay datos, inferimos totalChanges > 0 a partir de findings o compliance
      metrics.totalChanges = 1;
    }

    return metrics;
  }

  // ── Helpers privados ──

  private buildSummary(
    percentage: number,
    metrics: StandardAnalysisMetrics,
    keyIssues: StandardAnalysisKeyIssue[],
  ): string {
    if (metrics.totalChanges === 0) {
      return (
        'No existen datos suficientes para realizar un análisis de Gestión del cambio. ' +
        'Registrar al menos una solicitud de cambio para comenzar la evaluación del estándar 2.11.1.'
      );
    }

    if (percentage >= 90) {
      return (
        `El cumplimiento de Gestión del cambio es del ${percentage}%, lo que indica una gestión sólida. ` +
        'Se recomienda mantener la documentación, el flujo de aprobación y el seguimiento post-implementación.'
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
        `El cumplimiento de Gestión del cambio presenta oportunidades de mejora con un ${percentage}%.${issuesText}`
      );
    }

    // percentage < 50
    return (
      `El cumplimiento de Gestión del cambio es bajo (${percentage}%). ` +
      'Se requiere atención prioritaria para documentar solicitudes de cambio, realizar evaluaciones de impacto y completar el flujo de aprobación.'
    );
  }

  private buildQuickWins(metrics: StandardAnalysisMetrics): string[] {
    const wins: string[] = [];

    if ((metrics.changesWithoutImpactAnalysis ?? 0) > 0) {
      wins.push('Realizar evaluaciones de impacto SST en cambios de impacto significativo.');
    }

    if ((metrics.changesWithoutControlActions ?? 0) > 0) {
      wins.push('Definir acciones de control SST para cambios de alto impacto.');
    }

    if ((metrics.pendingApprovalChanges ?? 0) > 0 && wins.length < 3) {
      wins.push('Completar aprobaciones pendientes de solicitudes de cambio.');
    }

    if ((metrics.changesWithoutFollowUp ?? 0) > 0 && wins.length < 3) {
      wins.push('Registrar seguimientos post-implementación de cambios ejecutados.');
    }

    if ((metrics.rejectedChanges ?? 0) > 0 && wins.length < 3) {
      wins.push('Revisar y ajustar solicitudes de cambio rechazadas.');
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
      if ((metrics.totalChanges ?? 0) === 0) {
        steps.push('Registrar solicitudes de cambio en el módulo de Gestión del cambio.');
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
