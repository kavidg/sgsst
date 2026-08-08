import { Types } from 'mongoose';
import { ApprovalActor } from '../interfaces/approval-actor.interface';

/**
 * Información mínima del usuario autenticado para construir un ApprovalActor.
 */
export interface ApprovalActorInput {
  /** ObjectId del usuario como string (preferido cuando existe). */
  userId?: string;
  /** UID de Firebase (fallback cuando no existe ObjectId). */
  firebaseUid?: string;
  /** Correo del usuario. */
  email?: string;
  /** Nombre legible del usuario. */
  name?: string;
  /** Rol en el sistema: owner | admin | manager | member. */
  role?: string;
}

/**
 * Construye un ApprovalActor de forma centralizada para todos los módulos
 * integrados al Approval Workflow Core.
 *
 * Reglas:
 * 1. Preferir el ObjectId del usuario cuando exista (userId).
 * 2. Si no existe ObjectId, usar el firebaseUid.
 * 3. Mantener compatibilidad con los registros actuales: los campos opcionales
 *    (email, name, role) se omiten o reciben valores seguros por defecto.
 */
export function buildApprovalActor(input: ApprovalActorInput): ApprovalActor {
  const userId = input.userId ?? input.firebaseUid ?? 'unknown';

  return {
    userId,
    ...(input.firebaseUid ? { firebaseUid: input.firebaseUid } : {}),
    email: input.email ?? '',
    ...(input.name ? { name: input.name } : {}),
    role: input.role ?? 'member',
    timestamp: new Date(),
  };
}

/**
 * Resuelve el ObjectId del aprobador desde un ApprovalActor.
 *
 * Si el actor solo trae un UID de Firebase (userId sin ObjectId), no se puede
 * referenciar User por id; se devuelve undefined (el documento queda sin
 * approvedBy, campo opcional de la DocumentInstance).
 *
 * Se exige el formato estricto de 24 hex chars ademas de isValid para evitar
 * que un Firebase UID hex de 24 caracteres se interprete como ObjectId.
 */
export function resolveApprovedByObjectId(
  actor: ApprovalActor,
): Types.ObjectId | undefined {
  if (
    /^[0-9a-fA-F]{24}$/.test(actor.userId) &&
    Types.ObjectId.isValid(actor.userId)
  ) {
    return new Types.ObjectId(actor.userId);
  }
  return undefined;
}
