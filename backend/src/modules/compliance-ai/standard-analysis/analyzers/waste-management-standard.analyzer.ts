import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 3.1.9
 * "Eliminación adecuada de residuos sólidos, líquidos o gaseosos"
 * (FASE 34C).
 *
 * Interpreta los datos reales del ComplianceEngine
 * (WasteManagementProvider) y genera un análisis textual accionable.
 *
 * NO recalcula el score.
 * NO inventa datos.
 * NO consulta MongoDB.
 * NO introduce lógica duplicada del provider.
 * NO maneja datos sensibles.
 * Solo interpreta lo que el ComplianceEngine ya evaluó.
 *
 * El Provider genera estos findings:
 * - waste-management-no-records (HIGH): sin registros activos
 * - waste-management-no-managed-records (HIGH): solo PLANNED/SUSPENDED
 * - waste-management-disposal-method-pending (HIGH): ACTIVE sin disposalMethod
 * - waste-management-traceability-pending (MEDIUM): sin trazabilidad completa
 * - waste-management-disposal-overdue (MEDIUM): disposición vencida
 * - waste-management-hazardous-not-evidence (MEDIUM): hazardous sin disposición
 */
export class WasteManagementStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '3.1.9';
  private static readonly MODULE = 'waste-management';

  supports(standardCode: string): boolean {
    return standardCode === WasteManagementStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return WasteManagementStandardAnalyzer.MODULE;
  }

  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = context;
    const percentage = moduleCompliance.compliance;

    // ── NO_DATA ──
    const hasNoDataFinding = findings.some((f) => f.id === 'waste-management-no-records');
    if (hasNoDataFinding || percentage === 0) {
      return {
        summary:
          'No existen registros de gestión de residuos. ' +
          'El estándar 3.1.9 exige evidencia de identificación, manejo y disposición adecuada de los residuos generados por la operación.',
        keyIssues: [],
        quickWins: [
          'Registrar los residuos generados (sólidos, líquidos, gaseosos) con su manejo y método de disposición.',
        ],
        nextSteps: [
          'Iniciar el registro de residuos con declaración de tipos generados, trazabilidad y frecuencia de disposición.',
        ],
      };
    }

    // ── Construir keyIssues desde findings reales ──
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const finding of findings) {
      const priority = this.mapPriority(finding.priority);

      if (finding.id === 'waste-management-no-managed-records') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Los residuos están identificados pero ninguno tiene gestión activa. Un registro PLANNED NO demuestra disposición ejecutada.',
          recommendation:
            'Activar la gestión de cada residuo: manejo, método de disposición y trazabilidad.',
        });
      } else if (finding.id === 'waste-management-disposal-method-pending') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Registros activos sin método de disposición. La mera existencia del residuo NO es cumplimiento.',
          recommendation:
            'Registrar el método de disposición (gestor autorizado, tratamiento, disposición final).',
        });
      } else if (finding.id === 'waste-management-traceability-pending') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Registros sin trazabilidad completa (fecha de disposición, responsable, evidencia y destino). Sin trazabilidad no es posible demostrar la eliminación adecuada.',
          recommendation:
            'Completar fecha, responsable, evidencia documental y destino de cada disposición.',
        });
      } else if (finding.id === 'waste-management-disposal-overdue') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Disposiciones vencidas o fuera de la frecuencia declarada. La vigencia no es indefinida y afecta el criterio de continuidad.',
          recommendation:
            'Ejecutar las disposiciones pendientes y actualizar las fechas de próxima disposición.',
        });
      } else if (finding.id === 'waste-management-hazardous-not-evidence') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Residuos peligrosos sin disposición demostrada. hazardous = true es clasificación operativa, NO cumplimiento automático.',
          recommendation:
            'Gestionar los residuos peligrosos con método de disposición y trazabilidad completa.',
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

    const hasNoData = findings.some((f) => f.id === 'waste-management-no-records');
    const hasNoManaged = findings.some((f) => f.id === 'waste-management-no-managed-records');
    const hasNoDisposal = findings.some((f) => f.id === 'waste-management-disposal-method-pending');
    const hasOverdue = findings.some((f) => f.id === 'waste-management-disposal-overdue');

    if (hasNoData) {
      metrics.hasRecords = 0;
    } else {
      metrics.hasRecords = 1;
      metrics.hasManagedRecords = hasNoManaged ? 0 : 1;
      metrics.hasDisposalMethod = hasNoDisposal ? 0.5 : 1;
      metrics.hasOverdueDisposals = hasOverdue ? 1 : 0;
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
        'No existen registros de gestión de residuos. ' +
        'El estándar 3.1.9 exige evidencia de identificación, manejo y disposición adecuada de los residuos generados.'
      );
    }

    if (percentage >= 90) {
      return (
        `La gestión de residuos presenta un cumplimiento del ${percentage}%, con cobertura de los tipos declarados, manejo y disposición trazables y vigencia dentro de la frecuencia. ` +
        'Se recomienda mantener el calendario de disposiciones.'
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
        `La gestión de residuos presenta avances con un ${percentage}%, aunque existen brechas de cobertura, disposición, trazabilidad o continuidad.${issuesText}`
      );
    }

    return (
      `La gestión de residuos requiere atención prioritaria (${percentage}%) debido a brechas significativas. ` +
      'Se recomienda completar manejo, disposición y trazabilidad de los residuos generados.'
    );
  }

  private buildQuickWins(keyIssues: StandardAnalysisKeyIssue[]): string[] {
    const wins: string[] = [];

    if (keyIssues.some((i) => i.id === 'waste-management-no-managed-records')) {
      wins.push('Activar la gestión de los residuos identificados (manejo + disposición).');
    }

    if (keyIssues.some((i) => i.id === 'waste-management-disposal-method-pending') && wins.length < 3) {
      wins.push('Registrar el método de disposición de cada residuo activo.');
    }

    if (keyIssues.some((i) => i.id === 'waste-management-traceability-pending') && wins.length < 3) {
      wins.push('Completar fecha, responsable, evidencia y destino de cada disposición.');
    }

    if (keyIssues.some((i) => i.id === 'waste-management-disposal-overdue') && wins.length < 3) {
      wins.push('Ejecutar las disposiciones vencidas según la frecuencia declarada.');
    }

    if (wins.length === 0) {
      wins.push('Mantener el calendario de disposiciones según la frecuencia.');
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
      steps.push('Establecer un calendario de disposiciones según la frecuencia declarada.');
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
