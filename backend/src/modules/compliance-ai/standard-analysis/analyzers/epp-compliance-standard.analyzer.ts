import { StandardAnalyzer, StandardAnalysisContext, StandardAnalysisInterpretation, StandardAnalysisMetrics, StandardAnalysisKeyIssue } from '../../dto/standard-analysis.dto';

export class EppComplianceStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '4.2.6';
  private static readonly MODULE = 'epp-compliance';

  supports(code: string): boolean { return code === EppComplianceStandardAnalyzer.STANDARD_CODE; }
  getModule(): string { return EppComplianceStandardAnalyzer.MODULE; }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const pct = moduleCompliance.compliance;
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const f of findings) {
      if (f.id === 'epp-no-data') {
        return { summary: 'No existen registros de EPP. El estándar 4.2.6 requiere una matriz de EPP por cargo o tarea con entrega, reposición, capacitación y supervisión.', keyIssues: [], quickWins: ['Definir la matriz de EPP por cargo o tarea.'], nextSteps: ['Iniciar el proceso de selección, entrega y documentación de EPP.'] };
      }
      keyIssues.push({ id: f.id, title: f.title, priority: f.priority === 'HIGH' ? 'HIGH' : 'MEDIUM', impact: f.description, recommendation: f.priority === 'HIGH' ? 'Completar la matriz de EPP urgentemente.' : 'Ampliar la cobertura de EPP documentada.' });
    }

    const summary = pct >= 90 ? `Cumplimiento del ${pct}% en selección y gestión de EPP.` :
      pct >= 50 ? `Avance del ${pct}% pero existen brechas en la gestión de EPP.` :
      `La gestión de EPP requiere atención prioritaria (${pct}%).`;

    return { summary, keyIssues, quickWins: keyIssues.slice(0, 2).map(i => i.recommendation), nextSteps: keyIssues.slice(0, 2).map(i => i.recommendation) };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    return { compliancePercentage: ctx.moduleCompliance.compliance };
  }
}
