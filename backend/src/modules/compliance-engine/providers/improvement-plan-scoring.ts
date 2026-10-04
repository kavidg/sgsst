/**
 * E2 (7.1.4) — SCORER PURO del PLAN DE MEJORAMIENTO (improvement-plan).
 *
 * - FUNCIÓN PURA: sin Mongo, sin NestJS, sin HTTP, sin request, sin companyId;
 *   determinista con `now` inyectable (patrón corrective-preventive-actions-
 *   scoring.ts / management-improvement-actions-scoring.ts / incident-actions-
 *   scoring.ts). El provider transporta y adapta; el scorer es la ÚNICA fuente
 *   matemática del score de 7.1.4.
 * - Fórmula `dimensions:v1`, target 90. Pesos: structure 15 / planning 25 /
 *   execution 20 / monitoring 15 / evidenceAndClosure 15 / continuity 10
 *   (suma exacta 100).
 * - El estándar evalúa el PLAN COMO SISTEMA DE GESTIÓN (identificación,
 *   priorización, objetivos/metas/indicadores, cronograma, responsables,
 *   recursos, ejecución, seguimiento periódico, evidencia y cierre) — NO la
 *   existencia del plan (proxy existencial retirado en E2) ni acciones que
 *   pertenecen a otros estándares.
 * - FRONTERAS (sin doble scoring):
 *   · origin ACCIDENT NO evalúa la investigación del accidente (7.1.3);
 *   · origin MANAGEMENT_REVIEW NO evalúa la revisión por la dirección (6.1.3);
 *   · origin AUDIT NO evalúa la auditoría (6.1.2);
 *   · NO consulta CorrectivePreventiveAction (7.1.1) ni
 *     ManagementImprovementAction (7.1.2): el scorer evalúa la CALIDAD Y
 *     GESTIÓN del plan creado a partir del origen, jamás el contenido del
 *     origen. origin/originReferenceId son trazabilidad declarativa.
 *   · NO consume SgstProgram/ProgramActivity (dominio `programs`, independiente).
 * - OVERDUE derivado (NUNCA persistido): actividad con dueDate < now y estado
 *   no terminal; plan con endDate < now y estado no terminal.
 * - NO_DATA SOLO cuando no existen planes evaluables (reason
 *   'no-evaluable-plans'); planes deficientes producen score real con findings.
 * - Continuidad: 0 años → 0; 1 año → null (se REDISTRIBUYE — nunca castiga a
 *   una empresa con un solo año); ≥2 años → 1 (patrón oficial 7.1.1/7.1.2).
 */

// ── Contrato del dominio (Lean docs; ObjectIds llegan como ObjectId-like) ──

export interface IpEvidenceLike {
  documentId?: unknown;
  documentSnapshot?: string;
  evidenceUrl?: string;
  comment?: string;
}

export interface IpFollowUpLike {
  followUpDate?: string | Date;
  observations?: string;
  implementationStatus?: string;
  perceivedEffectiveness?: string;
  requiresContinuedFollowUp?: boolean;
}

export interface IpActivityLike {
  activityId?: string;
  description?: string;
  responsibleUserId?: unknown;
  responsibleUserSnapshot?: string;
  plannedDate?: string | Date;
  dueDate?: string | Date;
  executionDate?: string | Date;
  status?: string;
  progress?: number;
  evidence?: IpEvidenceLike;
  observations?: string;
  followUp?: IpFollowUpLike;
}

export interface IpObjectiveLike {
  objectiveId?: string;
  description?: string;
  target?: string;
  indicator?: string;
  observations?: string;
}

export interface IpMonitoringLike {
  monitoringId?: string;
  date?: string | Date;
  progress?: number;
  deviations?: string;
  adjustmentActions?: string;
  observations?: string;
}

