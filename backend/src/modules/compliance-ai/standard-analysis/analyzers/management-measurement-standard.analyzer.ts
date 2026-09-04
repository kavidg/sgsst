import { StandardAnalyzer, StandardAnalysisContext, StandardAnalysisInterpretation, StandardAnalysisMetrics, StandardAnalysisKeyIssue } from '../../dto/standard-analysis.dto';

export class ManagementMeasurementStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '6.1.1';
  private static readonly MODULE = 'management-measurement';

  supports(code: string): boolean { return code === ManagementMeasurementStandardAnalyzer.STANDARD_CODE; }
  getModule(): string { return ManagementMeasurementStandardAnalyzer.MODULE; }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const pct = moduleCompliance.compliance;
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const f of findings) {
      if (f.id === 'management-measurement-no-data') {
        return { summary: 'No existen indicadores de gestión SST configurados. Se requiere definir indicadores y comenzar a medir el desempeño del sistema.', keyIssues: [], quickWins: ['Definir al menos 3-5 indicadores clave del SG-SST.'], nextSteps: ['Crear indicadores de estructura, proceso y resultado, y comenzar a registrar mediciones periódicas.'] };
      }
      keyIssues.push({ id: f.id, title: f.title, priority: f.priority === 'HIGH' ? 'HIGH' : 'MEDIUM', impact: f.description, recommendation: f.priority === 'HIGH' ? 'Completar mediciones urgentemente.' : 'Actualizar indicadores y mediciones.' });
    }

    const summary = pct >= 90 ? `Cumplimiento del ${pct}% en medición de la gestión SST.` :
      pct >= 50 ? `Avance del ${pct}% pero existen brechas en la medición de indicadores SST.` :
      `La medición de la gestión SST requiere atención prioritaria (${pct}%).`;

    return { summary, keyIssues, quickWins: keyIssues.slice(0, 2).map(i => i.recommendation), nextSteps: keyIssues.slice(0, 2).map(i => i.recommendation) };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    return { compliancePercentage: ctx.moduleCompliance.compliance };
  }
}
