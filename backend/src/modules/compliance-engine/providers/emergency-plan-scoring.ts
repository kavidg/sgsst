import { redistributeWeightedScore } from './epp-scoring';

/**
 * NÚCLEO DE SCORING DEL ESTÁNDAR 5.1.1 — Plan de prevención, preparación y
 * respuesta ante emergencias (HACER). Función PURA sobre los datos de UNA
 * empresa: el provider hace las consultas bulk tenant-scoped y aquí todo se
 * calcula en memoria (sin N+1, determinista, clamp 0–100, nunca NaN/Infinity).
 *
 * FUENTE DE VERDAD (frontera anti-double-scoring, regla única):
 *  - SstEmergencies  → ÚNICA fuente de evidencia operativa de 5.1.1 (plan,
 *    amenazas, recursos, rutas, puntos, contactos, simulacros, socialización).
 *    Los registros legacy con itemCode '1.1.10' llegan resueltos por las
 *    funciones legacy-aware de PhvaAdvancedService (el provider NO consulta
 *    por itemCode directamente).
 *  - DocumentMaster  → solo metadatos del documento oficial referenciado por
 *    plan.documentId (tipo EMERGENCY_PLAN). Es UNA sola evidencia documental
 *    dentro de la dimensión Plan: documentUrl y documentId NO suman por
 *    separado (condición única `documentOk`).
 *
 * NO consume y NO puntúa (frontera 5.1.2 y módulos vecinos):
 *  - brigades / typedMembers / funciones / suplentes / capacitación de
 *    brigada (dimensión propia del futuro provider 5.1.2; la brigada solo
 *    aparece como metadata complementaria `brigadesPresent` SIN puntos).
 *  - Risk / ControlVerification (4.2.2), InspectionActivity (4.2.4),
 *    Maintenance (4.2.5), EppDelivery/EppApplicability (4.2.6),
 *    AnnualWorkPlan (cronograma), Training.
 *
 * La relación Drill.planActivityId con el Plan Anual es solo trazabilidad en
 * metadata: la EJECUCIÓN del simulacro puntúa aquí y el cumplimiento del
 * cronograma pertenece al provider annual-work-plan (sin doble conteo).
 */

export const EMERGENCY_PLAN_MODULE = 'emergency-plan';
export const EMERGENCY_PLAN_STANDARD_CODE = '5.1.1';
export const EMERGENCY_PLAN_FORMULA = 'dimensions:v1';

/** Pesos oficiales de las 7 dimensiones (total 100). */
export const EMERGENCY_PLAN_SCORE_WEIGHTS = {
  plan: 25,
  threats: 20,
  resources: 10,
  evacuation: 10,
  contacts: 10,
  drills: 15,
  socialization: 10,
} as const;

// ── Constantes normativas explícitas (sin magic numbers dispersos) ──

/** Estados de simulacro que cuentan como EJECUTADO. */
export const DRILL_EXECUTED_STATUSES: ReadonlySet<string> = new Set(['Ejecutado', 'Completado']);
/** Estado excluido explícitamente (no evaluable como ejecución). */
export const DRILL_CANCELLED_STATUS = 'Cancelado';
/** Ventana principal de vigencia de un simulacro ejecutado (meses). */
export const DRILL_WINDOW_MONTHS = 12;
/** Cobertura mínima de la socialización (0–100). */
export const SOCIALIZATION_COVERAGE_MIN = 80;

/** Grupos de contacto requeridos en la cadena de llamadas (6 requeridos). */
export const REQUIRED_CONTACT_GROUPS: readonly (readonly string[])[] = [
  ['ARL'],
  ['BOMBEROS'],
  ['AMBULANCIA'],
  ['POLICIA'],
  ['HOSPITAL', 'IPS'],
  ['INTERNO'],
];
/** Tipos complementarios (metadata; NO aumentan el denominador requerido). */
export const COMPLEMENTARY_CONTACT_TYPES: readonly string[] = ['DEFENSA_CIVIL', 'CRUZ_ROJA', 'OTRO'];

/** Valor del recurso según estado operativo tipado (o legacy compatible). */
export const RESOURCE_STATUS_CREDIT: Record<string, number> = {
  OPERATIVE: 1,
  PARTIAL: 0.5,
  INOPERATIVE: 0,
};

