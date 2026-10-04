/**
 * E1 (7.1.3) — LIFECYCLE TIPADO de los casos accidentales del dominio
 * incidents (Acciones por accidentes / Accidentalidad laboral).
 *
 * Unidad normativa 7.1.3 (E0):
 *   Accidente/Incidente → Investigación/análisis causal → Acciones →
 *   Ejecución → Evidencia/seguimiento → Cierre documentado.
 *
 * COMPATIBILIDAD (regla E1): el campo legacy `Incident.status` es STRING LIBRE
 * y permanece intacto — los registros históricos ('Abierto', 'Cerrado',
 * 'INVESTIGATED', etc.) NUNCA se migran destructivamente. El estado canónico
 * nuevo vive en `lifecycleStage` (typed) y se aplica SOLO a registros nuevos o
 * a partir de la primera operación de gestión avanzada 7.1.3 (mapper
 * `resolveLifecycleStage` abajo).
 *
 * OVERDUE (regla E1): condición DERIVADA (dueDate < now && estado no
 * terminal). NUNCA se persiste ni se acepta desde el cliente.
 *
 * NOTA (E2): el scoring 7.1.3 evaluará EXCLUSIVAMENTE
 * investigationType ∈ {ACCIDENT, INCIDENTE}; DISEASE (3.2.2) queda FUERA del
 * alcance evaluable de 7.1.3. E1 no implementa scorer; este contrato de
 * evaluabilidad queda documentado para E2.
 */

// ── Estados del caso accidental (canonical, nuevo) ─────────────────────────

/**
 * Estados canónicos del caso accidental para la gestión avanzada 7.1.3.
 * El campo legacy `status` (string libre) se mantiene por compatibilidad.
 */
export enum IncidentLifecycleStage {
  /** Registrado, sin investigación iniciada. */
  OPEN = 'OPEN',
  /** Investigación en curso (investigationDate registrada). */
  INVESTIGATING = 'INVESTIGATING',
  /** Investigación con causas; pendiente definir acciones. */
  ACTIONS_PENDING = 'ACTIONS_PENDING',
  /** Acciones definidas y en ejecución. */
  IN_PROGRESS = 'IN_PROGRESS',
  /** Investigación + acciones completadas (pre-cierre). */
  COMPLETED = 'COMPLETED',
  /** Cierre documentado (terminal). */
  CLOSED = 'CLOSED',
  /** Cancelado (terminal; p.ej. falso positivo). */
  CANCELLED = 'CANCELLED',
}

export const INCIDENT_LIFECYCLE_STAGES: readonly IncidentLifecycleStage[] =
  Object.values(IncidentLifecycleStage);

/** Estados terminales: sin transiciones de salida (sin reapertura). */
export const INCIDENT_TERMINAL_STAGES: readonly IncidentLifecycleStage[] = [
  IncidentLifecycleStage.CLOSED,
  IncidentLifecycleStage.CANCELLED,
];

/**
 * Transiciones válidas (server-side; el frontend solo las espeja en E3):
 *   OPEN → INVESTIGATING | CANCELLED
 *   INVESTIGATING → ACTIONS_PENDING | CANCELLED
 *   ACTIONS_PENDING → IN_PROGRESS | CANCELLED
 *   IN_PROGRESS → COMPLETED | CANCELLED
 *   COMPLETED → CLOSED
 *   CLOSED / CANCELLED → (terminal)
 *
 * PROHIBIDAS: OPEN → COMPLETED, OPEN → CLOSED, INVESTIGATING → CLOSED,
 * ACTIONS_PENDING → CLOSED y cualquier reapertura de terminal.
 */
export const INCIDENT_LIFECYCLE_TRANSITIONS: Readonly<
  Record<IncidentLifecycleStage, readonly IncidentLifecycleStage[]>
> = {
  [IncidentLifecycleStage.OPEN]: [
    IncidentLifecycleStage.INVESTIGATING,
    IncidentLifecycleStage.CANCELLED,
  ],
  [IncidentLifecycleStage.INVESTIGATING]: [
    IncidentLifecycleStage.ACTIONS_PENDING,
    IncidentLifecycleStage.CANCELLED,
  ],
  [IncidentLifecycleStage.ACTIONS_PENDING]: [
    IncidentLifecycleStage.IN_PROGRESS,
    IncidentLifecycleStage.CANCELLED,
  ],
  [IncidentLifecycleStage.IN_PROGRESS]: [
    IncidentLifecycleStage.COMPLETED,
    IncidentLifecycleStage.CANCELLED,
  ],
  [IncidentLifecycleStage.COMPLETED]: [
    IncidentLifecycleStage.CLOSED,
  ],
  [IncidentLifecycleStage.CLOSED]: [],
  [IncidentLifecycleStage.CANCELLED]: [],
};

