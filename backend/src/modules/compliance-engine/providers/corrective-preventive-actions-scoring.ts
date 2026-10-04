/**
 * Núcleo PURO de scoring del estándar 7.1.1 — Acciones preventivas y
 * correctivas (ACTUAR).
 *
 * Sin Mongo/Mongoose/NestJS/servicios/queries: recibe únicamente datos
 * serializables (ya consultados tenant-scoped por el provider) y devuelve un
 * breakdown completo (dimensions/counters/findings). Patrón:
 * copasst-audit-planning-scoring.ts (6.1.4) / annual-audit-scoring.ts (6.1.2).
 *
 * DECISIONES FUNCIONALES (Etapa E2 — provider oficial de 7.1.1):
 *  - Fuente oficial: colección CorrectivePreventiveAction (dominio propio E1).
 *    AccountabilityCommitment (proxy legacy), AccountabilityMeeting, AnnualAudit,
 *    Incident, CopasstPeriod y ManagementReviewDirection NO participan del
 *    score (frontera 7.1.1 ↔ 2.6.1 / 6.1.2 / 6.1.3 / 7.1.3; origin/
 *    originReferenceId son declarativos y NUNCA disparan consultas cruzadas).
 *  - 7.1.1 mide la GESTIÓN del portafolio de acciones (asignación → ejecución →
 *    evidencia → eficacia → continuidad). NO mide la cantidad de acciones
 *    creadas (más acciones no es mejor cumplimiento) NI re-puntúa resultados
 *    de otros estándares.
 *  - D1–D4 se evalúan sobre el CONJUNTO de acciones evaluables (portafolio,
 *    no solo la más reciente: la unidad del dominio es la acción atómica).
 *    D5 (continuidad) usa las vigencias (años de dueDate) de todas las
 *    evaluables.
 *  - OVERDUE es DERIVADO (dueDate < now AND status no terminal): NUNCA se
 *    persiste y NUNCA se recibe como estado (patrón FASE 9 / 6.1.4).
 *  - COMPLETED ≠ eficacia verificada: D4 exige verificación registrada
 *    (verified + result + verificador + fecha) para las acciones completadas.
 *  - NO_DATA solo cuando el tenant NO tiene ninguna acción ('no-actions').
 *    Acciones existentes pero incompletas = dominio real con bajo cumplimiento
 *    (percentage bajo, findings accionables) — NUNCA NO_DATA.
 *  - D5 (continuidad): 0 vigencias → 0; 1 vigencia → null (se REDISTRIBUYE —
 *    no se exige historia multiannual a un dominio nuevo, política D6 de
 *    6.1.1–6.1.4); ≥2 vigencias → 1.
 */

export const CPA_ACTIONS_MODULE = 'corrective-preventive-actions';
export const CPA_ACTIONS_STANDARD_CODE = '7.1.1';
export const CPA_ACTIONS_STANDARD_TITLE = 'Acciones preventivas y correctivas';
export const CPA_ACTIONS_FORMULA = 'dimensions:v1';

/** Meta de cumplimiento oficial (patrón 5.1.x / 4.2.x / 6.1.x / 7.1.x). */
export const CPA_ACTIONS_COMPLIANCE_TARGET = 90;

/** Pesos de las 5 dimensiones oficiales (suman exactamente 100). */
export const CPA_ACTIONS_SCORE_WEIGHTS = {
  programming: 20,
  execution: 25,
  evidence: 20,
  effectiveness: 25,
  continuity: 10,
} as const;

/** Estados terminales (espejo del schema del dominio E1). */
const TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED'];

// ── Entrada (serializable; sin tipos de Mongoose) ──

export interface CpaEffectivenessLike {
  verified?: boolean;
  result?: string;
  verifiedByUserId?: unknown;
  verifiedBySnapshot?: string;
  verificationDate?: string | Date;
  observations?: string;
}

export interface CpaEvidenceLike {
  documentId?: unknown;
  documentSnapshot?: string;
  evidenceUrl?: string;
  comment?: string;
}

