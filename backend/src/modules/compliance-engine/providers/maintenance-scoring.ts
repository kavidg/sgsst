import {
  Maintenance,
  MaintenanceStatus,
  MaintenanceType,
} from '../../maintenance/schemas/maintenance.schema';
import {
  isMaintenanceCancelled,
  isMaintenanceCompleted,
  isMaintenanceOverdue,
} from '../../maintenance/utils/maintenance-status.util';

/**
 * ETAPA 6C — Scoring específico de 4.2.5 Mantenimiento.
 *
 * Reemplaza la fórmula heredada (25 + 30×completados + 25×oportunidad + 20×responsable),
 * auditada en la Etapa 6B con los siguientes defectos: base 25 por mera existencia,
 * 20 puntos por `responsible` (obligatorio por DTO → no discrimina), indistinción
 * preventivo/correctivo, oportunidad medida como `plannedDate >= now` (trataba
 * COMPLETED como siempre oportuno) e invariancia al volumen.
 *
 * Fórmula por dimensiones normativas (criterio 4.2.5: "realiza mantenimiento con
 * trazabilidad documental para prevenir fallas que generen riesgos laborales"):
 *
 *   PROGRAMA      25  — existencia de planificación preventiva (solo PREVENTIVE)
 *   EJECUCIÓN     35  — completados válidos / evaluables (no cancelados)
 *   OPORTUNIDAD   25  — completados a tiempo (completedDate <= plannedDate) / completados
 *   TRAZABILIDAD  15  — completados con evidencia de ejecución + cierre (observations)
 *
 * Reglas transversales:
 * - CANCELLED queda FUERA de todos los denominadores (no premia, no castiga, no overdue).
 * - OVERDUE es dinámico y NO recibe penalización adicional: un vencido sin completar
 *   ya resta por EJECUCIÓN (sin doble castigo).
 * - Sin denominador válido en una dimensión → su peso se REDISTRIBUYE
 *   proporcionalmente entre las dimensiones activas (función única y determinista;
 *   nunca NaN/Infinity).
 * - Gestión puramente correctiva (sin ningún PREVENTIVE) queda limitada a 60
 *   (tope reactivo): demuestra actividad, no un programa preventivo.
 * - Sin registros evaluables → el provider responde NO_DATA (convención del engine).
 */

/** Pesos nominales de las dimensiones (Paso 9 del diseño aprobado). */
export const MAINTENANCE_SCORE_WEIGHTS = {
  program: 25,
  execution: 35,
  opportunity: 25,
  traceability: 15,
} as const;

/** Tope para gestión puramente correctiva (Paso 10): sin programa preventivo. */
export const MAINTENANCE_REACTIVE_CAP = 60;

export type MaintenanceScoreDimensionKey = 'program' | 'execution' | 'opportunity' | 'traceability';

export interface MaintenanceScoreDimension {
  key: MaintenanceScoreDimensionKey;
  weight: number;
  /** Ratio 0..1 de la dimensión; null = NO evaluable (sin denominador válido). */
  ratio: number | null;
}

export interface MaintenanceScoreCounters {
  /** Registros totales de la empresa (incluye cancelados). */
  total: number;
  /** Registros evaluables: no CANCELLED. */
  evaluated: number;
  /** Registros CANCELLED (excluidos de todos los denominadores). */
  cancelled: number;
  /** Preventivos evaluables con planificación válida (plannedDate). */
  preventiveEvaluable: number;
  /** COMPLETED válidos: completedDate real + evidencia de ejecución. */
  completedValid: number;
  /** Completados con completedDate <= plannedDate. */
  completedOnTime: number;
  /** Completados con información de cierre (observations). */
  completedWithClosureNotes: number;
  /** Vencidos dinámicos (no cancelados, no completados, plannedDate pasada). */
  overdue: number;
}

