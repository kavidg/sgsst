import { StandardAnalyzer, StandardAnalysisContext, StandardAnalysisInterpretation, StandardAnalysisMetrics, StandardAnalysisKeyIssue } from '../../dto/standard-analysis.dto';

export class IncidentActionsStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '7.1.3';
  private static readonly MODULE = 'incident-actions';

  supports(code: string): boolean { return code === IncidentActionsStandardAnalyzer.STANDARD_CODE; }
  getModule(): string { return IncidentActionsStandardAnalyzer.MODULE; }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const pct = moduleCompliance.compliance;
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const f of findings) {
      if (f.id === 'incident-actions-no-data') {
        return { summary: 'No existen incidentes registrados. El estándar 7.1.3 requiere que los accidentes generen acciones de mejora con análisis causal.', keyIssues: [], quickWins: ['Registrar incidentes existentes con análisis causal.'], nextSteps: ['Crear un proceso para registrar incidentes, investigar causas raíz y definir acciones correctivas.'] };
      }
      keyIssues.push({ id: f.id, title: f.title, priority: f.priority === 'HIGH' ? 'HIGH' : 'MEDIUM', impact: f.description, recommendation: f.priority === 'HIGH' ? 'Investigar incidentes pendientes urgentemente.' : 'Definir acciones correctivas para incidentes sin seguimiento.' });
    }

    const summary = pct >= 90 ? `Cumplimiento del ${pct}% en acciones por accidentes.` :
      pct >= 50 ? `Avance del ${pct}% pero existen brechas en la investigación y acciones de incidentes.` :
      `Las acciones por accidentes requieren atención prioritaria (${pct}%).`;

    return { summary, keyIssues, quickWins: keyIssues.slice(0, 2).map(i => i.recommendation), nextSteps: keyIssues.slice(0, 2).map(i => i.recommendation) };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    return { compliancePercentage: ctx.moduleCompliance.compliance };
  }
}
