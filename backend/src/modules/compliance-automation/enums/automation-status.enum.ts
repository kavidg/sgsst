/**
 * Estado de una automatización preparada por el Compliance Automation Engine.
 *
 * READY: la automatización fue preparada y está lista para ejecutarse en la
 *        siguiente fase (aún no se crean actividades, objetivos ni indicadores).
 */
export enum AutomationStatus {
  /** Preparada y lista para ejecutarse en la siguiente fase. */
  READY = 'READY',
  /** En espera de preparación. */
  PENDING = 'PENDING',
  /** Ya ejecutada (futuro). */
  EXECUTED = 'EXECUTED',
  /** Falló la ejecución (futuro). */
  FAILED = 'FAILED',
}
