/**
 * E2 (7.1.3) — SCORER PURO de las ACCIONES POR ACCIDENTES
 * (incident-actions — dominio incidents).
 *
 * - FUNCIÓN PURA: sin Mongo, sin NestJS, sin HTTP, sin request, sin companyId;
 *   determinista con `now` inyectable (patrón corrective-preventive-actions-
 *   scoring.ts / management-improvement-actions-scoring.ts). El provider
 *   transporta y adapta; el scorer es la ÚNICA fuente matemática del score de
 *   7.1.3.
 * - Fórmula `dimensions:v1`, target 90. Pesos: investigation 25 /
 *   causalAnalysis 20 / actions 20 / execution 20 / evidence 15 (suma 100).
 *   Razón técnica: la investigación formal y el análisis causal son el núcleo
 *   del criterio ("análisis causal"), las acciones y su ejecución son el
 *   seguimiento operativo ("planes de acción asociados se ejecuten"), y la
 *   evidencia/cierre documentado cierra la cadena (peso menor por ser
 *   transversal).
 * - UNIDAD EVALUABLE (contrato E1 — INCIDENT_713_EVALUABLE_TYPES): el CASO
 *   accidental (accidente/incidente) con su cadena documental completa. NUNCA
 *   se evalúa una acción aislada (frontera con 7.1.1) y DISEASE (3.2.2) queda
 *   EXCLUÍDO del scoring.
 * - FRONTERA con 7.1.1: la efectividad aquí es la PERCEPCIÓN declarativa del
 *   seguimiento (followUp.perceivedEffectiveness) — NO una verificación
 *   formal de eficacia. No se reutiliza ni duplica esa lógica.
 * - NO_DATA SOLO cuando no existen casos evaluables (ACCIDENT/INCIDENTE);
 *   casos deficientes producen score real bajo con findings (reason
 *   'no-evaluable-cases' cuando solo hay DISEASE u otros tipos).
 * - OVERDUE derivado (NUNCA persistido): dueDate < now AND status NOT IN
 *   [COMPLETED, CANCELLED] (isInvestigationActionOverdue del dominio E1).
 */

// ── Contrato del dominio (Lean docs; ObjectIds llegan como ObjectId-like) ──

export interface InvestigationActionLike {
  actionId?: string;
  action?: string;
  actionType?: string;
  responsible?: string;
  responsibleUserId?: unknown;
  responsibleSnapshot?: string;
  status?: string;
  plannedDate?: string | Date;
  dueDate?: string | Date;
  completedDate?: string | Date;
  evidence?: {
    documentId?: unknown;
    documentSnapshot?: string;
    evidenceUrl?: string;
    comment?: string;
  } | null;
  followUp?: {
    followUpDate?: string | Date;
    observations?: string;
    implementationStatus?: string;
    perceivedEffectiveness?: string;
  } | null;
}

export interface IncidentCaseLike {
  _id: unknown;
  companyId?: unknown;
  type?: string;
  date?: string | Date;
  description?: string;
  severity?: string;
  status?: string;
  accidentType?: string;
  /** investigationType ausente = ACCIDENT (default del schema E1). */
  investigationType?: string;
  investigationDate?: string | Date;
  investigationResponsibleUserId?: unknown;
  investigationResponsibleSnapshot?: string;
  /** Legacy string (compatibilidad E1). */
  responsible?: string;
  methodology?: string;
  investigationTeam?: Array<{ userId?: unknown; participantSnapshot?: string; participationRole?: string }>;
  immediateCauses?: string[];
  basicCauses?: string[];
  /** Causas básicas legacy (rol de causas básicas en la metodología histórica). */
  rootCauses?: string[];
  relatedFactors?: string[];
  conclusions?: string;
  recommendations?: string;
  investigationStatus?: string;
  lifecycleStage?: string;
  closureDate?: string | Date;
  closedByUserId?: unknown;
  closedBySnapshot?: string;
  /** Evidencia legacy (string[]). */
  evidence?: string[];
  /** Evidencia estructurada de investigación (E1). */
  investigationEvidence?: Array<{
    documentId?: unknown;
    documentSnapshot?: string;
    evidenceUrl?: string;
    comment?: string;
  }>;
  correctiveActions?: InvestigationActionLike[];
  preventiveActions?: InvestigationActionLike[];
  createdAt?: string | Date;
}

