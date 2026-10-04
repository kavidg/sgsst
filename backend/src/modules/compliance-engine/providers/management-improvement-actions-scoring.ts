/**
 * E2 (7.1.2) — SCORER PURO de las ACCIONES DE MEJORA DE LA ALTA DIRECCIÓN
 * (management-improvement-actions).
 *
 * - FUNCIÓN PURA: sin Mongo, sin NestJS, sin HTTP, sin request, sin companyId;
 *   determinista con `now` inyectable (patrón corrective-preventive-actions-
 *   scoring.ts / copasst-audit-planning-scoring.ts). El provider transporta y
 *   adapta; el scorer es la ÚNICA fuente matemática del score de 7.1.2.
 * - Fórmula `dimensions:v1`, target 90. Pesos: programming 20 / execution 25 /
 *   followUp 20 / evidence 25 / continuity 10 (suma exacta 100).
 * - FRONTERA con 7.1.1: la efectividad aquí es la PERCEPCIÓN declarativa del
 *   seguimiento (followUp.perceivedEffectiveness) — NO una verificación formal
 *   de eficacia (effectivenessVerification pertenece a corrective-preventive-
 *   actions). No se reutiliza ni duplica esa lógica.
 * - FRONTERA con accountability: NO se puntúan reuniones ni compromisos de
 *   rendición de cuentas (proxy legacy retirado del scoring en E2).
 * - OVERDUE derivado (NUNCA persistido): dueDate < now AND status NOT IN
 *   [COMPLETED, CANCELLED].
 * - NO_DATA SOLO cuando actions.length === 0 (reason 'no-actions'); acciones
 *   deficientes producen score real bajo con findings.
 */

// ── Contrato del dominio (Lean docs; ObjectIds llegan como ObjectId-like) ──

export interface MiaFollowUpLike {
  lastFollowUpDate?: string | Date;
  observations?: string;
  implementationStatus?: string;
  perceivedEffectiveness?: string;
  requiresContinuedFollowUp?: boolean;
}

export interface MiaEvidenceLike {
  documentId?: unknown;
  documentSnapshot?: string;
  evidenceUrl?: string;
  comment?: string;
}

export interface MiaActionLike {
  _id: unknown;
  actionCode?: string;
  title?: string;
  description?: string;
  origin?: string;
  originReferenceId?: unknown;
  decisionReference?: string;
  priority?: string;
  responsibleUserId?: unknown;
  responsibleSnapshot?: string;
  plannedDate?: string | Date;
  dueDate?: string | Date;
  executionDate?: string | Date;
  status?: string;
  evidence?: MiaEvidenceLike;
  followUp?: MiaFollowUpLike;
  createdAt?: string | Date;
}

export interface MiaActionsScoreInput {
  actions: MiaActionLike[];
  /** "Ahora" inyectable para determinismo y tests (default: new Date()). */
  now?: Date;
}

// ── Estructura de salida ──

export interface MiaActionsDimensionDetail {
  /** 0–1; null = NO evaluable (se redistribuye; NUNCA convertir null en 0). */
  ratio: number | null;
  numerator: number | null;
  denominator: number | null;
  weight: number;
  subchecks?: { satisfied: number; total: number };
  [key: string]: unknown;
}

