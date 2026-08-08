/**
 * Respuesta estructurada del AI Orchestrator.
 */
export class AiResponseDto {
  /** Módulo que respondió (ej: 'phva', 'documents', 'indicators', 'alerts'). */
  module!: string;
  /** Acción concreta detectada dentro del módulo. */
  action!: string;
  /** Nivel de confianza del motor (0-1). */
  confidence!: number;
  /** Respuesta legible para el usuario. */
  response!: string;
  /** Sugerencias de seguimiento. */
  suggestions!: string[];
}
