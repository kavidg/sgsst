import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 3.2.2 — Investigación de enfermedades laborales.
 *
 * Interpreta los datos reales del ComplianceEngine (DiseaseInvestigationProvider)
 * y genera un análisis textual accionable.
 *
 * NO recalcula el score.
 * NO inventa datos.
 * NO genera claims sobre AI Orchestrator, DocumentMaster o Evidence Adapter.
 * Solo interpreta lo que el ComplianceEngine ya evaluó.
 */
export class DiseaseInvestigationStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '3.2.2';
  private static readonly MODULE = 'disease-investigation';

  supports(standardCode: string): boolean {
    return standardCode === DiseaseInvestigationStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return DiseaseInvestigationStandardAnalyzer.MODULE;
  }

  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = context;
    const percentage = moduleCompliance.compliance;

    // ── NO_DATA ──
    const hasNoDataFinding = findings.some((f) => f.id === 'disease-investigation-no-data');
    if (hasNoDataFinding || percentage === 0) {
      return {
        summary:
          'No se encontraron investigaciones de enfermedades laborales suficientes para evaluar el estándar 3.2.2. ' +
          'Registrar las investigaciones de enfermedades laborales que correspondan al período evaluado.',
        keyIssues: [],
        quickWins: [
          'Registrar las investigaciones de enfermedades laborales que correspondan al período evaluado.',
        ],
        nextSteps: [
          'Establecer un mecanismo periódico para identificar, documentar y dar seguimiento a las investigaciones de enfermedades laborales.',
        ],
      };
    }

    // ── Construir keyIssues desde findings reales ──
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const finding of findings) {
      const priority = this.mapPriority(finding.priority);

      if (finding.id === 'disease-investigation-no-data') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Sin investigaciones de enfermedades laborales, no es posible evaluar el cumplimiento del estándar 3.2.2.',
          recommendation:
            'Registrar las investigaciones de enfermedades laborales en el sistema para comenzar la evaluación del estándar.',
        });
      } else if (finding.id === 'disease-investigation-formal-research-gap') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen investigaciones de enfermedades laborales sin fecha de investigación formal. ' +
            'La formalización es necesaria para la trazabilidad del estándar 3.2.2.',
          recommendation:
            'Registrar la fecha de investigación formal de los casos pendientes.',
        });
      } else if (finding.id === 'disease-investigation-causal-analysis-gap') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen investigaciones sin causas básicas, causas inmediatas ni factores relacionados. ' +
            'El análisis causal es fundamental para la investigación de enfermedades laborales.',
          recommendation:
            'Completar la identificación de causas básicas, causas inmediatas y factores relacionados.',
        });
      } else if (finding.id === 'disease-investigation-actions-gap') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen investigaciones sin acciones correctivas ni preventivas registradas. ' +
            'Las acciones derivadas de la investigación son esenciales para el seguimiento.',
          recommendation:
            'Definir acciones correctivas y preventivas para las investigaciones que aún no las tengan.',
        });
      } else if (finding.id === 'disease-investigation-overdue-actions') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen acciones correctivas o preventivas con fecha vencida que no han sido completadas. ' +
            'Las acciones vencidas afectan el seguimiento y la trazabilidad.',
          recommendation:
            'Revisar y priorizar las acciones correctivas y preventivas vencidas.',
        });
      } else if (finding.id === 'disease-investigation-evidence-gap') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen investigaciones sin referencias de evidencia documental. ' +
            'La evidencia administrativa fortalece la trazabilidad del proceso.',
          recommendation:
            'Completar las referencias de evidencia administrativa de las investigaciones.',
        });
      } else if (finding.id === 'disease-investigation-responsible-gap') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen investigaciones sin responsable asignado. ' +
            'La asignación de responsables es necesaria para el seguimiento efectivo.',
          recommendation:
            'Asignar responsables para las investigaciones pendientes de seguimiento.',
        });
      } else if (finding.id === 'disease-investigation-pending-closure') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Existen investigaciones pendientes de cierre formal. ' +
            'El cierre documentado es necesario para completar el ciclo de investigación.',
          recommendation:
            'Revisar las investigaciones pendientes de cierre y documentar su estado.',
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

    // Si existe el finding 'disease-investigation-no-data', totalInvestigations = 0.
    const hasNoDataFinding = findings.some((f) => f.id === 'disease-investigation-no-data');
    if (hasNoDataFinding) {
      metrics.totalInvestigations = 0;
    } else {
      metrics.totalInvestigations =
        (moduleCompliance.compliance ?? 0) > 0 || findings.length > 0 ? 1 : 0;
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
        'No se encontraron investigaciones de enfermedades laborales suficientes para evaluar el estándar 3.2.2. ' +
        'Registrar las investigaciones de enfermedades laborales que correspondan al período evaluado.'
      );
    }

    if (percentage >= 90) {
      return (
        `La investigación de enfermedades laborales presenta un cumplimiento del ${percentage}%, lo que indica una trazabilidad administrativa sólida con análisis causal, acciones derivadas y seguimiento adecuado. ` +
        'Se recomienda mantener la calidad de las investigaciones y continuar con revisiones periódicas.'
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
        `La investigación de enfermedades laborales presenta avances importantes con un ${percentage}%, aunque existen brechas en el análisis causal, las acciones derivadas o la evidencia documental.${issuesText}`
      );
    }

    // percentage < 50
    return (
      `La investigación de enfermedades laborales requiere atención prioritaria (${percentage}%) debido a brechas significativas en la trazabilidad administrativa. ` +
      'Se recomienda priorizar la formalización de investigaciones, el análisis causal y la asignación de acciones.'
    );
  }

  private buildQuickWins(keyIssues: StandardAnalysisKeyIssue[]): string[] {
    const wins: string[] = [];

    const hasOverdue = keyIssues.some((i) => i.id === 'disease-investigation-overdue-actions');
    const hasCausalGap = keyIssues.some((i) => i.id === 'disease-investigation-causal-analysis-gap');
    const hasFormalGap = keyIssues.some((i) => i.id === 'disease-investigation-formal-research-gap');
    const hasActionsGap = keyIssues.some((i) => i.id === 'disease-investigation-actions-gap');
    const hasEvidenceGap = keyIssues.some((i) => i.id === 'disease-investigation-evidence-gap');
    const hasResponsibleGap = keyIssues.some((i) => i.id === 'disease-investigation-responsible-gap');
    const hasPendingClosure = keyIssues.some((i) => i.id === 'disease-investigation-pending-closure');

    if (hasOverdue) {
      wins.push('Revisar y actualizar las acciones correctivas y preventivas vencidas.');
    }

    if (hasCausalGap && wins.length < 3) {
      wins.push('Completar el análisis de causas básicas, causas inmediatas y factores relacionados.');
    }

    if (hasFormalGap && wins.length < 3) {
      wins.push('Completar la fecha y formalización de las investigaciones pendientes.');
    }

    if (hasActionsGap && wins.length < 3) {
      wins.push('Definir acciones correctivas y preventivas para las investigaciones que aún no las tengan.');
    }

    if (hasEvidenceGap && wins.length < 3) {
      wins.push('Completar las referencias de evidencia administrativa de las investigaciones.');
    }

    if (hasResponsibleGap && wins.length < 3) {
      wins.push('Asignar responsables para las investigaciones pendientes de seguimiento.');
    }

    if (hasPendingClosure && wins.length < 3) {
      wins.push('Revisar las investigaciones pendientes de cierre y documentar su estado.');
    }

    if (wins.length === 0) {
      wins.push('Mantener la calidad de las investigaciones con análisis causal, acciones y evidencia actualizados.');
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
      steps.push('Establecer una revisión periódica del estado de las investigaciones.');
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
