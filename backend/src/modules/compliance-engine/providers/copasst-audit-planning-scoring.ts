/**
 * Núcleo PURO de scoring del estándar 6.1.4 — Planificación auditorías
 * COPASST (VERIFICAR).
 *
 * Sin Mongo/Mongoose/NestJS/servicios/queries: recibe únicamente datos
 * serializables (ya consultados tenant-scoped por el provider) y devuelve un
 * breakdown completo (dimensions/counters/findings). Patrón:
 * annual-audit-scoring.ts (6.1.2) / management-review-direction-scoring.ts
 * (6.1.3) / indicators-scoring.ts (6.1.1).
 *
 * DECISIONES FUNCIONALES (Etapa E2 — provider oficial de 6.1.4):
 *  - Fuente oficial: colección CopasstAuditPlanning (dominio propio E1).
 *    AccountabilityCommitment, findings-review y AnnualAudit NO participan
 *    del score (frontera anti-double-scoring 6.1.4 ↔ 6.1.2; AnnualAudit es
 *    referencia declarativa y NUNCA se consulta para puntuar).
 *  - 6.1.4 mide la calidad y trazabilidad de la PLANIFICACIÓN de auditorías
 *    con participación del COPASST. NO mide la ejecución de auditorías
 *    (informe/hallazgos/acciones son 6.1.2), NI la cantidad de auditorías
 *    planificadas (más items no es mejor cumplimiento).
 *  - D1–D5 se evalúan sobre la planificación evaluable MÁS RECIENTE (gestión
 *    vigente); D4 además usa TODAS las planificaciones evaluables para la
 *    continuidad (periodo vigente / deudor / futuro). Así "muchas
 *    planificaciones" NO infla el score.
 *  - Subcondiciones explícitas por dimensión (sin freebie por existir).
 *  - CANCELLED nunca puntúa; el estado DRAFT no penaliza por sí solo (la
 *    planificación es evaluable por contenido; el estado se exponen en
 *    counters y findings informativos).
 *  - D5 (seguimiento de recomendaciones/acciones derivadas) con UNA sola
 *    vigencia histórica evaluable → ratio null (se REDISTRIBUYE; no se
 *    exige historia multiannual — política D6 de 6.1.1/6.1.2/6.1.3). La
 *    trazabilidad vigente de resultados por item SÍ puntúa en D4.
 *  - NO hay dependencia artificial con AnnualAudit ni con
 *    AccountabilityCommitment: la trazabilidad de resultados se evalúa
 *    exclusivamente con los campos del dominio E1 (participación COPASST,
 *    observaciones, snapshots, historial embebido del planning).
 */

export const COPASST_AUDIT_PLANNING_MODULE = 'copasst-audit-planning';
export const COPASST_AUDIT_PLANNING_STANDARD_CODE = '6.1.4';
export const COPASST_AUDIT_PLANNING_FORMULA = 'dimensions:v1';

/** Meta de cumplimiento oficial (patrón 5.1.x / 4.2.x / 6.1.x). */
export const COPASST_AUDIT_PLANNING_COMPLIANCE_TARGET = 90;

/** Pesos de las 5 dimensiones oficiales (suman exactamente 100). */
export const COPASST_AUDIT_PLANNING_SCORE_WEIGHTS = {
  completeness: 25,
  schedule: 20,
  copasstParticipation: 25,
  traceability: 15,
  recommendations: 15,
} as const;

// ── Entrada (serializable; sin tipos de Mongoose) ──

export interface CopasstParticipationLike {
  required?: boolean;
  participated?: boolean;
  participationDate?: string | Date;
  participants?: Array<{ userId?: unknown; nameSnapshot?: string; role?: string }>;
  observations?: string;
}

export interface PlannedAuditItemLike {
  _id?: unknown;
  title?: string;
  plannedDate?: string | Date;
  auditorUserId?: unknown;
  auditorUserSnapshot?: string;
  responsibleUserId?: unknown;
  responsibleUserSnapshot?: string;
  objective?: string;
  scope?: string;
  criteria?: string;
  methodology?: string;
  copasstParticipation?: CopasstParticipationLike;
  status?: string;
  annualAuditId?: unknown;
}