export interface IncidentActionsScoreInput {
  /** TODOS los documentos Incident del tenant (el scorer filtra evaluables). */
  incidents: IncidentCaseLike[];
  /** "Ahora" inyectable para determinismo y tests (default: new Date()). */
  now?: Date;
}

// ── Estructura de salida ──

export interface IncidentActionsDimensionDetail {
  /** 0–1; null = NO evaluable (se redistribuye; NUNCA convertir null en 0). */
  ratio: number | null;
  numerator: number | null;
  denominator: number | null;
  weight: number;
  subchecks?: { satisfied: number; total: number };
  [key: string]: unknown;
}

export interface IncidentActionsFindingDraft {
  id: string;
  title: string;
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface IncidentActionsScoreBreakdown {
  percentage: number;
  noData: boolean;
  /** Causa exacta del NO_DATA (para metadata y tests). */
  noDataReason: 'no-evaluable-cases' | null;
  /** Vigencia del caso evaluable más reciente (contexto). */
  evaluatedPeriod: string | null;
  dimensions: {
    investigation: IncidentActionsDimensionDetail;
    causalAnalysis: IncidentActionsDimensionDetail;
    actions: IncidentActionsDimensionDetail;
    execution: IncidentActionsDimensionDetail;
    evidence: IncidentActionsDimensionDetail;
  };
  counters: {
    totalIncidents: number;
    evaluableIncidents: number;
    accidents: number;
    incidents: number;
    diseasesExcluded: number;
    investigatedCases: number;
    casesWithoutInvestigation: number;
    casesWithCausalAnalysis: number;
    casesWithoutCausalAnalysis: number;
    casesWithActions: number;
    casesWithoutActions: number;
    totalActions: number;
    completedActions: number;
    pendingActions: number;
    overdueActions: number;
    actionsWithEvidence: number;
    actionsWithoutEvidence: number;
    actionsWithFollowUp: number;
    casesClosed: number;
    casesNotClosed: number;
    lastIncidentDate: string | null;
  };
  latestIncident: {
    id: string;
    type: string | null;
    date: string | null;
    description: string | null;
    lifecycleStage: string | null;
    status: string | null;
  } | null;
  findings: IncidentActionsFindingDraft[];
}

// ── Constantes oficiales del estándar 7.1.3 ──

export const INCIDENT_ACTIONS_MODULE = 'incident-actions';
export const INCIDENT_ACTIONS_STANDARD_CODE = '7.1.3';
export const INCIDENT_ACTIONS_STANDARD_TITLE = 'Acciones por accidentes';
export const INCIDENT_ACTIONS_FORMULA = 'dimensions:v1';
export const INCIDENT_ACTIONS_COMPLIANCE_TARGET = 90;

/** Pesos oficiales de las dimensiones (suma exacta 100). */
export const INCIDENT_ACTIONS_SCORE_WEIGHTS = {
  investigation: 25,
  causalAnalysis: 20,
  actions: 20,
  execution: 20,
  evidence: 15,
} as const;

/**
 * Evaluabilidad (contrato E1 — INCIDENT_713_EVALUABLE_TYPES): SOLO
 * ACCIDENT e INCIDENTE son evaluables para 7.1.3; DISEASE (3.2.2) queda
 * EXCLUÍDO. investigationType ausente = ACCIDENT (default del schema E1 que
 * mantiene compatibilidad con registros históricos de accidentalidad).
 */
export const INCIDENT_713_EVALUABLE_TYPES: readonly string[] = ['ACCIDENT', 'INCIDENTE'];

// ── Helpers puros ──

function truthyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Referencia/id "presente": string no vacío U ObjectId-like (.lean()). */
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
function toTime(value: string | Date | undefined | null): number {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? NaN : value.getTime();
  if (typeof value === 'string' && value.trim().length > 0) {
    const t = Date.parse(value);
    return Number.isNaN(t) ? NaN : t;
  }
  return NaN;
}

/**
 * Copia local del helper oficial de redistribución (patrón epp/maintenance/
 * 6.1.4/7.1.1/7.1.2: cada scoring lleva su propia copia desacoplada). Solo las
 * dimensiones con ratio finito 0–1 participan del denominador.
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

/** Tipos válidos de implementación/percepción (espejo de los enums E1). */
const VALID_IMPLEMENTATION_STATUSES = ['NOT_STARTED', 'ON_TRACK', 'DELAYED', 'IMPLEMENTED'];
const VALID_PERCEIVED_EFFECTIVENESS = ['EFECTIVA', 'NO_EFECTIVA', 'INDETERMINADA'];
const VALID_INVESTIGATION_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'CAUSES_IDENTIFIED', 'CONCLUDED'];

