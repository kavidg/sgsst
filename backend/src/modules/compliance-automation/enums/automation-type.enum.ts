/**
 * Tipos de registros que una automatización podrá generar en el futuro.
 *
 * La FASE actual solo los describe y cuenta dentro del AutomationResult;
 * no crea registros reales en MongoDB.
 */
export enum AutomationType {
  /** Actividad del Plan Anual de Trabajo. */
  ANNUAL_PLAN_ACTIVITY = 'ANNUAL_PLAN_ACTIVITY',
  /** Objetivo del SG-SST. */
  OBJECTIVE = 'OBJECTIVE',
  /** Indicador de gestión. */
  INDICATOR = 'INDICATOR',
  /** Tarea vinculada a una actividad. */
  TASK = 'TASK',
  /** Alerta operativa. */
  ALERT = 'ALERT',
}
