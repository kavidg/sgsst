/**
 * Núcleo PURO de scoring del estándar 6.1.2 — Auditoría anual SG-SST (VERIFICAR).
 *
 * Sin Mongo/Mongoose/NestJS/servicios/queries: recibe únicamente datos
 * serializables (ya consultados tenant-scoped por el provider) y devuelve un
 * breakdown completo (dimensions/counters/findings). Patrón:
 * indicators-scoring.ts (6.1.1) / emergency-brigade-scoring.ts (5.1.2).
 *
 * DECISIONES FUNCIONALES (Etapa E2 — provider oficial de 6.1.2):
 *  - Fuente oficial: colección AnnualAudit (dominio propio creado en E1).
 *    AccountabilityMeeting/Commitment y DocumentMaster NO participan del
 *    score (frontera anti-double-scoring; DocumentMaster es solo evidencia).
 *  - D1–D5 se evalúan sobre la auditoría evaluable MÁS RECIENTE (gestión
 *    vigente); D6 (historial) sobre TODAS las evaluables. Así "más
 *    auditorías" NO mejora el score (solo la continuidad temporal de D6).
 *  - Subcondiciones explícitas por dimensión (sin freebie por existir).
 *  - Auditoría sin hallazgos → D3 válida (1) y D4 null (redistribuida):
 *    una auditoría puede no encontrar no conformidades.
 *  - Auditorías con fechas futuras o rangos incoherentes NO son evaluables
 *    y generan finding de integridad (patrón del ítem 14 del diseño).
 *  - D6 con un solo año evaluado → null (no se exige historia multiannual;
 *    se redistribuye; política idéntica a D6 de 6.1.1).
 */

export const ANNUAL_AUDIT_MODULE = 'annual-audit';
export const ANNUAL_AUDIT_STANDARD_CODE = '6.1.2';
export const ANNUAL_AUDIT_FORMULA = 'dimensions:v1';

/** Meta de cumplimiento oficial (patrón 5.1.x / 4.2.x / 6.1.1). */
export const ANNUAL_AUDIT_COMPLIANCE_TARGET = 90;

/** Pesos de las 6 dimensiones (suman exactamente 100). */
export const ANNUAL_AUDIT_SCORE_WEIGHTS = {
  program: 15,
  executionReport: 25,
  findingsDocumentation: 20,
  followUpClosure: 20,
  evidenceAnalysis: 10,
  periodicityHistory: 10,
} as const;

// ── Entrada (serializable; sin tipos de Mongoose) ──

export interface AuditActionLike {
  _id?: string;
  description?: string;
  responsible?: string;
  dueDate?: string | Date;
  status?: string;
  completedDate?: string | Date;
  evidenceUrl?: string;
}

export interface AuditFindingLike {
  _id?: string;
  type?: string;
  description?: string;
  criterion?: string;
  evidence?: string;
  severity?: string;
  responsibleUserId?: string;
  responsibleNameSnapshot?: string;
  dueDate?: string | Date;
  status?: string;
  actions?: AuditActionLike[];
}

export interface AnnualAuditLike {
  _id: string;
  auditCode?: string;
  title?: string;
  auditType?: string;
  plannedStartDate?: string | Date;
  plannedEndDate?: string | Date;
  scope?: string;
  objectives?: string;
  criteria?: string;
  methodology?: string;
  auditorUserId?: string;
  auditorNameSnapshot?: string;
  auditorCompetence?: string;
  auditorCompetenceEvidenceId?: string;
  actualStartDate?: string | Date;
  actualEndDate?: string | Date;
  status?: string;
  reportTitle?: string;
  reportDate?: string | Date;
  reportSummary?: string;
  reportDocumentId?: string;
  reportEvidenceUrl?: string;
  findingsSummary?: string;
  findings?: AuditFindingLike[];
}

export interface AnnualAuditScoreInput {
  /** Auditorías de la empresa (todas; tenant-scoped). */
  audits: AnnualAuditLike[];
  /** "Ahora" inyectable para determinismo y tests (default: new Date()). */
  now?: Date;
}

