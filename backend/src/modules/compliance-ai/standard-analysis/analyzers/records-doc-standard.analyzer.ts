import { StandardAnalyzer, StandardAnalysisContext, StandardAnalysisInterpretation, StandardAnalysisMetrics, StandardAnalysisKeyIssue } from '../../dto/standard-analysis.dto';

export class RecordsDocStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '5.1.2';
  private static readonly MODULE = 'records-doc';

  supports(code: string): boolean { return code === RecordsDocStandardAnalyzer.STANDARD_CODE; }
  getModule(): string { return RecordsDocStandardAnalyzer.MODULE; }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const pct = moduleCompliance.compliance;
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const f of findings) {
      if (f.id === 'records-doc-no-data') {
        return { summary: 'No existen registros SG-SST registrados. Se requiere documentar registros, actas, capacitaciones, auditorías e inspecciones del sistema de gestión.', keyIssues: [], quickWins: ['Crear registros básicos del SG-SST (actas, capacitaciones, auditorías).'], nextSteps: ['Definir la estructura de registros del SG-SST y comenzar a documentar evidencias.'] };
      }
      keyIssues.push({ id: f.id, title: f.title, priority: f.priority === 'HIGH' ? 'HIGH' : 'MEDIUM', impact: f.description, recommendation: f.priority === 'HIGH' ? 'Actualizar registros urgentemente.' : 'Completar la documentación de registros.' });
    }

    const summary = pct >= 90 ? `Cumplimiento del ${pct}% en registros SG-SST.` :
      pct >= 50 ? `Avance del ${pct}% pero existen brechas en los registros SG-SST.` :
      `Los registros SG-SST requieren atención prioritaria (${pct}%).`;

    return { summary, keyIssues, quickWins: keyIssues.slice(0, 2).map(i => i.recommendation), nextSteps: keyIssues.slice(0, 2).map(i => i.recommendation) };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    return { compliancePercentage: ctx.moduleCompliance.compliance };
  }
}
