/**
 * Estados de un período de medición.
 *
 * OPEN: período abierto, permite crear/editar mediciones
 * CLOSED: período cerrado, no permite modificaciones
 */
export enum IndicatorPeriodStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}
