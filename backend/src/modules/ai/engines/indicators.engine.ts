import { Injectable } from '@nestjs/common';
import { AIContext } from '../interfaces/ai-context.interface';
import { AIEngine, AIEngineResult } from '../interfaces/ai-engine.interface';

/**
 * Engine inicial de Indicadores.
 *
 * Estado actual: placeholder. Aún no consulta datos reales; en fases futuras
 * se conectará al Compliance Engine para responder sobre cumplimiento y avance.
 */
@Injectable()
export class IndicatorsEngine implements AIEngine {
  getName(): string {
    return 'indicators';
  }

  async execute(_question: string, _context: AIContext): Promise<AIEngineResult> {
    return {
      action: 'indicators_analysis',
      confidence: 0.4,
      response:
        'El motor de indicadores está preparado, pero aún no está conectado al Compliance Engine para responder sobre cumplimiento y avance.',
      suggestions: [
        '¿Cuál es el cumplimiento general del SG-SST?',
        'Muéstrame el avance por fase PHVA',
        '¿Cómo se comportan los indicadores este mes?',
      ],
    };
  }
}