/** ¿El caso es evaluable para 7.1.3? (ACCIDENT/INCIDENTE; DISEASE excluido). */
export function isEvaluableIncidentCase(c: IncidentCaseLike): boolean {
  const t = (c.investigationType ?? 'ACCIDENT').toUpperCase();
  return INCIDENT_713_EVALUABLE_TYPES.includes(t);
}

/** Acción con responsable trazable: userId tipado o string (id/snapshot/legacy). */
function actionHasResponsible(a: InvestigationActionLike): boolean {
  return (
    truthyId(a.responsibleUserId) ||
    truthyText(a.responsibleSnapshot) ||
    truthyText(a.responsible)
  );
}

/** Evidencia estructurada con soporte real: documentId (o snapshot) o URL. */
function hasStructuredEvidence(
  e?: Array<{ documentId?: unknown; documentSnapshot?: string; evidenceUrl?: string }> | null,
): boolean {
  if (!e || e.length === 0) return false;
  return e.some((x) => truthyId(x.documentId) || truthyText(x.documentSnapshot) || truthyText(x.evidenceUrl));
}

/** ¿El seguimiento de la acción es real (fecha/estado/percepción válidos)? */
function hasRealFollowUp(a: InvestigationActionLike): boolean {
  const f = a.followUp;
  if (!f) return false;
  const hasDate = !Number.isNaN(toTime(f.followUpDate));
  const hasImplementation =
    truthyText(f.implementationStatus) && VALID_IMPLEMENTATION_STATUSES.includes(f.implementationStatus);
  const hasPerception =
    truthyText(f.perceivedEffectiveness) && VALID_PERCEIVED_EFFECTIVENESS.includes(f.perceivedEffectiveness);
  return hasDate || hasImplementation || hasPerception;
}

/**
 * Perfil de investigación COMPLETO del caso: fecha + responsable (tipado o
 * legacy) + metodología + equipo + estado/conclusión (≥ 3 de 4 bloques).
 * Bloques: (a) investigationDate; (b) responsable; (c) metodología;
 * (d) equipo; (e) investigationStatus o closureDate.
 */
function investigationChecks(c: IncidentCaseLike): boolean[] {
  return [
    !Number.isNaN(toTime(c.investigationDate)),
    truthyId(c.investigationResponsibleUserId) ||
      truthyText(c.investigationResponsibleSnapshot) ||
      truthyText(c.responsible),
    truthyText(c.methodology),
    (c.investigationTeam?.length ?? 0) > 0,
    (truthyText(c.investigationStatus) && VALID_INVESTIGATION_STATUSES.includes(c.investigationStatus as string)) ||
      !Number.isNaN(toTime(c.closureDate)),
  ];
}

/** Investigación INICIADA: al menos fecha o responsable registrado. */
function hasInvestigationStarted(c: IncidentCaseLike): boolean {
  const checks = investigationChecks(c);
  return checks[0] || checks[1];
}

/** Análisis causal: subcondiciones estructurales del caso. */
function causalAnalysisChecks(c: IncidentCaseLike): boolean[] {
  return [
    (c.immediateCauses?.length ?? 0) > 0,
    (c.basicCauses?.length ?? 0) > 0 || (c.rootCauses?.length ?? 0) > 0,
    (c.relatedFactors?.length ?? 0) > 0,
    truthyText(c.conclusions) || truthyText(c.recommendations),
  ];
}

