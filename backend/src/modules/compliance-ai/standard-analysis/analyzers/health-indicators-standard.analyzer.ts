import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 3.3.2
 * "Medición y análisis de indicadores de salud".
 *
 * Interpreta los datos reales del ComplianceEngine (HealthIndicatorsProvider)
 * y genera un análisis textual accionable.
 *
 * NO recalcula el score.
 * NO inventa datos.
 * NO consulta MongoDB.
 * Solo interpreta lo que el ComplianceEngine ya evaluó.
 */
export class HealthIndicatorsStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '3.3.2';
  private static readonly MODULE = 'health-indicators';

  supports(code: string): boolean {
    return code === HealthIndicatorsStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return HealthIndicatorsStandardAnalyzer.MODULE;
  }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const pct = moduleCompliance.compliance;
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    // NO_DATA case
    const hasNoData = findings.some((f) => f.id === 'health-indicators-no-data');
    if (hasNoData && pct === 0) {
      return {
        summary:
          'No existen indicadores de salud configurados. El estándar 3.3.2 requiere que la empresa defina y mida indicadores de salud ocupacional como frecuencia de accidentes, severidad, ausentismo y otros.',
        keyIssues: [],
        quickWins: [
          'Configurar indicadores mínimos de salud (incidencia, severidad, frecuencia, ausentismo) en el módulo de Indicadores.',
        ],
        nextSteps: [
          'Definir indicadores de salud con metas y periodicidad.',
          'Registrar las primeras mediciones para el período vigente.',
        ],
      };
    }

    // Build keyIssues from findings
    for (const f of findings) {
      const priority: 'HIGH' | 'MEDIUM' | 'LOW' =
        f.priority === 'HIGH' ? 'HIGH' : f.priority === 'MEDIUM' ? 'MEDIUM' : 'LOW';

      if (f.id === 'health-indicators-no-measurements') {
        keyIssues.push({
          id: f.id, title: f.title, priority,
          impact: 'Existen indicadores de salud configurados pero sin mediciones. Sin datos no es posible evaluar el comportamiento.',
          recommendation: 'Registrar mediciones para todos los indicadores de salud configurados.',
        });
      } else if (f.id === 'health-indicators-outdated') {
        keyIssues.push({
          id: f.id, title: f.title, priority,
          impact: 'Indicadores de salud sin mediciones recientes. La periodicidad no se está cumpliendo.',
          recommendation: 'Actualizar las mediciones de salud para el período más reciente.',
        });
      } else if (f.id === 'health-indicators-below-target') {
        keyIssues.push({
          id: f.id, title: f.title, priority,
          impact: 'Algunos indicadores de salud no alcanzan la meta. Esto puede indicar problemas en la gestión de salud ocupacional.',
          recommendation: 'Revisar los indicadores fuera de meta y definir acciones correctivas.',
        });
      }
    }

    const summary =
      pct >= 90
        ? `Los indicadores de salud muestran un cumplimiento del ${pct}%. Las mediciones se realizan periódicamente y las metas se alcanzan consistentemente.`
        : pct >= 50
          ? `Los indicadores de salud alcanzan un ${pct}%. Existen brechas en mediciones o metas que requieren atención.`
          : `Los indicadores de salud requieren atención prioritaria (${pct}%). Hay indicadores sin mediciones o metas no alcanzadas.`;

    const quickWins = keyIssues.slice(0, 2).map((i) => i.recommendation);
    const nextSteps = keyIssues.slice(0, 3).map((i) => i.recommendation);

    return { summary, keyIssues, quickWins, nextSteps };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    return { compliancePercentage: ctx.moduleCompliance.compliance };
  }
}