export interface MiaActionsFindingDraft {
  id: string;
  title: string;
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface MiaActionsScoreBreakdown {
  percentage: number;
  noData: boolean;
  /** Causa exacta del NO_DATA (para metadata y tests). */
  noDataReason: 'no-actions' | null;
  /** Vigencia de la acción evaluable más reciente (contexto). */
  evaluatedPeriod: string | null;
  dimensions: {
    programming: MiaActionsDimensionDetail;
    execution: MiaActionsDimensionDetail;
    followUp: MiaActionsDimensionDetail;
    evidence: MiaActionsDimensionDetail;
    continuity: MiaActionsDimensionDetail;
  };
  counters: {
    totalActions: number;
    evaluableActions: number;
    pendingActions: number;
    inProgressActions: number;
    completedActions: number;
    cancelledActions: number;
    overdueActions: number;
    actionsWithExecutionDate: number;
    actionsWithEvidence: number;
    actionsWithoutEvidence: number;
    actionsWithFollowUp: number;
    actionsWithoutFollowUp: number;
    effectiveActions: number;
    ineffectiveActions: number;
    indeterminateEffectivenessActions: number;
    actionsRequiringContinuedFollowUp: number;
    lastActionDate: string | null;
  };
  latestAction: {
    id: string;
    actionCode: string | null;
    title: string | null;
    origin: string | null;
    status: string | null;
    dueDate: string | null;
  } | null;
  findings: MiaActionsFindingDraft[];
}

// ── Constantes oficiales del estándar 7.1.2 ──

export const MIA_ACTIONS_MODULE = 'management-improvement-actions';
export const MIA_ACTIONS_STANDARD_CODE = '7.1.2';
export const MIA_ACTIONS_STANDARD_TITLE = 'Acciones mejora alta dirección';
export const MIA_ACTIONS_FORMULA = 'dimensions:v1';
export const MIA_ACTIONS_COMPLIANCE_TARGET = 90;

/** Pesos oficiales de las dimensiones (suma exacta 100). */
export const MIA_ACTIONS_SCORE_WEIGHTS = {
  programming: 20,
  execution: 25,
  followUp: 20,
  evidence: 25,
  continuity: 10,
} as const;

// ── Helpers puros ──

function truthyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Referencia/id "presente": acepta string no vacío U ObjectId-like (los
 * documentos .lean() de Mongoose devuelven ObjectIds, no strings).
 */
function truthyId(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (value !== null && typeof value === 'object') {
    const isPlain =
      Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;
    if (!isPlain) {
      const s = String(value);
      return s.length > 0 && s !== '[object Object]';
    }
  }
  return false;
}

/** Fecha válida (Date o string parseable) → timestamp; inválida → NaN. */
function toTime(value: string | Date | undefined): number {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? NaN : value.getTime();
  if (typeof value === 'string' && value.trim().length > 0) {
    const t = Date.parse(value);
    return Number.isNaN(t) ? NaN : t;
  }
  return NaN;
}

/**
 * Copia local del helper oficial de redistribución (patrón epp/maintenance/
 * indicators/annual-audit/6.1.4/7.1.1: cada scoring lleva su propia copia
 * desacoplada). Solo las dimensiones con ratio finito 0–1 participan del
 * denominador.
 */
export function redistributeWeightedScore(
  dimensions: Array<{ ratio: number | null; weight: number }>,
): number {
  const active = dimensions.filter(
    (d) => d.ratio !== null && Number.isFinite(d.ratio) && (d.ratio as number) >= 0 && (d.ratio as number) <= 1,
  );
  const activeWeight = active.reduce((sum, d) => sum + d.weight, 0);
  if (activeWeight <= 0) return 0;
  const raw = active.reduce((sum, d) => sum + d.weight * (d.ratio as number), 0);
  const score = (raw / activeWeight) * 100;
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, score));
}

/** Orígenes válidos (espejo ImprovementActionOrigin del schema E1). */
const VALID_ORIGINS = ['MEETING', 'MANAGEMENT_REVIEW_6_1_3', 'OTHER'];
/** Prioridades válidas (espejo ImprovementActionPriority del schema E1). */
const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
/** Estados de implementación válidos (espejo ImplementationStatus del schema E1). */
const VALID_IMPLEMENTATION_STATUSES = ['NOT_STARTED', 'ON_TRACK', 'DELAYED', 'IMPLEMENTED'];
/** Percepciones de efectividad válidas (espejo PerceivedEffectiveness del schema E1). */
const VALID_PERCEIVED_EFFECTIVENESS = ['EFECTIVA', 'NO_EFECTIVA', 'INDETERMINADA'];

/**
 * OVERDUE derivado (NUNCA persistido): dueDate pasada y sin estado terminal.
 * Convención exacta del prompt E2 (7.1.2): dueDate < now AND status NOT IN
 * [COMPLETED, CANCELLED]. Una acción COMPLETED/CANCELLED NUNCA aparece como
 * vencida aunque su dueDate haya pasado.
 */
export function isOverdueManagementImprovementAction(a: MiaActionLike, now: Date): boolean {
  if (a.status === 'COMPLETED' || a.status === 'CANCELLED') return false;
  const due = toTime(a.dueDate);
  return !Number.isNaN(due) && due < now.getTime();
}

