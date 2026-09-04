import { StandardAnalyzer, StandardAnalysisContext, StandardAnalysisInterpretation, StandardAnalysisMetrics, StandardAnalysisKeyIssue } from '../../dto/standard-analysis.dto';

export class InternalAuditStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '6.1.3';
  private static readonly MODULE = 'internal-audit';

  supports(code: string): boolean { return code === InternalAuditStandardAnalyzer.STANDARD_CODE; }
  getModule(): string { return InternalAuditStandardAnalyzer.MODULE; }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const pct = moduleCompliance.compliance;
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const f of findings) {
      if (f.id === 'internal-audit-no-data') {
        return { summary: 'No existen auditorías internas SG-SST documentadas. Se requiere programar y ejecutar auditorías internas periódicas.', keyIssues: [], quickWins: ['Crear un documento de auditoría interna con programación anual.'], nextSteps: ['Definir el programa de auditorías internas, asignar auditores y ejecutar la primera auditoría.'] };
      }
      keyIssues.push({ id: f.id, title: f.title, priority: f.priority === 'HIGH' ? 'HIGH' : 'MEDIUM', impact: f.description, recommendation: f.priority === 'HIGH' ? 'Completar auditorías urgentemente.' : 'Actualizar documentación de auditorías.' });
    }

    const summary = pct >= 90 ? `Cumplimiento del ${pct}% en auditoría interna SG-SST.` :
      pct >= 50 ? `Avance del ${pct}% pero existen brechas en las auditorías internas.` :
      `La auditoría interna SG-SST requiere atención prioritaria (${pct}%).`;

    return { summary, keyIssues, quickWins: keyIssues.slice(0, 2).map(i => i.recommendation), nextSteps: keyIssues.slice(0, 2).map(i => i.recommendation) };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    return { compliancePercentage: ctx.moduleCompliance.compliance };
  }
}
