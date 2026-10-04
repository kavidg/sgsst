import {
  MAINTENANCE_STATUS_TRANSITIONS,
  MaintenanceStatus,
} from '../schemas/maintenance.schema';

/**
 * NORMALIZACIÓN de status de mantenimiento (patrón inspection-status.util).
 *
 * Convención del repositorio: lectura tolerante de variantes históricas,
 * escritura SIEMPRE canónica. Para la colección nueva la variante relevante
 * es el legacy que el antiguo MaintenanceProvider leía de InspectionActivity
 * ('pendiente', 'completada', 'ejecutada', etc.) y variantes en español.
 */
export const MAINTENANCE_STATUS = {
  PROGRAMMED: MaintenanceStatus.PROGRAMMED,
  IN_PROGRESS: MaintenanceStatus.IN_PROGRESS,
  COMPLETED: MaintenanceStatus.COMPLETED,
  CANCELLED: MaintenanceStatus.CANCELLED,
} as const;

/** Mapa de variantes históricas/español → estado canónico. */
const STATUS_ALIASES: Record<string, MaintenanceStatus> = {
  programmed: MaintenanceStatus.PROGRAMMED,
  programado: MaintenanceStatus.PROGRAMMED,
  programada: MaintenanceStatus.PROGRAMMED,
  scheduled: MaintenanceStatus.PROGRAMMED,
  in_progress: MaintenanceStatus.IN_PROGRESS,
  inprogress: MaintenanceStatus.IN_PROGRESS,
  'en proceso': MaintenanceStatus.IN_PROGRESS,
  'en_proceso': MaintenanceStatus.IN_PROGRESS,
  'en proceso de ejecución': MaintenanceStatus.IN_PROGRESS,
  completed: MaintenanceStatus.COMPLETED,
  completado: MaintenanceStatus.COMPLETED,
  completada: MaintenanceStatus.COMPLETED,
  ejecutado: MaintenanceStatus.COMPLETED,
  ejecutada: MaintenanceStatus.COMPLETED,
  finalizado: MaintenanceStatus.COMPLETED,
  finalizada: MaintenanceStatus.COMPLETED,
  cancelled: MaintenanceStatus.CANCELLED,
  canceled: MaintenanceStatus.CANCELLED,
  cancelado: MaintenanceStatus.CANCELLED,
  cancelada: MaintenanceStatus.CANCELLED,
};

/** ¿El valor recibido es una variante de COMPLETED? (lectura tolerante). */
export function isMaintenanceCompleted(status: string): boolean {
  return normalizeMaintenanceStatus(status) === MaintenanceStatus.COMPLETED;
}

/** ¿El valor recibido es una variante de CANCELLED? (lectura tolerante). */
export function isMaintenanceCancelled(status: string): boolean {
  return normalizeMaintenanceStatus(status) === MaintenanceStatus.CANCELLED;
}

/**
 * ¿Está vencido? Regla de negocio V1: PROGRAMADO (o variante no terminada)
 * cuya fecha programada ya pasó. Se calcula DINÁMICAMENTE — OVERDUE nunca
 * se persiste (sin cron en esta etapa).
 */
export function isMaintenanceOverdue(
  status: string,
  plannedDate: Date | string,
  now: Date = new Date(),
): boolean {
  if (isMaintenanceCompleted(status) || isMaintenanceCancelled(status)) {
    return false;
  }
  return new Date(plannedDate).getTime() < now.getTime();
}

/**
 * Normaliza cualquier variante conocida al estado canónico.
 * Devuelve undefined si el valor es desconocido (el service decide si
 * rechaza o aplica default).
 */
export function normalizeMaintenanceStatus(status: string): MaintenanceStatus | undefined {
  if (!status) return undefined;
  const key = String(status).trim().toLowerCase();
  return STATUS_ALIASES[key];
}

/**
 * ¿La transición from → to está permitida según las reglas V1?
 * Devuelve true si from y to ya son iguales (idempotencia).
 */
export function isMaintenanceTransitionAllowed(from: MaintenanceStatus, to: MaintenanceStatus): boolean {
  if (from === to) return true;
  return MAINTENANCE_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