/**
 * Acción EVALUABLE para scoring: título + descripción + responsable + fecha
 * compromiso válida + prioridad válida + origen válido + estado válido
 * (política de evaluabilidad del prompt E2). El resto de brechas (trazabilidad
 * del origen, ejecución, seguimiento, evidencia) SON el score — no inhabilidad
 * para evaluar.
 */
export function isEvaluableManagementImprovementAction(a: MiaActionLike): boolean {
  if (!truthyText(a.title) || !truthyText(a.description)) return false;
  if (!(truthyId(a.responsibleUserId) || truthyText(a.responsibleSnapshot))) return false;
  if (Number.isNaN(toTime(a.dueDate))) return false;
  if (!a.priority || !VALID_PRIORITIES.includes(a.priority)) return false;
  if (!a.origin || !VALID_ORIGINS.includes(a.origin)) return false;
  if (!a.status || !['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(a.status)) return false;
  return true;
}

/** Evidencia con soporte real: documentId (o snapshot) o URL externa. */
function hasEvidence(a: MiaActionLike): boolean {
  const e = a.evidence;
  if (!e) return false;
  return truthyId(e.documentId) || truthyText(e.documentSnapshot) || truthyText(e.evidenceUrl);
}

/**
 * Seguimiento REAL (no mera existencia de documento): la acción tiene
 * actividad de seguimiento si su followUp registra fecha y/o estado de
 * implementación válido y/o percepción de efectividad válida.
 */
function hasRealFollowUp(a: MiaActionLike): boolean {
  const f = a.followUp;
  if (!f) return false;
  const hasDate = !Number.isNaN(toTime(f.lastFollowUpDate));
  const hasImplementation =
    truthyText(f.implementationStatus) &&
    VALID_IMPLEMENTATION_STATUSES.includes(f.implementationStatus as string);
  const hasPerception =
    truthyText(f.perceivedEffectiveness) &&
    VALID_PERCEIVED_EFFECTIVENESS.includes(f.perceivedEffectiveness as string);
  return hasDate || hasImplementation || hasPerception;
}

/** Calcula el score de 7.1.2. Función PURA (determinista, sin efectos). */
export function computeMiaActionsScore(
  input: MiaActionsScoreInput,
): MiaActionsScoreBreakdown {
  const actions = Array.isArray(input.actions) ? input.actions : [];
  const now = input.now ?? new Date();

  // ── Contadores de estado (todas las acciones del tenant) ──
  const pendingActions = actions.filter((a) => a.status === 'PENDING').length;
  const inProgressActions = actions.filter((a) => a.status === 'IN_PROGRESS').length;
  const completedActions = actions.filter((a) => a.status === 'COMPLETED').length;
  const cancelledActions = actions.filter((a) => a.status === 'CANCELLED').length;
  const overdueActions = actions.filter((a) => isOverdueManagementImprovementAction(a, now)).length;

  const withExecutionDate = actions.filter((a) => !Number.isNaN(toTime(a.executionDate))).length;
  const withEvidence = actions.filter(hasEvidence).length;
  const withoutEvidence = actions.length - withEvidence;
  const withFollowUp = actions.filter(hasRealFollowUp).length;
  const withoutFollowUp = actions.length - withFollowUp;
  const effectiveActions = actions.filter(
    (a) => a.followUp?.perceivedEffectiveness === 'EFECTIVA',
  ).length;
  const ineffectiveActions = actions.filter(
    (a) => a.followUp?.perceivedEffectiveness === 'NO_EFECTIVA',
  ).length;
  const indeterminateEffectivenessActions = actions.filter(
    (a) => a.followUp?.perceivedEffectiveness === 'INDETERMINADA',
  ).length;
  const requiringContinuedFollowUp = actions.filter(
    (a) => a.followUp?.requiresContinuedFollowUp === true,
  ).length;

  // ── Conjunto evaluable (excluye CANCELLED del denominador de gestión: una
  // acción cancelada no es gestión de la acción, es su archivo). ──
  const evaluable = actions.filter(
    (a) => isEvaluableManagementImprovementAction(a) && a.status !== 'CANCELLED',
  );

  const noData = actions.length === 0;
  const noDataReason: MiaActionsScoreBreakdown['noDataReason'] =
    actions.length === 0 ? 'no-actions' : null;

  // ── D1 — PROGRAMACIÓN Y ASIGNACIÓN (20) ──
  // Trazabilidad suficiente de POR QUÉ existe la acción: origen válido,
  // título+descripción, responsable, fecha compromiso, prioridad y referencia
  // de la decisión (decisionReference u originReferenceId).
  const assignmentChecks = (a: MiaActionLike): boolean[] => [
    !!a.origin && VALID_ORIGINS.includes(a.origin),
    truthyText(a.title) && truthyText(a.description),
    truthyId(a.responsibleUserId) || truthyText(a.responsibleSnapshot),
    !Number.isNaN(toTime(a.dueDate)),
    !!a.priority && VALID_PRIORITIES.includes(a.priority),
    truthyText(a.decisionReference) || truthyId(a.originReferenceId),
  ];
  const fullyAssigned = evaluable.filter((a) => assignmentChecks(a).every(Boolean)).length;
  const programming: MiaActionsDimensionDetail = {
    ratio: evaluable.length > 0 ? fullyAssigned / evaluable.length : null,
    numerator: evaluable.length > 0 ? fullyAssigned : null,
    denominator: evaluable.length > 0 ? evaluable.length : null,
    weight: MIA_ACTIONS_SCORE_WEIGHTS.programming,
    evaluableActions: evaluable.length,
    fullyAssignedActions: fullyAssigned,
  };

  // ── D2 — EJECUCIÓN Y OPORTUNIDAD (25) ──
  // 4 subcondiciones sobre el portafolio evaluable:
  // (a) ≥1 acción ejecutada (executionDate registrada) — hay ejecución real;
  // (b) ninguna acción vencida sin cierre (overdueActions === 0 — COMPLETED/
  //     CANCELLED nunca cuentan como vencidas);
  // (c) 100% de las acciones COMPLETED tienen executionDate (coherencia);
  // (d) 100% de las acciones activas (PENDING/IN_PROGRESS) tienen dueDate
  //     válida (gestión programada).
  const completedWithExecution = evaluable.filter(
    (a) => a.status === 'COMPLETED' && !Number.isNaN(toTime(a.executionDate)),
  ).length;
  const completedTotal = evaluable.filter((a) => a.status === 'COMPLETED').length;
  const activeActions = evaluable.filter((a) => a.status === 'PENDING' || a.status === 'IN_PROGRESS');
  const activeWithDueDate = activeActions.filter((a) => !Number.isNaN(toTime(a.dueDate))).length;
  const executedAny = evaluable.filter((a) => !Number.isNaN(toTime(a.executionDate))).length;
  const executionSubchecks = (() => {
    if (evaluable.length === 0) return { satisfied: 0, total: 4 };
    const checks = [
      executedAny >= 1,
      overdueActions === 0,
      completedTotal === 0 || completedWithExecution === completedTotal,
      activeActions.length === 0 || activeWithDueDate === activeActions.length,
    ];
    return { satisfied: checks.filter(Boolean).length, total: checks.length };
  })();
  const execution: MiaActionsDimensionDetail = {
    ratio: evaluable.length > 0 ? executionSubchecks.satisfied / executionSubchecks.total : null,
    numerator: evaluable.length > 0 ? executionSubchecks.satisfied : null,
    denominator: evaluable.length > 0 ? executionSubchecks.total : null,
    weight: MIA_ACTIONS_SCORE_WEIGHTS.execution,
    subchecks: executionSubchecks,
    overdueActions,
    actionsWithExecutionDate: withExecutionDate,
  };

  // ── D3 — SEGUIMIENTO (20) ──
  // Actividad REAL de seguimiento (no mera existencia del documento):
  // (a) ≥1 acción con seguimiento real (fecha/estado/percepción válidos);
  // (b) 100% de las acciones activas (PENDING/IN_PROGRESS) con seguimiento;
  // (c) 100% de los seguimientos con fecha registrada (lastFollowUpDate);
  // (d) 100% de los seguimientos con estado de implementación válido.
  const followUps = evaluable.map((a) => a.followUp).filter((f): f is MiaFollowUpLike => !!f);
  const followUpsWithDate = followUps.filter((f) => !Number.isNaN(toTime(f.lastFollowUpDate))).length;
  const followUpsWithImplementation = followUps.filter(
    (f) => truthyText(f.implementationStatus) && VALID_IMPLEMENTATION_STATUSES.includes(f.implementationStatus as string),
  ).length;
  const activeWithFollowUp = activeActions.filter(hasRealFollowUp).length;
  const followUpSubchecks = (() => {
    if (evaluable.length === 0) return { satisfied: 0, total: 4 };
    const checks = [
      withFollowUp >= 1,
      activeActions.length === 0 || activeWithFollowUp === activeActions.length,
      followUps.length === 0 || followUpsWithDate === followUps.length,
      followUps.length === 0 || followUpsWithImplementation === followUps.length,
    ];
    return { satisfied: checks.filter(Boolean).length, total: checks.length };
  })();
  const followUp: MiaActionsDimensionDetail = {
    ratio: evaluable.length > 0 ? followUpSubchecks.satisfied / followUpSubchecks.total : null,
    numerator: evaluable.length > 0 ? followUpSubchecks.satisfied : null,
    denominator: evaluable.length > 0 ? followUpSubchecks.total : null,
    weight: MIA_ACTIONS_SCORE_WEIGHTS.followUp,
    subchecks: followUpSubchecks,
    actionsWithFollowUp: withFollowUp,
    actionsRequiringContinuedFollowUp: requiringContinuedFollowUp,
  };

  // ── D4 — EVIDENCIA Y TRAZABILIDAD (25) ──
  // 4 subcondiciones sobre el portafolio evaluable (sin exigir rootCause/
  // finding: eso es frontera de 7.1.1; sin duplicar eficacia formal):
  // (a) ≥1 acción con evidencia registrada (documentId/evidenceUrl);
  // (b) 100% de las acciones COMPLETED tienen evidencia (soporte del cierre);
  // (c) 100% de las acciones con decisión de origen trazable
  //     (decisionReference u originReferenceId);
  // (d) 100% de las acciones con responsable trazable (id o snapshot).
  const completedWithEvidence = evaluable.filter(
    (a) => a.status === 'COMPLETED' && hasEvidence(a),
  ).length;
  const withOriginTrace = evaluable.filter(
    (a) => truthyText(a.decisionReference) || truthyId(a.originReferenceId),
  ).length;
  const withResponsible = evaluable.filter(
    (a) => truthyId(a.responsibleUserId) || truthyText(a.responsibleSnapshot),
  ).length;
  const evidenceSubchecks = (() => {
    if (evaluable.length === 0) return { satisfied: 0, total: 4 };
    const checks = [
      withEvidence >= 1,
      completedTotal === 0 || completedWithEvidence === completedTotal,
      withOriginTrace === evaluable.length,
      withResponsible === evaluable.length,
    ];
    return { satisfied: checks.filter(Boolean).length, total: checks.length };
  })();
  const evidence: MiaActionsDimensionDetail = {
    ratio: evaluable.length > 0 ? evidenceSubchecks.satisfied / evidenceSubchecks.total : null,
    numerator: evaluable.length > 0 ? evidenceSubchecks.satisfied : null,
    denominator: evaluable.length > 0 ? evidenceSubchecks.total : null,
    weight: MIA_ACTIONS_SCORE_WEIGHTS.evidence,
    subchecks: evidenceSubchecks,
    actionsWithEvidence: withEvidence,
    completedWithEvidence,
  };

  // ── D5 — CONTINUIDAD (10) ──
  // Continuidad temporal REAL de la gestión (años distintos de dueDate de las
  // acciones evaluables): 0 vigencias → 0; 1 vigencia → null (se REDISTRIBUYE
  // — no se exige historia multiannual, política ya probada en 6.1.4/7.1.1);
  // ≥2 vigencias → 1.
  const distinctYears = new Set<string>();
  for (const a of evaluable) {
    const due = toTime(a.dueDate);
    if (!Number.isNaN(due)) {
      distinctYears.add(String(new Date(due).getUTCFullYear()));
    }
  }
  const continuity: MiaActionsDimensionDetail = {
    ratio: distinctYears.size >= 2 ? 1 : distinctYears.size === 1 ? null : 0,
    numerator: distinctYears.size >= 2 ? 2 : null,
    denominator: distinctYears.size >= 2 ? 2 : null,
    weight: MIA_ACTIONS_SCORE_WEIGHTS.continuity,
    distinctDueYears: distinctYears.size,
    evaluableActions: evaluable.length,
    limitation:
      'La dimensión de continuidad evalúa la cobertura temporal de la gestión de acciones de mejora; ' +
      'con una sola vigencia se redistribuye (no se exige historia multiannual).',
  };

  const w = MIA_ACTIONS_SCORE_WEIGHTS;
  const percentage = noData
    ? 0
    : redistributeWeightedScore([
        { ratio: programming.ratio, weight: w.programming },
        { ratio: execution.ratio, weight: w.execution },
        { ratio: followUp.ratio, weight: w.followUp },
        { ratio: evidence.ratio, weight: w.evidence },
        { ratio: continuity.ratio, weight: w.continuity },
      ]);

  // ── Período evaluado (contexto): año de la dueDate más reciente evaluable. ──
  const latestEvaluable = evaluable.length > 0
    ? evaluable.reduce((best, a) => {
        const ta = toTime(a.dueDate);
        const tb = toTime(best.dueDate);
        return ta > tb ? a : best;
      })
    : undefined;
  const evaluatedPeriod = latestEvaluable
    ? (() => {
        const t = toTime(latestEvaluable.dueDate);
        return Number.isNaN(t) ? null : String(new Date(t).getUTCFullYear());
      })()
    : null;

  // ── Última acción evaluable (para metadata) ──
  const latestAction = latestEvaluable
    ? {
        id: String(latestEvaluable._id),
        actionCode: truthyText(latestEvaluable.actionCode) ? (latestEvaluable.actionCode as string) : null,
        title: truthyText(latestEvaluable.title) ? (latestEvaluable.title as string) : null,
        origin: latestEvaluable.origin ?? null,
        status: latestEvaluable.status ?? null,
        dueDate: !Number.isNaN(toTime(latestEvaluable.dueDate))
          ? new Date(toTime(latestEvaluable.dueDate)).toISOString()
          : null,
      }
    : null;

  // ── Counters globales ──
  const counters: MiaActionsScoreBreakdown['counters'] = {
    totalActions: actions.length,
    evaluableActions: evaluable.length,
    pendingActions,
    inProgressActions,
    completedActions,
    cancelledActions,
    overdueActions,
    actionsWithExecutionDate: withExecutionDate,
    actionsWithEvidence: withEvidence,
    actionsWithoutEvidence: withoutEvidence,
    actionsWithFollowUp: withFollowUp,
    actionsWithoutFollowUp: withoutFollowUp,
    effectiveActions,
    ineffectiveActions,
    indeterminateEffectivenessActions,
    actionsRequiringContinuedFollowUp: requiringContinuedFollowUp,
    lastActionDate:
      latestEvaluable && !Number.isNaN(toTime(latestEvaluable.dueDate))
        ? new Date(toTime(latestEvaluable.dueDate)).toISOString()
        : null,
  };

  // ── Findings oficiales (solo lo demostrable desde los datos) ──
  const findings: MiaActionsFindingDraft[] = [];
  if (noData) {
    findings.push({
      id: 'management-improvement-actions-no-data',
      title: 'Sin acciones de mejora de la alta dirección registradas',
      description:
        'No existe gestión registrada de acciones de mejora aprobadas por la alta dirección. El estándar 7.1.2 requiere acciones con responsables, fechas, seguimiento a su implementación y efectividad.',
      priority: 'HIGH',
    });
  } else if (evaluable.length === 0) {
    findings.push({
      id: 'management-improvement-actions-incomplete-assignment',
      title: 'Sin acciones evaluables',
      description: `Existen ${actions.length} acción(es) registrada(s) pero ninguna cumple las condiciones mínimas de evaluación (título, descripción, responsable, fecha compromiso, prioridad, origen y estado válidos).`,
      priority: 'HIGH',
    });
  } else {
    if (fullyAssigned < evaluable.length) {
      findings.push({
        id: 'management-improvement-actions-incomplete-assignment',
        title: 'Acciones con asignación/trazabilidad de origen incompleta',
        description: `${evaluable.length - fullyAssigned} de ${evaluable.length} acción(es) evaluable(s) carece(n) de alguna condición de programación (origen válido, título/descripción, responsable, fecha compromiso, prioridad o referencia de la decisión de origen).`,
        priority: fullyAssigned === 0 ? 'HIGH' : 'MEDIUM',
      });
    }
    if (overdueActions > 0) {
      findings.push({
        id: 'management-improvement-actions-overdue',
        title: `${overdueActions} acción(es) vencida(s) sin cierre`,
        description:
          'Existen acciones de mejora cuya fecha compromiso ya pasó sin estado terminal (COMPLETED/CANCELLED). Ejecute, complete o reprograme estas acciones.',
        priority: 'HIGH',
      });
    }
    if (withoutFollowUp > 0 || (activeActions.length > 0 && activeWithFollowUp < activeActions.length)) {
      findings.push({
        id: 'management-improvement-actions-no-follow-up',
        title: 'Seguimiento de implementación insuficiente',
        description: `${withoutFollowUp} acción(es) sin seguimiento real registrado${activeActions.length > activeWithFollowUp ? `; ${activeActions.length - activeWithFollowUp} acción(es) activa(s) (PENDING/IN_PROGRESS) sin actividad de seguimiento` : ''}. Registre seguimiento con fecha, estado de implementación y percepción de efectividad.`,
        priority: 'MEDIUM',
      });
    }
    if (withoutEvidence > 0 || (completedTotal > 0 && completedWithEvidence < completedTotal)) {
      findings.push({
        id: 'management-improvement-actions-no-evidence',
        title: 'Evidencia de implementación insuficiente',
        description: `${withoutEvidence} acción(es) sin evidencia registrada${completedTotal > completedWithEvidence ? ` y ${completedTotal - completedWithEvidence} acción(es) COMPLETED sin soporte documental o URL` : ''}. Registre documentId (DocumentManagement) o evidenceUrl en cada acción.`,
        priority: 'MEDIUM',
      });
    }
    if (withOriginTrace < evaluable.length) {
      findings.push({
        id: 'management-improvement-actions-traceability-incomplete',
        title: 'Trazabilidad de la decisión de origen incompleta',
        description: `${evaluable.length - withOriginTrace} acción(es) sin decisión de alta dirección trazable (decisionReference u originReferenceId). Documente la decisión que originó cada acción de mejora.`,
        priority: 'MEDIUM',
      });
    }
    if (indeterminateEffectivenessActions > 0) {
      findings.push({
        id: 'management-improvement-actions-effectiveness-uncertain',
        title: 'Efectividad sin conclusión en el seguimiento',
        description: `${indeterminateEffectivenessActions} acción(es) con percepción de efectividad INDETERMINADA. Concluya el seguimiento definiendo si la acción de mejora resultó efectiva.`,
        priority: 'MEDIUM',
      });
    }
    if (ineffectiveActions > 0) {
      findings.push({
        id: 'management-improvement-actions-ineffective',
        title: 'Acciones con efectividad percibida negativa',
        description: `${ineffectiveActions} acción(es) con percepción NO_EFECTIVA en el seguimiento. Derive nuevas acciones de mejora o reoriente las existentes con la alta dirección.`,
        priority: 'MEDIUM',
      });
    }
    if (requiringContinuedFollowUp > 0) {
      findings.push({
        id: 'management-improvement-actions-continued-follow-up',
        title: 'Acciones que requieren continuar en seguimiento',
        description: `${requiringContinuedFollowUp} acción(es) marcada(s) con requiresContinuedFollowUp=true. Mantenga el seguimiento activo hasta concluir su implementación y efectividad.`,
        priority: 'LOW',
      });
    }
  }

  return {
    percentage,
    noData,
    noDataReason,
    evaluatedPeriod,
    dimensions: {
      programming,
      execution,
      followUp,
      evidence,
      continuity,
    },
    counters,
    latestAction,
    findings,
  };
}