export interface CopasstAuditPlanningLike {
  _id: string;
  planningCode?: string;
  title?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  scope?: string;
  objectives?: string;
  criteria?: string;
  methodology?: string;
  responsibleUserId?: unknown;
  responsibleUserSnapshot?: string;
  copasstPeriodId?: unknown;
  copasstPeriodSnapshot?: string;
  status?: string;
  items?: PlannedAuditItemLike[];
  createdBy?: unknown;
  createdBySnapshot?: string;
  updatedBy?: unknown;
  updatedBySnapshot?: string;
  createdAt?: string | Date;
}

export interface CopasstAuditPlanningScoreInput {
  /** Planificaciones de la empresa (todas; tenant-scoped). */
  plannings: CopasstAuditPlanningLike[];
  /** "Ahora" inyectable para determinismo y tests (default: new Date()). */
  now?: Date;
}

// ── Estructura de salida ──

export interface CopasstAuditPlanningDimensionDetail {
  /** 0–1; null = NO evaluable (se redistribuye; NUNCA convertir null en 0). */
  ratio: number | null;
  numerator: number | null;
  denominator: number | null;
  weight: number;
  subchecks?: { satisfied: number; total: number };
  [key: string]: unknown;
}

export interface CopasstAuditPlanningFindingDraft {
  id: string;
  title: string;
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface CopasstAuditPlanningScoreBreakdown {
  percentage: number;
  noData: boolean;
  /** Causa exacta del NO_DATA (para metadata y tests). */
  noDataReason: 'no-plannings' | 'no-evaluable-plannings' | null;
  /** Vigencia de la planificación evaluable más reciente (contexto). */
  evaluatedPeriod: string | null;
  dimensions: {
    completeness: CopasstAuditPlanningDimensionDetail;
    schedule: CopasstAuditPlanningDimensionDetail;
    copasstParticipation: CopasstAuditPlanningDimensionDetail;
    traceability: CopasstAuditPlanningDimensionDetail;
    recommendations: CopasstAuditPlanningDimensionDetail;
  };
  counters: {
    planningsTotal: number;
    planningsEvaluable: number;
    planningsDraft: number;
    planningsPlanned: number;
    planningsInProgress: number;
    planningsCompleted: number;
    planningsCancelled: number;
    itemsTotal: number;
    itemsCompleted: number;
    itemsWithDate: number;
    itemsWithoutDate: number;
    itemsWithAuditor: number;
    itemsWithResponsible: number;
    itemsWithParticipation: number;
    planningsWithCopasstPeriodRef: number;
    overdueItems: number;
    lastPlanningDate: string | null;
  };
  latestPlanning: {
    id: string;
    planningCode: string | null;
    title: string | null;
    status: string | null;
    startDate: string | null;
    endDate: string | null;
  } | null;
  findings: CopasstAuditPlanningFindingDraft[];
}

// ── Helpers puros ──

function truthyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Referencia/id "presente": acepta string no vacío U ObjectId-like (los
 * documentos .lean() de Mongoose devuelven ObjectIds, no strings; el scorer
 * puro solo evalúa PRESENCIA — la validación tenant-safe ocurrió en E1).
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
 * indicators/annual-audit: cada scoring lleva su propia copia desacoplada).
 * Solo las dimensiones con ratio finito 0–1 participan del denominador.
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

/** Período de la planificación válido: fechas presentes, start ≤ end. */
function hasValidPeriod(p: CopasstAuditPlanningLike): boolean {
  const start = toTime(p.startDate);
  const end = toTime(p.endDate);
  return !Number.isNaN(start) && !Number.isNaN(end) && start <= end;
}

/**
 * Item PLANIFICADO evaluable: título + objetivo + fecha dentro del período +
 * estado PLANNED/IN_PROGRESS/COMPLETED (CANCELLED no es planificación activa).
 */
function isMeaningfulPlannedItem(
  item: PlannedAuditItemLike,
  p: CopasstAuditPlanningLike,
): boolean {
  if (item.status === 'CANCELLED') return false;
  if (!truthyText(item.title) || !truthyText(item.objective)) return false;
  const planned = toTime(item.plannedDate);
  if (Number.isNaN(planned)) return false;
  const start = toTime(p.startDate);
  const end = toTime(p.endDate);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return planned >= start && planned <= end;
}

/**
 * Participación COPASST con trazabilidad real: requerida + declarada +
 * (fecha de participación O ≥1 participante registrado O observaciones).
 * `participated: true` sin ningún detalle no acredita participación.
 */
