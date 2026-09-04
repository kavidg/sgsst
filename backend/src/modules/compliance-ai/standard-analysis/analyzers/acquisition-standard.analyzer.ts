import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 2.9.1 — Adquisiciones.
 *
 * Interpreta los datos reales del ComplianceEngine (AcquisitionProvider)
 * y genera un análisis textual accionable.
 *
 * NO recalcula el score.
 * NO inventa datos.
 * NO genera claims sobre DocumentMaster o Approval Workflow.
 * Solo interpreta lo que el ComplianceEngine ya evaluó.
 */
export class AcquisitionStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '2.9.1';
  private static readonly MODULE = 'acquisitions';

  supports(standardCode: string): boolean {
    return standardCode === AcquisitionStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return AcquisitionStandardAnalyzer.MODULE;
  }

  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = context;
    const metrics = this.getMetrics(context);
    const percentage = moduleCompliance.compliance;

    // ── NO_DATA ──
    if (metrics.totalSuppliers === 0 && metrics.totalAcquisitions === 0) {
      return {
        summary:
          'No existen datos suficientes para realizar un análisis de Adquisiciones. ' +
          'Registrar al menos un proveedor y una adquisición para comenzar la evaluación del estándar 2.9.1.',
        keyIssues: [],
        quickWins: [
          'Registrar al menos un proveedor.',
          'Registrar la primera adquisición.',
        ],
        nextSteps: [
          'Ir al módulo de Adquisiciones.',
          'Crear proveedores y registrar las adquisiciones correspondientes.',
        ],
      };
    }

    // ── Construir keyIssues desde findings reales ──
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const finding of findings) {
      const priority = this.mapPriority(finding.priority);

      if (finding.id === 'acq-no-data' || finding.id === 'acq-no-suppliers') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Sin proveedores registrados, no es posible gestionar adquisiciones con criterios de SST.',
          recommendation:
            'Registrar proveedores que cumplan los criterios establecidos por la empresa.',
        });
      } else if (finding.id === 'acq-no-active-suppliers') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'No existen proveedores activos disponibles para asignar a adquisiciones.',
          recommendation:
            'Revisar y activar los proveedores que cumplan los criterios establecidos.',
        });
      } else if (finding.id === 'acq-no-supplier') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Las adquisiciones sin proveedor asignado no pueden ser evaluadas con criterios de SST.',
          recommendation:
            'Asignar proveedores activos a las adquisiciones pendientes de selección.',
        });
      } else if (finding.id === 'acq-no-sst-criteria') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'El estándar 2.9.1 exige integrar criterios de SST en los procesos de adquisición. ' +
            'Las adquisiciones sin estos criterios limitan la evidencia de cumplimiento.',
          recommendation:
            'Completar los criterios de SST en las adquisiciones que aún no los tienen definidos.',
        });
      } else if (finding.id === 'acq-incomplete') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Un volumen significativo de adquisiciones sin completar puede afectar la gestión general.',
          recommendation:
            'Revisar el estado de las adquisiciones pendientes y completar las gestiones requeridas.',
        });
      }
    }

    // ── Enriquecer con hallazgos de evidencia documental ──
    const evidence = context.evidence;
    if (evidence) {
      this.enrichWithEvidence(keyIssues, evidence);
    }

    // ── Summary basado en porcentaje real ──
    const summary = this.buildSummary(percentage, metrics, keyIssues, evidence);

    // ── Quick Wins (máximo 3) ──
    const quickWins = this.buildQuickWins(metrics, evidence);

    // ── Next Steps (máximo 3) ──
    const nextSteps = this.buildNextSteps(metrics, keyIssues, evidence);

    return { summary, keyIssues, quickWins, nextSteps };
  }

  getMetrics(context: StandardAnalysisContext): StandardAnalysisMetrics {
    // Las métricas se extraen de los datos del overview/moduleCompliance.
    // El ComplianceEngine ya calculó las métricas reales del dominio.
    // Aquí construimos un mapa plano de métricas conocidas.
    const { findings, moduleCompliance } = context;

    // Extraer métricas de los findings reales
    const metrics: StandardAnalysisMetrics = {
      compliancePercentage: moduleCompliance.compliance,
    };

    // Parsear métricas de los títulos de findings (patrón estable)
    for (const finding of findings) {
      const match = finding.title.match(/^(\d+)\s+adquisición/);
      if (match) {
        if (finding.id === 'acq-no-supplier') {
          metrics.acquisitionsWithoutSupplier = parseInt(match[1], 10);
        } else if (finding.id === 'acq-no-sst-criteria') {
          metrics.acquisitionsWithoutSstCriteria = parseInt(match[1], 10);
        } else if (finding.id === 'acq-incomplete') {
          metrics.incompleteAcquisitions = parseInt(match[1], 10);
        }
      }
    }

    // Métricas derivadas de findings reales.
    // Si existe el finding 'acq-no-data', sabemos que totalSuppliers = 0 y totalAcquisitions = 0.
    const hasNoDataFinding = findings.some((f) => f.id === 'acq-no-data');
    if (hasNoDataFinding) {
      metrics.totalSuppliers = 0;
      metrics.totalAcquisitions = 0;
    }

    return metrics;
  }

  // ── Helpers privados ──

  private enrichWithEvidence(
    keyIssues: StandardAnalysisKeyIssue[],
    evidence: NonNullable<StandardAnalysisContext['evidence']>,
  ): void {
    for (const finding of evidence.evidenceFindings) {
      if (finding.id === 'evidence-no-documents') {
        keyIssues.push({
          id: finding.id,
          title: 'Sin evidencia documental para 2.9.1',
          priority: 'MEDIUM',
          impact:
            'No existen documentos de soporte registrados para el estándar 2.9.1. ' +
            'La ausencia de evidencia documental limita la trazabilidad de las adquisiciones.',
          recommendation:
            'Registrar documentos de soporte (contratos, cotizaciones, evaluaciones) vinculados al estándar 2.9.1.',
        });
      } else if (finding.id === 'evidence-expired') {
        keyIssues.push({
          id: finding.id,
          title: finding.description.split('.')[0],
          priority: 'MEDIUM',
          impact:
            'Documentos de evidencia vencidos pueden afectar la vigencia de la documentación de soporte.',
          recommendation:
            'Renovar o actualizar los documentos de evidencia vencidos.',
        });
      } else if (finding.id === 'evidence-pending-approval') {
        keyIssues.push({
          id: finding.id,
          title: finding.description.split('.')[0],
          priority: 'LOW',
          impact:
            'Documentos pendientes de aprobación aún no constituyen evidencia vigente.',
          recommendation:
            'Completar el flujo de aprobación de los documentos pendientes.',
        });
      } else if (finding.id === 'evidence-no-acquisition-evidence') {
        keyIssues.push({
          id: finding.id,
          title: 'Adquisiciones sin evidencia documental vinculada',
          priority: 'MEDIUM',
          impact:
            'Ninguna adquisición tiene documentos de evidencia vinculados, lo que limita la trazabilidad.',
          recommendation:
            'Asociar documentos de soporte a las adquisiciones existentes.',
        });
      } else if (finding.id === 'evidence-partial-acquisition-evidence') {
        keyIssues.push({
          id: finding.id,
          title: finding.description.split('.')[0],
          priority: 'LOW',
          impact:
            'Algunas adquisiciones no tienen evidencia documental vinculada.',
          recommendation:
            'Completar la documentación de soporte para todas las adquisiciones.',
        });
      } else if (finding.id === 'approval-pending') {
        keyIssues.push({
          id: finding.id,
          title: finding.description.split('.')[0],
          priority: 'LOW',
          impact:
            'Las adquisiciones pendientes de aprobación aún no tienen formalización administrativa.',
          recommendation:
            'Completar el flujo de aprobación de las adquisiciones pendientes.',
        });
      } else if (finding.id === 'approval-rejected') {
        keyIssues.push({
          id: finding.id,
          title: finding.description.split('.')[0],
          priority: 'MEDIUM',
          impact:
            'Adquisiciones rechazadas requieren revisión y corrección antes de reenviar a aprobación.',
          recommendation:
            'Revisar los motivos de rechazo y corregir las adquisiciones antes de reenviar.',
        });
      }
    }
  }

  private buildSummary(
    percentage: number,
    metrics: StandardAnalysisMetrics,
    keyIssues: StandardAnalysisKeyIssue[],
    evidence?: StandardAnalysisContext['evidence'],
  ): string {
    if (metrics.totalSuppliers === 0 && metrics.totalAcquisitions === 0) {
      return (
        'No existen datos suficientes para realizar un análisis de Adquisiciones. ' +
        'Registrar al menos un proveedor y una adquisición para comenzar la evaluación del estándar 2.9.1.'
      );
    }

    if (percentage >= 90) {
      return (
        `El cumplimiento de Adquisiciones es del ${percentage}%, lo que indica una gestión sólida. ` +
        'Se recomienda mantener la calidad de los registros y la asignación de criterios SST en nuevas adquisiciones.'
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
        `El cumplimiento de Adquisiciones presenta oportunidades de mejora con un ${percentage}%.${issuesText}`
      );
    }

    // percentage < 50
    return (
      `El cumplimiento de Adquisiciones es bajo (${percentage}%). ` +
      'Se requiere atención prioritaria para establecer la gestión de proveedores y adquisiciones con criterios de SST.'
    );
  }

  private buildQuickWins(metrics: StandardAnalysisMetrics, evidence?: StandardAnalysisContext['evidence']): string[] {
    const wins: string[] = [];

    if ((metrics.acquisitionsWithoutSstCriteria ?? 0) > 0) {
      wins.push('Definir criterios SST en adquisiciones pendientes.');
    }

    if ((metrics.acquisitionsWithoutSupplier ?? 0) > 0) {
      wins.push('Asignar proveedores a adquisiciones sin proveedor.');
    }

    if (wins.length < 3 && (metrics.incompleteAcquisitions ?? 0) > 0) {
      wins.push('Revisar adquisiciones pendientes de cierre.');
    }

    // Enriquecer con quickWins de evidencia
    if (evidence && wins.length < 3) {
      if (evidence.totalDocuments === 0 && (metrics.totalAcquisitions ?? 0) > 0) {
        wins.push('Registrar documentos de evidencia para las adquisiciones.');
      } else if (evidence.acquisitionsWithoutDocuments > 0 && wins.length < 3) {
        wins.push('Vincular documentos de soporte a adquisiciones sin evidencia.');
      }
    }

    return wins.slice(0, 3);
  }

  private buildNextSteps(
    metrics: StandardAnalysisMetrics,
    keyIssues: StandardAnalysisKeyIssue[],
    evidence?: StandardAnalysisContext['evidence'],
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
      if (metrics.totalSuppliers === 0) {
        steps.push('Registrar proveedores en el módulo de Adquisiciones.');
      }
      if (metrics.totalAcquisitions === 0) {
        steps.push('Registrar adquisiciones para comenzar el seguimiento.');
      }
    }

    // Enriquecer con nextSteps de evidencia
    if (evidence && steps.length < 3) {
      if (evidence.expiredDocuments > 0 && steps.length < 3) {
        steps.push('Renovar documentos de evidencia vencidos.');
      }
      if (evidence.pendingApprovalDocuments > 0 && steps.length < 3) {
        steps.push('Completar aprobación de documentos pendientes.');
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
