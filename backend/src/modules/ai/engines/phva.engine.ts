import { Injectable } from '@nestjs/common';
import { AIContext } from '../interfaces/ai-context.interface';
import { AIEngine, AIEngineResult } from '../interfaces/ai-engine.interface';
import { PhvaAnalysisService } from '../../phva/phva-analysis.service';
import { PhvaAnalysisResult } from '../../phva/interfaces/phva-analysis.interface';

/**
 * Engine del módulo PHVA (Planear-Hacer-Verificar-Actuar).
 *
 * Analiza información REAL del sistema a través de PhvaAnalysisService:
 * - Porcentajes por fase provienen del Compliance Engine.
 * - Elementos pendientes provienen del Plan Anual y del Gestor Documental.
 *
 * Si no existe información suficiente, responde "Información insuficiente
 * para análisis" sin inventar datos.
 */
@Injectable()
export class PhvaEngine implements AIEngine {
  constructor(private readonly phvaAnalysisService: PhvaAnalysisService) {}

  getName(): string {
    return 'phva';
  }

  async execute(_question: string, context: AIContext): Promise<AIEngineResult> {
    if (!context.companyId) {
      return this.buildInsufficientResult();
    }

    let analysis: PhvaAnalysisResult;
    try {
      analysis = await this.phvaAnalysisService.analyzeCompanyPHVA(context.companyId);
    } catch {
      return this.buildInsufficientResult();
    }

    if (!this.hasEnoughData(analysis)) {
      return this.buildInsufficientResult();
    }

    // Reutiliza overallCompliance del Compliance Engine; solo si llega en 0
    // (overview no disponible) usa el promedio simple de fases como respaldo.
    const overall = analysis.overall > 0 ? analysis.overall : this.computeOverallCompliance(analysis);
    const opportunities = this.buildOpportunitiesText(analysis);

    return {
      action: 'phva_analysis',
      confidence: this.computeConfidence(analysis),
      response: `El cumplimiento actual del ciclo PHVA es ${overall}%. Las principales oportunidades de mejora son ${opportunities}.`,
      suggestions: this.buildSuggestions(analysis),
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private hasEnoughData(analysis: PhvaAnalysisResult): boolean {
    const phases = [analysis.planear, analysis.hacer, analysis.verificar, analysis.actuar];
    const hasPercentage = phases.some((phase) => phase.percentage > 0);
    const hasPending = phases.some((phase) => phase.pending.length > 0);
    return hasPercentage || hasPending;
  }

  private computeOverallCompliance(analysis: PhvaAnalysisResult): number {
    const phases = [analysis.planear, analysis.hacer, analysis.verificar, analysis.actuar];
    const total = phases.reduce((sum, phase) => sum + phase.percentage, 0);
    return Math.round(total / phases.length);
  }

  private buildOpportunitiesText(analysis: PhvaAnalysisResult): string {
    const phaseNames: Array<[string, number]> = [
      ['Planear', analysis.planear.percentage],
      ['Hacer', analysis.hacer.percentage],
      ['Verificar', analysis.verificar.percentage],
      ['Actuar', analysis.actuar.percentage],
    ];

    const sorted = [...phaseNames].sort((a, b) => a[1] - b[1]);
    const weakest = sorted.slice(0, 2);

    return weakest
      .filter(([, percentage]) => percentage < 100)
      .map(([name, percentage]) => `${name} (${percentage}%)`)
      .join(' y ') || 'ninguna en particular';
  }

  private buildSuggestions(analysis: PhvaAnalysisResult): string[] {
    const specific: string[] = [];
    if (analysis.planear.pending.length > 0) {
      specific.push(`Hay ${analysis.planear.pending.length} elemento(s) pendiente(s) de planear por atender`);
    }
    if (analysis.hacer.pending.length > 0) {
      specific.push(`Hay ${analysis.hacer.pending.length} actividad(es) en ejecución o retrasada(s) por revisar`);
    }
    if (analysis.verificar.pending.length > 0) {
      specific.push(`Hay ${analysis.verificar.pending.length} verificación(es) documental pendiente(s)`);
    }
    if (analysis.actuar.pending.length > 0) {
      specific.push(`Hay ${analysis.actuar.pending.length} hallazgo(s) de alta prioridad para actuar`);
    }
    // Máximo 4 sugerencias: la genérica siempre se conserva y las específicas se truncan.
    return ['¿Cómo va el cumplimiento por fase PHVA?', ...specific].slice(0, 4);
  }

  private computeConfidence(analysis: PhvaAnalysisResult): number {
    const phases = [analysis.planear, analysis.hacer, analysis.verificar, analysis.actuar];
    const populated = phases.filter((phase) => phase.percentage > 0 || phase.pending.length > 0).length;
    // Base 0.5 + 0.1 por fase con información real (máx 0.9).
    return Math.min(0.9, 0.5 + populated * 0.1);
  }

  private buildInsufficientResult(): AIEngineResult {
    return {
      action: 'phva_analysis',
      confidence: 0.2,
      response: 'Información insuficiente para análisis',
      suggestions: [
        '¿Cómo va el cumplimiento por fase PHVA?',
        '¿Qué actividades del plan anual están pendientes?',
        '¿Cuál es el avance del plan de trabajo?',
      ],
    };
  }
}
