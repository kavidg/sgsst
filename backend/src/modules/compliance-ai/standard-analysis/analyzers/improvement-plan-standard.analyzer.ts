import { StandardAnalyzer, StandardAnalysisContext, StandardAnalysisInterpretation, StandardAnalysisMetrics, StandardAnalysisKeyIssue } from '../../dto/standard-analysis.dto';

export class ImprovementPlanStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '7.1.4';
  private static readonly MODULE = 'improvement-plan';

  supports(code: string): boolean { return code === ImprovementPlanStandardAnalyzer.STANDARD_CODE; }
  getModule(): string { return ImprovementPlanStandardAnalyzer.MODULE; }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const pct = moduleCompliance.compliance;
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const f of findings) {
      if (f.id === 'improvement-plan-no-data') {
        return { summary: 'No existen planes de mejoramiento del SG-SST. Se requiere crear un plan con acciones, responsables y seguimiento.', keyIssues: [], quickWins: ['Crear un plan de mejoramiento básico con las acciones identificadas.'], nextSteps: ['Definir un plan de mejoramiento estructurado con responsables, plazos y indicadores de seguimiento.'] };
      }
      keyIssues.push({ id: f.id, title: f.title, priority: f.priority === 'HIGH' ? 'HIGH' : 'MEDIUM', impact: f.description, recommendation: f.priority === 'HIGH' ? 'Activar programas de mejoramiento urgentemente.' : 'Registrar avance en programas existentes.' });
    }

    const summary = pct >= 90 ? `Cumplimiento del ${pct}% en plan de mejoramiento.` :
      pct >= 50 ? `Avance del ${pct}% pero existen brechas en el plan de mejoramiento.` :
      `El plan de mejoramiento requiere atención prioritaria (${pct}%).`;

    return { summary, keyIssues, quickWins: keyIssues.slice(0, 2).map(i => i.recommendation), nextSteps: keyIssues.slice(0, 2).map(i => i.recommendation) };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    return { compliancePercentage: ctx.moduleCompliance.compliance };
  }
}