function hasDocumentedCopasstParticipation(part: CopasstParticipationLike | undefined): boolean {
  if (!part || !part.required || !part.participated) return false;
  const hasDate = !Number.isNaN(toTime(part.participationDate));
  const hasParticipants = Array.isArray(part.participants) && part.participants.length > 0;
  const hasObservations = truthyText(part.observations);
  return hasDate || hasParticipants || hasObservations;
}

/**
 * Planificación EVALUABLE para scoring:
 * período válido + título + ≥1 item planificado con sentido (no cancelado,
 * con título/objetivo y fecha dentro del período). Los demás campos faltantes
 * son brechas reales (bajan el score), no inhabilidad para evaluar.
 */
export function isEvaluablePlanning(p: CopasstAuditPlanningLike): boolean {
  if (!hasValidPeriod(p)) return false;
  if (!truthyText(p.title)) return false;
  const items = Array.isArray(p.items) ? p.items : [];
  return items.some((i) => isMeaningfulPlannedItem(i, p));
}

/** Calcula el score de 6.1.4. Función PURA (determinista, sin efectos). */
export function computeCopasstAuditPlanningScore(
  input: CopasstAuditPlanningScoreInput,
): CopasstAuditPlanningScoreBreakdown {
  const plannings = Array.isArray(input.plannings) ? input.plannings : [];
  const now = input.now ?? new Date();

  // ── Contadores de estado (todas las planificaciones del tenant) ──
  const planningsDraft = plannings.filter((p) => p.status === 'DRAFT').length;
  const planningsPlanned = plannings.filter((p) => p.status === 'PLANNED').length;
  const planningsInProgress = plannings.filter((p) => p.status === 'IN_PROGRESS').length;
  const planningsCompleted = plannings.filter((p) => p.status === 'COMPLETED').length;
  const planningsCancelled = plannings.filter((p) => p.status === 'CANCELLED').length;

  const allItems = plannings.flatMap((p) => (Array.isArray(p.items) ? p.items : []));
  const itemsTotal = allItems.length;
  const itemsCompleted = allItems.filter((i) => i.status === 'COMPLETED').length;
  const itemsWithDate = allItems.filter((i) => !Number.isNaN(toTime(i.plannedDate))).length;
  const itemsWithoutDate = itemsTotal - itemsWithDate;
  const itemsWithAuditor = allItems.filter(
    (i) => truthyId(i.auditorUserId) || truthyText(i.auditorUserSnapshot),
  ).length;
  const itemsWithResponsible = allItems.filter(
    (i) => truthyId(i.responsibleUserId) || truthyText(i.responsibleUserSnapshot),
  ).length;
  const itemsWithParticipation = allItems.filter((i) =>
    hasDocumentedCopasstParticipation(i.copasstParticipation),
  ).length;
  // Item vencido: no terminal, con fecha ya pasada (derivado; nunca persistido).
  const overdueItems = allItems.filter((i) => {
    if (i.status === 'COMPLETED' || i.status === 'CANCELLED') return false;
    const t = toTime(i.plannedDate);
    return !Number.isNaN(t) && t < now.getTime();
  }).length;

  // ── Conjunto evaluable ──
  const evaluable = plannings.filter((p) => isEvaluablePlanning(p));

  // Planificación evaluable más reciente (endDate desc → startDate → _id).
  const sortKey = (p: CopasstAuditPlanningLike): [number, number, string] => {
    const end = toTime(p.endDate);
    const start = toTime(p.startDate);
    return [Number.isNaN(end) ? 0 : end, Number.isNaN(start) ? 0 : start, String(p._id ?? '')];
  };
  const latest = evaluable.length > 0
    ? evaluable.reduce((best, p) => {
        const ka = sortKey(p);
        const kb = sortKey(best);
        return ka[0] > kb[0] || (ka[0] === kb[0] && (ka[1] > kb[1] || (ka[1] === kb[1] && ka[2] > kb[2])))
          ? p
          : best;
      })
    : undefined;

  // ── NO_DATA ──
  // Caso A: sin planificaciones. Caso B: planificaciones pero ninguna
  // evaluable (p.ej. DRAFT vacía sin items significativos). Caso C: al menos
  // una evaluable → score real (0% incluido es 0% real).
  const noData = plannings.length === 0 || evaluable.length === 0;
  const noDataReason: CopasstAuditPlanningScoreBreakdown['noDataReason'] =
    plannings.length === 0 ? 'no-plannings' : evaluable.length === 0 ? 'no-evaluable-plannings' : null;

  const itemsOf = (p: CopasstAuditPlanningLike | undefined): PlannedAuditItemLike[] =>
    Array.isArray(p?.items) ? (p?.items as PlannedAuditItemLike[]) : [];

  // ── D1 — COMPLETITUD DE LA PLANIFICACIÓN (25) ──
  // 7 subcondiciones sobre la más reciente evaluable: alcance, objetivos,
  // criterios, metodología, responsable, período válido, ≥1 item planificado.
  const completenessSubchecks = (() => {
    if (!latest) return { satisfied: 0, total: 7 };
    const checks = [
      truthyText(latest.scope),
      truthyText(latest.objectives),
      truthyText(latest.criteria),
      truthyText(latest.methodology),
      truthyId(latest.responsibleUserId) || truthyText(latest.responsibleUserSnapshot),
      hasValidPeriod(latest),
      itemsOf(latest).some((i) => isMeaningfulPlannedItem(i, latest)),
    ];
    return { satisfied: checks.filter(Boolean).length, total: checks.length };
  })();
  const completeness: CopasstAuditPlanningDimensionDetail = {
    ratio: latest ? completenessSubchecks.satisfied / completenessSubchecks.total : null,
    numerator: latest ? completenessSubchecks.satisfied : null,
    denominator: latest ? completenessSubchecks.total : null,
    weight: COPASST_AUDIT_PLANNING_SCORE_WEIGHTS.completeness,
    subchecks: completenessSubchecks,
    evaluatedPlanningId: latest?._id ?? null,
  };

  // ── D2 — PROGRAMACIÓN Y COBERTURA (20) ──
  // 4 subcondiciones: (a) ≥1 item con fecha dentro del período, (b) ≥1 item
  // con auditor/responsable definido, (c) cobertura de fechas ≥60% de los
  // items activos (calidad del cronograma, NO cantidad), (d) la planificación
  // está en un estado de gestión activa (PLANNED/IN_PROGRESS/COMPLETED; un
  // DRAFT vigente no es planificación formalizada).
  const latestItems = itemsOf(latest).filter((i) => i.status !== 'CANCELLED');
  const latestDated = latestItems.filter((i) => !Number.isNaN(toTime(i.plannedDate)));
  const latestInPeriod = latestItems.filter((i) => isMeaningfulPlannedItem(i, latest!));
  const latestWithRole = latestItems.filter(
    (i) => truthyId(i.auditorUserId) || truthyText(i.auditorUserSnapshot) ||
      truthyId(i.responsibleUserId) || truthyText(i.responsibleUserSnapshot),
  );
  const scheduleSubchecks = (() => {
    if (!latest) return { satisfied: 0, total: 4 };
    const checks = [
      latestInPeriod.length >= 1,
      latestWithRole.length >= 1,
      latestItems.length > 0 && latestDated.length / latestItems.length >= 0.6,
      ['PLANNED', 'IN_PROGRESS', 'COMPLETED'].includes(String(latest.status)),
    ];
    return { satisfied: checks.filter(Boolean).length, total: checks.length };
  })();
  const schedule: CopasstAuditPlanningDimensionDetail = {
    ratio: latest ? scheduleSubchecks.satisfied / scheduleSubchecks.total : null,
    numerator: latest ? scheduleSubchecks.satisfied : null,
    denominator: latest ? scheduleSubchecks.total : null,
    weight: COPASST_AUDIT_PLANNING_SCORE_WEIGHTS.schedule,
    subchecks: scheduleSubchecks,
    itemsTotal: latestItems.length,
    itemsWithDate: latestDated.length,
    itemsWithAuditorOrResponsible: latestWithRole.length,
  };

  // ── D3 — PARTICIPACIÓN DEL COPASST (25) ──
  // 4 subcondiciones sobre los items de la más reciente evaluable:
  // (a) ≥1 item con participación COPASST documentada (requerida + declarada
  // + fecha/participantes/observaciones), (b) cobertura de participación ≥50%
  // de los items con participación requerida, (c) referencia válida al
  // período COPASST (copasstPeriodId/snapshot — presencia; la tenencia fue
  // validada tenant-safe en E1), (d) trazabilidad de la participación
  // (participantes registrados con nombre u observaciones).
  const latestParticipations = latestItems
    .map((i) => i.copasstParticipation)
    .filter((x): x is CopasstParticipationLike => !!x);
  const latestRequired = latestParticipations.filter((x) => x.required !== false);
  const latestDocumented = latestParticipations.filter(hasDocumentedCopasstParticipation);
  const hasCopasstPeriodRef = truthyId(latest?.copasstPeriodId) || truthyText(latest?.copasstPeriodSnapshot);
  const hasParticipantsTraceability = latestDocumented.some(
    (x) =>
      (Array.isArray(x.participants) && x.participants.some((p) => truthyText(p.nameSnapshot))) ||
      truthyText(x.observations),
  );
  const participationSubchecks = (() => {
    if (!latest) return { satisfied: 0, total: 4 };
    const checks = [
      latestDocumented.length >= 1,
      latestRequired.length > 0 && latestDocumented.length / latestRequired.length >= 0.5,
      hasCopasstPeriodRef,
      hasParticipantsTraceability,
    ];
    return { satisfied: checks.filter(Boolean).length, total: checks.length };
  })();
  const copasstParticipation: CopasstAuditPlanningDimensionDetail = {
    ratio: latest ? participationSubchecks.satisfied / participationSubchecks.total : null,
    numerator: latest ? participationSubchecks.satisfied : null,
    denominator: latest ? participationSubchecks.total : null,
    weight: COPASST_AUDIT_PLANNING_SCORE_WEIGHTS.copasstParticipation,
    subchecks: participationSubchecks,
    itemsWithDocumentedParticipation: latestDocumented.length,
    copasstPeriodRef: hasCopasstPeriodRef,
  };

  // ── D4 — TRAZABILIDAD DOCUMENTAL Y DE RESULTADOS (15) ──
  // 5 subcondiciones sobre los items activos de la más reciente evaluable:
  // (a) identificación (código de planificación O item con título propio),
  // (b) ≥80% de items con objetivo, (c) ≥60% con alcance o criterios,
  // (d) ≥60% con metodología, (e) trazabilidad de resultado en al menos un
  // item (participación documentada O item completado O estado de gestión
  // activo). La ejecución de la auditoría NO se exige (es 6.1.2).
  const latestMeaningful = latestItems.filter((i) => isMeaningfulPlannedItem(i, latest!));
  const ratioPct = (n: number, d: number): number => (d > 0 ? n / d : 0);
  const traceabilitySubchecks = (() => {
    if (!latest) return { satisfied: 0, total: 5 };
    const checks = [
      truthyText(latest.planningCode) || latestItems.every((i) => truthyText(i.title)),
      ratioPct(latestItems.filter((i) => truthyText(i.objective)).length, latestItems.length) >= 0.8,
      ratioPct(
        latestItems.filter((i) => truthyText(i.scope) || truthyText(i.criteria)).length,
        latestItems.length,
      ) >= 0.6,
      ratioPct(latestItems.filter((i) => truthyText(i.methodology)).length, latestItems.length) >= 0.6,
      latestDocumented.length >= 1 ||
        latestItems.some((i) => i.status === 'COMPLETED') ||
        ['IN_PROGRESS', 'PLANNED'].includes(String(latest.status)),
    ];
    return { satisfied: checks.filter(Boolean).length, total: checks.length };
  })();
  const traceability: CopasstAuditPlanningDimensionDetail = {
    ratio: latest ? traceabilitySubchecks.satisfied / traceabilitySubchecks.total : null,
    numerator: latest ? traceabilitySubchecks.satisfied : null,
    denominator: latest ? traceabilitySubchecks.total : null,
    weight: COPASST_AUDIT_PLANNING_SCORE_WEIGHTS.traceability,
    subchecks: traceabilitySubchecks,
    meaningfulItems: latestMeaningful.length,
  };

  // ── D5 — SEGUIMIENTO DE RECOMENDACIONES/ACCIONES DERIVADAS (15) ──
  // El dominio E1 NO tiene mecanismo propio de recomendaciones/acciones
  // derivadas (y NO se inventa ni se reutiliza AccountabilityCommitment o
  // AnnualAudit — frontera 6.1.2). Se evalúa únicamente la continuidad
  // temporal REAL de planificaciones evaluables (años distintos de endDate):
  // 0 vigencias → 0 (sin planificación no hay trazabilidad); 1 vigencia →
  // null (se REDISTRIBUYE — no se exige historia multiannual, política D6 de
  // 6.1.1/6.1.2/6.1.3); ≥2 vigencias → 1 (ciclo de planificación consolidado).
  const distinctYears = new Set<string>();
  for (const p of evaluable) {
    const end = toTime(p.endDate);
    if (!Number.isNaN(end)) {
      distinctYears.add(String(new Date(end).getUTCFullYear()));
    }
  }
  const recommendations: CopasstAuditPlanningDimensionDetail = {
    ratio: distinctYears.size >= 2 ? 1 : distinctYears.size === 1 ? null : 0,
    numerator: distinctYears.size >= 2 ? 2 : null,
    denominator: distinctYears.size >= 2 ? 2 : null,
    weight: COPASST_AUDIT_PLANNING_SCORE_WEIGHTS.recommendations,
    distinctPlanningYears: distinctYears.size,
    evaluablePlannings: evaluable.length,
    limitation:
      'El dominio 6.1.4 no registra aún recomendaciones/acciones derivadas; ' +
      'la dimensión evalúa la continuidad de la planificación y se redistribuye con una sola vigencia.',
  };

  const w = COPASST_AUDIT_PLANNING_SCORE_WEIGHTS;
  const percentage = noData
    ? 0
    : redistributeWeightedScore([
        { ratio: completeness.ratio, weight: w.completeness },
        { ratio: schedule.ratio, weight: w.schedule },
        { ratio: copasstParticipation.ratio, weight: w.copasstParticipation },
        { ratio: traceability.ratio, weight: w.traceability },
        { ratio: recommendations.ratio, weight: w.recommendations },
      ]);

  // ── Período evaluado (contexto): año de la evaluable más reciente. ──
  const evaluatedPeriod = latest ? (() => {
    const end = toTime(latest.endDate);
    return Number.isNaN(end) ? null : String(new Date(end).getUTCFullYear());
  })() : null;

  // ── Última planificación evaluable (para metadata) ──
  const latestPlanning = latest
    ? {
        id: String(latest._id),
        planningCode: truthyText(latest.planningCode) ? latest.planningCode : null,
        title: truthyText(latest.title) ? latest.title : null,
        status: latest.status ?? null,
        startDate: !Number.isNaN(toTime(latest.startDate))
          ? new Date(toTime(latest.startDate)).toISOString()
          : null,
        endDate: !Number.isNaN(toTime(latest.endDate))
          ? new Date(toTime(latest.endDate)).toISOString()
          : null,
      }
    : null;

  // ── Counters globales ──
  const lastByDate = [...evaluable].sort((a, b) => toTime(b.endDate) - toTime(a.endDate))[0];
  const counters: CopasstAuditPlanningScoreBreakdown['counters'] = {
    planningsTotal: plannings.length,
    planningsEvaluable: evaluable.length,
    planningsDraft,
    planningsPlanned,
    planningsInProgress,
    planningsCompleted,
    planningsCancelled,
    itemsTotal,
    itemsCompleted,
    itemsWithDate,
    itemsWithoutDate,
    itemsWithAuditor,
    itemsWithResponsible,
    itemsWithParticipation,
    planningsWithCopasstPeriodRef: plannings.filter(
      (p) => truthyId(p.copasstPeriodId) || truthyText(p.copasstPeriodSnapshot),
    ).length,
    overdueItems,
    lastPlanningDate:
      lastByDate && !Number.isNaN(toTime(lastByDate.endDate))
        ? new Date(toTime(lastByDate.endDate)).toISOString()
        : null,
  };

  // ── Findings oficiales (solo lo demostrable desde los datos) ──
  const findings: CopasstAuditPlanningFindingDraft[] = [];
  if (plannings.length === 0) {
    findings.push({
      id: 'copasst-audit-planning-no-data',
      title: 'Sin planificación de auditorías COPASST registrada',
      description:
        'No existe planificación documentada de auditorías o verificaciones con participación del COPASST. El estándar 6.1.4 requiere cronograma, alcance, objetivos y responsables trazables.',
      priority: 'HIGH',
    });
  } else if (evaluable.length === 0) {
    findings.push({
      id: 'copasst-audit-planning-no-evaluable-plannings',
      title: 'Sin planificaciones evaluables',
      description: `Existen ${plannings.length} planificación(es) registrada(s) pero ninguna cumple las condiciones mínimas de evaluación (período válido, título y al menos una auditoría planificada con fecha, título y objetivo).`,
      priority: 'HIGH',
    });
  } else {
    const completenessMissing = completenessSubchecks.total - completenessSubchecks.satisfied;
    if (completenessMissing > 0) {
      findings.push({
        id: 'copasst-audit-planning-completeness-incomplete',
        title: 'Planificación incompleta',
        description: `La planificación vigente carece de ${completenessMissing} de ${completenessSubchecks.total} elementos (alcance, objetivos, criterios, metodología, responsable, período válido, auditorías planificadas).`,
        priority: completenessSubchecks.satisfied <= 3 ? 'HIGH' : 'MEDIUM',
      });
    }
    if (scheduleSubchecks.satisfied < scheduleSubchecks.total) {
      findings.push({
        id: 'copasst-audit-planning-schedule-incomplete',
        title: 'Cronograma de auditorías incompleto',
        description: `La planificación vigente registra ${latestDated.length} item(es) con fecha de ${latestItems.length} activo(s), ${latestWithRole.length} con auditor/responsable y estado ${String(latest?.status ?? '—')}. Formalice el cronograma (fechas, responsables y estado PLANNED o superior).`,
        priority: 'MEDIUM',
      });
    }
    if (participationSubchecks.satisfied < participationSubchecks.total) {
      findings.push({
        id: 'copasst-audit-planning-copasst-participation-incomplete',
        title: 'Participación del COPASST insuficientemente documentada',
        description: `Faltan ${participationSubchecks.total - participationSubchecks.satisfied} de ${participationSubchecks.total} condiciones de participación (participación declarada con fecha/participantes/observaciones, cobertura de items, referencia al período COPASST, trazabilidad). La participación del comité es componente central del estándar.`,
        priority: 'HIGH',
      });
    }
    if (traceabilitySubchecks.satisfied < traceabilitySubchecks.total) {
      findings.push({
        id: 'copasst-audit-planning-traceability-incomplete',
        title: 'Trazabilidad documental incompleta',
        description: `Faltan ${traceabilitySubchecks.total - traceabilitySubchecks.satisfied} de ${traceabilitySubchecks.total} condiciones de trazabilidad (identificación, objetivo, alcance/criterios, metodología por item, evidencia de gestión).`,
        priority: 'MEDIUM',
      });
    }
    if (itemsWithoutDate > 0) {
      findings.push({
        id: 'copasst-audit-planning-items-without-date',
        title: `${itemsWithoutDate} auditoría(s) planificada(s) sin fecha`,
        description:
          'Existen auditorías/verificaciones planificadas sin fecha programada. Asigne plannedDate dentro del período de la planificación.',
        priority: 'MEDIUM',
      });
    }
    if (overdueItems > 0) {
      findings.push({
        id: 'copasst-audit-planning-overdue-items',
        title: `${overdueItems} auditoría(s) planificada(s) con fecha vencida`,
        description:
          'Existen auditorías planificadas cuya fecha ya pasó sin cierre registrado. Actualice su estado o reprograme la fecha.',
        priority: 'HIGH',
      });
    }
    if (!hasCopasstPeriodRef) {
      findings.push({
        id: 'copasst-audit-planning-copasst-period-ref-missing',
        title: 'Falta referencia al período COPASST',
        description:
          'La planificación vigente no referencia el período COPASST (copasstPeriodId). La referencia establece trazabilidad entre la planificación y el comité vigente.',
        priority: 'MEDIUM',
      });
    }
    if (distinctYears.size === 1) {
      findings.push({
        id: 'copasst-audit-planning-history-limited',
        title: 'Planificación limitada a una sola vigencia',
        description:
          'Solo existe planificación evaluable en un período. La continuidad del ciclo de planificación de auditorías COPASST se consolidará con planificaciones en al menos dos vigencias.',
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
      completeness,
      schedule,
      copasstParticipation,
      traceability,
      recommendations,
    },
    counters,
    latestPlanning,
    findings,
  };
}
