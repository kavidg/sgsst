import { StandardAnalyzer, StandardAnalysisContext, StandardAnalysisInterpretation, StandardAnalysisMetrics, StandardAnalysisKeyIssue } from '../../dto/standard-analysis.dto';

export class ControlVerificationStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '4.3.1';
  private static readonly MODULE = 'control-verification-standard';

  supports(code: string): boolean { return code === ControlVerificationStandardAnalyzer.STANDARD_CODE; }
  getModule(): string { return ControlVerificationStandardAnalyzer.MODULE; }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const pct = moduleCompliance.compliance;
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const f of findings) {
      if (f.id === 'control-verification-standard-no-data') {
        return { summary: 'No existen datos para evaluar la verificación de controles. Se requieren riesgos e inspecciones registradas.', keyIssues: [], quickWins: ['Registrar riesgos con medidas de control y crear un programa de verificación.'], nextSteps: ['Iniciar la identificación de riesgos y configurar inspecciones periódicas.'] };
      }
      keyIssues.push({ id: f.id, title: f.title, priority: f.priority === 'HIGH' ? 'HIGH' : 'MEDIUM', impact: f.description, recommendation: f.priority === 'HIGH' ? 'Verificar controles urgentemente.' : 'Completar la documentación de verificación.' });
    }

    const summary = pct >= 90 ? `Cumplimiento del ${pct}% en verificación de controles.` :
      pct >= 50 ? `Avance del ${pct}% pero existen brechas en la verificación de controles.` :
      `La verificación de controles requiere atención prioritaria (${pct}%).`;

    return { summary, keyIssues, quickWins: keyIssues.slice(0, 2).map(i => i.recommendation), nextSteps: keyIssues.slice(0, 2).map(i => i.recommendation) };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    return { compliancePercentage: ctx.moduleCompliance.compliance };
  }
}
