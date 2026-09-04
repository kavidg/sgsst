import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 4.1.3
 * "Sustancias peligrosas".
 *
 * Interpreta los datos reales del ComplianceEngine (HazardousSubstanceProvider)
 * y genera un análisis textual accionable.
 *
 * NO recalcula el score.
 * NO inventa datos.
 * NO consulta MongoDB.
 * Solo interpreta lo que el ComplianceEngine ya evaluó.
 *
 * El Provider genera estos findings:
 * - hazardous-substance-no-data (HIGH): no hay registros ACTIVE
 * - hazardous-substance-no-sds (MEDIUM): ACTIVE sin SDS CURRENT
 * - hazardous-substance-partial-sds (MEDIUM): algunos ACTIVE sin SDS CURRENT
 * - hazardous-substance-expired-sds (MEDIUM): ACTIVE con SDS EXPIRED
 * - hazardous-substance-no-controls (MEDIUM): ACTIVE sin controles
 * - hazardous-substance-partial-controls (MEDIUM): algunos ACTIVE sin controles
 */
export class HazardousSubstanceStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '4.1.3';
  private static readonly MODULE = 'hazardous-substance';

  supports(standardCode: string): boolean {
    return standardCode === HazardousSubstanceStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return HazardousSubstanceStandardAnalyzer.MODULE;
  }

  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = context;
    const percentage = moduleCompliance.compliance;

    // ── NO_DATA ──
    const hasNoDataFinding = findings.some((f) => f.id === 'hazardous-substance-no-data');
    if (hasNoDataFinding || percentage === 0) {
      return {
        summary:
          'No existen registros activos de sustancias químicas peligrosas en el inventario. ' +
          'El estándar 4.1.3 requiere un inventario documentado de sustancias peligrosas con SDS y controles.',
        keyIssues: [],
        quickWins: [
          'Crear el inventario de sustancias peligrosas registrando las sustancias activas utilizadas por la empresa.',
        ],
        nextSteps: [
          'Iniciar el registro de sustancias peligrosas conforme al estándar 4.1.3.',
        ],
      };
    }

    // ── Construir keyIssues desde findings reales ──
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const finding of findings) {
      const priority = this.mapPriority(finding.priority);

      if (finding.id === 'hazardous-substance-no-sds') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'No se evidencia Hoja de Datos de Seguridad (SDS/HDS) vigente para las sustancias peligrosas registradas. ' +
            'Sin SDS CURRENT, no es posible demostrar la información técnica requerida para la manipulación segura.',
          recommendation:
            'Obtener y registrar las SDS/HDS vigentes para cada sustancia peligrosa en el inventario.',
        });
      } else if (finding.id === 'hazardous-substance-partial-sds') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Algunas sustancias peligrosas tienen SDS vigente pero otras no. ' +
            'La cobertura documental es parcial e inconsistente.',
          recommendation:
            'Priorizar la obtención de SDS vigentes para las sustancias que aún no las tienen registradas.',
        });
      } else if (finding.id === 'hazardous-substance-expired-sds') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen sustancias con SDS vencida. ' +
            'Una SDS vencida indica que existe un soporte identificado pero que requiere actualización o revisión.',
          recommendation:
            'Actualizar las SDS vencidas para mantener la trazabilidad documental del inventario.',
        });
      } else if (finding.id === 'hazardous-substance-no-controls') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'No se evidencian controles implementados documentados para las sustancias peligrosas activas. ' +
            'El estándar 4.1.3 requiere evidencia de controles para manipulación, almacenamiento y disposición.',
          recommendation:
            'Documentar los controles implementados para manipulación, almacenamiento y disposición de cada sustancia.',
        });
      } else if (finding.id === 'hazardous-substance-partial-controls') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Algunas sustancias tienen controles documentados pero otras no. ' +
            'La cobertura de controles es parcial.',
          recommendation:
            'Completar la documentación de controles para todas las sustancias peligrosas activas.',
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

    // Inferir métricas desde findings
    const hasNoData = findings.some((f) => f.id === 'hazardous-substance-no-data');
    const hasNoSds = findings.some((f) => f.id === 'hazardous-substance-no-sds');
    const hasPartialSds = findings.some((f) => f.id === 'hazardous-substance-partial-sds');
    const hasExpiredSds = findings.some((f) => f.id === 'hazardous-substance-expired-sds');
    const hasNoControls = findings.some((f) => f.id === 'hazardous-substance-no-controls');
    const hasPartialControls = findings.some((f) => f.id === 'hazardous-substance-partial-controls');

    if (hasNoData) {
      metrics.hasRecords = 0;
      metrics.hasSds = 0;
      metrics.hasControls = 0;
    } else {
      metrics.hasRecords = 1;
      metrics.hasSds = hasNoSds ? 0 : (hasPartialSds ? 0.5 : 1);
      metrics.hasControls = hasNoControls ? 0 : (hasPartialControls ? 0.5 : 1);
      metrics.hasExpiredSds = hasExpiredSds ? 1 : 0;
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
        'No existen registros activos de sustancias químicas peligrosas en el inventario. ' +
        'El estándar 4.1.3 requiere un inventario documentado con SDS y controles.'
      );
    }

    if (percentage >= 90) {
      return (
        `El inventario de sustancias peligrosas presenta un cumplimiento del ${percentage}%, lo que indica cobertura sólida de SDS y controles. ` +
        'Se recomienda mantener actualizado el inventario y la documentación.'
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
        `El inventario de sustancias peligrosas presenta avances con un ${percentage}%, aunque existen brechas en SDS, controles o documentación.${issuesText}`
      );
    }

    // percentage < 50
    return (
      `El inventario de sustancias peligrosas requiere atención prioritaria (${percentage}%) debido a brechas significativas. ` +
      'Se recomienda crear el inventario, obtener SDS vigentes y documentar controles conforme al estándar 4.1.3.'
    );
  }

  private buildQuickWins(keyIssues: StandardAnalysisKeyIssue[]): string[] {
    const wins: string[] = [];

    const hasNoSds = keyIssues.some((i) => i.id === 'hazardous-substance-no-sds');
    const hasPartialSds = keyIssues.some((i) => i.id === 'hazardous-substance-partial-sds');
    const hasExpiredSds = keyIssues.some((i) => i.id === 'hazardous-substance-expired-sds');
    const hasNoControls = keyIssues.some((i) => i.id === 'hazardous-substance-no-controls');
    const hasPartialControls = keyIssues.some((i) => i.id === 'hazardous-substance-partial-controls');

    if (hasNoSds || hasPartialSds) {
      wins.push('Obtener y registrar las SDS/HDS vigentes para las sustancias sin cobertura documental.');
    }

    if (hasExpiredSds && wins.length < 3) {
      wins.push('Actualizar las SDS vencidas para mantener la trazabilidad documental.');
    }

    if ((hasNoControls || hasPartialControls) && wins.length < 3) {
      wins.push('Documentar los controles implementados para manipulación, almacenamiento y disposición.');
    }

    if (wins.length === 0) {
      wins.push('Mantener actualizado el inventario de sustancias peligrosas y su documentación.');
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
      steps.push('Establecer revisiones periódicas del inventario de sustancias peligrosas.');
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
