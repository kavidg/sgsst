import { StandardAnalyzer, StandardAnalysisContext, StandardAnalysisInterpretation, StandardAnalysisMetrics, StandardAnalysisKeyIssue } from '../../dto/standard-analysis.dto';

/**
 * E2 — Analyzer legacy "Revisión de hallazgos" (AccountabilityCommitment).
 *
 * WRONG_MAPPING 6.1.4 RETIRADO: esta clase ya NO declara STANDARD_CODE
 * '6.1.4' (la fuente oficial es CopasstAuditPlanningStandardAnalyzer sobre el
 * provider `copasst-audit-planning`). Su registro fue retirado del
 * StandardAnalysisService (patrón 5.1.1/5.1.2/6.1.1/6.1.3: la clase se
 * conserva SIN registro, NO se elimina físicamente y NO se reasigna a otro
 * estándar — queda SIN estándar canónico).
 */
export class FindingsReviewStandardAnalyzer implements StandardAnalyzer {
  /** Sin estándar canónico desde E2 (retiro del wrong-mapping 6.1.4). */
  private static readonly STANDARD_CODE: string | null = null;
  private static readonly MODULE = 'findings-review';

  supports(_code: string): boolean { return FindingsReviewStandardAnalyzer.STANDARD_CODE !== null && _code === FindingsReviewStandardAnalyzer.STANDARD_CODE; }
  getModule(): string { return FindingsReviewStandardAnalyzer.MODULE; }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    // Nota E2: código muerto preservado (sin registro). Interpretaba la
    // evidencia de compromisos como 6.1.4 — mapping incorrecto ya retirado.
    const { moduleCompliance, findings } = ctx;
    const pct = moduleCompliance.compliance;
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const f of findings) {
      if (f.id === 'findings-review-no-data') {
        return { summary: 'No existen hallazgos o compromisos de seguimiento registrados. Se requiere documentar hallazgos de auditorías y revisiones.', keyIssues: [], quickWins: ['Registrar los hallazgos identificados en auditorías y revisiones anteriores.'], nextSteps: ['Crear un sistema de seguimiento de hallazgos con responsables y fechas límite.'] };
      }
      keyIssues.push({ id: f.id, title: f.title, priority: f.priority === 'HIGH' ? 'HIGH' : 'MEDIUM', impact: f.description, recommendation: f.priority === 'HIGH' ? 'Atender hallazgos vencidos urgentemente.' : 'Seguimiento de hallazgos pendientes.' });
    }

    const summary = pct >= 90 ? `Cumplimiento del ${pct}% en revisión de hallazgos.` :
      pct >= 50 ? `Avance del ${pct}% pero existen brechas en el seguimiento de hallazgos.` :
      `La revisión de hallazgos requiere atención prioritaria (${pct}%).`;

    return { summary, keyIssues, quickWins: keyIssues.slice(0, 2).map(i => i.recommendation), nextSteps: keyIssues.slice(0, 2).map(i => i.recommendation) };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    return { compliancePercentage: ctx.moduleCompliance.compliance };
  }
}
