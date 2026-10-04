/**
 * Normalización canónica del estado de `InspectionActivity.status`.
 *
 * AUDITORÍA (normalización): históricamente la colección recibió múltiples
 * representaciones del estado (es-ES, en-US, booleanos, mayúsculas) desde
 * integraciones de API directas, y cada consumidor (providers del
 * ComplianceEngine, provider legacy, resolver de indicadores, UI) interpretaba
 * un subconjunto distinto. Este helper es la ÚNICA fuente de verdad para
 * decidir si una inspección está completada o pendiente.
 *
 * Estados canónicos: PENDING | COMPLETED.
 * - CANCELLED: reservado conceptualmente para evolución futura; NO se usa hoy.
 * - OVERDUE no se almacena: es derivado (PENDING + plannedDate < now).
 *
 * Valores desconocidos/ausentes se normalizan a PENDING sin lanzar errores y
 * sin logs ruidosos por registro. La lectura es tolerante con datos históricos
 * (sin migración Mongo) y la escritura debe persistir SOLO el valor canónico
 * (patrón: leer tolerante, escribir canónico).
 */

/** Estados canónicos de una actividad de inspección. */
export type InspectionStatus = 'PENDING' | 'COMPLETED';

export const INSPECTION_STATUS = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
} as const satisfies Record<InspectionStatus, InspectionStatus>;

/** Variantes históricas/operativas que representan "completada". Matching case-insensitive. */
export const COMPLETED_STATUS_VARIANTS: readonly string[] = [
  'completada',
  'completa',
  'complete',
  'completed',
  'ejecutada',
  'finalizada',
  'closed',
  'cerrada',
  'aprobada',
  'approved',
];

/** Variantes históricas/operativas que representan "pendiente". Matching case-insensitive. */
export const PENDING_STATUS_VARIANTS: readonly string[] = [
  'pendiente',
  'pending',
];

/** `status` histórico puede llegar como boolean o incluso números por integraciones antiguas. */
type RawInspectionStatus = string | boolean | number | null | undefined;

/**
 * Normaliza cualquier representación histórica del estado a su valor canónico.
 * - Variantes de completado (es/en, booleans true) → 'COMPLETED'.
 * - Variantes de pendiente / desconocido / ausente → 'PENDING'.
 * - Nunca lanza; nunca loguea por registro.
 */
export function normalizeInspectionStatus(status: RawInspectionStatus): InspectionStatus {
  if (typeof status === 'boolean') {
    return status ? INSPECTION_STATUS.COMPLETED : INSPECTION_STATUS.PENDING;
  }

  if (typeof status !== 'string') {
    return INSPECTION_STATUS.PENDING;
  }

  const normalized = status.trim().toLowerCase();

  if (normalized === 'true') {
    return INSPECTION_STATUS.COMPLETED;
  }
  if (normalized === 'false') {
    return INSPECTION_STATUS.PENDING;
  }

  if (COMPLETED_STATUS_VARIANTS.includes(normalized)) {
    return INSPECTION_STATUS.COMPLETED;
  }

  // Desconocido, vacío o cualquier otro valor → PENDING (comportamiento
  // conservador: solo se acredita lo que se reconoce como ejecutado).
  return INSPECTION_STATUS.PENDING;
}

/**
 * Indica si el valor RAW corresponde a "completada" (sin normalizar el dato).
 * Azúcar de lectura para consumers: `isInspectionCompleted(a.status)`.
 */
export function isInspectionCompleted(status: RawInspectionStatus): boolean {
  return normalizeInspectionStatus(status) === INSPECTION_STATUS.COMPLETED;
}

/**
 * Normaliza el campo `status` de documentos/DTOs para PERSISTIR el valor
 * canónico. Reemplaza `status` siempre (si viene undefined aplica PENDING,
 * igual que el default del schema) y preserva el resto de propiedades.
 */
export function withCanonicalInspectionStatus<T extends object>(
  source: T & { status?: unknown },
): Omit<T, 'status'> & { status: InspectionStatus } {
  const { status, ...rest } = source as Record<string, unknown>;
  return {
    ...(rest as Omit<T, 'status'>),
    status: normalizeInspectionStatus(status as RawInspectionStatus),
  };
}
