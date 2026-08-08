/**
 * Tipos de paso que el Compliance Execution Engine puede ejecutar.
 *
 * Cada tipo tiene un ejecutor independiente (patrón Strategy) dentro del
 * execution-runner. Si el servicio subyacente no está disponible, el paso
 * se registra como SKIPPED con motivo "Servicio no disponible".
 */
export enum ExecutionStep {
  /** Actualización o registro de un documento del SG-SST. */
  DOCUMENT = 'DOCUMENT',
  /** Creación de un objetivo SST. */
  OBJECTIVE = 'OBJECTIVE',
  /** Creación de una actividad del plan anual. */
  ACTIVITY = 'ACTIVITY',
  /** Creación de un indicador de gestión. */
  INDICATOR = 'INDICATOR',
  /** Creación de una tarea vinculada a una actividad. */
  TASK = 'TASK',
  /** Notificación o alerta operativa. */
  ALERT = 'ALERT',
}
