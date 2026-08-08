import { ApprovalStatus } from '../enums/approval-status.enum';
import { ApprovalActor } from './approval-actor.interface';

/**
 * Acciones registradas en el historial del Approval Workflow Core.
 */
export type ApprovalEventAction =
  | 'CREATED'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'ADJUSTMENTS_REQUESTED'
  | 'ARCHIVED'
  | 'SIGNED';

/**
 * Evento de historial append-only del Approval Workflow Core.
 *
 * Cada transición de estado genera un evento inmutable con el actor y el
 * motivo; es la única fuente de auditoría del motor de aprobaciones.
 */
export interface ApprovalEvent {
  /** Solicitud a la que pertenece el evento. */
  requestId: string;
  /** Empresa propietaria de la solicitud. */
  companyId: string;
  /** Acción registrada. */
  action: ApprovalEventAction;
  /** Actor que realizó la acción. */
  actor: ApprovalActor;
  /** Estado previo de la solicitud. */
  previousStatus: ApprovalStatus;
  /** Nuevo estado de la solicitud. */
  newStatus: ApprovalStatus;
  /** Motivo o comentario de la transición. */
  reason?: string;
  /** Metadatos adicionales (diff de campos, versión, etc.). */
  metadata?: Record<string, unknown>;
}