export interface IpPlanLike {
  _id: unknown;
  companyId?: unknown;
  code?: string;
  title?: string;
  description?: string;
  period?: string;
  year?: number;
  responsibleUserId?: unknown;
  responsibleUserSnapshot?: string;
  origin?: string;
  originReferenceId?: unknown;
  originDescription?: string;
  priority?: string;
  prioritizationCriteria?: string;
  objectives?: IpObjectiveLike[];
  activities?: IpActivityLike[];
  resources?: Array<{ type?: string; description?: string; observations?: string }>;
  monitoring?: IpMonitoringLike[];
  startDate?: string | Date;
  endDate?: string | Date;
  status?: string;
  closureDate?: string | Date;
  closedByUserId?: unknown;
  closedByUserSnapshot?: string;
  closureObservations?: string;
  createdAt?: string | Date;
}

export interface IpPlansScoreInput {
  plans: IpPlanLike[];
  /** "Ahora" inyectable para determinismo y tests (default: new Date()). */
  now?: Date;
}

// ── Estructura de salida ──

export interface IpDimensionDetail {
  /** 0–1; null = NO evaluable (se redistribuye; NUNCA convertir null en 0). */
  ratio: number | null;
  numerator: number | null;
  denominator: number | null;
  weight: number;
  subchecks?: { satisfied: number; total: number };
  [key: string]: unknown;
}

