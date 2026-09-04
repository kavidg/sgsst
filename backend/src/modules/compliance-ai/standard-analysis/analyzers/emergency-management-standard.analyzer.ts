import { StandardAnalyzer, StandardAnalysisContext, StandardAnalysisInterpretation, StandardAnalysisMetrics, StandardAnalysisKeyIssue } from '../../dto/standard-analysis.dto';

export class EmergencyManagementStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '4.4.1';
  private static readonly MODULE = 'emergency-management';

  supports(code: string): boolean { return code === EmergencyManagementStandardAnalyzer.STANDARD_CODE; }
  getModule(): string { return EmergencyManagementStandardAnalyzer.MODULE; }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const pct = moduleCompliance.compliance;
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const f of findings) {
      if (f.id === 'emergency-management-no-data') {
        return { summary: 'No existen registros de gestión de emergencias. Se requiere plan de emergencias, brigadas, equipos y simulacros.', keyIssues: [], quickWins: ['Configurar el plan de emergencias y crear al menos una brigada.'], nextSteps: ['Definir plan de emergencias, asignar brigadas y programar simulacros.'] };
      }
      keyIssues.push({ id: f.id, title: f.title, priority: f.priority === 'HIGH' ? 'HIGH' : 'MEDIUM', impact: f.description, recommendation: f.priority === 'HIGH' ? 'Completar la gestión de emergencias urgentemente.' : 'Ampliar la cobertura de preparación ante emergencias.' });
    }

    const summary = pct >= 90 ? `Cumplimiento del ${pct}% en gestión de emergencias.` :
      pct >= 50 ? `Avance del ${pct}% pero existen brechas en la gestión de emergencias.` :
      `La gestión de emergencias requiere atención prioritaria (${pct}%).`;

    return { summary, keyIssues, quickWins: keyIssues.slice(0, 2).map(i => i.recommendation), nextSteps: keyIssues.slice(0, 2).map(i => i.recommendation) };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    return { compliancePercentage: ctx.moduleCompliance.compliance };
  }
}
