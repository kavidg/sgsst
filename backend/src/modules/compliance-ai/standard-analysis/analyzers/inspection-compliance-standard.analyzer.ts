import { StandardAnalyzer, StandardAnalysisContext, StandardAnalysisInterpretation, StandardAnalysisMetrics, StandardAnalysisKeyIssue } from '../../dto/standard-analysis.dto';

export class InspectionComplianceStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '4.2.4';
  private static readonly MODULE = 'inspection-compliance';

  supports(code: string): boolean { return code === InspectionComplianceStandardAnalyzer.STANDARD_CODE; }
  getModule(): string { return InspectionComplianceStandardAnalyzer.MODULE; }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const pct = moduleCompliance.compliance;
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const f of findings) {
      if (f.id.includes('no-data')) {
        return { summary: 'No existen inspecciones de seguridad. El estándar 4.2.4 requiere un programa de inspecciones periódicas.', keyIssues: [], quickWins: ['Crear un programa de inspecciones de seguridad.'], nextSteps: ['Definir frecuencia y cobertura de inspecciones.'] };
      }
      keyIssues.push({ id: f.id, title: f.title, priority: f.priority === 'HIGH' ? 'HIGH' : 'MEDIUM', impact: f.description, recommendation: f.priority === 'HIGH' ? 'Completar inspecciones vencidas.' : 'Asignar responsables.' });
    }

    const summary = pct >= 90 ? `Inspecciones de seguridad con cumplimiento del ${pct}%.` :
      pct >= 50 ? `Avance del ${pct}% en inspecciones, pero existen brechas.` :
      `Inspecciones de seguridad requieren atención prioritaria (${pct}%).`;

    return { summary, keyIssues, quickWins: keyIssues.slice(0, 2).map(i => i.recommendation), nextSteps: keyIssues.slice(0, 2).map(i => i.recommendation) };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    return { compliancePercentage: ctx.moduleCompliance.compliance };
  }
}
