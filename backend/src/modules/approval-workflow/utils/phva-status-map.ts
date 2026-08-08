import { ApprovalStatus } from '../enums/approval-status.enum';

/**
 * Fuente ÚNICA de conversión de estados locales de las sub-entidades de PHVA
 * Advanced hacia el ApprovalStatus canónico del motor (Fase 6.7).
 *
 * Centraliza TODOS los mapeos que antes vivían duplicados en el dispatcher
 * (PhvaAdvancedAdapter) y en cada handler (Resource Assignment, Training
 * Management, SST Policy, Responsibilities). Los handlers y el adapter solo
 * delegan aquí: toda la lógica de conversión vive en este archivo.
 *
 * Estados soportados (por sub-entidad):
 * - Resource Assignment:    DRAFT, PENDING_APPROVAL, APPROVED,
 *                           APPROVED_AND_SIGNED, REJECTED, ARCHIVED.
 * - Training Management:    PENDING, APPROVED, REJECTED,
 *                           ADJUSTMENTS_REQUESTED, DRAFT.
 * - SST Policy (español):   'Borrador', 'Pendiente aprobación', 'Aprobado',
 *                           'Vencido', 'Archivado' (+ equivalencias en inglés).
 * - Responsibilities:       DRAFT, PENDING_APPROVAL, APPROVED,
 *                           APPROVED_AND_SIGNED, REJECTED.
 *
 * Equivalencias canónicas documentadas:
 * - APPROVED_AND_SIGNED (estado compuesto de negocio: aprobado y firmado) se
 *   mapea al APPROVED canónico del motor.
 * - PENDING (estado inicial de capacitaciones) al PENDING_APPROVAL canónico.
 * - 'Vencido' (EXPIRED) es un ciclo cerrado: misma equivalencia de negocio que
 *   'Archivado' → ARCHIVED canónico.
 * - Cualquier estado desconocido se mapea a DRAFT (equivalencia explícita:
 *   un valor inesperado no puede considerarse aprobado ni pendiente).
 */
export function mapPhvaAdvancedStatus(localStatus: string): ApprovalStatus {
  switch (localStatus) {
    case 'PENDING':
    case 'PENDING_APPROVAL':
    case 'Pendiente aprobación':
      return ApprovalStatus.PENDING_APPROVAL;
    case 'APPROVED':
    case 'APPROVED_AND_SIGNED':
    case 'Aprobado':
      return ApprovalStatus.APPROVED;
    case 'REJECTED':
      return ApprovalStatus.REJECTED;
    case 'ADJUSTMENTS_REQUESTED':
      return ApprovalStatus.ADJUSTMENTS_REQUESTED;
    case 'ARCHIVED':
    case 'Archivado':
    case 'Vencido':
      // 'Vencido' es un ciclo cerrado (misma equivalencia que el archivo).
      return ApprovalStatus.ARCHIVED;
    case 'DRAFT':
    case 'Borrador':
    default:
      return ApprovalStatus.DRAFT;
  }
}
