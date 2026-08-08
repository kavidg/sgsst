import { Inject, Injectable } from '@nestjs/common';
import { AiResponseDto } from './dto/ai-response.dto';
import { AIEngine, AI_ENGINES } from './interfaces/ai-engine.interface';
import { AIContext } from './interfaces/ai-context.interface';
import { routeToEngine } from './utils/intent-router';

/**
 * Coordinador central del AI Orchestrator.
 *
 * Recibe una pregunta, la enruta al engine correspondiente mediante el
 * intent-router y retorna una respuesta estructurada. Si ningún engine
 * coincide, responde con un fallback de baja confianza.
 */
@Injectable()
export class OrchestratorService {
  constructor(
    @Inject(AI_ENGINES)
    private readonly engines: readonly AIEngine[],
  ) {}

  /**
   * Procesa la consulta del usuario: routing → ejecución → respuesta tipada.
   */
  async query(question: string, context: AIContext): Promise<AiResponseDto> {
    const engine = routeToEngine(question, this.engines);

    if (!engine) {
      return this.buildFallback();
    }

    const result = await engine.execute(question, context);

    return {
      module: engine.getName(),
      action: result.action,
      confidence: result.confidence,
      response: result.response,
      suggestions: result.suggestions,
    };
  }

  private buildFallback(): AiResponseDto {
    return {
      module: 'general',
      action: 'clarify',
      confidence: 0.2,
      response: `No pude identificar el módulo de tu consulta. Prueba preguntando por cumplimiento, indicadores, documentos, plan anual o alertas.`,
      suggestions: [
        '¿Cómo va el cumplimiento del SG-SST?',
        '¿Qué documentos están por vencer?',
        '¿Qué actividades del plan anual están pendientes?',
        '¿Existen alertas críticas?',
      ],
    };
  }
}
