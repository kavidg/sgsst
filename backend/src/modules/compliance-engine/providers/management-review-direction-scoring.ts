/**
 * Núcleo PURO de scoring del estándar 6.1.3 — Revisión por la dirección (VERIFICAR).
 *
 * Sin Mongo/Mongoose/NestJS/servicios/queries: recibe únicamente datos
 * serializables (ya consultados tenant-scoped por el provider) y devuelve un
 * breakdown completo (dimensions/counters/findings). Patrón:
 * annual-audit-scoring.ts (6.1.2) / indicators-scoring.ts (6.1.1).
 *
 * DECISIONES FUNCIONALES (Etapa E2 — provider oficial de 6.1.3):
 *  - Fuente oficial: colección ManagementReviewDirection (dominio propio E1).
 *    AnnualAudit, Indicators, PHVA, AccountabilityMeeting/Commitment y
 *    DocumentMaster NO participan del score: como máximo aparecen como
 *    entradas/evidencia declarativa en inputs[] (frontera anti-double-scoring).
 *  - 6.1.3 mide si la alta dirección realiza una revisión ESTRUCTURADA del
 *    SG-SST, analiza información relevante y produce decisiones de dirección
 *    trazables. NO mide cantidad de reuniones, documentos ni auditorías.
 *  - D1–D5 se evalúan sobre la revisión evaluable MÁS RECIENTE (gestión
 *    vigente); D6 (cierre/periodicidad/historial) sobre TODAS las evaluables.
 *    Así "más reuniones" NO mejora el score (solo la continuidad temporal D6).
 *  - Subcondiciones explícitas por dimensión (sin freebie por existir).
 *  - CANCELLED no infla cumplimiento; OVERDUE se DERIVA dinámicamente
 *    (misma lógica que E1); nunca estado persistente OVERDUE.
 *  - D6 con un solo año evaluado → null (se redistribuye; no se exige
 *    historia multiannual; política idéntica a D6 de 6.1.1/6.1.2).
 */

export const MANAGEMENT_REVIEW_DIRECTION_MODULE = 'management-review-direction';
export const MANAGEMENT_REVIEW_DIRECTION_STANDARD_CODE = '6.1.3';
export const MANAGEMENT_REVIEW_DIRECTION_FORMULA = 'dimensions:v1';

/** Meta de cumplimiento oficial (patrón 5.1.x / 4.2.x / 6.1.x). */
export const MANAGEMENT_REVIEW_DIRECTION_COMPLIANCE_TARGET = 90;

/** Pesos de las 6 dimensiones (suman exactamente 100). */
export const MANAGEMENT_REVIEW_DIRECTION_SCORE_WEIGHTS = {
  planning: 15,
  inputs: 20,
  analysis: 20,
  decisions: 20,
  evidence: 15,
  closureHistory: 10,
} as const;

// Tipos oficiales de entrada del dominio (E1). Sin recálculo de fuentes.
const OFFICIAL_INPUT_TYPES = [
  'AUDIT_RESULTS',
  'INDICATOR_RESULTS',
  'PHVA_COMPLIANCE',
  'OBJECTIVES',
  'IMPROVEMENT_ACTIONS',
  'RELEVANT_CHANGES',
  'RESOURCE_NEEDS',
  'OTHER',
] as const;

const TERMINAL_DECISION_STATUSES = ['COMPLETED', 'CANCELLED'] as const;

// ── Entrada (serializable; sin tipos de Mongoose) ──

export interface ReviewParticipantLike {
  _id?: string;
  userId?: string;
  nameSnapshot?: string;
  role?: string;
  attendance?: string;
}

export interface ReviewInputLike {
  _id?: string;
  type?: string;
  title?: string;
  description?: string;
  sourceModule?: string;
  sourceEntityId?: string;
  referencePeriod?: string;
  status?: string;
  evidenceDocumentId?: string;
  evidenceUrl?: string;
  observations?: string;
}

export interface ReviewDecisionLike {
  _id?: string;
  description?: string;
  category?: string;
  status?: string;
  responsibleUserId?: string;
  responsibleNameSnapshot?: string;
  dueDate?: string | Date;
  resourcesRequired?: string;
  evidenceUrl?: string;
  observations?: string;
}