// ── Estructura de salida ──

export interface AnnualAuditDimensionDetail {
  /** 0–1; null = NO evaluable (se redistribuye; NUNCA convertir null en 0). */
  ratio: number | null;
  numerator: number | null;
  denominator: number | null;
  weight: number;
  [key: string]: unknown;
}

export interface AnnualAuditFindingDraft {
  id: string;
  title: string;
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface AnnualAuditScoreBreakdown {
  percentage: number;
  noData: boolean;
  /** Causa exacta del NO_DATA (para metadata y tests). */
  noDataReason: 'no-audits' | 'no-evaluable-audits' | null;
  /** Año de la auditoría evaluable más reciente (contexto; null si no hay). */
  evaluatedPeriod: string | null;
  dimensions: {
    program: AnnualAuditDimensionDetail;
    executionReport: AnnualAuditDimensionDetail;
    findingsDocumentation: AnnualAuditDimensionDetail;
    followUpClosure: AnnualAuditDimensionDetail;
    evidenceAnalysis: AnnualAuditDimensionDetail;
    periodicityHistory: AnnualAuditDimensionDetail;
  };
  counters: {
    totalAudits: number;
    evaluableAudits: number;
    completedAudits: number;
    cancelledAudits: number;
    draftAudits: number;
    plannedAudits: number;
    inProgressAudits: number;
    auditsWithReport: number;
    auditsWithEvidence: number;
    auditsWithCompetenceEvidence: number;
    auditsWithFindings: number;
    totalFindings: number;
    completeFindings: number;
    incompleteFindings: number;
    totalActions: number;
    completedActions: number;
    openActions: number;
    overdueActions: number;
    actionsWithEvidence: number;
    futureDateAudits: number;
    auditsWithIntegrityIssues: number;
    duplicateAuditCodes: number;
  };
  findings: AnnualAuditFindingDraft[];
}

// ── Helpers puros ──

function truthyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function truthyId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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
 * indicators: cada scoring lleva su propia copia desacoplada). Solo las
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

/** Informe con información mínima (título, documento o URL de evidencia). */
function hasMinimalReport(a: AnnualAuditLike): boolean {
  return truthyText(a.reportTitle) || truthyId(a.reportDocumentId) || truthyText(a.reportEvidenceUrl);
}

/**
 * Auditoría EVALUABLE para scoring (ítem 13 del diseño):
 * COMPLETED + fechas reales válidas y coherentes + informe mínimo.
 * Los estados previos (DRAFT/PLANNED/IN_PROGRESS) no son evidencia histórica.
 * CANCELLED nunca entra. Fechas futuras/rangos incoherentes invalidan.
 */
export function isEvaluableAudit(a: AnnualAuditLike, now: Date): boolean {
  if (a.status !== 'COMPLETED') return false;
  const start = toTime(a.actualStartDate);
  const end = toTime(a.actualEndDate);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  if (start > end) return false;
  if (end > now.getTime() || start > now.getTime()) return false;
  return hasMinimalReport(a);
}

/** Hallazgo suficientemente documentado (7 condiciones, ítem 7 del diseño). */
function isCompleteFinding(f: AuditFindingLike): boolean {
  return (
    truthyText(f.type) &&
    truthyText(f.description) &&
    truthyText(f.criterion) &&
    truthyText(f.evidence) &&
    (truthyText(f.responsibleNameSnapshot) || truthyId(f.responsibleUserId)) &&
    !Number.isNaN(toTime(f.dueDate)) &&
    truthyText(f.status)
  );
}

