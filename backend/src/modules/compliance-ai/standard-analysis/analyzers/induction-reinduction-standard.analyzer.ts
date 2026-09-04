import { StandardAnalyzer, StandardAnalysisContext, StandardAnalysisInterpretation, StandardAnalysisMetrics, StandardAnalysisKeyIssue } from '../../dto/standard-analysis.dto';

export class InductionReinductionStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '1.2.2';
  private static readonly MODULE = 'induction-reinduction';

  supports(code: string): boolean { return code === InductionReinductionStandardAnalyzer.STANDARD_CODE; }
  getModule(): string { return InductionReinductionStandardAnalyzer.MODULE; }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const pct = moduleCompliance.compliance;
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const f of findings) {
      if (f.id === 'induction-no-data') {
        return { summary: 'No existen registros de inducción/reinducción SG-SST. Se requiere documentar la inducción de todos los trabajadores al sistema de gestión.', keyIssues: [], quickWins: ['Crear registros de inducción para los trabajadores activos.'], nextSteps: ['Definir el programa de inducción y reinducción, registrar contenidos y ejecutar para toda la nómina.'] };
      }
      keyIssues.push({ id: f.id, title: f.title, priority: f.priority === 'HIGH' ? 'HIGH' : 'MEDIUM', impact: f.description, recommendation: f.priority === 'HIGH' ? 'Completar inducciones pendientes urgentemente.' : 'Documentar contenidos de inducciones existentes.' });
    }

    const summary = pct >= 90 ? `Cumplimiento del ${pct}% en inducción y reinducción SG-SST.` :
      pct >= 50 ? `Avance del ${pct}% pero existen brechas en la cobertura de inducciones.` :
      `La inducción y reinducción SG-SST requiere atención prioritaria (${pct}%).`;

    return { summary, keyIssues, quickWins: keyIssues.slice(0, 2).map(i => i.recommendation), nextSteps: keyIssues.slice(0, 2).map(i => i.recommendation) };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    return { compliancePercentage: ctx.moduleCompliance.compliance };
  }
}
