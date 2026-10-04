import { EppDeliveryStatus } from '../schemas/epp-delivery.schema';

/**
 * Utilidades de estado de EppDelivery (4.2.6 — Alternativa B).
 *
 * Patrón maintenance-status.util.ts (4.2.5): lectura tolerante de variantes,
 * escritura canónica y estados derivados calculados DINÁMICAMENTE.
 */

const CANONICAL_STATUSES: string[] = Object.values(EppDeliveryStatus);

/**
 * Estados terminales/resueltos: una entrega reemplazada, devuelta o dada de
 * baja por daño ya no puede "vencer".
 */
const RESOLVED_STATUSES: string[] = [
  EppDeliveryStatus.REPLACED,
  EppDeliveryStatus.RETURNED,
  EppDeliveryStatus.DAMAGED,
];

/** Normaliza un valor arbitrario al estado canónico (null si es desconocido). */
export function normalizeEppDeliveryStatus(value: unknown): EppDeliveryStatus | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return (CANONICAL_STATUSES as string[]).includes(upper) ? (upper as EppDeliveryStatus) : null;
}

/** true si la transición de estado está permitida por las reglas del dominio. */
export function isEppDeliveryTransitionAllowed(
  from: EppDeliveryStatus,
  to: EppDeliveryStatus,
): boolean {
  if (from === to) return false;
  // Solo una entrega ACTIVE puede resolverse (reemplazarse/devolverse/dañarse).
  return from === EppDeliveryStatus.ACTIVE && RESOLVED_STATUSES.includes(to);
}

export interface EppDeliveryOverdueCandidate {
  status: string;
  expectedReplacementDate?: Date | null;
  actualReplacementDate?: Date | null;
}

/**
 * Vencimiento DINÁMICO de reposición (nunca persistido como estado EXPIRED).
 *
 * Una entrega está vencida cuando:
 *  - tiene `expectedReplacementDate`,
 *  - aún no fue reemplazada (`actualReplacementDate` vacía),
 *  - sigue ACTIVE (no devuelta ni dada de baja),
 *  - y la fecha esperada ya pasó respecto de `now`.
 *
 * No requiere cron ni scheduler (misma decisión de V1 que 4.2.5).
 */
export function isEppDeliveryOverdue(delivery: EppDeliveryOverdueCandidate, now = new Date()): boolean {
  if (!delivery.expectedReplacementDate) return false;
  if (delivery.actualReplacementDate) return false;
  if (RESOLVED_STATUSES.includes(delivery.status)) return false;
  return delivery.expectedReplacementDate.getTime() < now.getTime();
}