/** Calcula el score de 6.1.2. Función PURA (determinista, sin efectos). */
export function computeAnnualAuditScore(input: AnnualAuditScoreInput): AnnualAuditScoreBreakdown {
  const audits = Array.isArray(input.audits) ? input.audits : [];
  const now = input.now ?? new Date();

  // ── Contadores de estado (todas las auditorías del tenant) ──
  const completedAudits = audits.filter((a) => a.status === 'COMPLETED').length;
  const cancelledAudits = audits.filter((a) => a.status === 'CANCELLED').length;
  const draftAudits = audits.filter((a) => a.status === 'DRAFT').length;
  const plannedAudits = audits.filter((a) => a.status === 'PLANNED').length;
  const inProgressAudits = audits.filter((a) => a.status === 'IN_PROGRESS').length;

  // ── Integridad: fechas futuras / rangos incoherentes / códigos duplicados ──
  let futureDateAudits = 0;
  let invalidRangeAudits = 0;
  for (const a of audits) {
    const start = toTime(a.actualStartDate);
    const end = toTime(a.actualEndDate);
    const future =
      (!Number.isNaN(start) && start > now.getTime()) || (!Number.isNaN(end) && end > now.getTime());
    if (future) futureDateAudits += 1;
    if (!Number.isNaN(start) && !Number.isNaN(end) && start > end) invalidRangeAudits += 1;
  }
  const seenCodes = new Map<string, number>();
  for (const a of audits) {
    if (truthyText(a.auditCode)) {
      seenCodes.set(a.auditCode.trim(), (seenCodes.get(a.auditCode.trim()) ?? 0) + 1);
    }
  }
  let duplicateAuditCodes = 0;
  for (const count of seenCodes.values()) {
    if (count > 1) duplicateAuditCodes += count - 1;
  }
  const auditsWithIntegrityIssues = futureDateAudits + invalidRangeAudits + duplicateAuditCodes;

  // ── Conjunto evaluable (fechas futuras/incoherentes excluidas) ──
  const evaluable = audits.filter((a) => isEvaluableAudit(a, now));

  // Auditoría evaluable más reciente (actualEndDate desc → actualStartDate → _id).
  const sortKey = (a: AnnualAuditLike): [number, number, string] => {
    const end = toTime(a.actualEndDate);
    const start = toTime(a.actualStartDate);
    return [Number.isNaN(end) ? 0 : end, Number.isNaN(start) ? 0 : start, String(a._id ?? '')];
  };
  const latest = evaluable.length > 0
    ? evaluable.reduce((best, a) => {
        const ka = sortKey(a);
        const kb = sortKey(best);
        return ka[0] > kb[0] || (ka[0] === kb[0] && (ka[1] > kb[1] || (ka[1] === kb[1] && ka[2] > kb[2])))
          ? a
          : best;
      })
    : undefined;

  const findingsOf = (a: AnnualAuditLike | undefined): AuditFindingLike[] =>
    Array.isArray(a?.findings) ? (a?.findings as AuditFindingLike[]) : [];

  // ── NO_DATA (ítem 12 del diseño) ──
  // Caso A: sin auditorías. Caso B: auditorías pero ninguna evaluable.
  // Caso C: al menos una evaluable → score real (0% incluido).
  const noData = audits.length === 0 || evaluable.length === 0;
  const noDataReason: AnnualAuditScoreBreakdown['noDataReason'] =
    audits.length === 0 ? 'no-audits' : evaluable.length === 0 ? 'no-evaluable-audits' : null;

  // ── D1 — PROGRAMA (15): planificación completa de la más reciente evaluable.
  // 7 subcondiciones: título, rango planificado válido, alcance, objetivos,
  // criterios, metodología, auditor identificado. Sin freebie por existir.
  const programSubchecks = (() => {
    if (!latest) return { satisfied: 0, total: 7 };
    const pStart = toTime(latest.plannedStartDate);
    const pEnd = toTime(latest.plannedEndDate);
    const plannedRangeValid = !Number.isNaN(pStart) && !Number.isNaN(pEnd) && pStart <= pEnd;
    const checks = [
      truthyText(latest.title),
      plannedRangeValid,
      truthyText(latest.scope),
      truthyText(latest.objectives),
      truthyText(latest.criteria),
      truthyText(latest.methodology),
      truthyId(latest.auditorUserId) || truthyText(latest.auditorNameSnapshot),
    ];
    return { satisfied: checks.filter(Boolean).length, total: checks.length };
  })();
  const program: AnnualAuditDimensionDetail = {
    ratio: latest ? programSubchecks.satisfied / programSubchecks.total : null,
    numerator: latest ? programSubchecks.satisfied : null,
    denominator: latest ? programSubchecks.total : null,
    weight: ANNUAL_AUDIT_SCORE_WEIGHTS.program,
    subchecks: programSubchecks,
    evaluatedAuditId: latest?._id ?? null,
  };

  // ── D2 — EJECUCIÓN / INFORME (25): ejecución real documentada.
  // 8 subcondiciones sobre la más reciente evaluable: inicio real, fin real,
  // coherencia de fechas, COMPLETED, título de informe, fecha de informe,
  // contenido (summary), soporte (documento o URL). La evaluable ya garantiza
  // el piso mínimo (fechas + informe mínimo): el contenido completo es lo que
  // suma el resto.
  const executionSubchecks = (() => {
    if (!latest) return { satisfied: 0, total: 8 };
    const start = toTime(latest.actualStartDate);
    const end = toTime(latest.actualEndDate);
    const checks = [
      !Number.isNaN(start),
      !Number.isNaN(end),
      !Number.isNaN(start) && !Number.isNaN(end) && start <= end,
      latest.status === 'COMPLETED',
      truthyText(latest.reportTitle),
      !Number.isNaN(toTime(latest.reportDate)),
      truthyText(latest.reportSummary) || truthyText(latest.findingsSummary),
      truthyId(latest.reportDocumentId) || truthyText(latest.reportEvidenceUrl),
    ];
    return { satisfied: checks.filter(Boolean).length, total: checks.length };
  })();
  const executionReport: AnnualAuditDimensionDetail = {
    ratio: latest ? executionSubchecks.satisfied / executionSubchecks.total : null,
    numerator: latest ? executionSubchecks.satisfied : null,
    denominator: latest ? executionSubchecks.total : null,
    weight: ANNUAL_AUDIT_SCORE_WEIGHTS.executionReport,
    subchecks: executionSubchecks,
  };

  // ── D3 — HALLAZGOS DOCUMENTADOS (20): calidad del registro, no cantidad.
  // Sin hallazgos → 1 (puede no haber no conformidades). Con hallazgos →
  // completos/total (hallazgos vacíos NO suman).
  const latestFindings = findingsOf(latest);
  const latestCompleteFindings = latestFindings.filter(isCompleteFinding);
  const findingsDocumentation: AnnualAuditDimensionDetail = {
    ratio: latest
      ? latestFindings.length === 0
        ? 1
        : latestCompleteFindings.length / latestFindings.length
      : null,
    numerator: latest ? (latestFindings.length === 0 ? 1 : latestCompleteFindings.length) : null,
    denominator: latest ? (latestFindings.length === 0 ? 1 : latestFindings.length) : null,
    weight: ANNUAL_AUDIT_SCORE_WEIGHTS.findingsDocumentation,
    noFindings: latest ? latestFindings.length === 0 : null,
    totalFindings: latestFindings.length,
    completeFindings: latestCompleteFindings.length,
  };

  // ── D4 — SEGUIMIENTO / CIERRE (20): acciones de findings[] (NUNCA
  // AccountabilityCommitment). Sin hallazgos → null (redistribuida; no se
  // penaliza). Con hallazgos y sin acciones → 0. Con acciones →
  // completadas/total (los detalles registran abiertas/vencidas/evidencia).
  const latestActions = latestFindings.flatMap((f) => (Array.isArray(f.actions) ? f.actions : []));
  const latestCompletedActions = latestActions.filter((a) => a.status === 'COMPLETED');
  const latestOpenActions = latestActions.filter((a) => a.status !== 'COMPLETED');
  const latestOverdueActions = latestActions.filter((a) => {
    if (a.status === 'COMPLETED') return false;
    const due = toTime(a.dueDate);
    return !Number.isNaN(due) && due < now.getTime();
  });
  const latestActionsWithEvidence = latestActions.filter((a) => truthyText(a.evidenceUrl));
  const followUpClosure: AnnualAuditDimensionDetail = {
    ratio: latest
      ? latestFindings.length === 0
        ? null
        : latestActions.length === 0
          ? 0
          : latestCompletedActions.length / latestActions.length
      : null,
    numerator: latest
      ? latestFindings.length === 0
        ? null
        : latestCompletedActions.length
      : null,
    denominator: latest
      ? latestFindings.length === 0
        ? null
        : latestActions.length === 0
          ? 0
          : latestActions.length
      : null,
    weight: ANNUAL_AUDIT_SCORE_WEIGHTS.followUpClosure,
    notApplicableNoFindings: latest ? latestFindings.length === 0 : null,
    totalActions: latestActions.length,
    completedActions: latestCompletedActions.length,
    openActions: latestOpenActions.length,
    overdueActions: latestOverdueActions.length,
    actionsWithEvidence: latestActionsWithEvidence.length,
  };

  // ── D5 — EVIDENCIA / ANÁLISIS (10): trazabilidad, SIN doble conteo.
  // 4 subcondiciones: soporte del informe (documento O URL cuentan como UNA
  // evidencia), análisis/resumen, evidencia de competencia del auditor,
  // evidencia en hallazgos (todos con evidencia, o sin hallazgos → neutro).
  const evidenceSubchecks = (() => {
    if (!latest) return { satisfied: 0, total: 4 };
    const reportEvidence = truthyId(latest.reportDocumentId) || truthyText(latest.reportEvidenceUrl);
    const analysis = truthyText(latest.reportSummary) || truthyText(latest.findingsSummary);
    const competenceEvidence = truthyId(latest.auditorCompetenceEvidenceId);
    const findingsEvidence =
      latestFindings.length === 0 ? true : latestCompleteFindings.length === latestFindings.length;
    const checks = [reportEvidence, analysis, competenceEvidence, findingsEvidence];
    return { satisfied: checks.filter(Boolean).length, total: checks.length };
  })();
  const evidenceAnalysis: AnnualAuditDimensionDetail = {
    ratio: latest ? evidenceSubchecks.satisfied / evidenceSubchecks.total : null,
    numerator: latest ? evidenceSubchecks.satisfied : null,
    denominator: latest ? evidenceSubchecks.total : null,
    weight: ANNUAL_AUDIT_SCORE_WEIGHTS.evidenceAnalysis,
    subchecks: evidenceSubchecks,
  };

  // ── D6 — PERIODICIDAD / HISTORIAL (10): continuidad temporal, NO volumen.
  // Años distintos (actualEndDate) con ≥1 evaluable. 1 año → null (no se
  // exige historia multiannual; se redistribuye). ≥2 años → 1.
  const distinctYears = new Set<string>();
  for (const a of evaluable) {
    const end = toTime(a.actualEndDate);
    if (!Number.isNaN(end)) {
      distinctYears.add(String(new Date(end).getUTCFullYear()));
    }
  }
  const periodicityHistory: AnnualAuditDimensionDetail = {
    ratio: distinctYears.size >= 2 ? 1 : distinctYears.size === 1 ? null : 0,
    numerator: distinctYears.size >= 2 ? 2 : null,
    denominator: distinctYears.size >= 2 ? 2 : null,
    weight: ANNUAL_AUDIT_SCORE_WEIGHTS.periodicityHistory,
    distinctCompletedYears: distinctYears.size,
    evaluableAudits: evaluable.length,
  };

  const w = ANNUAL_AUDIT_SCORE_WEIGHTS;
  const percentage = noData
    ? 0
    : redistributeWeightedScore([
        { ratio: program.ratio, weight: w.program },
        { ratio: executionReport.ratio, weight: w.executionReport },
        { ratio: findingsDocumentation.ratio, weight: w.findingsDocumentation },
        { ratio: followUpClosure.ratio, weight: w.followUpClosure },
        { ratio: evidenceAnalysis.ratio, weight: w.evidenceAnalysis },
        { ratio: periodicityHistory.ratio, weight: w.periodicityHistory },
      ]);

  // ── Período evaluado (contexto): año de la evaluable más reciente. ──
  const evaluatedPeriod = latest ? (() => {
    const end = toTime(latest.actualEndDate);
    return Number.isNaN(end) ? null : String(new Date(end).getUTCFullYear());
  })() : null;

  // ── Counters globales (todas las auditorías del tenant) ──
  const allFindings = audits.flatMap((a) => findingsOf(a));
  const allActions = allFindings.flatMap((f) => (Array.isArray(f.actions) ? f.actions : []));
  const allCompleteFindings = allFindings.filter(isCompleteFinding);
  const counters: AnnualAuditScoreBreakdown['counters'] = {
    totalAudits: audits.length,
    evaluableAudits: evaluable.length,
    completedAudits,
    cancelledAudits,
    draftAudits,
    plannedAudits,
    inProgressAudits,
    auditsWithReport: audits.filter(hasMinimalReport).length,
    auditsWithEvidence: audits.filter(
      (a) => truthyId(a.reportDocumentId) || truthyText(a.reportEvidenceUrl) || truthyId(a.auditorCompetenceEvidenceId),
    ).length,
    auditsWithCompetenceEvidence: audits.filter((a) => truthyId(a.auditorCompetenceEvidenceId)).length,
    auditsWithFindings: audits.filter((a) => findingsOf(a).length > 0).length,
    totalFindings: allFindings.length,
    completeFindings: allCompleteFindings.length,
    incompleteFindings: allFindings.length - allCompleteFindings.length,
    totalActions: allActions.length,
    completedActions: allActions.filter((a) => a.status === 'COMPLETED').length,
    openActions: allActions.filter((a) => a.status !== 'COMPLETED').length,
    overdueActions: allActions.filter((a) => {
      if (a.status === 'COMPLETED') return false;
      const due = toTime(a.dueDate);
      return !Number.isNaN(due) && due < now.getTime();
    }).length,
    actionsWithEvidence: allActions.filter((a) => truthyText(a.evidenceUrl)).length,
    futureDateAudits,
    auditsWithIntegrityIssues,
    duplicateAuditCodes,
  };

  // ── Findings oficiales (solo lo demostrable desde los datos) ──
  const findings: AnnualAuditFindingDraft[] = [];
  if (audits.length === 0) {
    findings.push({
      id: 'annual-audit-no-data',
      title: 'Sin auditorías internas registradas',
      description:
        'No existen auditorías al SG-SST registradas. El estándar 6.1.2 requiere auditoría anual con hallazgos documentados y seguimiento al cierre de acciones.',
      priority: 'HIGH',
    });
  } else if (evaluable.length === 0) {
    findings.push({
      id: 'annual-audit-no-evaluable-audits',
      title: 'Sin auditorías evaluables',
      description: `Existen ${audits.length} auditoría(s) registrada(s) pero ninguna cumple las condiciones de evaluación (COMPLETED, fechas reales válidas e informe mínimo). Complete la ejecución y el informe de al menos una auditoría.`,
      priority: 'HIGH',
    });
  } else {
    const programIncomplete = programSubchecks.total - programSubchecks.satisfied;
    if (programIncomplete > 0) {
      findings.push({
        id: 'annual-audit-program-incomplete',
        title: 'Programa de auditoría incompleto',
        description: `La auditoría evaluable más reciente carece de ${programIncomplete} de ${programSubchecks.total} elementos de planificación (título, fechas planificadas, alcance, objetivos, criterios, metodología, auditor identificado).`,
        priority: programSubchecks.satisfied === 0 ? 'HIGH' : 'MEDIUM',
      });
    }
    const notCompleted = draftAudits + plannedAudits + inProgressAudits;
    if (notCompleted > 0) {
      findings.push({
        id: 'annual-audit-not-completed',
        title: `${notCompleted} auditoría(s) sin completar`,
        description: `${draftAudits} en borrador, ${plannedAudits} planificada(s) y ${inProgressAudits} en ejecución. Solo las auditorías COMPLETED con informe constituyen evidencia de ejecución.`,
        priority: 'MEDIUM',
      });
    }
    if (latest && !truthyText(latest.reportTitle) && !truthyText(latest.reportSummary) && !truthyText(latest.findingsSummary)) {
      findings.push({
        id: 'annual-audit-no-report',
        title: 'Informe de auditoría sin contenido documentado',
        description:
          'La auditoría evaluable más reciente no registra título ni resumen del informe (solo soporte documental o URL). Documente el contenido del informe para demostrar el resultado de la auditoría.',
        priority: 'MEDIUM',
      });
    }
    if (counters.incompleteFindings > 0) {
      findings.push({
        id: 'annual-audit-findings-incomplete',
        title: `${counters.incompleteFindings} hallazgo(s) incompleto(s)`,
        description:
          'Existen hallazgos sin los elementos mínimos de documentación (tipo, descripción, criterio, evidencia, responsable, fecha límite, estado). Los hallazgos vacíos no demuestran gestión.',
        priority: 'MEDIUM',
      });
    }
    if (counters.openActions > 0) {
      findings.push({
        id: 'annual-audit-open-actions',
        title: `${counters.openActions} acción(es) de seguimiento abierta(s)`,
        description: 'Existen acciones derivadas de hallazgos pendientes o en progreso. Complete su cierre para demostrar el seguimiento de la auditoría.',
        priority: 'MEDIUM',
      });
    }
    if (counters.overdueActions > 0) {
      findings.push({
        id: 'annual-audit-overdue-actions',
        title: `${counters.overdueActions} acción(es) vencida(s)`,
        description: 'Existen acciones de seguimiento con fecha límite vencida sin completar. Priorice su cierre y registre la evidencia correspondiente.',
        priority: 'HIGH',
      });
    }
    if (evidenceSubchecks.satisfied < evidenceSubchecks.total) {
      findings.push({
        id: 'annual-audit-evidence-missing',
        title: 'Evidencia y análisis incompletos',
        description: `Faltan ${evidenceSubchecks.total - evidenceSubchecks.satisfied} de ${evidenceSubchecks.total} elementos de trazabilidad (soporte del informe, resumen/análisis, competencia del auditor, evidencia de hallazgos).`,
        priority: 'LOW',
      });
    }
    if (distinctYears.size === 1) {
      findings.push({
        id: 'annual-audit-history-incomplete',
        title: 'Historial limitado a un solo año',
        description:
          'Solo existe evidencia de auditoría completada en un año. La continuidad anual se evaluará cuando existan al menos dos años con auditorías completadas.',
        priority: 'LOW',
      });
    }
    if (counters.auditsWithIntegrityIssues > 0) {
      findings.push({
        id: 'annual-audit-data-integrity',
        title: `${counters.auditsWithIntegrityIssues} incidencia(s) de integridad de datos`,
        description:
          'Se detectaron auditorías con fechas futuras, rangos de fechas incoherentes o códigos duplicados dentro de la empresa. Esas auditorías quedaron fuera de la evaluación hasta corregir sus datos.',
        priority: 'HIGH',
      });
    }
  }

  return {
    percentage,
    noData,
    noDataReason,
    evaluatedPeriod,
    dimensions: {
      program,
      executionReport,
      findingsDocumentation,
      followUpClosure,
      evidenceAnalysis,
      periodicityHistory,
    },
    counters,
    findings,
  };
}
