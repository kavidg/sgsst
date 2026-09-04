import { StandardAnalyzer, StandardAnalysisContext, StandardAnalysisInterpretation, StandardAnalysisMetrics, StandardAnalysisKeyIssue } from '../../dto/standard-analysis.dto';

export class ManagementImprovementStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '7.1.2';
  private static readonly MODULE = 'management-improvement';

  supports(code: string): boolean { return code === ManagementImprovementStandardAnalyzer.STANDARD_CODE; }
  getModule(): string { return ManagementImprovementStandardAnalyzer.MODULE; }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const pct = moduleCompliance.compliance;
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const f of findings) {
      if (f.id === 'management-improvement-no-data') {
        return { summary: 'No existen acciones de mejora aprobadas por la alta dirección. Se requiere documentar reuniones de dirección con acciones de mejora.', keyIssues: [], quickWins: ['Programar una reunión de dirección con acciones de mejora.'], nextSteps: ['Definir el proceso de revisión de mejora por la alta dirección y documentar resultados.'] };
      }
      keyIssues.push({ id: f.id, title: f.title, priority: f.priority === 'HIGH' ? 'HIGH' : 'MEDIUM', impact: f.description, recommendation: f.priority === 'HIGH' ? 'Programar reuniones de dirección urgentemente.' : 'Completar documentación de reuniones.' });
    }

    const summary = pct >= 90 ? `Cumplimiento del ${pct}% en acciones de mejora de alta dirección.` :
      pct >= 50 ? `Avance del ${pct}% pero existen brechas en las acciones de mejora.` :
      `Las acciones de mejora de alta dirección requieren atención prioritaria (${pct}%).`;

    return { summary, keyIssues, quickWins: keyIssues.slice(0, 2).map(i => i.recommendation), nextSteps: keyIssues.slice(0, 2).map(i => i.recommendation) };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    return { compliancePercentage: ctx.moduleCompliance.compliance };
  }
}
