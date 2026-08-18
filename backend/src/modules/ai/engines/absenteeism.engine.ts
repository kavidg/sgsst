import { Injectable } from '@nestjs/common';
import { AbsenteeismService } from '../../absenteeism/absenteeism.service';
import { AIContext } from '../interfaces/ai-context.interface';
import { AIEngine, AIEngineResult } from '../interfaces/ai-engine.interface';

/**
 * Engine de Ausentismo (AUDIT-5).
 *
 * Capa delgada de composición: reutiliza AbsenteeismService (stats + registros
 * reales, scoped por companyId). Nunca expone userId, descripción ni soporte
 * (PII): solo agregados (días perdidos, casos, promedio, causas por tipo).
 */
@Injectable()
export class AbsenteeismEngine implements AIEngine {
  constructor(private readonly absenteeismService: AbsenteeismService) {}

  getName(): string {
    return 'absenteeism';
  }

  async execute(_question: string, context: AIContext): Promise<AIEngineResult> {
    if (!context.companyId) {
      return this.buildInsufficientResult();
    }

    try {
      const [stats, records] = await Promise.all([
        this.absenteeismService.getCompanyStats(context.companyId),
        this.absenteeismService.findAllByCompany(context.companyId),
      ]);

      if (stats.totalCasos === 0 && records.length === 0) {
        return {
          action: 'absenteeism_summary',
          confidence: 0.5,
          response: 'No hay registros de ausentismo para tu empresa.',
          suggestions: [
            '¿Cómo va el cumplimiento del SG-SST?',
            '¿Qué indicadores tenemos?',
            '¿Qué problemas de accidentalidad tenemos?',
          ],
        };
      }

      const causeCounts = new Map<string, number>();
      for (const record of records) {
        causeCounts.set(record.tipo, (causeCounts.get(record.tipo) ?? 0) + 1);
      }
      const causes = Array.from(causeCounts.entries())
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ');

      return {
        action: 'absenteeism_summary',
        confidence: 0.7,
        response: `Tu empresa registra ${stats.totalCasos} casos de ausentismo, ${stats.totalDiasPerdidos} días perdidos (promedio ${stats.promedioDias} días por caso). Causas: ${causes}.`,
        suggestions: [
          '¿Cómo está el cumplimiento del SG-SST?',
          '¿Qué indicadores tenemos?',
          '¿Qué debería priorizar el responsable SST?',
        ],
      };
    } catch {
      return this.buildInsufficientResult();
    }
  }

  private buildInsufficientResult(): AIEngineResult {
    return {
      action: 'absenteeism_summary',
      confidence: 0.2,
      response: 'Información insuficiente para analizar el ausentismo.',
      suggestions: ['¿Cómo va el cumplimiento del SG-SST?', '¿Qué indicadores tenemos?'],
    };
  }
}