export interface ReviewAnalysisLike {
  summary?: string;
  strengths?: string[];
  gaps?: string[];
  priorities?: string[];
  managementObservations?: string;
}

export interface ManagementReviewDirectionLike {
  _id: string;
  reviewCode?: string;
  title?: string;
  reviewType?: string;
  plannedDate?: string | Date;
  location?: string;
  scope?: string;
  objectives?: string;
  responsibleUserId?: string;
  responsibleNameSnapshot?: string;
  participants?: ReviewParticipantLike[];
  actualStartDate?: string | Date;
  actualEndDate?: string | Date;
  status?: string;
  inputs?: ReviewInputLike[];
  analysis?: ReviewAnalysisLike;
  decisions?: ReviewDecisionLike[];
  minutesDocumentId?: string;
  minutesEvidenceUrl?: string;
  reportTitle?: string;
}

export interface ManagementReviewDirectionScoreInput {
  /** Revisiones de la empresa (todas; tenant-scoped). */
  reviews: ManagementReviewDirectionLike[];
  /** "Ahora" inyectable para determinismo y tests (default: new Date()). */
  now?: Date;
}

// ── Estructura de salida ──

export interface ManagementReviewDirectionDimensionDetail {
  /** 0–1; null = NO evaluable (se redistribuye; NUNCA convertir null en 0). */
  ratio: number | null;
  numerator: number | null;
  denominator: number | null;
  weight: number;
  [key: string]: unknown;
}