// ── Tipos de entrada (likes: solo los campos que el scoring necesita) ──

export interface EmergencyThreatLike {
  scenario?: string; threat?: string; description?: string; vulnerability?: string;
  probability?: string; impact?: string; riskLevel?: string;
  preventiveMeasures?: string[]; responseMeasures?: string[]; responseProcedure?: string;
  active?: boolean;
}

export interface EmergencyEquipmentLike {
  name?: string; type?: string; resourceType?: string; quantity?: number;
  status?: string; operationalStatus?: string; active?: boolean;
}

export interface EmergencyRouteLike {
  name?: string; estimatedTimeMinutes?: number; responsible?: string;
  signageVerified?: boolean; associatedExit?: string; diagramUrl?: string; active?: boolean;
}

export interface EmergencyMeetingPointLike {
  name?: string; responsible?: string; countProcedure?: string;
  expectedCount?: number; counts?: unknown[]; active?: boolean;
}

export interface EmergencyContactLike {
  type?: string; phone?: string; callOrder?: number; active?: boolean;
}

export interface EmergencyDrillLike {
  name?: string; date?: Date | string; participants?: number; expectedParticipants?: number;
  status?: string; planActivityId?: unknown; active?: boolean;
}

export interface EmergencyPlanSocializationLike {
  date?: Date | string; coveragePercentage?: number; participants?: string;
  observations?: string; evidence?: string[];
}

export interface EmergencyPlanLike {
  planName?: string; version?: string; effectiveDate?: Date | string;
  expirationDate?: Date | string; documentUrl?: string;
  documentId?: unknown;
  socialization?: EmergencyPlanSocializationLike;
}

export interface EmergencyRecordLike {
  companyId?: unknown; itemCode?: string; complianceStatus?: string;
  plan?: EmergencyPlanLike;
  threats?: EmergencyThreatLike[];
  equipment?: EmergencyEquipmentLike[];
  evacuationRoutes?: EmergencyRouteLike[];
  meetingPoints?: EmergencyMeetingPointLike[];
  contacts?: EmergencyContactLike[];
  drills?: EmergencyDrillLike[];
  brigades?: Array<{ brigadeId?: string; active?: boolean; members?: string[]; typedMembers?: unknown[] }>;
}

/** Metadatos mínimos del DocumentMaster referenciado por plan.documentId. */
export interface EmergencyDocumentMetaLike {
  _id?: unknown; companyId?: unknown; documentType?: string;
}

export interface EmergencyPlanScoreInput {
  /** SstEmergencies de la empresa (resuelto legacy-aware) o null si no existe. */
  record: EmergencyRecordLike | null;
  /** DocumentMaster de plan.documentId (solo cuando el plan lo referencia). */
  planDocument: EmergencyDocumentMetaLike | null;
  /** companyId autenticado para validar el tenant del documento referenciado. */
  companyId: string;
  /** Instante de evaluación (ventana de simulacros y vigencias; inyectable en tests). */
  now?: Date;
}

// ── Estructura de salida ──

export interface DimensionDetail {
  ratio: number | null;
  numerator: number | null;
  denominator: number | null;
  /** Subcondiciones/detalle explicable por dimensión. */
  [key: string]: unknown;
}