/** OVERDUE derivado de una acción (regla oficial; delega en el helper E1). */
export function isOverdueInvestigationAction(a: InvestigationActionLike, now: Date): boolean {
  if (a.status === 'COMPLETED' || a.status === 'CANCELLED') return false;
  if (!Number.isNaN(toTime(a.completedDate))) return false;
  const due = toTime(a.dueDate);
  return !Number.isNaN(due) && due < now.getTime();
}

/** Calcula el score de 7.1.3. Función PURA (determinista, sin efectos). */
export function computeIncidentActionsScore(
  input: IncidentActionsScoreInput,
): IncidentActionsScoreBreakdown {
  const all = Array.isArray(input.incidents) ? input.incidents : [];
  const now = input.now ?? new Date();

  // ── Evaluabilidad: SOLO ACCIDENT/INCIDENTE (DISEASE excluido) ──
  const evaluable = all.filter(isEvaluableIncidentCase);
  const noData = evaluable.length === 0;
  const noDataReason: IncidentActionsScoreBreakdown['noDataReason'] =
    evaluable.length === 0 ? 'no-evaluable-cases' : null;

  const accidents = evaluable.filter((c) => (c.investigationType ?? 'ACCIDENT').toUpperCase() === 'ACCIDENT').length;
  const incidentsCount = evaluable.length - accidents;
  const diseasesExcluded = all.filter((c) => (c.investigationType ?? '').toUpperCase() === 'DISEASE').length;

  // Acciones de los casos evaluables (la unidad es el CASO; las acciones
  // pertenecen a su caso — no se evalúan aisladas).
  const caseActions = (c: IncidentCaseLike): InvestigationActionLike[] => [
    ...(c.correctiveActions ?? []),
    ...(c.preventiveActions ?? []),
  ];
  const allActions = evaluable.flatMap(caseActions);

  const completedActions = allActions.filter((a) => a.status === 'COMPLETED').length;
  const pendingActions = allActions.filter(
    (a) => a.status === 'PENDING' || a.status === 'IN_PROGRESS',
  ).length;
  const cancelledActions = allActions.filter((a) => a.status === 'CANCELLED').length;
  const overdueActions = allActions.filter((a) => isOverdueInvestigationAction(a, now)).length;
  const actionsWithResponsible = allActions.filter(actionHasResponsible).length;
  const actionsWithEvidence = allActions.filter(
    (a) => hasStructuredEvidence(a.evidence ? [a.evidence] : null),
  ).length;
  const actionsWithoutEvidence = allActions.length - actionsWithEvidence;
  const actionsWithFollowUp = allActions.filter(hasRealFollowUp).length;
  const completedWithoutCompletedDate = allActions.filter(
    (a) => a.status === 'COMPLETED' && Number.isNaN(toTime(a.completedDate)),
  ).length;
  const activeWithoutDueDate = allActions.filter(
    (a) =>
      (a.status === 'PENDING' || a.status === 'IN_PROGRESS') &&
      Number.isNaN(toTime(a.dueDate)),
  ).length;

  const investigatedCases = evaluable.filter(hasInvestigationStarted).length;
  const casesWithoutInvestigation = evaluable.length - investigatedCases;
  const fullyInvestigated = evaluable.filter((c) => investigationChecks(c).filter(Boolean).length >= 4).length;

  const casesWithCausalAnalysis = evaluable.filter((c) => causalAnalysisChecks(c).some(Boolean)).length;
  const casesWithCompleteCausal = evaluable.filter((c) => causalAnalysisChecks(c).every(Boolean)).length;
  const casesWithoutCausalAnalysis = evaluable.length - casesWithCausalAnalysis;

  const casesWithActions = evaluable.filter((c) => caseActions(c).length > 0).length;
  const casesWithoutActions = evaluable.length - casesWithActions;
  const casesWithResponsibleActions = evaluable.filter((c) => {
    const actions = caseActions(c);
    return actions.length > 0 && actions.every(actionHasResponsible);
  }).length;

  const casesClosed = evaluable.filter((c) => !Number.isNaN(toTime(c.closureDate))).length;
  const casesNotClosed = evaluable.length - casesClosed;
  const casesWithClosureDocumented = evaluable.filter(
    (c) =>
      !Number.isNaN(toTime(c.closureDate)) &&
      (truthyId(c.closedByUserId) || truthyText(c.closedBySnapshot)),
  ).length;
  const casesEligibleForClosure = evaluable.filter((c) => {
    if (!Number.isNaN(toTime(c.closureDate))) return false; // ya cerrado
    if (!hasInvestigationStarted(c)) return false;
    const actions = caseActions(c).filter((a) => a.status !== 'CANCELLED');
    return actions.length === 0 || actions.every((a) => a.status === 'COMPLETED');
  }).length;

  const casesWithEvidence = evaluable.filter(
    (c) => hasStructuredEvidence(c.investigationEvidence) || (c.evidence?.length ?? 0) > 0,
  ).length;
  const completedActionsWithEvidence = allActions.filter(
    (a) => a.status === 'COMPLETED' && hasStructuredEvidence(a.evidence ? [a.evidence] : null),
  ).length;

  // ── D1 — INVESTIGACIÓN (25): casos con investigación iniciada. ──
  const investigation: IncidentActionsDimensionDetail = {
    ratio: evaluable.length > 0 ? investigatedCases / evaluable.length : null,
    numerator: evaluable.length > 0 ? investigatedCases : null,
    denominator: evaluable.length > 0 ? evaluable.length : null,
    weight: INCIDENT_ACTIONS_SCORE_WEIGHTS.investigation,
    evaluableCases: evaluable.length,
    investigatedCases,
    fullyInvestigatedCases: fullyInvestigated,
  };

  // ── D2 — ANÁLISIS CAUSAL (20): fracción de subcondiciones por caso. ──
  const causalSum = evaluable.reduce(
    (sum, c) => sum + causalAnalysisChecks(c).filter(Boolean).length / 4,
    0,
  );
  const causalAnalysis: IncidentActionsDimensionDetail = {
    ratio: evaluable.length > 0 ? causalSum / evaluable.length : null,
    numerator: evaluable.length > 0 ? causalSum : null,
    denominator: evaluable.length > 0 ? evaluable.length : null,
    weight: INCIDENT_ACTIONS_SCORE_WEIGHTS.causalAnalysis,
    casesWithCausalAnalysis,
    casesWithCompleteCausalAnalysis: casesWithCompleteCausal,
  };

  // ── D3 — ACCIONES DERIVADAS (20): fracción de acciones con responsable ──
  // por caso (un caso sin acciones aporta 0 — no genera 100% artificial).
  const actionsSum = evaluable.reduce((sum, c) => {
    const actions = caseActions(c);
    if (actions.length === 0) return sum;
    return sum + actions.filter(actionHasResponsible).length / actions.length;
  }, 0);
  const actions: IncidentActionsDimensionDetail = {
    ratio: evaluable.length > 0 ? actionsSum / evaluable.length : null,
    numerator: evaluable.length > 0 ? actionsSum : null,
    denominator: evaluable.length > 0 ? evaluable.length : null,
    weight: INCIDENT_ACTIONS_SCORE_WEIGHTS.actions,
    casesWithActions,
    casesWithoutActions,
    casesWithResponsibleActions,
    totalActions: allActions.length,
  };

  // ── D4 — EJECUCIÓN Y OPORTUNIDAD (20): 4 subcondiciones de portafolio. ──
  const executionSubchecks = (() => {
    if (evaluable.length === 0) return { satisfied: 0, total: 4 };
    const checks = [
      completedActions >= 1,
      overdueActions === 0,
      completedActions === 0 || completedWithoutCompletedDate === 0,
      allActions.length === 0 || activeWithoutDueDate === 0,
    ];
    return { satisfied: checks.filter(Boolean).length, total: checks.length };
  })();
  const execution: IncidentActionsDimensionDetail = {
    ratio: evaluable.length > 0 ? executionSubchecks.satisfied / executionSubchecks.total : null,
    numerator: evaluable.length > 0 ? executionSubchecks.satisfied : null,
    denominator: evaluable.length > 0 ? executionSubchecks.total : null,
    weight: INCIDENT_ACTIONS_SCORE_WEIGHTS.execution,
    subchecks: executionSubchecks,
    overdueActions,
    cancelledActions,
  };

  // ── D5 — EVIDENCIA Y TRAZABILIDAD (15): 3 subcondiciones de portafolio. ──
  const evidenceSubchecks = (() => {
    if (evaluable.length === 0) return { satisfied: 0, total: 3 };
    const checks = [
      casesWithEvidence >= 1,
      completedActions === 0 || completedActionsWithEvidence === completedActions,
      casesWithClosureDocumented >= 1 || casesClosed === 0,
    ];
    return { satisfied: checks.filter(Boolean).length, total: checks.length };
  })();
  const evidence: IncidentActionsDimensionDetail = {
    ratio: evaluable.length > 0 ? evidenceSubchecks.satisfied / evidenceSubchecks.total : null,
    numerator: evaluable.length > 0 ? evidenceSubchecks.satisfied : null,
    denominator: evaluable.length > 0 ? evidenceSubchecks.total : null,
    weight: INCIDENT_ACTIONS_SCORE_WEIGHTS.evidence,
    subchecks: evidenceSubchecks,
    casesWithEvidence,
    actionsWithEvidence,
    casesWithClosureDocumented,
  };

  const w = INCIDENT_ACTIONS_SCORE_WEIGHTS;
  const percentage = noData
    ? 0
    : redistributeWeightedScore([
        { ratio: investigation.ratio, weight: w.investigation },
        { ratio: causalAnalysis.ratio, weight: w.causalAnalysis },
        { ratio: actions.ratio, weight: w.actions },
        { ratio: execution.ratio, weight: w.execution },
        { ratio: evidence.ratio, weight: w.evidence },
      ]);

  // ── Período evaluado (contexto): año del caso evaluable más reciente. ──
  const latest = evaluable.length > 0
    ? evaluable.reduce((best, c) => {
        const ta = toTime(c.date);
        const tb = toTime(best.date);
        return ta > tb ? c : best;
      })
    : undefined;
  const evaluatedPeriod = latest
    ? (() => {
        const t = toTime(latest.date);
        return Number.isNaN(t) ? null : String(new Date(t).getUTCFullYear());
      })()
    : null;

  const latestIncident = latest
    ? {
        id: String(latest._id),
        type: truthyText(latest.type) ? (latest.type as string) : null,
        date: !Number.isNaN(toTime(latest.date)) ? new Date(toTime(latest.date)).toISOString() : null,
        description: truthyText(latest.description) ? (latest.description as string) : null,
        lifecycleStage: truthyText(latest.lifecycleStage) ? (latest.lifecycleStage as string) : null,
        status: truthyText(latest.status) ? (latest.status as string) : null,
      }
    : null;

  // ── Counters globales ──
  const counters: IncidentActionsScoreBreakdown['counters'] = {
    totalIncidents: all.length,
    evaluableIncidents: evaluable.length,
    accidents,
    incidents: incidentsCount,
    diseasesExcluded,
    investigatedCases,
    casesWithoutInvestigation,
    casesWithCausalAnalysis,
    casesWithoutCausalAnalysis,
    casesWithActions,
    casesWithoutActions,
    totalActions: allActions.length,
    completedActions,
    pendingActions,
    overdueActions,
    actionsWithEvidence,
    actionsWithoutEvidence,
    actionsWithFollowUp,
    casesClosed,
    casesNotClosed,
    lastIncidentDate:
      latest && !Number.isNaN(toTime(latest.date)) ? new Date(toTime(latest.date)).toISOString() : null,
  };

  // ── Findings oficiales (solo lo demostrable desde los datos) ──
  const findings: IncidentActionsFindingDraft[] = [];
  if (noData) {
    findings.push({
      id: 'incident-actions-no-data',
      title: 'Sin casos evaluable de accidentes/incidentes registrados',
      description:
        'No existen casos de accidente o incidente de trabajo registrados (los casos de enfermedad laboral no puntúan este estándar). El estándar 7.1.3 requiere que los accidentes generen acciones con análisis causal y cierre documentado.',
      priority: 'HIGH',
    });
  } else {
    if (casesWithoutInvestigation > 0) {
      findings.push({
        id: 'incident-actions-no-investigation',
        title: `${casesWithoutInvestigation} caso(s) sin investigación registrada`,
        description: `${casesWithoutInvestigation} de ${evaluable.length} caso(s) evaluable(s) no tienen investigación formal iniciada (fecha o responsable de investigación). Registre la investigación de cada accidente/incidente.`,
        priority: 'HIGH',
      });
    }
    const incompleteInvestigations = investigatedCases - fullyInvestigated;
    if (incompleteInvestigations > 0) {
      findings.push({
        id: 'incident-actions-incomplete-investigation',
        title: `${incompleteInvestigations} investigación(es) incompleta(s)`,
        description: `${incompleteInvestigations} investigación(es) carecen de algún bloque del perfil formal (fecha, responsable, metodología, equipo o estado/conclusión). Complete el perfil de investigación.`,
        priority: 'MEDIUM',
      });
    }
    if (casesWithoutCausalAnalysis > 0) {
      findings.push({
        id: 'incident-actions-incomplete-causal-analysis',
        title: `${casesWithoutCausalAnalysis} caso(s) sin análisis causal`,
        description: `${casesWithoutCausalAnalysis} caso(s) no registran causas inmediatas, básicas, factores relacionados ni conclusiones. Documente el análisis causal de la investigación.`,
        priority: 'HIGH',
      });
    }
    if (casesWithoutActions > 0) {
      findings.push({
        id: 'incident-actions-no-actions',
        title: `${casesWithoutActions} caso(s) sin acciones derivadas`,
        description: `${casesWithoutActions} caso(s) investigado(s) no tienen acciones correctivas ni preventivas definidas. Derive acciones de las conclusiones de la investigación.`,
        priority: 'MEDIUM',
      });
    }
    const actionsWithoutResponsible = allActions.length - actionsWithResponsible;
    if (actionsWithoutResponsible > 0) {
      findings.push({
        id: 'incident-actions-actions-without-responsible',
        title: `${actionsWithoutResponsible} acción(es) sin responsable`,
        description: `${actionsWithoutResponsible} acción(es) no tienen responsable identificable. Asigne responsable a cada acción derivada.`,
        priority: 'MEDIUM',
      });
    }
    if (overdueActions > 0) {
      findings.push({
        id: 'incident-actions-overdue',
        title: `${overdueActions} acción(es) vencida(s) sin cierre`,
        description:
          'Existen acciones cuya fecha compromiso ya pasó sin estado terminal (COMPLETED/CANCELLED). Ejecute, complete o reprograme estas acciones.',
        priority: 'HIGH',
      });
    }
    if (pendingActions > 0) {
      findings.push({
        id: 'incident-actions-actions-incomplete',
        title: `${pendingActions} acción(es) pendiente(s) o en ejecución`,
        description: `${pendingActions} acción(es) derivadas de investigaciones permanecen sin completar. Dé seguimiento hasta su cierre.`,
        priority: 'MEDIUM',
      });
    }
    if (actionsWithoutEvidence > 0 || completedActionsWithEvidence < completedActions) {
      findings.push({
        id: 'incident-actions-no-evidence',
        title: 'Evidencia de implementación insuficiente',
        description: `${actionsWithoutEvidence} acción(es) sin evidencia registrada${completedActions > completedActionsWithEvidence ? `; ${completedActions - completedActionsWithEvidence} acción(es) completada(s) sin soporte documental o URL` : ''}. Registre documentId (DocumentManagement) o evidenceUrl.`,
        priority: 'MEDIUM',
      });
    }
    if (actionsWithFollowUp < allActions.length) {
      findings.push({
        id: 'incident-actions-insufficient-follow-up',
        title: 'Seguimiento de acciones insuficiente',
        description: `${allActions.length - actionsWithFollowUp} acción(es) sin actividad de seguimiento real (fecha, estado de implementación o percepción de efectividad registrados).`,
        priority: 'MEDIUM',
      });
    }
    if (casesEligibleForClosure > 0) {
      findings.push({
        id: 'incident-actions-closure-not-documented',
        title: `${casesEligibleForClosure} caso(s) con cierre pendiente de documentar`,
        description: `${casesEligibleForClosure} caso(s) con investigación y acciones completas que aún no documentan su cierre (closureDate/actor de cierre). Formalice el cierre documentado del caso.`,
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
      investigation,
      causalAnalysis,
      actions,
      execution,
      evidence,
    },
    counters,
    latestIncident,
    findings,
  };
}