/** ¿Transición válida? (el service es la autoridad server-side). */
export function isValidIncidentTransition(
  current: IncidentLifecycleStage,
  next: IncidentLifecycleStage,
): boolean {
  if (current === next) return false;
  return INCIDENT_LIFECYCLE_TRANSITIONS[current].includes(next);
}

// ── Mapper de compatibilidad legacy → canonical (NO destructivo) ────────────

/**
 * Resuelve el estado canónico de un incidente SIN modificar datos históricos:
 * 1. Si ya tiene `lifecycleStage` tipado válido → se usa tal cual.
 * 2. Si el legacy `status` es reconocido → se mapea (preservando el string).
 * 3. Si hay investigationDate → INVESTIGATING (deducción conservadora).
 * 4. Default: OPEN.
 *
 * El mapper NUNCA persiste nada por sí mismo; el service lo usa al iniciar una
 * operación de gestión avanzada sobre un registro legacy.
 */
export function resolveLifecycleStage(input: {
  lifecycleStage?: string;
  status?: string;
  investigationDate?: Date | string | null;
  closureDate?: Date | string | null;
}): IncidentLifecycleStage {
  if (
    input.lifecycleStage &&
    INCIDENT_LIFECYCLE_STAGES.includes(input.lifecycleStage as IncidentLifecycleStage)
  ) {
    return input.lifecycleStage as IncidentLifecycleStage;
  }
  const legacy = (input.status ?? '').trim().toLowerCase();
  if (['cerrado', 'closed', 'completado', 'completed', 'investigated'].includes(legacy)) {
    // Nota E1: los históricos 'Cerrado' se tratan como COMPLETED (pre-cierre
    // documentado), NO como CLOSED — el cierre documentado 7.1.3 exige
    // investigación/causas/acciones/evidencia y se obtiene explícitamente.
    return IncidentLifecycleStage.COMPLETED;
  }
  if (input.closureDate != null) {
    return IncidentLifecycleStage.COMPLETED;
  }
  if (['abierto', 'open', 'in-progress', 'en proceso'].includes(legacy)) {
    return input.investigationDate != null
      ? IncidentLifecycleStage.INVESTIGATING
      : IncidentLifecycleStage.OPEN;
  }
  if (input.investigationDate != null) {
    return IncidentLifecycleStage.INVESTIGATING;
  }
  return IncidentLifecycleStage.OPEN;
}

// ── Overdue (DERIVADO — nunca persistido) ───────────────────────────────────

/**
 * Regla oficial de vencimiento (misma del patrón 7.1.1/7.1.2):
 * dueDate < now AND la acción no está en estado terminal.
 * Solo presentación/scoring; NUNCA se envía al backend ni se persiste.
 */
export function isInvestigationActionOverdue(
  action: { dueDate?: Date | string | null; completedDate?: Date | string | null; status?: string },
  now?: Date,
): boolean {
  if (action.status === 'COMPLETED' || action.status === 'CANCELLED') return false;
  if (action.completedDate != null) return false;
  if (!action.dueDate) return false;
  const due = action.dueDate instanceof Date
    ? action.dueDate.getTime()
    : Date.parse(String(action.dueDate));
  return !Number.isNaN(due) && due < (now ?? new Date()).getTime();
}

// ── Evaluabilidad 7.1.3 (contrato para E2 — sin scoring en E1) ─────────────

/**
 * Tipos de incidente EVALUABLES para 7.1.3. `INCIDENTE` cubre la variante
 * textual usada por el dominio actual (accidentType/case 'INCIDENTE').
 * DISEASE queda EXCLUÍDO (pertenece a 3.2.2 — investigación de enfermedad
 * laboral) y NUNCA debe entrar en el scoring de 7.1.3 (E2).
 */
export const INCIDENT_713_EVALUABLE_TYPES: readonly string[] = ['ACCIDENT', 'INCIDENTE'];

/**
 * Tipado del estado de la investigación (progresión interna del análisis
 * causal). Complementa al lifecycle del caso; NO lo sustituye.
 */
export enum InvestigationProgressStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  CAUSES_IDENTIFIED = 'CAUSES_IDENTIFIED',
  CONCLUDED = 'CONCLUDED',
}

/** Estado de implementación de una acción (seguimiento). */
export enum InvestigationActionImplementationStatus {
  NOT_STARTED = 'NOT_STARTED',
  ON_TRACK = 'ON_TRACK',
  DELAYED = 'DELAYED',
  IMPLEMENTED = 'IMPLEMENTED',
}

/**
 * PERCEPCIÓN de efectividad declarada en el seguimiento de la acción.
 * FRONTERA con 7.1.1: NO es verificación formal de eficacia (eso es
 * corrective-preventive-actions). En UI futura presentarse como
 * "Percepción de efectividad" — jamás "eficacia verificada/formal".
 */
export enum InvestigationPerceivedEffectiveness {
  EFECTIVA = 'EFECTIVA',
  NO_EFECTIVA = 'NO_EFECTIVA',
  INDETERMINADA = 'INDETERMINADA',
}