export interface EmergencyFindingDraft {
  id: string;
  title: string;
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface EmergencyPlanScoreBreakdown {
  score: number;
  noData: boolean;
  /** true si el registro existe pero NO tiene ninguna evidencia estructurada. */
  emptyRecord: boolean;
  dimensions: {
    plan: DimensionDetail;
    threats: DimensionDetail;
    resources: DimensionDetail;
    evacuation: DimensionDetail;
    contacts: DimensionDetail;
    drills: DimensionDetail;
    socialization: DimensionDetail;
  };
  counters: {
    activeThreats: number; completeThreats: number;
    activeResources: number; operativeResources: number; partialResources: number; inoperativeResources: number;
    operativeRoutes: number; operativeMeetingPoints: number;
    requiredContacts: number; validRequiredContacts: number; complementaryContacts: number;
    executedDrills12m: number; expectedParticipants: number; participants: number;
    drillsLinkedToAnnualPlan: number;
    socializationCoverage: number; socializationEvidence: number;
    documentPresent: boolean; planApproved: boolean; planCurrent: boolean;
    brigadesPresent: boolean;
  };
  details: {
    plan: {
      namePresent: boolean; validityValid: boolean; validityDatesProvided: boolean;
      approved: boolean; documentOk: boolean; documentFromMaster: boolean; documentUrlPresent: boolean;
      documentWrongType: boolean; documentCrossTenant: boolean;
    };
    threats: { missingFields: string[] };
    evacuation: { routesTotal: number; pointsTotal: number; routeOk: boolean; pointOk: boolean; signageVerified: number; countsRecorded: number };
    drills: { evaluable: number; windowDays: number; avgCoverage: number | null; linkedToAnnualPlan: number };
    socialization: { dateValid: boolean; coverageOk: boolean; evidenceOk: boolean };
  };
  findings: EmergencyFindingDraft[];
}

// ── Helpers puros ──

function isValidDate(value: Date | string | undefined): value is Date | string {
  if (value === undefined || value === null || value === '') return false;
  const d = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(d.getTime());
}

function asDate(value: Date | string | undefined): Date | null {
  return isValidDate(value) ? new Date(value) : null;
}

function truthyText(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Crédito del recurso: tipado nuevo con fallback al estado legacy compatible. */
export function emergencyResourceCredit(resource: EmergencyEquipmentLike): number {
  const typed = resource.operationalStatus;
  const legacy = typed === undefined ? legacyResourceStatusToOperational(resource.status) : undefined;
  const effective = typed ?? legacy;
  if (effective === undefined) return 0;
  return RESOURCE_STATUS_CREDIT[effective] ?? 0;
}

/** Interpreta el estado legacy ('OPERATIVO'/'PARCIAL'/'INOPERATIVO'/'VENCIDO'). */
export function legacyResourceStatusToOperational(status: string | undefined): string | undefined {
  switch (status) {
    case 'OPERATIVO': return 'OPERATIVE';
    case 'PARCIAL': return 'PARTIAL';
    case 'INOPERATIVO': case 'VENCIDO': return 'INOPERATIVE';
    default: return undefined;
  }
}

function threatMissingFields(t: EmergencyThreatLike): string[] {
  const missing: string[] = [];
  if (!truthyText(t.scenario)) missing.push('scenario');
  if (!truthyText(t.threat)) missing.push('threat');
  if (!truthyText(t.vulnerability)) missing.push('vulnerability');
  if (!t.probability) missing.push('probability');
  if (!t.impact) missing.push('impact');
  if (!t.riskLevel) missing.push('riskLevel');
  if ((t.preventiveMeasures?.length ?? 0) === 0 && (t.responseMeasures?.length ?? 0) === 0) {
    missing.push('measures');
  }
  return missing;
}

function sameId(a: unknown, b: string): boolean {
  return a !== undefined && a !== null && String(a).trim().toLowerCase() === b.trim().toLowerCase();
}

function startOfEvaluationWindow(now: Date): Date {
  const start = new Date(now.getTime());
  start.setMonth(start.getMonth() - DRILL_WINDOW_MONTHS);
  return start;
}

// ── Cálculo principal ──

export function computeEmergencyPlanScore(
  input: EmergencyPlanScoreInput,
  now: Date = new Date(),
): EmergencyPlanScoreBreakdown {
  const { record, planDocument, companyId } = input;
  const evaluationNow = input.now ?? now;
  const plan = record?.plan ?? {};
  const threats = record?.threats ?? [];
  const equipment = record?.equipment ?? [];
  const routes = record?.evacuationRoutes ?? [];
  const points = record?.meetingPoints ?? [];
  const contacts = record?.contacts ?? [];
  const drills = record?.drills ?? [];
  const brigades = record?.brigades ?? [];

  // ── Dimensión PLAN (25) — 4 subcondiciones (denominador fijo) ──
  const namePresent = truthyText(plan.planName);
  const effective = asDate(plan.effectiveDate);
  const expiration = asDate(plan.expirationDate);
  const validityDatesProvided = Boolean(effective && expiration);
  const validityValid = Boolean(
    effective && expiration && effective.getTime() <= evaluationNow.getTime() &&
    expiration.getTime() >= evaluationNow.getTime(),
  );
  // Fuente ÚNICA de aprobación: SstEmergencies.complianceStatus (no se inventa
  // un estado alternativo; la aprobación la decide el Approval Workflow).
  const approved = record?.complianceStatus === 'COMPLIES';
  // Evidencia documental ÚNICA: documento oficial (DocumentMaster EMERGENCY_PLAN
  // del mismo tenant) O URL documental. documentId + documentUrl + DocumentMaster
  // NO son tres unidades: es una sola condición documental.
  const documentCrossTenant = Boolean(plan.documentId && planDocument && !sameId(planDocument.companyId, companyId));
  const documentWrongType = Boolean(
    plan.documentId && planDocument && !documentCrossTenant && planDocument.documentType !== 'EMERGENCY_PLAN',
  );
  const documentFromMaster = Boolean(
    plan.documentId && planDocument && !documentCrossTenant && !documentWrongType,
  );
  const documentUrlPresent = truthyText(plan.documentUrl);
  const documentOk = documentFromMaster || documentUrlPresent;
  const planNumerator =
    (namePresent ? 1 : 0) + (validityValid ? 1 : 0) + (approved ? 1 : 0) + (documentOk ? 1 : 0);
  const planDetail: DimensionDetail = {
    ratio: planNumerator / 4, numerator: planNumerator, denominator: 4,
    namePresent, validityValid, approved, documentOk,
    documentFromMaster, documentUrlPresent,
    documentWrongType, documentCrossTenant,
  };

  // ── Dimensión AMENAZAS/VULNERABILIDADES (20) ──
  const activeThreats = threats.filter((t) => t.active !== false);
  const completeThreats = activeThreats.filter((t) => threatMissingFields(t).length === 0);
  const threatRatio = activeThreats.length > 0 ? completeThreats.length / activeThreats.length : null;
  const threatsDetail: DimensionDetail = {
    ratio: threatRatio,
    numerator: activeThreats.length > 0 ? completeThreats.length : null,
    denominator: activeThreats.length > 0 ? activeThreats.length : null,
    activeThreats: activeThreats.length,
    completeThreats: completeThreats.length,
    missingFields: activeThreats.flatMap((t) => threatMissingFields(t)),
    responseProcedureDocumented: activeThreats.filter((t) => truthyText(t.responseProcedure)).length,
  };

  // ── Dimensión RECURSOS OPERATIVOS (10) ──
  const activeResources = equipment.filter((e) => e.active !== false);
  const operativeResources = activeResources.filter((e) => emergencyResourceCredit(e) === 1).length;
  const partialResources = activeResources.filter((e) => emergencyResourceCredit(e) === 0.5).length;
  const inoperativeResources = activeResources.filter((e) => emergencyResourceCredit(e) === 0).length;
  const resourceRatio = activeResources.length > 0
    ? activeResources.reduce((sum, e) => sum + emergencyResourceCredit(e), 0) / activeResources.length
    : null;
  const resourcesDetail: DimensionDetail = {
    ratio: resourceRatio,
    numerator: activeResources.length > 0
      ? activeResources.reduce((sum, e) => sum + emergencyResourceCredit(e), 0) : null,
    denominator: activeResources.length > 0 ? activeResources.length : null,
    activeResources: activeResources.length,
    operativeResources, partialResources, inoperativeResources,
  };

  // ── Dimensión EVACUACIÓN (10) ──
  // Denominador FIJO (siempre evaluable): la exigencia mínima es ruta Y punto
  // operativos. 1 = ambos · 0.5 = solo uno · 0 = ninguno.
  const operativeRoutes = routes.filter(
    (r) => r.active !== false && truthyText(r.name) && Number(r.estimatedTimeMinutes) > 0 && truthyText(r.responsible),
  );
  const operativeMeetingPoints = points.filter(
    (p) => p.active !== false && truthyText(p.name) && truthyText(p.responsible) && truthyText(p.countProcedure),
  );
  const routeOk = operativeRoutes.length > 0;
  const pointOk = operativeMeetingPoints.length > 0;
  const evacuationRatio = (routeOk ? 0.5 : 0) + (pointOk ? 0.5 : 0);
  const countsRecorded = points.reduce((sum, p) => sum + (p.counts?.length ?? 0), 0);
  const evacuationDetail: DimensionDetail = {
    ratio: evacuationRatio,
    numerator: (routeOk ? 1 : 0) + (pointOk ? 1 : 0),
    denominator: 2,
    routesTotal: routes.length, pointsTotal: points.length,
    operativeRoutes: operativeRoutes.length, operativeMeetingPoints: operativeMeetingPoints.length,
    signageVerified: routes.filter((r) => r.active !== false && r.signageVerified === true).length,
    withDiagram: routes.filter((r) => r.active !== false && truthyText(r.diagramUrl)).length,
    withAssociatedExit: routes.filter((r) => r.active !== false && truthyText(r.associatedExit)).length,
    countsRecorded,
  };

  // ── Dimensión CONTACTOS (10) — cadena requerida / 6 ──
  // Denominador FIJO (siempre evaluable): los 6 grupos requeridos.
  const validRequiredContacts = REQUIRED_CONTACT_GROUPS.filter((group) =>
    contacts.some(
      (c) => c.active !== false && group.includes(c.type ?? '') &&
        truthyText(c.phone) && Number(c.callOrder) >= 1,
    ),
  ).length;
  const complementaryContacts = contacts.filter(
    (c) => c.active !== false && COMPLEMENTARY_CONTACT_TYPES.includes(c.type ?? ''),
  ).length;
  const contactRatio = validRequiredContacts / REQUIRED_CONTACT_GROUPS.length;
  const contactsDetail: DimensionDetail = {
    ratio: contactRatio,
    numerator: validRequiredContacts,
    denominator: REQUIRED_CONTACT_GROUPS.length,
    totalContacts: contacts.filter((c) => c.active !== false).length,
    validRequiredContacts,
    complementaryContacts,
    missingRequiredGroups: REQUIRED_CONTACT_GROUPS.filter(
      (group) => !contacts.some(
        (c) => c.active !== false && group.includes(c.type ?? '') && truthyText(c.phone) && Number(c.callOrder) >= 1,
      ),
    ).flat(),
  };

  // ── Dimensión SIMULACROS (15) ──
  const evaluableDrills = drills.filter(
    (d) => d.active !== false && (d.status ?? '') !== DRILL_CANCELLED_STATUS,
  );
  const windowStart = startOfEvaluationWindow(evaluationNow);
  const executed12m = evaluableDrills.filter((d) => {
    if (!DRILL_EXECUTED_STATUSES.has(d.status ?? '')) return false;
    const date = asDate(d.date);
    if (!date) return false;
    return date.getTime() >= windowStart.getTime() && date.getTime() <= evaluationNow.getTime();
  });
  const withCoverage = executed12m.filter((d) => Number(d.expectedParticipants) > 0);
  const avgCoverage = withCoverage.length > 0
    ? withCoverage.reduce(
        (sum, d) => sum + Math.min(1, Math.max(0, Number(d.participants) / Number(d.expectedParticipants))),
        0,
      ) / withCoverage.length
    : null;
  // Ejecución dentro de la ventana → crédito base 0.5; la cobertura media de
  // participantes completa hasta 0.5 adicionales (clamp 0–1, sin >100%).
  let drillRatio: number | null = null;
  if (evaluableDrills.length > 0) {
    drillRatio = executed12m.length === 0 ? 0 : 0.5 + 0.5 * (avgCoverage ?? 0);
  }
  const drillsLinkedToAnnualPlan = drills.filter((d) => d.planActivityId !== undefined && d.planActivityId !== null).length;
  const drillsDetail: DimensionDetail = {
    ratio: drillRatio,
    numerator: drillRatio === null ? null : Math.round(drillRatio * 100) / 100,
    denominator: drillRatio === null ? null : 1,
    evaluableDrills: evaluableDrills.length,
    executedDrills12m: executed12m.length,
    windowMonths: DRILL_WINDOW_MONTHS,
    avgCoverage: avgCoverage === null ? null : Math.round(avgCoverage * 1000) / 1000,
    linkedToAnnualPlan: drillsLinkedToAnnualPlan,
  };

  // ── Dimensión SOCIALIZACIÓN (10) ──
  const socialization = plan.socialization;
  const hasSocialization = Boolean(
    socialization && (
      isValidDate(socialization.date) || Number(socialization.coveragePercentage) > 0 ||
      truthyText(socialization.participants) || (socialization.evidence?.length ?? 0) > 0
    ),
  );
  const socializationDateValid = Boolean(socialization && isValidDate(socialization.date));
  const socializationCoverage = hasSocialization ? Number(socialization?.coveragePercentage ?? 0) : 0;
  const socializationEvidenceCount = hasSocialization
    ? (socialization?.evidence?.filter((e) => truthyText(e)).length ?? 0) : 0;
  const socializationCoverageOk =
    socializationCoverage >= SOCIALIZATION_COVERAGE_MIN && socializationCoverage <= 100;
  const socializationEvidenceOk = socializationEvidenceCount > 0;
  let socializationRatio: number | null = null;
  if (hasSocialization) {
    socializationRatio =
      ((socializationDateValid ? 1 : 0) + (socializationCoverageOk ? 1 : 0) + (socializationEvidenceOk ? 1 : 0)) / 3;
  }
  const socializationDetail: DimensionDetail = {
    ratio: socializationRatio,
    numerator: socializationRatio === null ? null : Math.round(socializationRatio * 3),
    denominator: socializationRatio === null ? null : 3,
    dateValid: socializationDateValid,
    coverage: socializationCoverage,
    coverageMin: SOCIALIZATION_COVERAGE_MIN,
    coverageOk: socializationCoverageOk,
    evidence: socializationEvidenceCount,
  };

  // ── Score final: redistribución ÚNICA existente (helper del repo, sin copias) ──
  const score = redistributeWeightedScore([
    { ratio: (planDetail.ratio as number) ?? null, weight: EMERGENCY_PLAN_SCORE_WEIGHTS.plan },
    { ratio: (threatsDetail.ratio as number) ?? null, weight: EMERGENCY_PLAN_SCORE_WEIGHTS.threats },
    { ratio: (resourcesDetail.ratio as number) ?? null, weight: EMERGENCY_PLAN_SCORE_WEIGHTS.resources },
    { ratio: (evacuationDetail.ratio as number) ?? null, weight: EMERGENCY_PLAN_SCORE_WEIGHTS.evacuation },
    { ratio: (contactsDetail.ratio as number) ?? null, weight: EMERGENCY_PLAN_SCORE_WEIGHTS.contacts },
    { ratio: (drillsDetail.ratio as number) ?? null, weight: EMERGENCY_PLAN_SCORE_WEIGHTS.drills },
    { ratio: (socializationDetail.ratio as number) ?? null, weight: EMERGENCY_PLAN_SCORE_WEIGHTS.socialization },
  ]);

  // ── NO_DATA ──
  // Solo cuando NO existe registro o el registro está COMPLETAMENTE vacío.
  // Un plan parcialmente diligenciado NO es NO_DATA (se evalúa parcialmente).
  const emptyRecord = Boolean(record) && !(
    namePresent || threats.length > 0 || equipment.length > 0 || routes.length > 0 ||
    points.length > 0 || contacts.length > 0 || drills.length > 0 || hasSocialization
  );
  const noData = !record || emptyRecord;

  // ── Counters (explican el score sin volver a consultar Mongo) ──
  const counters = {
    activeThreats: activeThreats.length,
    completeThreats: completeThreats.length,
    activeResources: activeResources.length,
    operativeResources, partialResources, inoperativeResources,
    operativeRoutes: operativeRoutes.length,
    operativeMeetingPoints: operativeMeetingPoints.length,
    requiredContacts: REQUIRED_CONTACT_GROUPS.length,
    validRequiredContacts,
    complementaryContacts,
    executedDrills12m: executed12m.length,
    expectedParticipants: withCoverage.reduce((s, d) => s + Number(d.expectedParticipants), 0),
    participants: withCoverage.reduce((s, d) => s + Number(d.participants), 0),
    drillsLinkedToAnnualPlan,
    socializationCoverage,
    socializationEvidence: socializationEvidenceCount,
    documentPresent: documentOk,
    planApproved: approved,
    planCurrent: validityValid,
    brigadesPresent: brigades.some((b) => b.active !== false),
  } as EmergencyPlanScoreBreakdown['counters'];

  // ── Findings (códigos oficiales; sin findings de brigada: 5.1.2) ──
  const findings: EmergencyFindingDraft[] = [];
  if (noData) {
    findings.push({
      id: 'emergency-plan-no-data',
      title: record ? 'Registro de emergencias vacío' : 'Sin registro de emergencias',
      description: record
        ? 'El registro de emergencias de la empresa no contiene ninguna evidencia estructurada (plan, amenazas, recursos, rutas, puntos, contactos ni simulacros). Diligencie el plan en /emergencies.'
        : 'No existe registro de plan de prevención, preparación y respuesta ante emergencias. El estándar 5.1.1 requiere plan documentado, socializado y actualizado.',
      priority: 'HIGH',
    });
  } else {
    if (!approved) {
      findings.push({
        id: 'emergency-plan-not-approved',
        title: 'Plan de emergencias sin aprobación vigente',
        description: 'El estado de cumplimiento del plan (SstEmergencies.complianceStatus) no es COMPLIES. Envíe el plan a aprobación para acreditar la aprobación formal.',
        priority: 'HIGH',
      });
    }
    if (namePresent && validityDatesProvided && !validityValid) {
      findings.push({
        id: 'emergency-plan-expired',
        title: 'Plan de emergencias fuera de vigencia',
        description: `Las fechas de vigencia del plan no cubren la fecha de evaluación (${expiration ? new Date(expiration).toISOString().slice(0, 10) : 'sin fecha de expiración'}). Actualice la versión vigente.`,
        priority: 'HIGH',
      });
    }
    if (!documentOk) {
      findings.push({
        id: 'emergency-plan-document-missing',
        title: 'Sin documento oficial del plan',
        description: 'El plan no tiene documento oficial asociado (DocumentMaster tipo EMERGENCY_PLAN ni URL documental). Vincule el documento oficial desde /emergencies → Plan.',
        priority: 'MEDIUM',
      });
    } else if (plan.documentId && documentWrongType) {
      // Integridad: el documento referenciado no es EMERGENCY_PLAN.
      findings.push({
        id: 'emergency-plan-document-missing',
        title: 'Documento oficial con tipo incorrecto',
        description: 'El documentId referenciado existe en la empresa pero no es de tipo EMERGENCY_PLAN; no acredita el documento oficial del plan.',
        priority: 'MEDIUM',
      });
    }
    if (activeThreats.length === 0) {
      findings.push({
        id: 'emergency-threat-matrix-incomplete',
        title: 'Matriz de amenazas y vulnerabilidades vacía',
        description: 'No hay amenazas activas evaluadas. El estándar 5.1.1 requiere la identificación de amenazas y vulnerabilidades con probabilidad, impacto, nivel de riesgo y medidas.',
        priority: 'HIGH',
      });
    } else if (completeThreats.length < activeThreats.length) {
      findings.push({
        id: 'emergency-threat-matrix-incomplete',
        title: `${activeThreats.length - completeThreats.length} amenaza(s) incompleta(s)`,
        description: 'Amenazas activas sin scenario/threat/vulnerability/valoración completa o sin medidas preventivas ni de respuesta.',
        priority: completeThreats.length === 0 ? 'HIGH' : 'MEDIUM',
      });
    }
    if (resourceRatio !== null && resourceRatio < 1) {
      findings.push({
        id: 'emergency-resources-incomplete',
        title: 'Recursos de emergencia no completamente operativos',
        description: `${operativeResources} operativo(s), ${partialResources} parcial(es) y ${inoperativeResources} inoperativo(s) de ${activeResources.length} recursos activos. Mantenga el inventario de emergencias operativo (no sustituye el mantenimiento 4.2.5).`,
        priority: resourceRatio < 0.5 ? 'HIGH' : 'MEDIUM',
      });
    } else if (activeResources.length === 0) {
      findings.push({
        id: 'emergency-resources-incomplete',
        title: 'Sin recursos de emergencia registrados',
        description: 'No hay extintores, botiquines, camillas, alarmas, señalización ni kits registrados. Registre el inventario de preparación en /emergencies → Recursos.',
        priority: 'MEDIUM',
      });
    }
    if (evacuationRatio < 1) {
      findings.push({
        id: 'emergency-evacuation-incomplete',
        title: evacuationRatio === 0 ? 'Evacuación sin ruta y punto de encuentro operativos' : 'Evacuación parcialmente operativa',
        description: evacuationRatio === 0
          ? 'Se requiere al menos una ruta de evacuación operativa (activa, con tiempo estimado y responsable) y al menos un punto de encuentro operativo (con responsable y procedimiento de conteo).'
          : 'Existe ruta o punto de encuentro operativo, pero no ambos. Complete la pareja ruta + punto para acreditar la evacuación.',
        priority: evacuationRatio === 0 ? 'HIGH' : 'MEDIUM',
      });
    }
    if (validRequiredContacts < REQUIRED_CONTACT_GROUPS.length) {
      const missing = contactsDetail.missingRequiredGroups as string[];
      findings.push({
        id: 'emergency-contacts-incomplete',
        title: `Cadena de llamadas incompleta (${validRequiredContacts}/${REQUIRED_CONTACT_GROUPS.length})`,
        description: `Faltan contactos válidos (activos, con teléfono y orden ≥ 1) de: ${missing.join(', ')}.`,
        priority: validRequiredContacts === 0 ? 'HIGH' : 'MEDIUM',
      });
    }
    if (evaluableDrills.length === 0 || executed12m.length === 0) {
      findings.push({
        id: 'emergency-drill-missing',
        title: evaluableDrills.length === 0 ? 'Sin simulacros registrados' : 'Sin simulacros ejecutados en los últimos 12 meses',
        description: 'El estándar 5.1.1 requiere simulacros ejecutados dentro de la ventana de 12 meses (estados Ejecutado/Completado, excluye Cancelados).',
        priority: 'HIGH',
      });
    }
    if (!hasSocialization || !socializationCoverageOk || !socializationEvidenceOk) {
      findings.push({
        id: 'emergency-socialization-missing',
        title: 'Socialización del plan incompleta',
        description: `La socialización requiere fecha válida, cobertura ≥ ${SOCIALIZATION_COVERAGE_MIN}% y al menos una evidencia.` +
          (!hasSocialization ? ' Actualmente no hay registro de socialización.' :
            ` Fecha: ${socializationDateValid ? 'OK' : 'pendiente'} · Cobertura: ${socializationCoverage}% · Evidencias: ${socializationEvidenceCount}.`),
        priority: !hasSocialization ? 'MEDIUM' : 'LOW',
      });
    }
  }

  return {
    score,
    noData,
    emptyRecord,
    dimensions: {
      plan: planDetail,
      threats: threatsDetail,
      resources: resourcesDetail,
      evacuation: evacuationDetail,
      contacts: contactsDetail,
      drills: drillsDetail,
      socialization: socializationDetail,
    },
    counters,
    details: {
      plan: {
        namePresent, validityValid, validityDatesProvided, approved,
        documentOk, documentFromMaster, documentUrlPresent, documentWrongType, documentCrossTenant,
      },
      threats: { missingFields: (threatsDetail.missingFields as string[]) ?? [] },
      evacuation: {
        routesTotal: routes.length, pointsTotal: points.length,
        routeOk: operativeRoutes.length > 0, pointOk: operativeMeetingPoints.length > 0,
        signageVerified: (evacuationDetail.signageVerified as number) ?? 0,
        countsRecorded,
      },
      drills: {
        evaluable: evaluableDrills.length,
        windowDays: Math.round((evaluationNow.getTime() - windowStart.getTime()) / 86400000),
        avgCoverage,
        linkedToAnnualPlan: drillsLinkedToAnnualPlan,
      },
      socialization: {
        dateValid: socializationDateValid, coverageOk: socializationCoverageOk, evidenceOk: socializationEvidenceOk,
      },
    },
    findings,
  };
}
