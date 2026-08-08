/**
 * Contexto enriquecido que el Orchestrator entrega a cada engine.
 * Prepara la información base (usuario, empresa, timestamp) para que los
 * engines futuros puedan consultar datos reales sin duplicar lógica.
 */
export interface AIContext {
  /** UID de Firebase del usuario autenticado (null si no está disponible). */
  userId: string | null;
  /** Identificador de la empresa seleccionada (null si no está disponible). */
  companyId: string | null;
  /** Momento en que se procesó la consulta. */
  timestamp: Date;
  /** Pregunta original del usuario. */
  question: string;
}
