import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
} from '../../dto/standard-analysis.dto';

/**
 * Analizador determinista para el estándar 3.3.6 — Ausentismo por causa médica.
 *
 * Interpreta los datos reales del ComplianceEngine (MedicalAbsenteeismProvider)
 * y genera un análisis textual accionable.
 *
 * NO consulta MongoDB.
 * NO recalcula el compliancePercentage (viene del ComplianceEngine).
 * NO duplica la lógica del provider.
 * NO manipula PHVA weights.
 * NO convierte texto en evidencia.
 * NO usa información clínica: el cálculo es metadata-only.
 */
export class MedicalAbsenteeismStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '3.3.6';
  private static readonly MODULE = 'medical-absenteeism';

  supports(standardCode: string): boolean {
    return standardCode === MedicalAbsenteeismStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return MedicalAbsenteeismStandardAnalyzer.MODULE;
  }

  analyze(context: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = context;
    const percentage = moduleCompliance.compliance;

    // ── NO_DATA: sin denominador del período o companyId inválido ──
    const noDataFinding = findings.find(
      (f) =>
        f.id === 'medical-absenteeism-no-denominator' ||
        f.id === 'medical-absenteeism-invalid-company',
    );
    if (noDataFinding) {
      return {
        summary:
          'No existe un registro válido de días de trabajo programados para el período evaluado, por lo que ' +
          'no es posible calcular el ausentismo por causa médica (3.3.6). El denominador normativo ' +
          '("días de trabajo programados en el mes") no se inventa ni se sustituye por headcount u horas trabajadas.',
        keyIssues: [
          {
            id: noDataFinding.id,
            title: noDataFinding.title,
            priority: 'HIGH',
            impact:
              'Sin denominador programado del período no puede calcularse el indicador ni demostrarse su medición real.',
            recommendation:
              'Cargar mensualmente los días de trabajo programados de la empresa en el módulo de datos periódicos.',
          },
        ],
        quickWins: [
          'Registrar los días de trabajo programados del mes actual para habilitar la medición.',
        ],
        nextSteps: [
          'Establecer una rutina mensual de carga del denominador y revisar el indicador resultante.',
        ],
      };
    }

    // ── Construir keyIssues desde findings reales ──
    const keyIssues: StandardAnalysisKeyIssue[] = [];

    for (const finding of findings) {
      const priority = this.mapPriority(finding.priority);

      if (finding.id === 'medical-absenteeism-zero-absences') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Un ausentismo de 0% es un resultado válido, pero puede reflejar subregistro si las ausencias ' +
            'reales no se están registrando o clasificando con la señal de incapacidad médica.',
          recommendation:
            'Verificar que las ausencias por incapacidad (laboral o común) se registren con la señal ' +
            'estructurada de incapacidad médica.',
        });
      } else if (finding.id === 'medical-absenteeism-unclassified-records') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Registros de ausentismo sin la señal estructurada de incapacidad médica: su aporte real al ' +
            'indicador no queda reflejado y la trazabilidad del numerador se degrada.',
          recommendation:
            'Clasificar los registros de ausentismo indicando si corresponden a incapacidad médica.',
        });
      } else if (finding.id === 'medical-absenteeism-cross-period') {
        keyIssues.push({
          id: finding.id,
          title: finding.title,
          priority,
          impact:
            'Ausencias que cruzan los límites del mes: se atribuyó solo la parte del período, evitando ' +
            'doble contabilización entre meses.',
          recommendation:
            'Revisar las ausencias de larga duración y confirmar que las fechas registradas son correctas.',
        });
      }
    }

    const summary = this.buildSummary(percentage, keyIssues);
    const quickWins = this.buildQuickWins(keyIssues);
    const nextSteps = this.buildNextSteps(keyIssues);

    return { summary, keyIssues, quickWins, nextSteps };
  }

  getMetrics(context: StandardAnalysisContext): StandardAnalysisMetrics {
    const { findings, moduleCompliance } = context;

    const metrics: StandardAnalysisMetrics = {
      compliancePercentage: moduleCompliance.compliance,
    };

    const noDataFinding = findings.some(
      (f) =>
        f.id === 'medical-absenteeism-no-denominator' ||
        f.id === 'medical-absenteeism-invalid-company',
    );
    // Métrica de dominio sin PII: 0 cuando no hay medición (sin denominador);
    // 1 cuando existe una medición válida del período.
    metrics.hasValidMeasurement = noDataFinding ? 0 : 1;

    return metrics;
  }

  // ── Helpers privados ──

  private buildSummary(
    percentage: number,
    keyIssues: StandardAnalysisKeyIssue[],
  ): string {
    if (percentage >= 90) {
      return (
        `La medición del ausentismo por causa médica (3.3.6) alcanza un ${percentage}%: existe un denominador ` +
        'programado del período, los registros de ausencia con incapacidad médica quedan atribuidos al mes ' +
        'correcto (sin doble conteo entre meses) y la trazabilidad del numerador es completa. Se recomienda ' +
        'mantener la carga mensual del denominador y la clasificación oportuna de las ausencias.'
      );
    }

    if (percentage >= 50) {
      const issuesText =
        keyIssues.length > 0
          ? ` Las principales oportunidades de mejora son: ${keyIssues
              .slice(0, 2)
              .map((issue) => issue.title.toLowerCase())
              .join(' y ')}.`
          : '';
      return (
        `La medición del ausentismo por causa médica (3.3.6) avanza con un ${percentage}%, aunque presenta ` +
        `brechas de trazabilidad o de clasificación de las ausencias.${issuesText}`
      );
    }

    return (
      `La medición del ausentismo por causa médica (3.3.6) requiere atención (${percentage}%): existen registros ` +
      'sin la señal estructurada de incapacidad médica o sin vínculo de usuario, lo que degrada la calidad de ' +
      'la medición. Clasificar las ausencias y mantener el denominador mensual actualizado.'
    );
  }

  private buildQuickWins(keyIssues: StandardAnalysisKeyIssue[]): string[] {
    const wins: string[] = [];

    const hasZeroAbsences = keyIssues.some((i) => i.id === 'medical-absenteeism-zero-absences');
    const hasUnclassified = keyIssues.some((i) => i.id === 'medical-absenteeism-unclassified-records');
    const hasCrossPeriod = keyIssues.some((i) => i.id === 'medical-absenteeism-cross-period');

    if (hasZeroAbsences) {
      wins.push('Verificar el subregistro: confirmar que las ausencias médicas reales se registran.');
    }
    if (hasUnclassified && wins.length < 3) {
      wins.push('Clasificar los registros de ausentismo con la señal de incapacidad médica.');
    }
    if (hasCrossPeriod && wins.length < 3) {
      wins.push('Revisar las ausencias que cruzan los límites del mes.');
    }
    if (wins.length === 0) {
      wins.push('Mantener la carga mensual de días de trabajo programados y la revisión del indicador.');
    }

    return wins.slice(0, 3);
  }

  private buildNextSteps(keyIssues: StandardAnalysisKeyIssue[]): string[] {
    const steps: string[] = [];

    const highIssues = keyIssues.filter((issue) => issue.priority === 'HIGH');
    const mediumIssues = keyIssues.filter((issue) => issue.priority === 'MEDIUM');

    for (const issue of highIssues.slice(0, 2)) {
      steps.push(issue.recommendation);
    }
    for (const issue of mediumIssues.slice(0, 1)) {
      if (steps.length < 3) {
        steps.push(issue.recommendation);
      }
    }
    if (steps.length === 0) {
      steps.push('Revisar periódicamente el ausentismo por causa médica calculado y sus hallazgos.');
    }

    return steps.slice(0, 3);
  }

  private mapPriority(priority: string): 'HIGH' | 'MEDIUM' | 'LOW' {
    const normalized = priority.toUpperCase();
    if (normalized === 'HIGH' || normalized === 'CRITICAL') return 'HIGH';
    if (normalized === 'MEDIUM') return 'MEDIUM';
    return 'LOW';
  }
}
