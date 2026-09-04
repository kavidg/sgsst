import { StandardAnalyzer, StandardAnalysisContext, StandardAnalysisInterpretation, StandardAnalysisMetrics, StandardAnalysisKeyIssue } from '../../dto/standard-analysis.dto';

export class ProceduresStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '4.2.3';
  private static readonly MODULE = 'procedures';

  supports(code: string): boolean { return code === ProceduresStandardAnalyzer.STANDARD_CODE; }
  getModule(): string { return ProceduresStandardAnalyzer.MODULE; }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const pct = moduleCompliance.compliance;
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const f of findings) {
      if (f.id.includes('no-data')) {
        return { summary: 'No existen riesgos registrados. El estándar 4.2.3 requiere procedimientos e instructivos para tareas críticas.', keyIssues: [], quickWins: ['Registrar riesgos y asociar procedimientos.'], nextSteps: ['Crear procedimientos de trabajo seguro para tareas críticas.'] };
      }
      keyIssues.push({ id: f.id, title: f.title, priority: f.priority === 'HIGH' ? 'HIGH' : 'MEDIUM', impact: f.description, recommendation: 'Documentar procedimientos e instructivos para las tareas identificadas.' });
    }

    const summary = pct >= 90 ? `Procedimientos documentados con cumplimiento del ${pct}%.` :
      pct >= 50 ? `Avance del ${pct}% en procedimientos, pero faltan algunos.` :
      `Procedimientos e instructivos requieren atención prioritaria (${pct}%).`;

    return { summary, keyIssues, quickWins: keyIssues.slice(0, 2).map(i => i.recommendation), nextSteps: keyIssues.slice(0, 2).map(i => i.recommendation) };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    return { compliancePercentage: ctx.moduleCompliance.compliance };
  }
}
