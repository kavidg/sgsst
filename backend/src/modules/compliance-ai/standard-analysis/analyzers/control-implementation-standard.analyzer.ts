import { StandardAnalyzer, StandardAnalysisContext, StandardAnalysisInterpretation, StandardAnalysisMetrics, StandardAnalysisKeyIssue } from '../../dto/standard-analysis.dto';

export class ControlImplementationStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '4.2.1';
  private static readonly MODULE = 'control-implementation';

  supports(code: string): boolean { return code === ControlImplementationStandardAnalyzer.STANDARD_CODE; }
  getModule(): string { return ControlImplementationStandardAnalyzer.MODULE; }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const pct = moduleCompliance.compliance;
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const f of findings) {
      if (f.id === 'control-impl-no-data') {
        return { summary: 'No existen riesgos registrados. El estándar 4.2.1 requiere medidas de control para los riesgos identificados.', keyIssues: [], quickWins: ['Registrar riesgos y definir medidas de control para cada uno.'], nextSteps: ['Iniciar la identificación de riesgos y la definición de controles.'] };
      }
      keyIssues.push({ id: f.id, title: f.title, priority: f.priority === 'HIGH' ? 'HIGH' : 'MEDIUM', impact: f.description, recommendation: f.priority === 'HIGH' ? 'Implementar controles urgentemente.' : 'Completar la documentación de controles.' });
    }

    const summary = pct >= 90 ? `Cumplimiento del ${pct}% en implementación de controles.` :
      pct >= 50 ? `Avance del ${pct}% pero existen brechas en la implementación de controles.` :
      `Implementación de controles requiere atención prioritaria (${pct}%).`;

    return { summary, keyIssues, quickWins: keyIssues.slice(0, 2).map(i => i.recommendation), nextSteps: keyIssues.slice(0, 2).map(i => i.recommendation) };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    return { compliancePercentage: ctx.moduleCompliance.compliance };
  }
}
