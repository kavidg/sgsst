import { Injectable } from '@nestjs/common';
import { AIContext } from '../interfaces/ai-context.interface';
import { AIEngine, AIEngineResult } from '../interfaces/ai-engine.interface';

/**
 * Engine inicial de Alertas.
 *
 * Estado actual: placeholder. Aún no consulta datos reales; en fases futuras
 * se conectará al módulo de alertas para resumir notificaciones y emergencias.
 */
@Injectable()
export class AlertsEngine implements AIEngine {
  getName(): string {
    return 'alerts';
  }

  async execute(_question: string, _context: AIContext): Promise<AIEngineResult> {
    return {
      action: 'alerts_summary',
      confidence: 0.4,
      response:
        'El motor de alertas está preparado, pero aún no está conectado al módulo de alertas para resumir notificaciones y emergencias.',
      suggestions: [
        '¿Existen alertas críticas activas?',
        'Resume las alertas recientes',
        '¿Qué emergencias requieren atención?',
      ],
    };
  }
}
