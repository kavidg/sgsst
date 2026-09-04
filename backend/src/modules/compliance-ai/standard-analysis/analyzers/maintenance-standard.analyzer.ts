import { StandardAnalyzer, StandardAnalysisContext, StandardAnalysisInterpretation, StandardAnalysisMetrics, StandardAnalysisKeyIssue } from '../../dto/standard-analysis.dto';

export class MaintenanceStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '4.2.5';
  private static readonly MODULE = 'maintenance';

  supports(code: string): boolean { return code === MaintenanceStandardAnalyzer.STANDARD_CODE; }
  getModule(): string { return MaintenanceStandardAnalyzer.MODULE; }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const pct = moduleCompliance.compliance;
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const f of findings) {
      if (f.id === 'maintenance-no-data') {
        return { summary: 'No existen actividades de mantenimiento registradas. El estándar 4.2.5 requiere un programa de mantenimiento preventivo y correctivo.', keyIssues: [], quickWins: ['Crear un programa de mantenimiento de equipos, instalaciones y herramientas.'], nextSteps: ['Iniciar la planificación y registro de actividades de mantenimiento.'] };
      }
      keyIssues.push({ id: f.id, title: f.title, priority: f.priority === 'HIGH' ? 'HIGH' : 'MEDIUM', impact: f.description, recommendation: f.priority === 'HIGH' ? 'Completar el programa de mantenimiento urgentemente.' : 'Ampliar la cobertura del programa de mantenimiento.' });
    }

    const summary = pct >= 90 ? `Cumplimiento del ${pct}% en mantenimiento preventivo y correctivo.` :
      pct >= 50 ? `Avance del ${pct}% pero existen brechas en el programa de mantenimiento.` :
      `El programa de mantenimiento requiere atención prioritaria (${pct}%).`;

    return { summary, keyIssues, quickWins: keyIssues.slice(0, 2).map(i => i.recommendation), nextSteps: keyIssues.slice(0, 2).map(i => i.recommendation) };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    return { compliancePercentage: ctx.moduleCompliance.compliance };
  }
}
