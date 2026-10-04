/**
 * Estado administrativo del seguimiento derivado de una verificación — PHVA 4.2.2.
 *
 * OPEN   — Seguimiento pendiente de cierre.
 * CLOSED — Seguimiento cerrado.
 *
 * Separación deliberada entre el RESULTADO de campo (ControlVerificationResult)
 * y este estado administrativo: no deben mezclarse en un único estado
 * (lección del caos de estados de InspectionActivity.status).
 */
export enum FollowUpStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}
