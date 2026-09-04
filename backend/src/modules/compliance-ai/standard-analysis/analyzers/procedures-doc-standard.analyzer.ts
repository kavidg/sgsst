import { StandardAnalyzer, StandardAnalysisContext, StandardAnalysisInterpretation, StandardAnalysisMetrics, StandardAnalysisKeyIssue } from '../../dto/standard-analysis.dto';

export class ProceduresDocStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '5.1.1';
  private static readonly MODULE = 'procedures-doc';

  supports(code: string): boolean { return code === ProceduresDocStandardAnalyzer.STANDARD_CODE; }
  getModule(): string { return ProceduresDocStandardAnalyzer.MODULE; }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const pct = moduleCompliance.compliance;
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const f of findings) {
      if (f.id === 'procedures-doc-no-data') {
        return { summary: 'No existen procedimientos SG-SST registrados. Se requiere documentar procedimientos, políticas, manuales y formatos del sistema de gestión.', keyIssues: [], quickWins: ['Crear al menos un procedimiento base del SG-SST.'], nextSteps: ['Definir la estructura documental del SG-SST: políticas, procedimientos, manuales y formatos.'] };
      }
      keyIssues.push({ id: f.id, title: f.title, priority: f.priority === 'HIGH' ? 'HIGH' : 'MEDIUM', impact: f.description, recommendation: f.priority === 'HIGH' ? 'Actualizar procedimientos urgentemente.' : 'Completar la documentación de procedimientos.' });
    }

    const summary = pct >= 90 ? `Cumplimiento del ${pct}% en procedimientos SG-SST.` :
      pct >= 50 ? `Avance del ${pct}% pero existen brechas en los procedimientos SG-SST.` :
      `Los procedimientos SG-SST requieren atención prioritaria (${pct}%).`;

    return { summary, keyIssues, quickWins: keyIssues.slice(0, 2).map(i => i.recommendation), nextSteps: keyIssues.slice(0, 2).map(i => i.recommendation) };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    return { compliancePercentage: ctx.moduleCompliance.compliance };
  }
}