export interface MaintenanceScoreBreakdown {
  /** Score final 0–100 (entero), tras redistribución y tope reactivo. */
  score: number;
  hasPreventiveProgram: boolean;
  cappedAt60: boolean;
  dimensions: Record<MaintenanceScoreDimensionKey, { ratio: number | null; evaluable: boolean }>;
  counters: MaintenanceScoreCounters;
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Evidencia ASOCIADA AL CIERRE (Paso 3, ETAPA 6C): última entrada del
 * statusHistory que registra la transición a COMPLETED con evidenceUrl.
 * Así, la evidencia que puntúa es la que acompaña la operación de completado
 * (quién/cuándo/evidencia), no una URL preexistente en un PROGRAMMED.
 */
export function closureEvidenceOf(record: Maintenance): string | null {
  const history = Array.isArray(record.statusHistory) ? record.statusHistory : [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i] as { to?: unknown; evidenceUrl?: unknown } | undefined;
    if (
      String(entry?.to) === MaintenanceStatus.COMPLETED &&
      entry?.evidenceUrl !== undefined &&
      String(entry.evidenceUrl).trim().length > 0
    ) {
      return String(entry.evidenceUrl).trim();
    }
  }
  return null;
}

/**
 * ¿El registro COMPLETED cuenta como ejecutado con evidencia?
 * - Vía principal: evidencia asociada al cierre (statusHistory).
 * - Tolerancia legacy: registros COMPLETED creados antes de la ETAPA 6C, cuya
 *   evidencia quedó únicamente en el campo plano (la regla V1 la exigía en el
 *   momento del cierre, aunque no la asociara al historial).
 */
function hasExecutionEvidence(record: Maintenance): boolean {
  if (closureEvidenceOf(record) !== null) return true;
  return Boolean(record.evidenceUrl && String(record.evidenceUrl).trim().length > 0);
}

/**
 * REDISTRIBUCIÓN ÚNICA DE PESOS (Paso 9).
 *
 * Cada dimensión con denominador válido aporta `weight × ratio`; el total se
 * normaliza por la suma de pesos activos → el resultado vive en 0–100 aunque
 * falten dimensiones. Determinista, sin NaN/Infinity (clamp defensivo).
 */
export function redistributeWeightedScore(
  dimensions: Array<{ ratio: number | null; weight: number }>,
): number {
  const active = dimensions.filter((d) => d.ratio !== null && Number.isFinite(d.ratio));
  const activeWeight = active.reduce((sum, d) => sum + d.weight, 0);
  if (activeWeight <= 0) return 0;
  const raw = active.reduce((sum, d) => sum + d.weight * (d.ratio as number), 0);
  const score = (raw / activeWeight) * 100;
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, score));
}

/**
 * Calcula el score específico de 4.2.5 sobre los registros de UNA empresa
 * (una consulta tenant-scoped + cálculo en memoria; sin N+1, Paso 20).
 *
 * @param records Mantenimientos de la empresa (colección completa).
 * @param now     Instante de evaluación (overdue dinámico; inyectable en tests).
 */