export interface IpFindingDraft {
  id: string;
  title: string;
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface IpScoreBreakdown {
  percentage: number;
  noData: boolean;
  /** Causa exacta del NO_DATA (para metadata y tests). */
  noDataReason: 'no-evaluable-plans' | null;
  /** Período evaluado (años derivados de los planes evaluables). */
  evaluatedPeriod: string | null;
  dimensions: {
    structure: IpDimensionDetail;
    planning: IpDimensionDetail;
    execution: IpDimensionDetail;
    monitoring: IpDimensionDetail;
    evidenceAndClosure: IpDimensionDetail;
    continuity: IpDimensionDetail;
  };
  counters: {
    totalPlans: number;
    evaluablePlans: number;
    draftPlans: number;
    submittedPlans: number;
    inProgressPlans: number;
    completedPlans: number;
    closedPlans: number;
    cancelledPlans: number;
    overduePlans: number;
    totalActivities: number;
    completedActivities: number;
    pendingActivities: number;
    inProgressActivities: number;
    cancelledActivities: number;
    overdueActivities: number;
    activitiesWithEvidence: number;
    activitiesWithoutEvidence: number;
    plansWithObjectives: number;
    plansWithoutObjectives: number;
    plansWithIndicators: number;
    plansWithoutIndicators: number;
    plansWithMonitoring: number;
    plansWithoutMonitoring: number;
    plansWithResources: number;
    plansWithoutResources: number;
    plansWithFollowUp: number;
    plansWithoutFollowUp: number;
    plansClosed: number;
    plansNotClosed: number;
    lastPlanDate: string | null;
  };
  latestPlan: {
    id: string;
    code: string | null;
    title: string | null;
    period: string | null;
    year: number | null;
    status: string | null;
    endDate: string | null;
  } | null;
  findings: IpFindingDraft[];
}

// ── Constantes oficiales del estándar 7.1.4 ──

export const IP_PLAN_MODULE = 'improvement-plan';
export const IP_PLAN_STANDARD_CODE = '7.1.4';
export const IP_PLAN_STANDARD_TITLE = 'Plan de mejoramiento';
export const IP_PLAN_FORMULA = 'dimensions:v1';
export const IP_PLAN_COMPLIANCE_TARGET = 90;

/** Pesos oficiales de las dimensiones (suma exacta 100). */
export const IP_PLAN_SCORE_WEIGHTS = {
  structure: 15,
  planning: 25,
  execution: 20,
  monitoring: 15,
  evidenceAndClosure: 15,
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

/** Orígenes válidos (espejo ImprovementPlanOrigin del schema E1). */
const VALID_ORIGINS = [
  'SELF_ASSESSMENT',
  'AUDIT',
  'INSPECTION',
  'ACCIDENT',
  'MANAGEMENT_REVIEW',
  'INDICATOR',
  'LEGAL_REQUIREMENT',
  'OTHER',
];
/** Prioridades válidas (espejo ImprovementPlanPriority del schema E1). */
const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
/** Estados del plan válidos (espejo ImprovementPlanStatus del schema E1). */
const VALID_PLAN_STATUSES = ['DRAFT', 'SUBMITTED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'CANCELLED'];

/**
 * OVERDUE derivado de ACTIVIDAD (NUNCA persistido): dueDate pasada y sin
 * estado terminal. Una actividad COMPLETED/CANCELLED nunca aparece como
 * vencida aunque su dueDate haya pasado.
 */
export function isImprovementPlanActivityOverdue(a: IpActivityLike, now: Date): boolean {
  if (a.status === 'COMPLETED' || a.status === 'CANCELLED') return false;
  const due = toTime(a.dueDate);
  return !Number.isNaN(due) && due < now.getTime();
}

/**
 * OVERDUE derivado del PLAN (NUNCA persistido): endDate pasada y estado no
 * terminal (DRAFT/SUBMITTED/IN_PROGRESS).
 */
export function isImprovementPlanOverdue(p: IpPlanLike, now: Date): boolean {
  if (p.status === 'COMPLETED' || p.status === 'CLOSED' || p.status === 'CANCELLED') return false;
  const end = toTime(p.endDate);
  return !Number.isNaN(end) && end < now.getTime();
}

/**
 * Año derivado del plan (determinístico): year explícito → año de 4 dígitos
 * dentro del texto de period → año de startDate. Garantiza que toda plan
 * evaluable tenga un año para continuidad/evaluatedPeriod.
 */
export function derivePlanYear(p: IpPlanLike): number | null {
  if (typeof p.year === 'number' && Number.isFinite(p.year) && p.year >= 1900 && p.year <= 2999) {
    return p.year;
  }
  if (truthyText(p.period)) {
    const m = p.period.match(/\b(19|20)\d{2}\b/);
    if (m) return Number(m[0]);
  }
  const start = new Date(toTime(p.startDate) || (typeof p.startDate === 'string' ? Date.parse(p.startDate) : NaN));
  const t = toTime(p.startDate);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    const y = d.getUTCFullYear();
    if (y >= 1900 && y <= 2999) return y;
  }
  void start;
  return null;
}

/**
 * Plan EVALUABLE para scoring: título + período/año (explícito o derivable de
 * fechas) + responsable + origen válido + prioridad válida + al menos una
 * actividad u objetivo significativo (política de evaluabilidad del prompt
 * E2.7 — NUNCA `plans.length > 0` como única condición).
 */
export function isEvaluableImprovementPlan(p: IpPlanLike): boolean {
  if (!truthyText(p.title)) return false;
  const hasPeriod =
    (typeof p.year === 'number' && Number.isFinite(p.year)) ||
    truthyText(p.period) ||
    !Number.isNaN(toTime(p.startDate));
  if (!hasPeriod) return false;
  const hasResponsible = truthyId(p.responsibleUserId) || truthyText(p.responsibleUserSnapshot);
  if (!hasResponsible) return false;
  if (!truthyText(p.origin) || !VALID_ORIGINS.includes(p.origin)) return false;
  if (!truthyText(p.priority) || !VALID_PRIORITIES.includes(p.priority)) return false;
  const meaningful =
    (p.activities?.length ?? 0) > 0 || (p.objectives?.length ?? 0) > 0;
  return meaningful;
}

/** Evidencia "presente": documentId (ObjectId-like) o evidenceUrl. */
function hasEvidence(e: IpEvidenceLike | undefined): boolean {
  if (!e) return false;
  return truthyId(e.documentId) || truthyText(e.evidenceUrl);
}

/** CANCELLED "documentada": tiene observaciones o follow-up (regla E2.5.3). */
function isDocumentedCancellation(a: IpActivityLike): boolean {
  return truthyText(a.observations) || !!a.followUp;
}

/**
 * Copia local del helper oficial de redistribución (patrón epp/maintenance/
 * indicators/annual-audit/6.1.4/7.1.1/7.1.2/7.1.3: cada scoring lleva su
 * propia copia desacoplada). Solo las dimensiones con ratio finito 0–1
 * participan del denominador.
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

// ── Dimensiones (por plan evaluable; promedio de subchecks/ratios) ──

/**
 * STRUCTURE — identificación y contextualización del plan (6 subchecks):
 * código, descripción, período/año, priorización, origen referenciado
 * (originDescription u originReferenceId), origen válido+responsable ya
 * exigidos por evaluabilidad → aquí se premia el detalle adicional.
 */
function structureRatioPerPlan(p: IpPlanLike): { ratio: number; satisfied: number; total: number } {
  const checks = [
    truthyText(p.code),
    truthyText(p.description),
    truthyText(p.period) || (typeof p.year === 'number' && Number.isFinite(p.year)),
    truthyText(p.prioritizationCriteria),
    truthyText(p.originDescription) || truthyId(p.originReferenceId),
    truthyText(p.responsibleUserSnapshot) || truthyId(p.responsibleUserId),
  ];
  const satisfied = checks.filter(Boolean).length;
  return { ratio: satisfied / checks.length, satisfied, total: checks.length };
}

/**
 * PLANNING — consolidación del plan (7 subchecks): objetivos, metas,
 * indicadores, actividades, responsables de actividades, cronograma de
 * actividades y recursos. Es la dimensión de mayor peso porque el
 * modeReview exige "plan consolidado, priorización, cronograma, responsables
 * e indicadores".
 */
function planningRatioPerPlan(p: IpPlanLike): { ratio: number; satisfied: number; total: number } {
  const activities = p.activities ?? [];
  const objectives = p.objectives ?? [];
  const checks = [
    objectives.length > 0,
    objectives.some((o) => truthyText(o.target)),
    objectives.some((o) => truthyText(o.indicator)),
    activities.length > 0,
    activities.length > 0 && activities.every((a) => truthyId(a.responsibleUserId) || truthyText(a.responsibleUserSnapshot)),
    activities.length > 0 &&
      activities.every((a) => !Number.isNaN(toTime(a.plannedDate)) || !Number.isNaN(toTime(a.dueDate))),
    (p.resources?.length ?? 0) > 0,
  ];
  const satisfied = checks.filter(Boolean).length;
  return { ratio: satisfied / checks.length, satisfied, total: checks.length };
}

/**
 * EXECUTION — gestión de la ejecución (5 subchecks por plan con actividades):
 * ≥1 completada, sin vencidas, completadas con executionDate, activas con
 * dueDate y sin cancelaciones sin documentar. Regla CANCELLED (E2.5.3): las
 * actividades CANCELLED no cuentan como completadas; salen de la penalización
 * solo si su cancelación está documentada (observaciones o follow-up) — una
 * cancelación sin gestión sí penaliza la ejecución. Un plan sin actividades
 * no demuestra ejecución → 0.
 */
function executionRatioPerPlan(p: IpPlanLike, now: Date): { ratio: number; satisfied: number; total: number } {
  const activities = p.activities ?? [];
  if (activities.length === 0) return { ratio: 0, satisfied: 0, total: 5 };
  const completed = activities.filter((a) => a.status === 'COMPLETED');
  const active = activities.filter((a) => a.status === 'PENDING' || a.status === 'IN_PROGRESS');
  const checks = [
    completed.length > 0,
    activities.every((a) => !isImprovementPlanActivityOverdue(a, now)),
    completed.every((a) => !Number.isNaN(toTime(a.executionDate))),
    active.every((a) => !Number.isNaN(toTime(a.dueDate))),
    activities.every((a) => a.status !== 'CANCELLED' || isDocumentedCancellation(a)),
  ];
  const satisfied = checks.filter(Boolean).length;
  return { ratio: satisfied / checks.length, satisfied, total: checks.length };
}

/** MONITORING — seguimiento periódico del plan como entidad independiente. */
function monitoringRatioPerPlan(p: IpPlanLike): { ratio: number; satisfied: boolean } {
  const satisfied = (p.monitoring?.length ?? 0) > 0;
  return { ratio: satisfied ? 1 : 0, satisfied };
}

/**
 * EVIDENCE AND CLOSURE — trazabilidad documental y cierre (4 subchecks):
 * ≥1 actividad con evidencia, completadas con evidencia, plan en fase de
 * cierre (COMPLETED/CLOSED) y cierre documentado completo (CLOSED con fecha
 * y responsable de cierre).
 */
function evidenceClosureRatioPerPlan(p: IpPlanLike): { ratio: number; satisfied: number; total: number } {
  const activities = p.activities ?? [];
  const completed = activities.filter((a) => a.status === 'COMPLETED');
  const checks = [
    activities.some((a) => hasEvidence(a.evidence)),
    completed.length > 0 && completed.every((a) => hasEvidence(a.evidence)),
    p.status === 'COMPLETED' || p.status === 'CLOSED',
    p.status === 'CLOSED' &&
      !Number.isNaN(toTime(p.closureDate)) &&
      (truthyId(p.closedByUserId) || truthyText(p.closedByUserSnapshot)),
  ];
  const satisfied = checks.filter(Boolean).length;
  return { ratio: satisfied / checks.length, satisfied, total: checks.length };
}

/** Promedio de ratios por plan (denominador = planes evaluables). */
function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Number.isFinite(mean) ? Math.min(1, Math.max(0, mean)) : null;
}

function buildDimension(
  weight: number,
  perPlan: Array<{ ratio: number; satisfied: number; total: number }>,
): IpDimensionDetail {
  const ratios = perPlan.map((r) => r.ratio);
  const ratio = average(ratios);
  const satisfied = perPlan.reduce((s, r) => s + r.satisfied, 0);
  const total = perPlan.reduce((s, r) => s + r.total, 0);
  return {
    ratio,
    numerator: ratio === null ? null : Math.round(ratio * 1000) / 1000,
    denominator: ratios.length > 0 ? 1 : null,
    weight,
    subchecks: total > 0 ? { satisfied, total } : undefined,
  };
}

// ── Scorer principal ──

/**
 * Calcula el score OFICIAL de 7.1.4. Determinista: mismo input + mismo `now`
 * → mismo resultado (sin Date.now() interno, sin Math.random, sin iteración
 * dependiente de orden salvo desempates explícitos por _id).
 */
export function computeImprovementPlanScore(input: IpPlansScoreInput): IpScoreBreakdown {
  const now = input.now ?? new Date();
  const plans = input.plans ?? [];
  const evaluable = plans.filter(isEvaluableImprovementPlan);

  // ── Counters (hechos operativos sobre TODOS los planes; planesWith* sobre
  // evaluables porque alimentan findings del score) ──
  const statusCount = (s: string) => plans.filter((p) => p.status === s).length;
  const allActivities = plans.flatMap((p) => p.activities ?? []);
  const overdueActivities = allActivities.filter((a) => isImprovementPlanActivityOverdue(a, now)).length;
  const overduePlans = plans.filter((p) => isImprovementPlanOverdue(p, now)).length;

  const evaluableWith = (pred: (p: IpPlanLike) => boolean) => evaluable.filter(pred).length;
  const plansWithIndicators = evaluableWith(
    (p) => (p.objectives ?? []).some((o) => truthyText(o.indicator)),
  );

  const years = Array.from(
    new Set(evaluable.map(derivePlanYear).filter((y): y is number => y !== null)),
  ).sort((a, b) => a - b);

  // latestPlan determinístico: mayor año derivado → mayor startDate → mayor
  // createdAt → mayor _id (desempates explícitos, sin orden accidental de Mongo).
  let latestPlan: IpScoreBreakdown['latestPlan'] = null;
  if (evaluable.length > 0) {
    const sorted = [...evaluable].sort((a, b) => {
      const ya = derivePlanYear(a) ?? 0;
      const yb = derivePlanYear(b) ?? 0;
      if (ya !== yb) return yb - ya;
      const ta = toTime(a.startDate);
      const tb = toTime(b.startDate);
      if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return tb - ta;
      const ca = toTime(a.createdAt);
      const cb = toTime(b.createdAt);
      if (!Number.isNaN(ca) && !Number.isNaN(cb) && ca !== cb) return cb - ca;
      return String(b._id ?? '').localeCompare(String(a._id ?? ''));
    });
    const p = sorted[0];
    const endT = toTime(p.endDate);
    latestPlan = {
      id: String(p._id),
      code: truthyText(p.code) ? p.code : null,
      title: truthyText(p.title) ? p.title : null,
      period: truthyText(p.period) ? p.period : null,
      year: derivePlanYear(p),
      status: truthyText(p.status) ? p.status : null,
      endDate: !Number.isNaN(endT) ? new Date(endT).toISOString() : null,
    };
  }

  const counters: IpScoreBreakdown['counters'] = {
    totalPlans: plans.length,
    evaluablePlans: evaluable.length,
    draftPlans: statusCount('DRAFT'),
    submittedPlans: statusCount('SUBMITTED'),
    inProgressPlans: statusCount('IN_PROGRESS'),
    completedPlans: statusCount('COMPLETED'),
    closedPlans: statusCount('CLOSED'),
    cancelledPlans: statusCount('CANCELLED'),
    overduePlans,
    totalActivities: allActivities.length,
    completedActivities: allActivities.filter((a) => a.status === 'COMPLETED').length,
    pendingActivities: allActivities.filter((a) => a.status === 'PENDING').length,
    inProgressActivities: allActivities.filter((a) => a.status === 'IN_PROGRESS').length,
    cancelledActivities: allActivities.filter((a) => a.status === 'CANCELLED').length,
    overdueActivities,
    activitiesWithEvidence: allActivities.filter((a) => hasEvidence(a.evidence)).length,
    activitiesWithoutEvidence: allActivities.filter((a) => !hasEvidence(a.evidence)).length,
    plansWithObjectives: evaluableWith((p) => (p.objectives ?? []).length > 0),
    plansWithoutObjectives: evaluable.length - evaluableWith((p) => (p.objectives ?? []).length > 0),
    plansWithIndicators,
    plansWithoutIndicators: evaluable.length - plansWithIndicators,
    plansWithMonitoring: evaluableWith((p) => (p.monitoring ?? []).length > 0),
    plansWithoutMonitoring: evaluable.length - evaluableWith((p) => (p.monitoring ?? []).length > 0),
    plansWithResources: evaluableWith((p) => (p.resources ?? []).length > 0),
    plansWithoutResources: evaluable.length - evaluableWith((p) => (p.resources ?? []).length > 0),
    plansWithFollowUp: evaluableWith((p) => (p.activities ?? []).some((a) => !!a.followUp)),
    plansWithoutFollowUp: evaluable.length - evaluableWith((p) => (p.activities ?? []).some((a) => !!a.followUp)),
    plansClosed: statusCount('CLOSED'),
    plansNotClosed: plans.length - statusCount('CLOSED'),
    lastPlanDate: latestPlan?.endDate ?? null,
  };

  // ── NO_DATA: SOLO cuando no existen planes evaluables. Planes deficientes
  // producen score real con findings (NUNCA se convierten en NO_DATA). ──
  if (evaluable.length === 0) {
    return {
      percentage: 0,
      noData: true,
      noDataReason: 'no-evaluable-plans',
      evaluatedPeriod: null,
      dimensions: {
        structure: { ratio: null, numerator: null, denominator: null, weight: IP_PLAN_SCORE_WEIGHTS.structure },
        planning: { ratio: null, numerator: null, denominator: null, weight: IP_PLAN_SCORE_WEIGHTS.planning },
        execution: { ratio: null, numerator: null, denominator: null, weight: IP_PLAN_SCORE_WEIGHTS.execution },
        monitoring: { ratio: null, numerator: null, denominator: null, weight: IP_PLAN_SCORE_WEIGHTS.monitoring },
        evidenceAndClosure: { ratio: null, numerator: null, denominator: null, weight: IP_PLAN_SCORE_WEIGHTS.evidenceAndClosure },
        continuity: { ratio: null, numerator: null, denominator: null, weight: IP_PLAN_SCORE_WEIGHTS.continuity },
      },
      counters,
      latestPlan,
      findings: [
        {
          id: 'improvement-plan-no-data',
          title: 'Sin planes de mejoramiento evaluables',
          description:
            'No existen planes de mejoramiento evaluables para 7.1.4 (título, período, responsable, origen, prioridad y al menos una actividad u objetivo). El estándar requiere un plan consolidado con seguimiento y cierre documentado.',
          priority: 'HIGH',
        },
      ],
    };
  }

  // ── Dimensiones ──
  const structurePerPlan = evaluable.map(structureRatioPerPlan);
  const planningPerPlan = evaluable.map(planningRatioPerPlan);
  const executionPerPlan = evaluable.map((p) => executionRatioPerPlan(p, now));
  const monitoringPerPlan = evaluable.map(monitoringRatioPerPlan);
  const evidencePerPlan = evaluable.map(evidenceClosureRatioPerPlan);

  // Continuity (regla oficial): 0 años → 0; 1 año → null (redistribución —
  // NUNCA castiga a una empresa con un solo año); ≥2 años → 1.
  const continuityRatio = years.length >= 2 ? 1 : years.length === 1 ? null : 0;

  const dimensions: IpScoreBreakdown['dimensions'] = {
    structure: buildDimension(IP_PLAN_SCORE_WEIGHTS.structure, structurePerPlan),
    planning: buildDimension(IP_PLAN_SCORE_WEIGHTS.planning, planningPerPlan),
    execution: buildDimension(IP_PLAN_SCORE_WEIGHTS.execution, executionPerPlan),
    monitoring: {
      ratio: average(monitoringPerPlan.map((m) => m.ratio)),
      numerator: monitoringPerPlan.filter((m) => m.satisfied).length,
      denominator: monitoringPerPlan.length,
      weight: IP_PLAN_SCORE_WEIGHTS.monitoring,
    },
    evidenceAndClosure: buildDimension(IP_PLAN_SCORE_WEIGHTS.evidenceAndClosure, evidencePerPlan),
    continuity: {
      ratio: continuityRatio,
      numerator: years.length,
      denominator: null,
      weight: IP_PLAN_SCORE_WEIGHTS.continuity,
    },
  };

  const percentage = redistributeWeightedScore([
    { ratio: dimensions.structure.ratio, weight: IP_PLAN_SCORE_WEIGHTS.structure },
    { ratio: dimensions.planning.ratio, weight: IP_PLAN_SCORE_WEIGHTS.planning },
    { ratio: dimensions.execution.ratio, weight: IP_PLAN_SCORE_WEIGHTS.execution },
    { ratio: dimensions.monitoring.ratio, weight: IP_PLAN_SCORE_WEIGHTS.monitoring },
    { ratio: dimensions.evidenceAndClosure.ratio, weight: IP_PLAN_SCORE_WEIGHTS.evidenceAndClosure },
    { ratio: dimensions.continuity.ratio, weight: IP_PLAN_SCORE_WEIGHTS.continuity },
  ]);

  const evaluatedPeriod =
    years.length === 0
      ? null
      : years.length === 1
        ? String(years[0])
        : `${years[0]}–${years[years.length - 1]}`;

  // ── Findings (estables y determinísticos) ──
  const findings: IpFindingDraft[] = [];
  const push = (
    id: string,
    title: string,
    description: string,
    priority: 'HIGH' | 'MEDIUM' | 'LOW',
  ) => findings.push({ id, title, description, priority });

  const incompleteStructure = structurePerPlan.filter((r) => r.ratio < 1).length;
  if (incompleteStructure > 0) {
    const withoutPrioritization = evaluable.filter((p) => !truthyText(p.prioritizationCriteria)).length;
    push(
      'improvement-plan-incomplete-structure',
      `${incompleteStructure} plan(es) con identificación incompleta`,
      `${incompleteStructure} de ${evaluable.length} plan(es) carecen de alguno de los elementos de identificación (código, descripción, período/año, priorización —${withoutPrioritization} sin criterios—, referencia de origen o responsable).`,
      incompleteStructure === evaluable.length ? 'HIGH' : 'MEDIUM',
    );
  }

  if (counters.plansWithoutObjectives > 0) {
    push(
      'improvement-plan-no-objectives',
      `${counters.plansWithoutObjectives} plan(es) sin objetivos`,
      `${counters.plansWithoutObjectives} de ${evaluable.length} plan(es) evaluable(s) no tienen objetivos definidos.`,
      'HIGH',
    );
  }
  if (counters.plansWithoutIndicators > 0) {
    push(
      'improvement-plan-no-indicators',
      `${counters.plansWithoutIndicators} plan(es) sin indicadores en sus objetivos`,
      `${counters.plansWithoutIndicators} de ${evaluable.length} plan(es) no asocian indicadores a sus objetivos (el modeReview exige indicadores).`,
      'MEDIUM',
    );
  }
  const plansWithIrresponsibleActivities = evaluable.filter(
    (p) =>
      (p.activities ?? []).length > 0 &&
      !(p.activities ?? []).every((a) => truthyId(a.responsibleUserId) || truthyText(a.responsibleUserSnapshot)),
  ).length;
  if (plansWithIrresponsibleActivities > 0) {
    push(
      'improvement-plan-no-responsibles',
      `${plansWithIrresponsibleActivities} plan(es) con actividades sin responsable`,
      `${plansWithIrresponsibleActivities} de ${evaluable.length} plan(es) tienen actividades sin responsable asignado.`,
      'HIGH',
    );
  }
  const plansWithoutSchedule = evaluable.filter(
    (p) =>
      (p.activities ?? []).length > 0 &&
      !(p.activities ?? []).every((a) => !Number.isNaN(toTime(a.plannedDate)) || !Number.isNaN(toTime(a.dueDate))),
  ).length;
  if (plansWithoutSchedule > 0) {
    push(
      'improvement-plan-no-schedule',
      `${plansWithoutSchedule} plan(es) con actividades sin cronograma`,
      `${plansWithoutSchedule} de ${evaluable.length} plan(es) tienen actividades sin fecha programada ni fecha límite.`,
      'MEDIUM',
    );
  }
  if (overdueActivities > 0 || overduePlans > 0) {
    push(
      'improvement-plan-overdue',
      overdueActivities > 0 ? `${overdueActivities} actividad(es) vencida(s)` : `${overduePlans} plan(es) vencido(s)`,
      overdueActivities > 0
        ? `${overdueActivities} actividad(es) con fecha límite pasada y sin estado terminal.`
        : `${overduePlans} plan(es) con fecha de fin pasada y sin estado terminal.`,
      'HIGH',
    );
  }
  const executionMean = dimensions.execution.ratio ?? 0;
  if (executionMean < 1) {
    push(
      'improvement-plan-insufficient-execution',
      'Ejecución insuficiente de las actividades',
      `La dimensión de ejecución registra ${Math.round(executionMean * 100)}% (completadas, fechas de ejecución, vencimientos y cronograma de activas).`,
      executionMean < 0.5 ? 'HIGH' : 'MEDIUM',
    );
  }
  if (counters.plansWithoutMonitoring > 0) {
    push(
      'improvement-plan-no-monitoring',
      `${counters.plansWithoutMonitoring} plan(es) sin seguimiento periódico`,
      `${counters.plansWithoutMonitoring} de ${evaluable.length} plan(es) no tienen registros de seguimiento del plan (monitoring) con progreso, desviaciones o acciones de ajuste.`,
      'HIGH',
    );
  }
  if (counters.activitiesWithEvidence === 0) {
    push(
      'improvement-plan-no-evidence',
      'Sin evidencia documental de ejecución',
      'Ninguna actividad del plan registra evidencia (documento o URL).',
      'MEDIUM',
    );
  }
  const plansNeverCompleted = evaluable.filter((p) => p.status !== 'COMPLETED' && p.status !== 'CLOSED').length;
  if (plansNeverCompleted > 0) {
    push(
      'improvement-plan-no-closure',
      `${plansNeverCompleted} plan(es) sin cierre`,
      `${plansNeverCompleted} de ${evaluable.length} plan(es) no alcanzan estado COMPLETED/CLOSED con cierre documentado (fecha y responsable de cierre).`,
      'MEDIUM',
    );
  }
  if (years.length === 1) {
    push(
      'improvement-plan-insufficient-continuity',
      'Continuidad aún no evaluable',
      'Los planes evaluables corresponden a un solo año; la dimensión de continuidad se redistribuye entre las demás dimensiones y NO penaliza el score.',
      'LOW',
    );
  }

  return {
    percentage,
    noData: false,
    noDataReason: null,
    evaluatedPeriod,
    dimensions,
    counters,
    latestPlan,
    findings,
  };
}
