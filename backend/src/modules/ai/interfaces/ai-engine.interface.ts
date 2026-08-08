import { AIContext } from './ai-context.interface';

/**
 * Token de inyección de NestJS para el registro de engines disponibles.
 * Permite escalar agregando nuevos engines sin modificar el orchestrator.
 */
export const AI_ENGINES = 'AI_ENGINES';

/**
 * Resultado estructurado que produce un engine del AI Orchestrator.
 */
export interface AIEngineResult {
  action: string;
  confidence: number;
  response: string;
  suggestions: string[];
}

/**
 * Contrato base de un engine del AI Orchestrator.
 *
 * Todo engine futuro (PHVA, documentos, indicadores, alertas, etc.) debe
 * implementar esta interfaz para ser registrado y enrutado por el orchestrator.
 */
export interface AIEngine {
  /** Nombre único del engine, usado como identificador de módulo en la respuesta. */
  getName(): string;
  /**
   * Ejecuta el engine para responder la consulta del usuario.
   * @param question - Pregunta normalizada del usuario.
   * @param context - Contexto enriquecido (usuario, empresa, timestamp).
   */
  execute(question: string, context: AIContext): Promise<AIEngineResult> | AIEngineResult;
}