export interface CpaActionLike {
  _id: string;
  actionCode?: string;
  type?: string;
  title?: string;
  description?: string;
  origin?: string;
  originReferenceId?: unknown;
  finding?: string;
  rootCause?: string;
  actionPlan?: string;
  priority?: string;
  responsibleUserId?: unknown;
  responsibleSnapshot?: string;
  plannedDate?: string | Date;
  dueDate?: string | Date;
  executionDate?: string | Date;
  status?: string;
  evidence?: CpaEvidenceLike;
  effectivenessVerification?: CpaEffectivenessLike;
  closureDate?: string | Date;
  createdAt?: string | Date;
}

export interface CpaActionsScoreInput {
  /** Acciones de la empresa (todas; tenant-scoped). */
  actions: CpaActionLike[];
  /** "Ahora" inyectable para determinismo y tests (default: new Date()). */
  now?: Date;
}

// ── Estructura de salida ──

export interface CpaActionsDimensionDetail {
  /** 0–1; null = NO evaluable (se redistribuye; NUNCA convertir null en 0). */
  ratio: number | null;
  numerator: number | null;
  denominator: number | null;
  weight: number;
  subchecks?: { satisfied: number; total: number };
  [key: string]: unknown;
}

export interface CpaActionsFindingDraft {
  id: string;
  title: string;
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface CpaActionsScoreBreakdown {
  percentage: number;
  noData: boolean;
  /** Causa exacta del NO_DATA (para metadata y tests). */
  noDataReason: 'no-actions' | null;
  /** Vigencia de la acción evaluable más reciente (contexto). */
  evaluatedPeriod: string | null;
  dimensions: {
    programming: CpaActionsDimensionDetail;
    execution: CpaActionsDimensionDetail;
    evidence: CpaActionsDimensionDetail;
    effectiveness: CpaActionsDimensionDetail;
    continuity: CpaActionsDimensionDetail;
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
    actionsWithEffectiveness: number;
    actionsWithoutEffectiveness: number;
    effectiveActions: number;
    ineffectiveActions: number;
    actionsRequiringNewAction: number;
    lastActionDate: string | null;
  };
  latestAction: {
    id: string;
    actionCode: string | null;
    title: string | null;
    type: string | null;
    status: string | null;
    dueDate: string | null;
  } | null;
  findings: CpaActionsFindingDraft[];
}

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
 * indicators/annual-audit/6.1.4: cada scoring lleva su propia copia
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

/** Tipos válidos (espejo ActionItemType del schema E1). */
const VALID_TYPES = ['PREVENTIVE', 'CORRECTIVE', 'IMPROVEMENT'];
/** Orígenes válidos (espejo ActionOrigin del schema E1). */
const VALID_ORIGINS = [
  'AUDIT_6_1_2',
  'MANAGEMENT_REVIEW_6_1_3',
  'INCIDENT_7_1_3',
  'INSPECTION',
  'INDICATOR',
  'LEGAL_MATRIX',
  'OTHER',
];
/** Prioridades válidas (espejo ActionPriority del schema E1). */
const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/**
 * OVERDUE derivado (NUNCA persistido): dueDate pasada y sin estado terminal.
 * Convención exacta del prompt E2 (7.1.1): dueDate < now AND status NOT IN
 * [COMPLETED, CANCELLED].
 */
export function isOverdueAction(a: CpaActionLike, now: Date): boolean {
  if (a.status === 'COMPLETED' || a.status === 'CANCELLED') return false;
  const due = toTime(a.dueDate);
  return !Number.isNaN(due) && due < now.getTime();
}

/**
 * Acción EVALUABLE para scoring: título + descripción + fecha compromiso
 * válida + tipo válido + origen válido (estado no requerido: PENDING es el
 * default del dominio). El resto de brechas (responsable, evidencia,
 * ejecución, eficacia) SON el score — no inhabilidad para evaluar.
 */
export function isEvaluableAction(a: CpaActionLike): boolean {
  if (!truthyText(a.title) || !truthyText(a.description)) return false;
  if (Number.isNaN(toTime(a.dueDate))) return false;
  if (!a.type || !VALID_TYPES.includes(a.type)) return false;
  if (!a.origin || !VALID_ORIGINS.includes(a.origin)) return false;
  return true;
}

/** Evidencia con soporte real: documentId (o snapshot) o URL externa. */
function hasEvidence(a: CpaActionLike): boolean {
  const e = a.evidence;
  if (!e) return false;
  return truthyId(e.documentId) || truthyText(e.documentSnapshot) || truthyText(e.evidenceUrl);
}

/** Verificación de eficacia con trazabilidad real (verificador + fecha). */
function hasDocumentedEffectiveness(a: CpaActionLike): boolean {
  const v = a.effectivenessVerification;
  if (!v) return false;
  const hasVerifier = truthyId(v.verifiedByUserId) || truthyText(v.verifiedBySnapshot);
  const hasDate = !Number.isNaN(toTime(v.verificationDate));
  return v.verified === true && truthyText(v.result) && hasVerifier && hasDate;
}

/** Calcula el score de 7.1.1. Función PURA (determinista, sin efectos). */
export function computeCpaActionsScore(
  input: CpaActionsScoreInput,
): CpaActionsScoreBreakdown {
  const actions = Array.isArray(input.actions) ? input.actions : [];
  const now = input.now ?? new Date();

  // ── Contadores de estado (todas las acciones del tenant) ──
  const pendingActions = actions.filter((a) => a.status === 'PENDING').length;
  const inProgressActions = actions.filter((a) => a.status === 'IN_PROGRESS').length;
  const completedActions = actions.filter((a) => a.status === 'COMPLETED').length;
  const cancelledActions = actions.filter((a) => a.status === 'CANCELLED').length;
  const overdueActions = actions.filter((a) => isOverdueAction(a, now)).length;

  const withExecutionDate = actions.filter((a) => !Number.isNaN(toTime(a.executionDate))).length;
  const withEvidence = actions.filter(hasEvidence).length;
  const withoutEvidence = actions.length - withEvidence;
  const withEffectiveness = actions.filter((a) => a.effectivenessVerification?.verified === true).length;
  const withoutEffectiveness = completedActions - withEffectiveness;
  const effectiveActions = actions.filter(
    (a) => a.effectivenessVerification?.result === 'EFECTIVA',
  ).length;
  const ineffectiveActions = actions.filter(
    (a) => a.effectivenessVerification?.result === 'NO_EFECTIVA',
  ).length;
  const requiringNewAction = actions.filter(
    (a) => a.effectivenessVerification?.result === 'REQUIERE_NUEVA_ACCION',
  ).length;

  // ── Conjunto evaluable (excluye CANCELLED del denominador de gestión: una
  // acción cancelada no es gestión de la acción, es su archivo). ──
  const evaluable = actions.filter((a) => isEvaluableAction(a) && a.status !== 'CANCELLED');

  const noData = actions.length === 0;
  const noDataReason: CpaActionsScoreBreakdown['noDataReason'] =
    actions.length === 0 ? 'no-actions' : null;

  // ── D1 — PROGRAMACIÓN Y ASIGNACIÓN (20) ──
  // Una acción está "asignada" si cumple las 6 condiciones de registro:
  // tipo válido, origen válido, título+descripción, responsable, fecha
  // compromiso y prioridad válida. ratio = acciones completamente asignadas /
  // acciones evaluables (penaliza portafolios parcialmente asignados; sin
  // freebie por existir).
  const assignmentChecks = (a: CpaActionLike): boolean[] => [
    !!a.type && VALID_TYPES.includes(a.type),
    !!a.origin && VALID_ORIGINS.includes(a.origin),
    truthyText(a.title) && truthyText(a.description),
    truthyId(a.responsibleUserId) || truthyText(a.responsibleSnapshot),
    !Number.isNaN(toTime(a.dueDate)),
    !!a.priority && VALID_PRIORITIES.includes(a.priority),
  ];
  const fullyAssigned = evaluable.filter((a) => assignmentChecks(a).every(Boolean)).length;
  const programming: CpaActionsDimensionDetail = {
    ratio: evaluable.length > 0 ? fullyAssigned / evaluable.length : null,
    numerator: evaluable.length > 0 ? fullyAssigned : null,
    denominator: evaluable.length > 0 ? evaluable.length : null,
    weight: CPA_ACTIONS_SCORE_WEIGHTS.programming,
    evaluableActions: evaluable.length,
    fullyAssignedActions: fullyAssigned,
  };

  // ── D2 — EJECUCIÓN Y OPORTUNIDAD (25) ──
  // 4 subcondiciones sobre el portafolio evaluable:
  // (a) ≥1 acción ejecutada (executionDate registrada) — hay ejecución real;
  // (b) ninguna acción vencida sin cierre (overdueActions === 0);
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
  const execution: CpaActionsDimensionDetail = {
    ratio: evaluable.length > 0 ? executionSubchecks.satisfied / executionSubchecks.total : null,
    numerator: evaluable.length > 0 ? executionSubchecks.satisfied : null,
    denominator: evaluable.length > 0 ? executionSubchecks.total : null,
    weight: CPA_ACTIONS_SCORE_WEIGHTS.execution,
    subchecks: executionSubchecks,
    overdueActions,
    actionsWithExecutionDate: withExecutionDate,
  };

  // ── D3 — EVIDENCIA Y TRAZABILIDAD (20) ──
  // 4 subcondiciones sobre el portafolio evaluable:
  // (a) ≥1 acción con evidencia registrada (documentId/evidenceUrl);
  // (b) 100% de las acciones COMPLETED tienen evidencia (soporte del cierre);
  // (c) ≥1 acción con análisis documentado (rootCause o actionPlan);
  // (d) 100% de las acciones con responsable trazable (id o snapshot).
  const completedWithEvidence = evaluable.filter(
    (a) => a.status === 'COMPLETED' && hasEvidence(a),
  ).length;
  const withAnalysis = evaluable.filter(
    (a) => truthyText(a.rootCause) || truthyText(a.actionPlan),
  ).length;
  const withResponsible = evaluable.filter(
    (a) => truthyId(a.responsibleUserId) || truthyText(a.responsibleSnapshot),
  ).length;
  const evidenceSubchecks = (() => {
    if (evaluable.length === 0) return { satisfied: 0, total: 4 };
    const checks = [
      withEvidence >= 1,
      completedTotal === 0 || completedWithEvidence === completedTotal,
      withAnalysis >= 1,
      withResponsible === evaluable.length,
    ];
    return { satisfied: checks.filter(Boolean).length, total: checks.length };
  })();
  const evidence: CpaActionsDimensionDetail = {
    ratio: evaluable.length > 0 ? evidenceSubchecks.satisfied / evidenceSubchecks.total : null,
    numerator: evaluable.length > 0 ? evidenceSubchecks.satisfied : null,
    denominator: evaluable.length > 0 ? evidenceSubchecks.total : null,
    weight: CPA_ACTIONS_SCORE_WEIGHTS.evidence,
    subchecks: evidenceSubchecks,
    actionsWithEvidence: withEvidence,
    completedWithEvidence,
  };

  // ── D4 — VERIFICACIÓN DE EFICACIA (25) — dimensión CENTRAL de 7.1.1 ──
  // 4 subcondiciones sobre las acciones COMPLETED del portafolio evaluable
  // (COMPLETED NO equivale a eficacia verificada):
  // (a) ≥1 verificación documentada (verified + result + verificador + fecha);
  // (b) 100% de las COMPLETED tienen verificación registrada;
  // (c) 100% de las verificaciones tienen trazabilidad (verificador + fecha);
  // (d) 100% de las verificaciones tienen resultado válido (enum).
  const verifiedComplete = evaluable.filter(hasDocumentedEffectiveness).length;
  const completedWithAnyVerification = evaluable.filter(
    (a) => a.effectivenessVerification?.verified === true,
  ).length;
  const verifications = evaluable
    .map((a) => a.effectivenessVerification)
    .filter((v): v is CpaEffectivenessLike => !!v && v.verified === true);
  const verificationsTraceable = verifications.filter(
    (v) =>
      (truthyId(v.verifiedByUserId) || truthyText(v.verifiedBySnapshot)) &&
      !Number.isNaN(toTime(v.verificationDate)),
  ).length;
  const verificationsWithResult = verifications.filter(
    (v) => truthyText(v.result) && ['EFECTIVA', 'NO_EFECTIVA', 'REQUIERE_NUEVA_ACCION'].includes(v.result as string),
  ).length;
  const effectivenessSubchecks = (() => {
    if (evaluable.length === 0) return { satisfied: 0, total: 4 };
    const checks = [
      verifiedComplete >= 1,
      completedTotal === 0 || completedWithAnyVerification === completedTotal,
      verifications.length === 0 || verificationsTraceable === verifications.length,
      verifications.length === 0 || verificationsWithResult === verifications.length,
    ];
    return { satisfied: checks.filter(Boolean).length, total: checks.length };
  })();
  const effectiveness: CpaActionsDimensionDetail = {
    ratio: evaluable.length > 0 ? effectivenessSubchecks.satisfied / effectivenessSubchecks.total : null,
    numerator: evaluable.length > 0 ? effectivenessSubchecks.satisfied : null,
    denominator: evaluable.length > 0 ? effectivenessSubchecks.total : null,
    weight: CPA_ACTIONS_SCORE_WEIGHTS.effectiveness,
    subchecks: effectivenessSubchecks,
    completedActions: completedTotal,
    verifiedComplete,
    effectiveActions,
    ineffectiveActions,
    actionsRequiringNewAction: requiringNewAction,
  };

  // ── D5 — CICLO Y CONTINUIDAD (10) ──
  // Continuidad temporal REAL de la gestión (años distintos de dueDate de las
  // acciones evaluables): 0 vigencias → 0; 1 vigencia → null (se REDISTRIBUYE
  // — no se exige historia multiannual, política D6); ≥2 vigencias → 1.
  const distinctYears = new Set<string>();
  for (const a of evaluable) {
    const due = toTime(a.dueDate);
    if (!Number.isNaN(due)) {
      distinctYears.add(String(new Date(due).getUTCFullYear()));
    }
  }
  const continuity: CpaActionsDimensionDetail = {
    ratio: distinctYears.size >= 2 ? 1 : distinctYears.size === 1 ? null : 0,
    numerator: distinctYears.size >= 2 ? 2 : null,
    denominator: distinctYears.size >= 2 ? 2 : null,
    weight: CPA_ACTIONS_SCORE_WEIGHTS.continuity,
    distinctDueYears: distinctYears.size,
    evaluableActions: evaluable.length,
    limitation:
      'La dimensión de continuidad evalúa la cobertura temporal de la gestión de acciones; ' +
      'con una sola vigencia se redistribuye (no se exige historia multiannual).',
  };

  const w = CPA_ACTIONS_SCORE_WEIGHTS;
  const percentage = noData
    ? 0
    : redistributeWeightedScore([
        { ratio: programming.ratio, weight: w.programming },
        { ratio: execution.ratio, weight: w.execution },
        { ratio: evidence.ratio, weight: w.evidence },
        { ratio: effectiveness.ratio, weight: w.effectiveness },
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
        type: latestEvaluable.type ?? null,
        status: latestEvaluable.status ?? null,
        dueDate: !Number.isNaN(toTime(latestEvaluable.dueDate))
          ? new Date(toTime(latestEvaluable.dueDate)).toISOString()
          : null,
      }
    : null;

  // ── Counters globales ──
  const counters: CpaActionsScoreBreakdown['counters'] = {
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
    actionsWithEffectiveness: withEffectiveness,
    actionsWithoutEffectiveness: Math.max(0, withoutEffectiveness),
    effectiveActions,
    ineffectiveActions,
    actionsRequiringNewAction: requiringNewAction,
    lastActionDate:
      latestEvaluable && !Number.isNaN(toTime(latestEvaluable.dueDate))
        ? new Date(toTime(latestEvaluable.dueDate)).toISOString()
        : null,
  };

  // ── Findings oficiales (solo lo demostrable desde los datos) ──
  const findings: CpaActionsFindingDraft[] = [];
  if (noData) {
    findings.push({
      id: 'corrective-preventive-actions-no-data',
      title: 'Sin acciones preventivas/correctivas registradas',
      description:
        'No existe gestión registrada de acciones preventivas y correctivas. El estándar 7.1.1 requiere acciones definidas, ejecutadas y verificadas con responsables y fechas trazables.',
      priority: 'HIGH',
    });
  } else if (evaluable.length === 0) {
    findings.push({
      id: 'corrective-preventive-actions-incomplete-assignment',
      title: 'Sin acciones evaluables',
      description: `Existen ${actions.length} acción(es) registrada(s) pero ninguna cumple las condiciones mínimas de evaluación (título, descripción, fecha compromiso, tipo y origen válidos).`,
      priority: 'HIGH',
    });
  } else {
    if (fullyAssigned < evaluable.length) {
      findings.push({
        id: 'corrective-preventive-actions-incomplete-assignment',
        title: 'Acciones con asignación incompleta',
        description: `${evaluable.length - fullyAssigned} de ${evaluable.length} acción(es) evaluable(s) carece(n) de alguna condición de asignación (tipo, origen, título/descripción, responsable, fecha compromiso o prioridad).`,
        priority: fullyAssigned === 0 ? 'HIGH' : 'MEDIUM',
      });
    }
    if (overdueActions > 0) {
      findings.push({
        id: 'corrective-preventive-actions-overdue',
        title: `${overdueActions} acción(es) vencida(s) sin cierre`,
        description:
          'Existen acciones cuya fecha compromiso ya pasó sin estado terminal (COMPLETED/CANCELLED). Ejecute, complete o reprograme estas acciones.',
        priority: 'HIGH',
      });
    }
    if (withoutEvidence > 0 || (completedTotal > 0 && completedWithEvidence < completedTotal)) {
      findings.push({
        id: 'corrective-preventive-actions-no-evidence',
        title: 'Evidencia de ejecución insuficiente',
        description: `${withoutEvidence} acción(es) sin evidencia registrada${completedTotal > completedWithEvidence ? ` y ${completedTotal - completedWithEvidence} acción(es) COMPLETED sin soporte documental o URL` : ''}. Registre documentId (DocumentManagement) o evidenceUrl en cada acción.`,
        priority: 'MEDIUM',
      });
    }
    if (completedTotal > 0 && completedWithAnyVerification < completedTotal) {
      findings.push({
        id: 'corrective-preventive-actions-effectiveness-unverified',
        title: 'Eficacia sin verificar en acciones completadas',
        description: `${completedTotal - completedWithAnyVerification} de ${completedTotal} acción(es) COMPLETED no tienen verificación de eficacia registrada (verified + resultado + verificador + fecha). La verificación de eficacia es componente central del estándar 7.1.1.`,
        priority: 'HIGH',
      });
    }
    if (withAnalysis < evaluable.length) {
      findings.push({
        id: 'corrective-preventive-actions-traceability-incomplete',
        title: 'Trazabilidad del análisis incompleta',
        description: `${evaluable.length - withAnalysis} acción(es) sin causa raíz ni plan de acción documentado. Documente rootCause/actionPlan para rastrear el análisis que motiva cada acción.`,
        priority: 'MEDIUM',
      });
    }
    if (ineffectiveActions + requiringNewAction > 0) {
      findings.push({
        id: 'corrective-preventive-actions-ineffective',
        title: 'Acciones con resultado de eficacia negativo',
        description: `${ineffectiveActions} acción(es) verificada(s) como NO_EFECTIVA y ${requiringNewAction} que REQUIEREN_NUEVA_ACCION. Registre nuevas acciones correctivas derivadas para cerrar la recurrencia.`,
        priority: 'MEDIUM',
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
      evidence,
      effectiveness,
      continuity,
    },
    counters,
    latestAction,
    findings,
  };
}
