/**
 * E1 (7.1.4) — LIFECYCLE TIPADO del Plan de mejoramiento y sus actividades.
 *
 * Plan:
 *   DRAFT → SUBMITTED | CANCELLED
 *   SUBMITTED → IN_PROGRESS | CANCELLED
 *   IN_PROGRESS → COMPLETED | CANCELLED
 *   COMPLETED → CLOSED
 *   CLOSED / CANCELLED → (terminales, sin reapertura)
 *
 * Actividad:
 *   PENDING → IN_PROGRESS | CANCELLED
 *   IN_PROGRESS → COMPLETED | CANCELLED
 *   COMPLETED / CANCELLED → (terminales)
 *
 * OVERDUE (plan y actividad) es DERIVADO: dueDate/endDate < now && estado no
 * terminal. NUNCA se persiste ni se acepta desde el cliente.
 */

// ─── Estados del plan ───────────────────────────────────────────────────────

export enum ImprovementPlanStatus {
  /** Borrador: el plan se está elaborando. */
  DRAFT = 'DRAFT',
  /** Somitido/aprobado por la dirección; pendiente de iniciar ejecución. */
  SUBMITTED = 'SUBMITTED',
  /** En ejecución (actividades en curso, seguimiento activo). */
  IN_PROGRESS = 'IN_PROGRESS',
  /** Actividades completadas (pre-cierre). */
  COMPLETED = 'COMPLETED',
  /** Cierre documentado (terminal). */
  CLOSED = 'CLOSED',
  /** Cancelado (terminal). */
  CANCELLED = 'CANCELLED',
}

export const IMPROVEMENT_PLAN_TERMINAL_STATUSES: readonly ImprovementPlanStatus[] = [
  ImprovementPlanStatus.CLOSED,
  ImprovementPlanStatus.CANCELLED,
];

/**
 * Transiciones válidas del plan (server-side; el frontend solo las espeja):
 * DRAFT → SUBMITTED | CANCELLED
 * SUBMITTED → IN_PROGRESS | CANCELLED
 * IN_PROGRESS → COMPLETED | CANCELLED
 * COMPLETED → CLOSED
 * CLOSED / CANCELLED → (ninguna)
 */
export const IMPROVEMENT_PLAN_TRANSITIONS: Readonly<
  Record<ImprovementPlanStatus, readonly ImprovementPlanStatus[]>
> = {
  [ImprovementPlanStatus.DRAFT]: [
    ImprovementPlanStatus.SUBMITTED,
    ImprovementPlanStatus.CANCELLED,
  ],
  [ImprovementPlanStatus.SUBMITTED]: [
    ImprovementPlanStatus.IN_PROGRESS,
    ImprovementPlanStatus.CANCELLED,
  ],
  [ImprovementPlanStatus.IN_PROGRESS]: [
    ImprovementPlanStatus.COMPLETED,
    ImprovementPlanStatus.CANCELLED,
  ],
  [ImprovementPlanStatus.COMPLETED]: [
    ImprovementPlanStatus.CLOSED,
  ],
  [ImprovementPlanStatus.CLOSED]: [],
  [ImprovementPlanStatus.CANCELLED]: [],
};

export function isImprovementPlanTransitionValid(
  current: ImprovementPlanStatus,
  next: ImprovementPlanStatus,
): boolean {
  if (current === next) return false;
  return IMPROVEMENT_PLAN_TRANSITIONS[current].includes(next);
}

// ─── Estados de actividad ───────────────────────────────────────────────────

export enum ImprovementPlanActivityStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * Transiciones válidas de actividad (patrón 7.1.1/7.1.2/7.1.3):
 * PENDING → IN_PROGRESS | CANCELLED; IN_PROGRESS → COMPLETED | CANCELLED;
 * COMPLETED y CANCELLED terminales (sin COMPLETED → IN_PROGRESS, etc.).
 */
export const IMPROVEMENT_PLAN_ACTIVITY_TRANSITIONS: Readonly<
  Record<ImprovementPlanActivityStatus, readonly ImprovementPlanActivityStatus[]>
> = {
  [ImprovementPlanActivityStatus.PENDING]: [
    ImprovementPlanActivityStatus.IN_PROGRESS,
    ImprovementPlanActivityStatus.CANCELLED,
  ],
  [ImprovementPlanActivityStatus.IN_PROGRESS]: [
    ImprovementPlanActivityStatus.COMPLETED,
    ImprovementPlanActivityStatus.CANCELLED,
  ],
  [ImprovementPlanActivityStatus.COMPLETED]: [],
  [ImprovementPlanActivityStatus.CANCELLED]: [],
};

export function isActivityTransitionValid(
  current: ImprovementPlanActivityStatus,
  next: ImprovementPlanActivityStatus,
): boolean {
  if (current === next) return false;
  return IMPROVEMENT_PLAN_ACTIVITY_TRANSITIONS[current].includes(next);
}

// ─── Estados de seguimiento ─────────────────────────────────────────────────

export enum ImprovementPlanImplementationStatus {
  NOT_STARTED = 'NOT_STARTED',
  ON_TRACK = 'ON_TRACK',
  DELAYED = 'DELAYED',
  IMPLEMENTED = 'IMPLEMENTED',
}

/**
 * PERCEPCIÓN de efectividad declarada en el seguimiento — NO verificación
 * formal de eficacia (frontera con 7.1.1). En UI futura presentarse como
 * "Percepción de efectividad" — jamás "eficacia verificada/comprobada".
 */
export enum ImprovementPlanPerceivedEffectiveness {
  EFECTIVA = 'EFECTIVA',
  NO_EFECTIVA = 'NO_EFECTIVA',
  INDETERMINADA = 'INDETERMINADA',
}

// ─── Overdue derivado (NUNCA persistido) ────────────────────────────────────

/**
 * Regla oficial de vencimiento de actividad (patrón 7.1.1/7.1.2/7.1.3):
 * dueDate < now && estado no terminal. Solo presentación/scoring; NUNCA se
 * envía al backend ni se persiste.
 */
export function isImprovementPlanActivityOverdue(
  activity: { dueDate?: Date | string | null; status?: string },
  now?: Date,
): boolean {
  if (activity.status === 'COMPLETED' || activity.status === 'CANCELLED') return false;
  if (!activity.dueDate) return false;
  const due = activity.dueDate instanceof Date
    ? activity.dueDate.getTime()
    : Date.parse(String(activity.dueDate));
  return !Number.isNaN(due) && due < (now ?? new Date()).getTime();
}

/**
 * Plan vencido (derivado): endDate < now && estado no terminal
 * (DRAFT/SUBMITTED/IN_PROGRESS). Un plan COMPLETED/CLOSED/CANCELLED nunca
 * aparece como vencido.
 */
export function isImprovementPlanOverdue(
  plan: { endDate?: Date | string | null; status?: string },
  now?: Date,
): boolean {
  if (
    plan.status === 'COMPLETED' ||
    plan.status === 'CLOSED' ||
    plan.status === 'CANCELLED'
  ) {
    return false;
  }
  if (!plan.endDate) return false;
  const end = plan.endDate instanceof Date
    ? plan.endDate.getTime()
    : Date.parse(String(plan.endDate));
  return !Number.isNaN(end) && end < (now ?? new Date()).getTime();
}
