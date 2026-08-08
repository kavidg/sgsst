import { Injectable } from '@nestjs/common';
import { AIContext } from '../interfaces/ai-context.interface';
import { AIEngine, AIEngineResult } from '../interfaces/ai-engine.interface';

/**
 * Engine inicial de Documentos y Evidencias.
 *
 * Estado actual: placeholder. Aún no consulta datos reales; en fases futuras
 * se conectará al Document Management para detectar vencimientos y evidencias.
 */
@Injectable()
export class DocumentsEngine implements AIEngine {
  getName(): string {
    return 'documents';
  }

  async execute(_question: string, _context: AIContext): Promise<AIEngineResult> {
    return {
      action: 'documents_review',
      confidence: 0.4,
      response:
        'El motor de documentos está preparado, pero aún no está conectado al gestor documental para revisar evidencias y vencimientos.',
      suggestions: [
        '¿Qué documentos están por vencer?',
        '¿Cuáles evidencias faltan en la matriz documental?',
        'Muéstrame el estado de la documentación del SG-SST',
      ],
    };
  }
}
