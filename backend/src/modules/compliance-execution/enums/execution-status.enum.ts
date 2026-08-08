/**
 * Estados de una ejecución del Compliance Execution Engine.
 *
 * Se usan tanto para los pasos individuales del ExecutionPlan como para el
 * estado general del ExecutionResult y del historial.
 */
export enum ExecutionStatus {
  /** Paso pendiente de ejecutar. */
  PENDING = 'PENDING',
  /** Paso en ejecución. */
  RUNNING = 'RUNNING',
  /** Paso ejecutado correctamente. */
  COMPLETED = 'COMPLETED',
  /** Paso omitido (por ejemplo, servicio no disponible). */
  SKIPPED = 'SKIPPED',
  /** Paso que falló durante la ejecución. */
  FAILED = 'FAILED',
  /** Ejecución general completada parcialmente (hubo pasos omitidos o fallos). */
  PARTIAL = 'PARTIAL',
}
