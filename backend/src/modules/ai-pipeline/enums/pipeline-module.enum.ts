/**
 * Módulos del pipeline PHVA → IA → hallazgos → acciones → plan → tareas →
 * evidencias → verificación (AUDIT-3).
 *
 * Se usan como `sourceModule`/`targetModule` de PipelineTrace para evitar
 * strings mágicos y permitir queries deterministas de trazabilidad.
 */
export enum PipelineModule {
  PHVA = 'PHVA',
  AI_ANALYSIS = 'AI_ANALYSIS',
  FINDING = 'FINDING',
  ACTION = 'ACTION',
  ACTIVITY = 'ACTIVITY',
  TASK = 'TASK',
  EVIDENCE = 'EVIDENCE',
  VERIFICATION = 'VERIFICATION',
}

/** Tipos de análisis IA persistidos. */
export enum AiAnalysisType {
  COMPLIANCE = 'COMPLIANCE',
  PHVA = 'PHVA',
}

/**
 * Actor que solicitó/ejecutó un análisis IA (AUDIT-4).
 *
 * - USER: análisis invocado por un usuario autenticado (requestedBy = uid).
 * - SYSTEM: análisis generado automáticamente por un pipeline/proceso.
 */
export enum AiAnalysisActorType {
  USER = 'USER',
  SYSTEM = 'SYSTEM',
}

/**
 * Versión de engine persistida en cada análisis (trazabilidad de motor).
 *
 * AUDIT-4: el fingerprint de idempotencia incluye engineVersion, por lo que
 * un cambio en las reglas del motor genera un análisis nuevo (historial
 * versionado) sin duplicar el anterior.
 */
export const AI_PIPELINE_ENGINE_VERSION = 'deterministic:1';
