import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 2.10.1 — Contratación.
 *
 * Interpreta los datos reales del ComplianceEngine (ContractingProvider)
 * y genera un análisis textual accionable.
 *
 * NO recalcula el score.
 * NO inventa datos.
 * NO genera claims sobre Approval Workflow o DocumentMaster.
 * Solo interpreta lo que el ComplianceEngine ya evaluó.
 */
export class ContractingStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '2.10.1';
  private static readonly MODULE = 'contracting';

  supports(standardCode: string): boolean {
    return standardCode === ContractingStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return ContractingStandardAnalyzer.MODULE;
  }

  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = context;
    const metrics = this.getMetrics(context);
    const percentage = moduleCompliance.compliance;

    // ── NO_DATA ──
    if (metrics.totalContracts === 0) {
      return {
        summary:
          'No existen datos suficientes para realizar un análisis de Contratación. ' +
          'Registrar al menos un contrato activo con contratista para comenzar la evaluación del estándar 2.10.1.',
        keyIssues: [],
        quickWins: [
          'Registrar al menos un contrato activo.',
          'Asociar un contratista de tipo CONTRACTOR al contrato.',
        ],
        nextSteps: [
          'Ir al módulo de Contratación.',
          'Crear contratos con contratistas y definir requisitos SST.',
        ],
      };
    }

    // ── Construir keyIssues desde findings reales ──
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const finding of findings) {
      const priority = this.mapPriority(finding.priority);

      if (finding.id === 'ctr-no-data') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Sin contratos registrados, no es posible evaluar el cumplimiento de requisitos SST en la contratación.',
          recommendation:
            'Registrar contratos con contratistas y definir los requisitos SST establecidos para cada uno.',
        });
      } else if (finding.id === 'ctr-no-sst-requirements') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'El estándar 2.10.1 requiere que la contratación incorpore lineamientos de SST. ' +
            'Los contratos sin requisitos SST documentados limitan la evidencia de cumplimiento.',
          recommendation:
            'Documentar los requisitos de Seguridad y Salud en el Trabajo en los contratos activos que aún no los tienen.',
        });
      } else if (finding.id === 'ctr-pending-inductions') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Los trabajadores de contratistas sin inducción SST completada representan un riesgo de incumplimiento normativo.',
          recommendation:
            'Completar las inducciones SST pendientes para cada trabajador de los contratistas activos.',
        });
      } else if (finding.id === 'ctr-no-evaluations') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Sin evaluaciones de seguimiento, no es posible demostrar control del cumplimiento durante la ejecución del contrato.',
          recommendation:
            'Registrar evaluaciones de desempeño SST para cada contrato activo.',
        });
      } else if (finding.id === 'ctr-no-policy-data') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'No existe información estructurada de pólizas o certificados para verificar la vigencia de la documentación contractual.',
          recommendation:
            'Implementar campos de referencia documental para pólizas y certificados de contratistas en un bloque posterior.',
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
      const match = finding.title.match(/^(\d+)\s+contrato/);
      if (match) {
        if (finding.id === 'ctr-no-sst-requirements') {
          metrics.contractsWithoutSstRequirements = parseInt(match[1], 10);
        } else if (finding.id === 'ctr-no-evaluations') {
          metrics.contractsWithoutEvaluation = parseInt(match[1], 10);
        }
      }

      const inductionMatch = finding.title.match(/^(\d+)\s+inducción/);
      if (inductionMatch && finding.id === 'ctr-pending-inductions') {
        metrics.pendingInductions = parseInt(inductionMatch[1], 10);
      }
    }

    // Si existe el finding 'ctr-no-data', sabemos que totalContracts = 0.
    const hasNoDataFinding = findings.some((f) => f.id === 'ctr-no-data');
    if (hasNoDataFinding) {
      metrics.totalContracts = 0;
    }

    return metrics;
  }

  // ── Helpers privados ──

  private buildSummary(
    percentage: number,
    metrics: StandardAnalysisMetrics,
    keyIssues: StandardAnalysisKeyIssue[],
  ): string {
    if (metrics.totalContracts === 0) {
      return (
        'No existen datos suficientes para realizar un análisis de Contratación. ' +
        'Registrar al menos un contrato activo con contratista para comenzar la evaluación del estándar 2.10.1.'
      );
    }

    if (percentage >= 90) {
      return (
        `El cumplimiento de Contratación es del ${percentage}%, lo que indica una gestión sólida. ` +
        'Se recomienda mantener la documentación de requisitos SST y la realización periódica de inducciones y evaluaciones.'
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
        `El cumplimiento de Contratación presenta oportunidades de mejora con un ${percentage}%.${issuesText}`
      );
    }

    // percentage < 50
    return (
      `El cumplimiento de Contratación es bajo (${percentage}%). ` +
      'Se requiere atención prioritaria para documentar requisitos SST, completar inducciones y registrar evaluaciones de contratistas.'
    );
  }

  private buildQuickWins(metrics: StandardAnalysisMetrics): string[] {
    const wins: string[] = [];

    if ((metrics.contractsWithoutSstRequirements ?? 0) > 0) {
      wins.push('Documentar requisitos SST en contratos activos.');
    }

    if ((metrics.pendingInductions ?? 0) > 0) {
      wins.push('Completar inducciones SST pendientes de contratistas.');
    }

    if ((metrics.contractsWithoutEvaluation ?? 0) > 0 && wins.length < 3) {
      wins.push('Registrar evaluaciones de seguimiento para contratos activos.');
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

    // Si no hay issues suficientes, agregar pasos genéricos basados en métricas
    if (steps.length === 0) {
      if ((metrics.contractsWithoutSstRequirements ?? 0) > 0) {
        steps.push('Documentar requisitos SST en los contratos activos.');
      }
      if ((metrics.pendingInductions ?? 0) > 0) {
        steps.push('Completar las inducciones SST pendientes.');
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
