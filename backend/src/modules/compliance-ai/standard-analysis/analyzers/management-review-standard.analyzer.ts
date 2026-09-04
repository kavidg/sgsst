import { StandardAnalyzer, StandardAnalysisContext, StandardAnalysisInterpretation, StandardAnalysisMetrics, StandardAnalysisKeyIssue } from '../../dto/standard-analysis.dto';

export class ManagementReviewStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '6.1.2';
  private static readonly MODULE = 'management-review';

  supports(code: string): boolean { return code === ManagementReviewStandardAnalyzer.STANDARD_CODE; }
  getModule(): string { return ManagementReviewStandardAnalyzer.MODULE; }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const pct = moduleCompliance.compliance;
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const f of findings) {
      if (f.id === 'management-review-no-data') {
        return { summary: 'No existen reuniones de dirección registradas. Se requiere programar y ejecutar revisiones periódicas por la dirección del SG-SST.', keyIssues: [], quickWins: ['Programar la primera reunión de dirección del SG-SST.'], nextSteps: ['Definir la periodicidad de revisiones de dirección y documentar participantes y resultados.'] };
      }
      keyIssues.push({ id: f.id, title: f.title, priority: f.priority === 'HIGH' ? 'HIGH' : 'MEDIUM', impact: f.description, recommendation: f.priority === 'HIGH' ? 'Programar reuniones de dirección urgentemente.' : 'Completar la documentación de reuniones.' });
    }

    const summary = pct >= 90 ? `Cumplimiento del ${pct}% en revisión por la dirección.` :
      pct >= 50 ? `Avance del ${pct}% pero existen brechas en las revisiones de dirección.` :
      `La revisión por la dirección requiere atención prioritaria (${pct}%).`;

    return { summary, keyIssues, quickWins: keyIssues.slice(0, 2).map(i => i.recommendation), nextSteps: keyIssues.slice(0, 2).map(i => i.recommendation) };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    return { compliancePercentage: ctx.moduleCompliance.compliance };
  }
}