export interface ManagementReviewDirectionFindingDraft {
  id: string;
  title: string;
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ManagementReviewDirectionScoreBreakdown {
  percentage: number;
  noData: boolean;
  /** Causa exacta del NO_DATA (para metadata y tests). */
  noDataReason: 'no-reviews' | 'no-evaluable-reviews' | null;
  /** Año de la revisión evaluable más reciente (contexto; null si no hay). */
  evaluatedPeriod: string | null;
  dimensions: {
    planning: ManagementReviewDirectionDimensionDetail;
    inputs: ManagementReviewDirectionDimensionDetail;
    analysis: ManagementReviewDirectionDimensionDetail;
    decisions: ManagementReviewDirectionDimensionDetail;
    evidence: ManagementReviewDirectionDimensionDetail;
    closureHistory: ManagementReviewDirectionDimensionDetail;
  };
  counters: {
    reviewsTotal: number;
    reviewsEvaluable: number;
    reviewsCompleted: number;
    reviewsDraft: number;
    reviewsPlanned: number;
    reviewsInProgress: number;
    reviewsCancelled: number;
    inputsTotal: number;
    inputsReviewed: number;
    inputsValidReviewed: number;
    inputTypesPresent: number;
    inputTypesReviewed: number;
    decisionsTotal: number;
    decisionsActionable: number;
    decisionsCompleted: number;
    decisionsPending: number;
    decisionsInProgress: number;
    decisionsCancelled: number;
    decisionsOverdue: number;
    participantsTotal: number;
    participantsPresent: number;
    reviewsWithEvidence: number;
    reviewsWithAnalysis: number;
    reviewsWithDecisions: number;
    reviewsWithHistory: number;
    lastReviewDate: string | null;
    lastReviewStatus: string | null;
    futureDateReviews: number;
  };
  latestReview: {
    id: string;
    reviewCode: string | null;
    title: string | null;
    status: string | null;
    actualEndDate: string | null;
  } | null;
  findings: ManagementReviewDirectionFindingDraft[];
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
function truthyId(value: unknown): value is string {
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

/** Acta/evidencia mínima del acto de revisión (uno de los tres canales). */
function hasMinimalMinutes(r: ManagementReviewDirectionLike): boolean {
  return truthyId(r.minutesDocumentId) || truthyText(r.minutesEvidenceUrl) || truthyText(r.reportTitle);
}

/**
 * Revisión EVALUABLE para scoring (ítem 5 del diseño):
 * COMPLETED + fechas reales válidas y no futuras + acta/evidencia formal +
 * contenido mínimo (análisis con contenido o decisiones). Los estados
 * DRAFT/PLANNED/IN_PROGRESS no son evidencia histórica; CANCELLED nunca entra.
 */
export function isEvaluableReview(r: ManagementReviewDirectionLike, now: Date): boolean {
  if (r.status !== 'COMPLETED') return false;
  const start = toTime(r.actualStartDate);
  const end = toTime(r.actualEndDate);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  if (start > end) return false;
  if (end > now.getTime() || start > now.getTime()) return false;
  if (!hasMinimalMinutes(r)) return false;
  return hasMinimalAnalysisOrDecisions(r);
}

/** Contenido mínimo de revisión: análisis con contenido o decisiones registradas. */
function hasMinimalAnalysisOrDecisions(r: ManagementReviewDirectionLike): boolean {
  const a = r.analysis;
  const hasAnalysisContent =
    !!a &&
    (truthyText(a.summary) ||
      truthyText(a.managementObservations) ||
      (Array.isArray(a.strengths) && a.strengths.some(truthyText)) ||
      (Array.isArray(a.gaps) && a.gaps.some(truthyText)) ||
      (Array.isArray(a.priorities) && a.priorities.some(truthyText)));
  const hasDecisions = Array.isArray(r.decisions) && r.decisions.length > 0;
  return hasAnalysisContent || hasDecisions;
}

/**
 * Entrada VÁLIDA revisada: los 4 mínimos del diseño (type oficial + título +
 * descripción + status REVIEWED). La evidencia/referencia mejora trazabilidad
 * pero NO duplica puntos.
 */
export function isValidReviewedInput(i: ReviewInputLike): boolean {
  return (
    truthyText(i.type) &&
    (OFFICIAL_INPUT_TYPES as readonly string[]).includes(String(i.type)) &&
    truthyText(i.title) &&
    truthyText(i.description) &&
    i.status === 'REVIEWED'
  );
}

/**
 * Decisión ACCIONABLE (elemento mínimo del diseño): descripción + categoría
 * válida + responsable + fecha límite válida. Sin responsible/dueDate es un
 * registro incompleto que NO demuestra gestión de dirección.
 */
export function isActionableDecision(d: ReviewDecisionLike): boolean {
  return (
    truthyText(d.description) &&
    truthyText(d.category) &&
    (truthyId(d.responsibleUserId) || truthyText(d.responsibleNameSnapshot)) &&
    !Number.isNaN(toTime(d.dueDate))
  );
}

/**
 * Vencimiento DERIVADO dinámicamente (misma lógica que E1). Nunca estado
 * persistente OVERDUE: una decisión está vencida cuando su estado no es
 * terminal y su dueDate ya pasó.
 */
export function isDecisionOverdue(
  d: Pick<ReviewDecisionLike, 'status' | 'dueDate'>,
  now: Date,
): boolean {
  if (TERMINAL_DECISION_STATUSES.includes(d.status as (typeof TERMINAL_DECISION_STATUSES)[number])) {
    return false;
  }
  const due = toTime(d.dueDate);
  return !Number.isNaN(due) && due < now.getTime();
}

/** Calcula el score de 6.1.3. Función PURA (determinista, sin efectos). */
export function computeManagementReviewDirectionScore(
  input: ManagementReviewDirectionScoreInput,
): ManagementReviewDirectionScoreBreakdown {
  const reviews = Array.isArray(input.reviews) ? input.reviews : [];
  const now = input.now ?? new Date();

  // ── Contadores de estado (todas las revisiones del tenant) ──
  const reviewsCompleted = reviews.filter((r) => r.status === 'COMPLETED').length;
  const reviewsCancelled = reviews.filter((r) => r.status === 'CANCELLED').length;
  const reviewsDraft = reviews.filter((r) => r.status === 'DRAFT').length;
  const reviewsPlanned = reviews.filter((r) => r.status === 'PLANNED').length;
  const reviewsInProgress = reviews.filter((r) => r.status === 'IN_PROGRESS').length;

  const allInputs = reviews.flatMap((r) => (Array.isArray(r.inputs) ? r.inputs : []));
  const allDecisions = reviews.flatMap((r) => (Array.isArray(r.decisions) ? r.decisions : []));
  const allParticipants = reviews.flatMap((r) => (Array.isArray(r.participants) ? r.participants : []));

  // Integridad: fechas futuras en ejecución (no demostrables).
  let futureDateReviews = 0;
  for (const r of reviews) {
    const start = toTime(r.actualStartDate);
    const end = toTime(r.actualEndDate);
    if ((!Number.isNaN(start) && start > now.getTime()) || (!Number.isNaN(end) && end > now.getTime())) {
      futureDateReviews += 1;
    }
  }

  // ── Conjunto evaluable (ítem 5) ──
  const evaluable = reviews.filter((r) => isEvaluableReview(r, now));

  // Revisión evaluable más reciente (actualEndDate desc → actualStartDate → _id).
  const sortKey = (r: ManagementReviewDirectionLike): [number, number, string] => {
    const end = toTime(r.actualEndDate);
    const start = toTime(r.actualStartDate);
    return [Number.isNaN(end) ? 0 : end, Number.isNaN(start) ? 0 : start, String(r._id ?? '')];
  };
  const latest = evaluable.length > 0
    ? evaluable.reduce((best, r) => {
        const ka = sortKey(r);
        const kb = sortKey(best);
        return ka[0] > kb[0] || (ka[0] === kb[0] && (ka[1] > kb[1] || (ka[1] === kb[1] && ka[2] > kb[2])))
          ? r
          : best;
      })
    : undefined;

  // ── NO_DATA (ítem 6 del diseño) ──
  // Caso A: sin revisiones. Caso B: revisiones pero ninguna evaluable.
  // Caso C: al menos una evaluable → score real (0% incluido es 0% real).
  const noData = reviews.length === 0 || evaluable.length === 0;
  const noDataReason: ManagementReviewDirectionScoreBreakdown['noDataReason'] =
    reviews.length === 0 ? 'no-reviews' : evaluable.length === 0 ? 'no-evaluable-reviews' : null;

  const inputsOf = (r: ManagementReviewDirectionLike | undefined): ReviewInputLike[] =>
    Array.isArray(r?.inputs) ? (r?.inputs as ReviewInputLike[]) : [];
  const decisionsOf = (r: ManagementReviewDirectionLike | undefined): ReviewDecisionLike[] =>
    Array.isArray(r?.decisions) ? (r?.decisions as ReviewDecisionLike[]) : [];

  // ── D1 — EXISTENCIA Y PLANIFICACIÓN (15) ──
  // 6 subcondiciones sobre la más reciente evaluable: título, tipo válido,
  // fecha planificada válida, responsable identificado, alcance, objetivos.
  // No hay puntos por "existir un documento vacío".
  const planningSubchecks = (() => {
    if (!latest) return { satisfied: 0, total: 6 };
    const checks = [
      truthyText(latest.title),
      truthyText(latest.reviewType) &&
        ['ORDINARY', 'EXTRAORDINARY'].includes(String(latest.reviewType)),
      !Number.isNaN(toTime(latest.plannedDate)),
      truthyId(latest.responsibleUserId) || truthyText(latest.responsibleNameSnapshot),
      truthyText(latest.scope),
      truthyText(latest.objectives),
    ];
    return { satisfied: checks.filter(Boolean).length, total: checks.length };
  })();
  const planning: ManagementReviewDirectionDimensionDetail = {
    ratio: latest ? planningSubchecks.satisfied / planningSubchecks.total : null,
    numerator: latest ? planningSubchecks.satisfied : null,
    denominator: latest ? planningSubchecks.total : null,
    weight: MANAGEMENT_REVIEW_DIRECTION_SCORE_WEIGHTS.planning,
    subchecks: planningSubchecks,
    evaluatedReviewId: latest?._id ?? null,
  };

  // ── D2 — ENTRADAS RELEVANTES (20): cobertura/calidad, NO cantidad bruta.
  // 3 subcondiciones: (a) hay entradas revisadas válidas (≥1), (b) cobertura
  // de tipos oficiales revisados ≥ 3 de los 8 (temas mínimos de una revisión
  // de dirección: resultados, objetivos/acciones, recursos/cambios), (c) la
  // mayoría de las entradas revisadas son válidas (≥80%). 8 entradas vacías
  // o no revisadas dan 0%.
  const latestInputs = inputsOf(latest);
  const latestReviewedInputs = latestInputs.filter((i) => i.status === 'REVIEWED');
  const latestValidReviewed = latestReviewedInputs.filter(isValidReviewedInput);
  const latestTypesReviewed = new Set(latestValidReviewed.map((i) => String(i.type)));
  const inputsSubchecks = (() => {
    if (!latest) return { satisfied: 0, total: 3 };
    const checks = [
      latestValidReviewed.length >= 1,
      latestTypesReviewed.size >= 3,
      latestReviewedInputs.length > 0 &&
        latestValidReviewed.length / latestReviewedInputs.length >= 0.8,
    ];
    return { satisfied: checks.filter(Boolean).length, total: checks.length };
  })();
  const inputsDimension: ManagementReviewDirectionDimensionDetail = {
    ratio: latest ? inputsSubchecks.satisfied / inputsSubchecks.total : null,
    numerator: latest ? inputsSubchecks.satisfied : null,
    denominator: latest ? inputsSubchecks.total : null,
    weight: MANAGEMENT_REVIEW_DIRECTION_SCORE_WEIGHTS.inputs,
    subchecks: inputsSubchecks,
    totalInputs: latestInputs.length,
    reviewedInputs: latestReviewedInputs.length,
    validReviewedInputs: latestValidReviewed.length,
    typesPresent: [...new Set(latestInputs.map((i) => String(i.type)))].length,
    typesReviewed: [...latestTypesReviewed],
  };

  // ── D3 — ANÁLISIS DE RESULTADOS (20): interpretación y conclusiones.
  // 5 subcondiciones independientes: summary, strengths con contenido,
  // gaps con contenido, priorities con contenido, managementObservations.
  const latestAnalysis = latest?.analysis;
  const analysisSubchecks = (() => {
    if (!latest) return { satisfied: 0, total: 5 };
    const checks = [
      truthyText(latestAnalysis?.summary),
      Array.isArray(latestAnalysis?.strengths) && latestAnalysis.strengths.some(truthyText),
      Array.isArray(latestAnalysis?.gaps) && latestAnalysis.gaps.some(truthyText),
      Array.isArray(latestAnalysis?.priorities) && latestAnalysis.priorities.some(truthyText),
      truthyText(latestAnalysis?.managementObservations),
    ];
    return { satisfied: checks.filter(Boolean).length, total: checks.length };
  })();
  const analysis: ManagementReviewDirectionDimensionDetail = {
    ratio: latest ? analysisSubchecks.satisfied / analysisSubchecks.total : null,
    numerator: latest ? analysisSubchecks.satisfied : null,
    denominator: latest ? analysisSubchecks.total : null,
    weight: MANAGEMENT_REVIEW_DIRECTION_SCORE_WEIGHTS.analysis,
    subchecks: analysisSubchecks,
  };

  // ── D4 — DECISIONES Y ACCIONES DE DIRECCIÓN (20): decisiones PROPIAS del
  // dominio (NUNCA AccountabilityCommitment). Sin decisiones → 0 (una revisión
  // de dirección sin decisiones no demuestra gestión; NO se redistribuye para
  // no esconder la brecha). Con decisiones → accionables/total ponderado con
  // cierre: ratio = (accionables/total) * (1/2 + cerradas/(2*total)) — exige
  // tanto calidad de registro como ejecución real. CANCELLED no suma cierre.
  const latestDecisions = decisionsOf(latest);
  const latestActionable = latestDecisions.filter(isActionableDecision);
  const latestClosedDecisions = latestDecisions.filter((d) => d.status === 'COMPLETED');
  const decisionsRatio = (() => {
    if (!latest) return null;
    if (latestDecisions.length === 0) return 0;
    const quality = latestActionable.length / latestDecisions.length;
    const closure = latestClosedDecisions.length / latestDecisions.length;
    return quality * (0.5 + 0.5 * closure);
  })();
  const decisions: ManagementReviewDirectionDimensionDetail = {
    ratio: decisionsRatio,
    numerator: latest ? latestClosedDecisions.length : null,
    denominator: latest ? latestDecisions.length : null,
    weight: MANAGEMENT_REVIEW_DIRECTION_SCORE_WEIGHTS.decisions,
    totalDecisions: latestDecisions.length,
    actionableDecisions: latestActionable.length,
    completedDecisions: latestClosedDecisions.length,
    notApplicableNoDecisions: false,
  };

  // ── D5 — EVIDENCIA Y TRAZABILIDAD (15) ──
  // 4 subcondiciones: acta (documento O URL O reportTitle cuentan como UNA
  // evidencia), participantes registrados, asistencia registrada, análisis
  // documentado (contenido). El mismo documento nunca cuenta dos veces.
  const evidenceSubchecks = (() => {
    if (!latest) return { satisfied: 0, total: 4 };
    const participants = Array.isArray(latest.participants) ? latest.participants : [];
    const checks = [
      hasMinimalMinutes(latest),
      participants.length > 0,
      participants.every((p) => truthyText(p.attendance)) && participants.length > 0,
      analysisSubchecks.satisfied >= 1,
    ];
    return { satisfied: checks.filter(Boolean).length, total: checks.length };
  })();
  const evidence: ManagementReviewDirectionDimensionDetail = {
    ratio: latest ? evidenceSubchecks.satisfied / evidenceSubchecks.total : null,
    numerator: latest ? evidenceSubchecks.satisfied : null,
    denominator: latest ? evidenceSubchecks.total : null,
    weight: MANAGEMENT_REVIEW_DIRECTION_SCORE_WEIGHTS.evidence,
    subchecks: evidenceSubchecks,
    minutesDocumentId: latest?.minutesDocumentId ?? null,
  };

  // ── D6 — CIERRE, PERIODICIDAD E HISTORIAL (10): continuidad temporal, NO
  // volumen. Años distintos (actualEndDate) con ≥1 evaluable. 1 año → null
  // (no se exige historia multiannual; se redistribuye). ≥2 años → 1.
  // DRAFT/PLANNED/IN_PROGRESS/CANCELLED nunca cuentan como cierre.
  const distinctYears = new Set<string>();
  for (const r of evaluable) {
    const end = toTime(r.actualEndDate);
    if (!Number.isNaN(end)) {
      distinctYears.add(String(new Date(end).getUTCFullYear()));
    }
  }
  const closureHistory: ManagementReviewDirectionDimensionDetail = {
    ratio: distinctYears.size >= 2 ? 1 : distinctYears.size === 1 ? null : 0,
    numerator: distinctYears.size >= 2 ? 2 : null,
    denominator: distinctYears.size >= 2 ? 2 : null,
    weight: MANAGEMENT_REVIEW_DIRECTION_SCORE_WEIGHTS.closureHistory,
    distinctCompletedYears: distinctYears.size,
    evaluableReviews: evaluable.length,
    futureDateReviews,
  };

  const w = MANAGEMENT_REVIEW_DIRECTION_SCORE_WEIGHTS;
  const percentage = noData
    ? 0
    : redistributeWeightedScore([
        { ratio: planning.ratio, weight: w.planning },
        { ratio: inputsDimension.ratio, weight: w.inputs },
        { ratio: analysis.ratio, weight: w.analysis },
        { ratio: decisions.ratio, weight: w.decisions },
        { ratio: evidence.ratio, weight: w.evidence },
        { ratio: closureHistory.ratio, weight: w.closureHistory },
      ]);

  // ── Período evaluado (contexto): año de la evaluable más reciente. ──
  const evaluatedPeriod = latest ? (() => {
    const end = toTime(latest.actualEndDate);
    return Number.isNaN(end) ? null : String(new Date(end).getUTCFullYear());
  })() : null;

  // ── Última revisión evaluable (para metadata) ──
  const latestReview = latest
    ? {
        id: String(latest._id),
        reviewCode: truthyText(latest.reviewCode) ? latest.reviewCode : null,
        title: truthyText(latest.title) ? latest.title : null,
        status: latest.status ?? null,
        actualEndDate: !Number.isNaN(toTime(latest.actualEndDate))
          ? new Date(toTime(latest.actualEndDate)).toISOString()
          : null,
      }
    : null;

  // ── Counters globales (todas las revisiones del tenant) ──
  const lastEvaluableByDate = [...evaluable].sort((a, b) => {
    const ta = toTime(a.actualEndDate);
    const tb = toTime(b.actualEndDate);
    return tb - ta;
  })[0];
  const counters: ManagementReviewDirectionScoreBreakdown['counters'] = {
    reviewsTotal: reviews.length,
    reviewsEvaluable: evaluable.length,
    reviewsCompleted,
    reviewsDraft,
    reviewsPlanned,
    reviewsInProgress,
    reviewsCancelled,
    inputsTotal: allInputs.length,
    inputsReviewed: allInputs.filter((i) => i.status === 'REVIEWED').length,
    inputsValidReviewed: allInputs.filter(isValidReviewedInput).length,
    inputTypesPresent: new Set(allInputs.map((i) => String(i.type))).size,
    inputTypesReviewed: new Set(
      allInputs.filter(isValidReviewedInput).map((i) => String(i.type)),
    ).size,
    decisionsTotal: allDecisions.length,
    decisionsActionable: allDecisions.filter(isActionableDecision).length,
    decisionsCompleted: allDecisions.filter((d) => d.status === 'COMPLETED').length,
    decisionsPending: allDecisions.filter((d) => d.status === 'PENDING').length,
    decisionsInProgress: allDecisions.filter((d) => d.status === 'IN_PROGRESS').length,
    decisionsCancelled: allDecisions.filter((d) => d.status === 'CANCELLED').length,
    decisionsOverdue: allDecisions.filter((d) => isDecisionOverdue(d, now)).length,
    participantsTotal: allParticipants.length,
    participantsPresent: allParticipants.filter((p) => p.attendance === 'ATTENDED').length,
    reviewsWithEvidence: reviews.filter(hasMinimalMinutes).length,
    reviewsWithAnalysis: reviews.filter(hasMinimalAnalysisOrDecisions).length,
    reviewsWithDecisions: reviews.filter((r) => decisionsOf(r).length > 0).length,
    reviewsWithHistory: reviewsWithHistory(reviews),
    lastReviewDate: lastEvaluableByDate && !Number.isNaN(toTime(lastEvaluableByDate.actualEndDate))
      ? new Date(toTime(lastEvaluableByDate.actualEndDate)).toISOString()
      : null,
    lastReviewStatus: lastEvaluableByDate?.status ?? null,
    futureDateReviews,
  };

  // ── Findings oficiales (solo lo demostrable desde los datos) ──
  const findings: ManagementReviewDirectionFindingDraft[] = [];
  if (reviews.length === 0) {
    findings.push({
      id: 'management-review-direction-no-data',
      title: 'Sin revisiones por la dirección registradas',
      description:
        'No existen revisiones del SG-SST por la alta dirección registradas. El estándar 6.1.3 requiere revisión periódica con análisis de resultados y decisiones documentadas.',
      priority: 'HIGH',
    });
  } else if (evaluable.length === 0) {
    findings.push({
      id: 'management-review-direction-no-evaluable-reviews',
      title: 'Sin revisiones evaluables',
      description: `Existen ${reviews.length} revisión(es) registrada(s) pero ninguna cumple las condiciones de evaluación (COMPLETED, fechas reales válidas, acta/evidencia y contenido mínimo de análisis o decisiones). Complete la ejecución de al menos una revisión.`,
      priority: 'HIGH',
    });
  } else {
    const planningIncomplete = planningSubchecks.total - planningSubchecks.satisfied;
    if (planningIncomplete > 0) {
      findings.push({
        id: 'management-review-direction-planning-incomplete',
        title: 'Planificación de la revisión incompleta',
        description: `La revisión evaluable más reciente carece de ${planningIncomplete} de ${planningSubchecks.total} elementos de planificación (título, tipo, fecha planificada, responsable, alcance, objetivos).`,
        priority: planningSubchecks.satisfied === 0 ? 'HIGH' : 'MEDIUM',
      });
    }
    if (inputsSubchecks.satisfied < inputsSubchecks.total) {
      findings.push({
        id: 'management-review-direction-inputs-incomplete',
        title: 'Entradas de información insuficientes o no revisadas',
        description: `La revisión evaluable más reciente registra ${latestValidReviewed.length} entrada(s) revisada(s) válida(s) y ${latestTypesReviewed.size} tipo(s) oficial(es) cubierto(s). Una revisión de dirección requiere recibir y revisar información relevante del SG-SST (resultados de auditoría, indicadores, cumplimiento PHVA, objetivos, acciones de mejora, cambios, necesidades de recursos).`,
        priority: 'HIGH',
      });
    }
    if (analysisSubchecks.satisfied < analysisSubchecks.total) {
      findings.push({
        id: 'management-review-direction-analysis-incomplete',
        title: 'Análisis de la dirección incompleto',
        description: `Faltan ${analysisSubchecks.total - analysisSubchecks.satisfied} de ${analysisSubchecks.total} elementos de análisis (resumen, fortalezas, brechas, prioridades, observaciones de la dirección). La recopilación de datos sin interpretación no demuestra revisión.`,
        priority: 'MEDIUM',
      });
    }
    if (decisionsRatio !== null && decisionsRatio < 1) {
      findings.push({
        id: 'management-review-direction-decisions-incomplete',
        title: 'Decisiones de dirección incompletas o sin cierre',
        description: `La revisión evaluable más reciente registra ${latestDecisions.length} decisión(es), ${latestActionable.length} accionable(s) (descripción, categoría, responsable y fecha límite) y ${latestClosedDecisions.length} cerrada(s). Las decisiones sin responsable o fecha límite no demuestran gestión trazable.`,
        priority: latestDecisions.length === 0 ? 'HIGH' : 'MEDIUM',
      });
    }
    if (evidenceSubchecks.satisfied < evidenceSubchecks.total) {
      findings.push({
        id: 'management-review-direction-evidence-incomplete',
        title: 'Evidencia y trazabilidad incompletas',
        description: `Faltan ${evidenceSubchecks.total - evidenceSubchecks.satisfied} de ${evidenceSubchecks.total} elementos de trazabilidad (acta/informe, participantes, asistencia, análisis documentado).`,
        priority: 'MEDIUM',
      });
    }
    const notCompleted = reviewsDraft + reviewsPlanned + reviewsInProgress;
    if (notCompleted > 0) {
      findings.push({
        id: 'management-review-direction-not-completed',
        title: `${notCompleted} revisión(es) sin completar`,
        description: `${reviewsDraft} en borrador, ${reviewsPlanned} planificada(s) y ${reviewsInProgress} en ejecución. Solo las revisiones COMPLETED con evidencia constituyen revisión de dirección ejecutada.`,
        priority: 'MEDIUM',
      });
    }
    if (counters.decisionsOverdue > 0) {
      findings.push({
        id: 'management-review-direction-overdue-decisions',
        title: `${counters.decisionsOverdue} decisión(es) vencida(s)`,
        description:
          'Existen decisiones de dirección con fecha límite vencida sin cierre. Priorice su ejecución y registre la evidencia correspondiente.',
        priority: 'HIGH',
      });
    }
    if (distinctYears.size === 1) {
      findings.push({
        id: 'management-review-direction-history-incomplete',
        title: 'Historial limitado a un solo año',
        description:
          'Solo existe evidencia de revisión completada en un año. La continuidad temporal del ciclo de revisión por la dirección se evaluará cuando existan al menos dos años con revisiones completadas.',
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
      planning,
      inputs: inputsDimension,
      analysis,
      decisions,
      evidence,
      closureHistory,
    },
    counters,
    latestReview,
    findings,
  };
}

/**
 * Contador de trazabilidad de historial: revisiones con registro suficiente
 * para reconstruir el acto de revisión (participantes o entradas o decisiones
 * o evidencia documental adjunta). Es la proxy serializable disponible en el
 * documento (el historial append-only vive en otra colección y el provider no
 * consulta colecciones adicionales para puntuar).
 */
function reviewsWithHistory(reviews: ManagementReviewDirectionLike[]): number {
  return reviews.filter((r) => {
    const hasParticipants = Array.isArray(r.participants) && r.participants.length > 0;
    const hasInputs = Array.isArray(r.inputs) && r.inputs.length > 0;
    const hasDecisions = Array.isArray(r.decisions) && r.decisions.length > 0;
    const hasDocumentedMinutes = truthyId(r.minutesDocumentId);
    return hasParticipants || hasInputs || hasDecisions || hasDocumentedMinutes;
  }).length;
}
