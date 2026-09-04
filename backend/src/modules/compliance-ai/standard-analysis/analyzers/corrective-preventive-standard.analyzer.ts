import { StandardAnalyzer, StandardAnalysisContext, StandardAnalysisInterpretation, StandardAnalysisMetrics, StandardAnalysisKeyIssue } from '../../dto/standard-analysis.dto';

export class CorrectivePreventiveStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '7.1.1';
  private static readonly MODULE = 'corrective-preventive';

  supports(code: string): boolean { return code === CorrectivePreventiveStandardAnalyzer.STANDARD_CODE; }
  getModule(): string { return CorrectivePreventiveStandardAnalyzer.MODULE; }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const pct = moduleCompliance.compliance;
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const f of findings) {
      if (f.id === 'corrective-preventive-no-data') {
        return { summary: 'No existen acciones preventivas o correctivas registradas. Se requiere definir, ejecutar y verificar acciones para evitar recurrencias.', keyIssues: [], quickWins: ['Registrar las primeras acciones correctivas/preventivas identificadas.'], nextSteps: ['Crear un proceso para registrar acciones preventivas y correctivas con responsables y fechas.'] };
      }
      keyIssues.push({ id: f.id, title: f.title, priority: f.priority === 'HIGH' ? 'HIGH' : 'MEDIUM', impact: f.description, recommendation: f.priority === 'HIGH' ? 'Cerrar acciones vencidas urgentemente.' : 'Dar seguimiento a acciones pendientes.' });
    }

    const summary = pct >= 90 ? `Cumplimiento del ${pct}% en acciones preventivas y correctivas.` :
      pct >= 50 ? `Avance del ${pct}% pero existen brechas en las acciones preventivas/correctivas.` :
      `Las acciones preventivas/correctivas requieren atención prioritaria (${pct}%).`;

    return { summary, keyIssues, quickWins: keyIssues.slice(0, 2).map(i => i.recommendation), nextSteps: keyIssues.slice(0, 2).map(i => i.recommendation) };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    return { compliancePercentage: ctx.moduleCompliance.compliance };
  }
}