export function computeMaintenanceScore(
  records: Maintenance[],
  now: Date = new Date(),
): MaintenanceScoreBreakdown {
  const cancelled = records.filter((r) => isMaintenanceCancelled(String(r.status)));
  const evaluated = records.filter((r) => !isMaintenanceCancelled(String(r.status)));

  // COMPLETED válidos: fecha real + evidencia de ejecución (Paso 6).
  const completedValid = evaluated.filter((r) =>
    isMaintenanceCompleted(String(r.status)) &&
    isValidDate(r.completedDate) &&
    isValidDate(r.plannedDate) &&
    hasExecutionEvidence(r),
  );

  // OPORTUNIDAD real (Paso 7): completedDate <= plannedDate. Un completado
  // tardío cuenta como ejecutado pero no como oportuno (sin doble castigo).
  const completedOnTime = completedValid.filter(
    (r) => (r.completedDate as Date).getTime() <= (r.plannedDate as Date).getTime(),
  );

  // TRAZABILIDAD (Paso 8): la evidencia de ejecución ya es condición de
  // elegibilidad (garantizada por el service al completar); la señal
  // incremental que se evalúa aquí es la información de cierre (observations).
  // Su ausencia NO invalida la ejecución: solo reduce la dimensión (15 pts).
  const completedWithClosureNotes = completedValid.filter(
    (r) => Boolean(r.observations && String(r.observations).trim().length > 0),
  );

  // PROGRAMA (Pasos 5 y 14): preventivos evaluables con planificación válida.
  // Los correctivos NO satisfacen esta dimensión. Sin preventivos, la dimensión
  // queda ACTIVA con ratio 0 (Paso 5: programScore = 0 — no se redistribuye):
  // la gestión puramente correctiva no demuestra programa preventivo.
  const preventives = evaluated.filter((r) => r.maintenanceType === MaintenanceType.PREVENTIVE);
  const preventiveEvaluable = preventives.filter((r) => isValidDate(r.plannedDate));

  // OVERDUE dinámico (Paso 12): solo para el contador/finding. No resta puntos
  // adicionales: el vencido sin completar ya penaliza vía EJECUCIÓN.
  const overdue = evaluated.filter((r) => isMaintenanceOverdue(String(r.status), r.plannedDate, now)).length;

  const programRatio = preventives.length > 0
    ? preventiveEvaluable.length / preventives.length
    : 0;
  const executionRatio = evaluated.length > 0 ? completedValid.length / evaluated.length : null;
  const opportunityRatio = completedValid.length > 0 ? completedOnTime.length / completedValid.length : null;
  const traceabilityRatio = completedValid.length > 0
    ? completedWithClosureNotes.length / completedValid.length
    : null;

  const dimensions: Array<MaintenanceScoreDimension> = [
    { key: 'program', ratio: programRatio, weight: MAINTENANCE_SCORE_WEIGHTS.program },
    { key: 'execution', ratio: executionRatio, weight: MAINTENANCE_SCORE_WEIGHTS.execution },
    { key: 'opportunity', ratio: opportunityRatio, weight: MAINTENANCE_SCORE_WEIGHTS.opportunity },
    { key: 'traceability', ratio: traceabilityRatio, weight: MAINTENANCE_SCORE_WEIGHTS.traceability },
  ];

  const hasPreventiveProgram = preventives.length > 0;
  // Tope reactivo (Paso 10): solo aplica si HAY registros evaluables pero
  // ninguno preventivo. Sin registros evaluables el provider responde NO_DATA.
  const cappedAt60 = evaluated.length > 0 && !hasPreventiveProgram;
  const redistributed = redistributeWeightedScore(
    dimensions.map(({ ratio, weight }) => ({ ratio, weight })),
  );
  const capped = cappedAt60 ? Math.min(redistributed, MAINTENANCE_REACTIVE_CAP) : redistributed;
  const score = Math.round(Math.min(100, Math.max(0, capped)));

  return {
    score,
    hasPreventiveProgram,
    cappedAt60,
    dimensions: {
      program: { ratio: programRatio, evaluable: programRatio !== null },
      execution: { ratio: executionRatio, evaluable: executionRatio !== null },
      opportunity: { ratio: opportunityRatio, evaluable: opportunityRatio !== null },
      traceability: { ratio: traceabilityRatio, evaluable: traceabilityRatio !== null },
    },
    counters: {
      total: records.length,
      evaluated: evaluated.length,
      cancelled: cancelled.length,
      preventiveEvaluable: preventiveEvaluable.length,
      completedValid: completedValid.length,
      completedOnTime: completedOnTime.length,
      completedWithClosureNotes: completedWithClosureNotes.length,
      overdue,
    },
  };
}

/** Re-export para que el provider use la misma semántica de estados. */
export { MaintenanceStatus };
