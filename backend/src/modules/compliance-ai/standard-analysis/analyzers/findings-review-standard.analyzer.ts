import { StandardAnalyzer, StandardAnalysisContext, StandardAnalysisInterpretation, StandardAnalysisMetrics, StandardAnalysisKeyIssue } from '../../dto/standard-analysis.dto';

export class FindingsReviewStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '6.1.4';
  private static readonly MODULE = 'findings-review';

  supports(code: string): boolean { return code === FindingsReviewStandardAnalyzer.STANDARD_CODE; }
  getModule(): string { return FindingsReviewStandardAnalyzer.MODULE; }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
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
