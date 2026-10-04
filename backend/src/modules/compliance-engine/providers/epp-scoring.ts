import { Types } from 'mongoose';
import { EppDelivery } from '../../epp/schemas/epp-delivery.schema';
// FUENTE DE REQUISITOS V2: la forma de una relación de matriz se deriva del
// schema EppApplicability (type-only: no acopla el scoring al documento).
import type { EppApplicability } from '../../epp/schemas/epp-applicability.schema';
import { isEppDeliveryOverdue } from '../../epp/utils/epp-delivery-status.util';

/**
 * ETAPA 4.2.6 — Scoring V2 definitivo (Elementos de Protección Personal).
 *
 * FUENTES (frontera anti-double-scoring):
 *  - SstEpp           → catálogo EPP de la empresa (identidad lógica eppId).
 *  - JobProfile       → perfiles de cargo activos (denominador de PROGRAMA).
 *  - Employee         → trabajadores reales y su jobProfileId (identidad _id).
 *  - EppApplicability → ÚNICA fuente de REQUISITOS (qué EPP requiere cada
 *                       JobProfile). NO se reconstruye desde riesgos ni desde
 *                       requiredFor.
 *  - EppDelivery      → ÚNICA fuente de entregas reales (cobertura, vigencia,
 *                       condición, trazabilidad).
 *
 * NO consume: InspectionActivity (4.2.4), Maintenance (4.2.5),
 * Risk.controls / ControlVerification (4.2.2), training-management ni
 * SstEpp.assignments[]. NO interpreta `requiredFor` (texto legacy/display).
 * NO lee complianceStatus: el estado lo decide la aprobación, nunca el score.
 *
 * Fórmula por dimensiones (pesos sin cambios):
 *
 *   PROGRAMA           25 — jobProfilesConMatrizValida / jobProfilesActivosConTrabajadores
 *   COBERTURA          30 — requisitosEppCubiertos / requisitosEppAplicables (M2, principal)
 *   VIGENCIA_CONDICION 25 — Σ valor(entrega) / entregas ACTIVE de requisitos aplicables
 *   TRAZABILIDAD       20 — entregas trazables / entregas evaluables (requisitos aplicables)
 *
 * M1 (complementaria, NO puntúa): fullyCoveredWorkers / workersWithRequirements.
 *
 * Reglas transversales:
 * - Una dimensión sin denominador válido se EXCLUYE (ratio null) y su peso se
 *   REDISTRIBUYE (redistributeWeightedScore: determinista, clamp 0–100,
 *   nunca NaN/Infinity). Comportamiento intacto respecto a V1.
 * - Vigencia DINÁMICA vía isEppDeliveryOverdue (patrón Maintenance): no se
 *   persiste EXPIRED, sin cron ni scheduler.
 * - Solo acredita cobertura una entrega ACTIVE, no vencida, con condición
 *   GOOD o FAIR. RETURNED/REPLACED/DAMAGED no acreditan nada (solo historial).
 * - Sin doble penalización: una entrega vencida puntúa 0 en VIGENCIA_CONDICION
 *   y su requisito simplemente no está cubierto; COBERTURA no la castiga dos
 *   veces. FAIR vigente SÍ cubre en COBERTURA y vale 0.5 en VIGENCIA.
 * - Las entregas FUERA de matriz no mejoran ningún score (metadata
 *   deliveriesOutsideApplicability + finding LOW).
 * - Cantidad (quantity): la matriz no define cantidades requeridas; solo se
 *   valida que la entrega tenga quantity > 0 (no se inventan reglas de cantidad).
 */

/** Pesos nominales de las dimensiones de 4.2.6 (25/30/25/20, sin cambios). */
export const EPP_SCORE_WEIGHTS = {
  program: 25,
  coverage: 30,
  validityCondition: 25,
  traceability: 20,
} as const;

export type EppScoreDimensionKey = 'program' | 'coverage' | 'validityCondition' | 'traceability';

export interface EppScoreDimension {
  key: EppScoreDimensionKey;
  weight: number;
  /** Ratio 0..1 de la dimensión; null = NO evaluable (sin denominador válido). */
  ratio: number | null;
}

/** Numerador/denominador/ratio de una dimensión (metadata serializable). */
export interface EppDimensionDetail {
  ratio: number | null;
  numerator: number;
  denominator: number;
}

/** Detalle de la dimensión COBERTURA (M2 principal + M1 complementaria). */
export interface EppCoverageDetail extends EppDimensionDetail {
  coveredRequirements: number;
  applicableRequirements: number;
  fullyCoveredWorkers: number;
  workersWithRequirements: number;
  /** Trabajadores activos sin jobProfileId (finding MEDIUM, fuera del denominador). */
  workersWithoutJobProfile: number;
}

export interface EppScoreCounters {
  /** Ítems de catálogo totales y activos. */
  catalogItems: number;
  catalogActive: number;
  /** JobProfiles activos de la empresa (para diagnóstico). */
  jobProfilesActive: number;
  /** JobProfiles activos asociados a al menos un Employee activo (denominador PROGRAMA). */
  jobProfilesWithWorkers: number;
  /** JobProfiles del denominador con matriz válida (numerador PROGRAMA). */
  jobProfilesWithMatrix: number;
  /** JobProfiles del denominador sin matriz requerida (finding HIGH). */
  jobProfilesWithoutMatrix: number;
  /** Relaciones activas+required cuyo eppItemId no existe o está inactivo en el catálogo. */
  inactiveItemReferences: number;
  /** Trabajadores activos con al menos un requisito EPP aplicable (denominador M1). */
  workersWithRequirements: number;
  /** Trabajadores del denominador M1 completamente cubiertos (numerador M1). */
  fullyCoveredWorkers: number;
  /** Trabajadores activos sin jobProfileId. */
  workersWithoutJobProfile: number;
  /** Trabajadores activos cuyo jobProfileId apunta a un JobProfile inactivo/inexistente. */
  workersWithInactiveJobProfile: number;
  /** Requisitos aplicables totales (denominador M2). */
  applicableRequirements: number;
  /** Requisitos aplicables cubiertos (numerador M2, completed). */
  coveredRequirements: number;
  /** Entregas ACTIVE (estado persistido). */
  activeDeliveries: number;
  /** Entregas ACTIVE vigentes (no vencidas, GOOD/FAIR) ligadas a un requisito. */
  activeValidDeliveries: number;
  /** Entregas ACTIVE vencidas ligadas a requisitos aplicables (dinámico, no persistido). */
  overdue: number;
  /** Entregas resueltas por estado terminal (solo historial). */
  replaced: number;
  returned: number;
  damaged: number;
  /** Entregas evaluables (de requisitos aplicables) con evidencia propia. */
  withEvidence: number;
  /** Entregas evaluables con datos estructurales completos (trazabilidad). */
  traceable: number;
  /** Entregas ACTIVE de requisitos aplicables con condición deficiente (FAIR/POOR/DAMAGED). */
  deficientCondition: number;
  /** Entregas ACTIVE de requisitos aplicables con condición severa (POOR/DAMAGED). */
  severeCondition: number;
  /** Entregas ACTIVE que no corresponden a ningún requisito aplicable. */
  deliveriesOutsideApplicability: number;
  /** Pendientes por acción de reposición/condición (determinista, sin doble conteo con requisitos). */
  activeRequiringAction: number;
}

export interface EppScoreBreakdown {
  /** Score final 0–100 (entero), tras redistribución. */
  score: number;
  dimensions: Record<EppScoreDimensionKey, { ratio: number | null; evaluable: boolean }>;
  /** Detalle num/den por dimensión (metadata V2). */
  details: {
    program: EppDimensionDetail;
    coverage: EppCoverageDetail;
    validityCondition: EppDimensionDetail;
    traceability: EppDimensionDetail;
  };
  counters: EppScoreCounters;
  /** Señales para la construcción de findings en el provider. */
  hasCatalog: boolean;
  hasApplicableRequirements: boolean;
  hasEvaluableDeliveries: boolean;
  /** true si hay JobProfiles activos con trabajadores sin matriz requerida. */
  jobProfilesWithoutMatrix: boolean;
  /** true si hay trabajadores activos sin jobProfileId. */
  workersWithoutJobProfile: boolean;
  /** true si hay trabajadores activos con JobProfile inactivo/inexistente. */
  workersWithInactiveJobProfile: boolean;
  /** true si hay relaciones matriz activas+required apuntando a EPP inactivo. */
  inactiveItemReferences: boolean;
  /** true si hay entregas fuera de la matriz de aplicabilidad. */
  deliveriesOutsideApplicability: boolean;
}

/**
 * Tipos mínimos de lectura (evita acoplar el scoring a documentos hidratados).
 * `requiredFor` NO aparece: es texto legacy/display y no se consulta.
 */
type CatalogItemLike = { eppId: string; name: string; active?: boolean };
type EppRecordLike = { catalog?: CatalogItemLike[] };
type JobProfileLike = { _id: unknown; companyId?: unknown; active?: boolean };
type WorkerLike = { _id: unknown; status?: string; jobProfileId?: unknown };
type ApplicabilityLike = Pick<
  EppApplicability,
  'jobProfileId' | 'eppItemId' | 'required' | 'active'
>;
type DeliveryLike = Pick<
  EppDelivery,
  | 'employeeId'
  | 'eppItemId'
  | 'deliveryDate'
  | 'expectedReplacementDate'
  | 'actualReplacementDate'
  | 'quantity'
  | 'condition'
  | 'status'
  | 'evidenceUrl'
  | 'certificateUrl'
  | 'history'
>;

/** Identidad técnica presente (ObjectId de Mongo o string no vacío). */
function hasIdentity(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (value instanceof Types.ObjectId) return true;
  return typeof (value as { toString?: unknown }).toString === 'function';
}

/** Identidad COMPARABLE (string estable para Maps/Sets en memoria). */
function identityKey(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (hasIdentity(value)) return String(value);
  return '';
}

/** true si la fecha es válida. */
function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Evidencia PROPIA de la entrega: URL del evento o certificado del elemento.
 * La evidencia histórica del documento SstEpp NO acredita aquí (V1 = V2).
 */
export function deliveryHasOwnEvidence(delivery: DeliveryLike): boolean {
  return Boolean(
    (delivery.evidenceUrl && String(delivery.evidenceUrl).trim().length > 0) ||
      (delivery.certificateUrl && String(delivery.certificateUrl).trim().length > 0),
  );
}

/**
 * Entrega VÁLIDA para cubrir un requisito (regla determinista de V2):
 *   status ACTIVE, no vencida (dinámico), condición GOOD o FAIR,
 *   quantity > 0 (validación estructural; la matriz no define cantidades).
 *
 * RETURNED/REPLACED/DAMAGED NO acreditan cobertura. EXPIRED no se evalúa
 * porque no se persiste: la vigencia es dinámica.
 * Varias entregas válidas del mismo requisito valen SIEMPRE 1 (no duplica).
 */
export function isDeliveryCoveringRequirement(delivery: DeliveryLike, now: Date): boolean {
  return (
    String(delivery.status) === 'ACTIVE' &&
    !isEppDeliveryOverdue(delivery, now) &&
    (delivery.condition === 'GOOD' || delivery.condition === 'FAIR') &&
    Number.isFinite(delivery.quantity) &&
    (delivery.quantity as number) > 0
  );
}

/**
 * Cobertura de UN requisito (employeeId + eppItemId): cubierto si existe AL
 * MENOS una entrega válida. Determinista: recorre las entregas indexadas por
 * requisito y retorna con la primera válida (0 o 1, sin doble conteo).
 */
export function isRequirementCovered(
  validDeliveriesForRequirement: DeliveryLike[],
  now: Date,
): boolean {
  return validDeliveriesForRequirement.some((d) => isDeliveryCoveringRequirement(d, now));
}

/**
 * Trazabilidad estructural de la entrega: identidad real del trabajador y del
 * EPP, fecha y cantidad válidas, historial server-side y createdBy.
 * La evidencia que puntúa es la PROPIA de la entrega (deliveryHasOwnEvidence).
 */
export function isDeliveryTraceable(
  delivery: DeliveryLike & { createdBy?: string },
  validWorkerIds: ReadonlySet<string>,
  catalogItemIds: ReadonlySet<string>,
): boolean {
  return (
    hasIdentity(delivery.employeeId) && validWorkerIds.has(String(delivery.employeeId)) &&
    typeof delivery.eppItemId === 'string' && delivery.eppItemId.trim().length > 0 &&
    catalogItemIds.has(delivery.eppItemId) &&
    isValidDate(delivery.deliveryDate) &&
    Number.isFinite(delivery.quantity) && (delivery.quantity as number) > 0 &&
    Array.isArray(delivery.history) && delivery.history.length > 0 &&
    typeof delivery.createdBy === 'string' && delivery.createdBy.trim().length > 0 &&
    deliveryHasOwnEvidence(delivery)
  );
}

/**
 * REDISTRIBUCIÓN ÚNICA DE PESOS (COMPORTAMIENTO INTACTO DESDE V1).
 *
 * score = (Σ peso × ratio) / (Σ pesos activos) × 100
 *
 * - Una dimensión con ratio null (sin denominador válido) se excluye y NO
 *   aporta peso: su peso se redistribuye entre las restantes.
 * - Determinista; clamp 0–100; nunca NaN/Infinity (retorna 0 si no hay pesos
 *   activos o el resultado no es finito).
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

/** Entrada de datos de una empresa para el cálculo V2 (todo tenant-scoped). */
export interface EppScoreInput {
  /** SstEpp de la empresa (o null si no existe). */
  eppRecord: EppRecordLike | null;
  /** JobProfiles de la empresa (colección completa tenant-scoped). */
  jobProfiles: JobProfileLike[];
  /** Employees de la empresa (colección completa tenant-scoped). */
  workers: WorkerLike[];
  /** EppApplicability de la empresa (colección completa tenant-scoped). */
  applicabilities: ApplicabilityLike[];
  /** EppDeliveries de la empresa (colección completa tenant-scoped). */
  deliveries: DeliveryLike[];
  /** Instante de evaluación (vencimiento dinámico; inyectable en tests). */
  now?: Date;
}

/**
 * Calcula el score V2 de 4.2.6 sobre los datos de UNA empresa. Función pura:
 * el provider hace las consultas bulk (sin N+1) y aquí todo es en memoria con
 * Maps/Sets construidos una sola vez.
 */
export function computeEppScore(
  input: EppScoreInput,
  now: Date = new Date(),
): EppScoreBreakdown {
  const { eppRecord, jobProfiles, workers, applicabilities, deliveries } = input;
  const evaluationNow = input.now ?? now;

  // ── Catálogo EPP (SstEpp) ──
  const catalog = eppRecord?.catalog ?? [];
  const itemIdOf = (item: CatalogItemLike): string => {
    const legacy = (item as unknown as { eppItemId?: unknown }).eppItemId;
    if (typeof legacy === 'string' && legacy.trim().length > 0) return legacy;
    return item.eppId;
  };
  const activeCatalogItemIds = new Set(
    catalog.filter((item) => item.active !== false).map(itemIdOf).filter((id) => id.length > 0),
  );
  const allCatalogItemIds = new Set(catalog.map(itemIdOf).filter((id) => id.length > 0));
  const catalogItems = catalog.length;
  const catalogActive = activeCatalogItemIds.size;
  const hasCatalog = catalogItems > 0;

  // ── Trabajadores activos ──
  const activeWorkers = workers.filter((w) => String(w.status ?? '') === 'Activo');
  const activeWorkerIds = new Set(activeWorkers.map((w) => identityKey(w._id)));
  const allWorkerIds = new Set(workers.map((w) => identityKey(w._id)));

  // Trabajadores activos SIN jobProfileId: no generan requisitos (no penalizan
  // cobertura artificialmente) pero sí generan finding de integridad.
  const workersWithoutJobProfile = activeWorkers.filter((w) => !hasIdentity(w.jobProfileId));

  // Mapa jobProfileId → JobProfile activo (una pasada).
  const activeJobProfileById = new Map<string, JobProfileLike>();
  for (const jp of jobProfiles) {
    if (jp.active !== false) activeJobProfileById.set(identityKey(jp._id), jp);
  }

  // Trabajadores activos con JobProfile activo (base de COBERTURA y PROGRAMA).
  const workersWithActiveProfile = activeWorkers.filter((w) =>
    activeJobProfileById.has(identityKey(w.jobProfileId)),
  );
  const workersWithInactiveProfile = activeWorkers.filter(
    (w) => hasIdentity(w.jobProfileId) && !activeJobProfileById.has(identityKey(w.jobProfileId)),
  );

  // Índice en memoria empleadoKey → jobProfileKey (una pasada, sin queries).
  const jobProfileKeyByEmployee = new Map<string, string>();
  for (const w of workersWithActiveProfile) {
    jobProfileKeyByEmployee.set(identityKey(w._id), identityKey(w.jobProfileId));
  }

  // JobProfiles activos con al menos un Employee activo (denominador PROGRAMA).
  const profileIdsWithWorkers = new Set(workersWithActiveProfile.map((w) => identityKey(w.jobProfileId)));
  const jobProfilesWithWorkers = profileIdsWithWorkers.size;

  // ── Matriz EppApplicability: requisitos por cargo ──
  // Solo relaciones active=true + required=true generan requisitos. Las
  // required=false NO acreditan matriz ni requisitos. Las que apuntan a un
  // eppItemId inexistente o inactivo son problema de integridad (finding HIGH)
  // y no cuentan como requisito válido.
  const requiredItemIdsByProfile = new Map<string, string[]>();
  let inactiveItemReferences = 0;
  for (const rel of applicabilities) {
    if (rel.active === false || rel.required === false) continue;
    const profileKey = identityKey(rel.jobProfileId);
    if (!profileKey) continue;
    const itemId = typeof rel.eppItemId === 'string' ? rel.eppItemId.trim() : '';
    if (!itemId) continue;
    if (!activeCatalogItemIds.has(itemId)) {
      inactiveItemReferences += 1;
      continue; // no es requisito válido; no aporta a programa ni cobertura
    }
    const list = requiredItemIdsByProfile.get(profileKey);
    if (list) {
      if (!list.includes(itemId)) list.push(itemId);
    } else {
      requiredItemIdsByProfile.set(profileKey, [itemId]);
    }
  }

  // ── PROGRAMA (25) ──
  // jobProfilesConMatrizValida / jobProfilesActivosConTrabajadores.
  // Un JobProfile con SOLO required=false NO tiene matriz requerida.
  const jobProfilesWithoutMatrixKeys: string[] = [];
  for (const profileKey of profileIdsWithWorkers) {
    const required = requiredItemIdsByProfile.get(profileKey);
    if (!required || required.length === 0) jobProfilesWithoutMatrixKeys.push(profileKey);
  }
  const jobProfilesWithMatrix = jobProfilesWithWorkers - jobProfilesWithoutMatrixKeys.length;
  const jobProfilesWithoutMatrix = jobProfilesWithoutMatrixKeys.length;
  const programRatio = jobProfilesWithWorkers > 0 ? jobProfilesWithMatrix / jobProfilesWithWorkers : null;

  // ── COBERTURA (30) — M2 principal ──
  // Requisitos aplicables: employeeId + eppItemId para cada trabajador activo
  // con JobProfile activo, contra la matriz requerida de SU cargo.
  // Índice requisito → entregas (una pasada; sin queries en loops).
  const deliveriesByRequirement = new Map<string, DeliveryLike[]>();
  const deliveriesOutside: DeliveryLike[] = [];
  for (const d of deliveries) {
    const employeeKey = identityKey(d.employeeId);
    const itemId = typeof d.eppItemId === 'string' ? d.eppItemId.trim() : '';
    const profileKey = jobProfileKeyByEmployee.get(employeeKey) ?? '';
    const required = profileKey ? requiredItemIdsByProfile.get(profileKey) : undefined;
    const isApplicable = Boolean(profileKey && required && itemId && required.includes(itemId) && activeWorkerIds.has(employeeKey));
    if (isApplicable) {
      const key = `${employeeKey}::${itemId}`;
      const bucket = deliveriesByRequirement.get(key);
      if (bucket) bucket.push(d);
      else deliveriesByRequirement.set(key, [d]);
    } else {
      deliveriesOutside.push(d);
    }
  }

  let applicableRequirements = 0;
  let coveredRequirements = 0;
  let fullyCoveredWorkers = 0;
  let workersWithRequirements = 0;
  for (const worker of workersWithActiveProfile) {
    const workerKey = identityKey(worker._id);
    const required = requiredItemIdsByProfile.get(identityKey(worker.jobProfileId)) ?? [];
    if (required.length === 0) continue; // sin matriz: no genera requisitos
    workersWithRequirements += 1;
    let coveredForWorker = 0;
    for (const itemId of required) {
      applicableRequirements += 1;
      if (isRequirementCovered(deliveriesByRequirement.get(`${workerKey}::${itemId}`) ?? [], evaluationNow)) {
        coveredRequirements += 1;
        coveredForWorker += 1;
      }
    }
    if (coveredForWorker === required.length) fullyCoveredWorkers += 1;
  }

  const coverageRatio = applicableRequirements > 0 ? coveredRequirements / applicableRequirements : null;

  // ── VIGENCIA_CONDICION (25) ──
  // SOLO entregas ACTIVE de requisitos aplicables (§16): los estados
  // terminales (RETURNED/REPLACED/DAMAGED) son historial y no se reevalúan.
  // Una entrega de un EPP no requerido hoy no mejora el score (queda en
  // metadata/finding LOW).
  const applicableDeliveries: DeliveryLike[] = [];
  for (const bucket of deliveriesByRequirement.values()) applicableDeliveries.push(...bucket);

  const activeApplicableDeliveries = applicableDeliveries.filter((d) => String(d.status) === 'ACTIVE');
  const overdueDeliveries = activeApplicableDeliveries.filter((d) => isEppDeliveryOverdue(d, evaluationNow));
  const currentActiveDeliveries = activeApplicableDeliveries.filter((d) => !isEppDeliveryOverdue(d, evaluationNow));
  const validityValue = (d: DeliveryLike): number => {
    if (d.condition === 'GOOD') return 1;
    if (d.condition === 'FAIR') return 0.5;
    return 0; // POOR / DAMAGED
  };
  const validitySum = currentActiveDeliveries.reduce((sum, d) => sum + validityValue(d), 0);
  const validityConditionRatio = activeApplicableDeliveries.length > 0 ? validitySum / activeApplicableDeliveries.length : null;

  const deficientCondition = activeApplicableDeliveries.filter(
    (d) => d.condition === 'FAIR' || d.condition === 'POOR' || d.condition === 'DAMAGED',
  );
  const severeCondition = deficientCondition.filter(
    (d) => d.condition === 'POOR' || d.condition === 'DAMAGED',
  );
  const activeValidDeliveries = currentActiveDeliveries.filter((d) => validityValue(d) > 0).length;

  // Pendientes por acción (determinista, sin doble conteo con requisitos):
  // entregas ACTIVE de requisitos aplicables vencidas o con condición ≠ GOOD
  // cuyo requisito ya está CUBIERTO. Si el requisito NO está cubierto ya queda
  // contado como "requisito sin cobertura" y su entrega no se duplica aquí
  // (§17/§24: la penalización de una vencida es cobertura + vigencia, punto).
  const coveringDeliveryKeys = new Set<string>();
  for (const [key, bucket] of deliveriesByRequirement) {
    const covering = bucket.find((d) => isDeliveryCoveringRequirement(d, evaluationNow));
    if (covering) coveringDeliveryKeys.add(key);
  }
  const activeRequiringAction = activeApplicableDeliveries.filter((d) => {
    if (!isEppDeliveryOverdue(d, evaluationNow) && d.condition === 'GOOD') return false;
    const key = `${identityKey(d.employeeId)}::${d.eppItemId}`;
    return coveringDeliveryKeys.has(key);
  }).length;

  // ── TRAZABILIDAD (20) ──
  // Entregas de requisitos aplicables con datos estructurales completos y
  // evidencia propia. Las entregas fuera de matriz NO mejoran el score.
  const traceableDeliveries = applicableDeliveries.filter((d) =>
    isDeliveryTraceable(d as DeliveryLike & { createdBy?: string }, activeWorkerIds, allCatalogItemIds),
  );
  const withEvidence = applicableDeliveries.filter((d) => deliveryHasOwnEvidence(d)).length;
  const traceabilityRatio = applicableDeliveries.length > 0 ? traceableDeliveries.length / applicableDeliveries.length : null;

  // ── Score con redistribución (comportamiento intacto) ──
  const dimensions: EppScoreDimension[] = [
    { key: 'program', ratio: programRatio, weight: EPP_SCORE_WEIGHTS.program },
    { key: 'coverage', ratio: coverageRatio, weight: EPP_SCORE_WEIGHTS.coverage },
    { key: 'validityCondition', ratio: validityConditionRatio, weight: EPP_SCORE_WEIGHTS.validityCondition },
    { key: 'traceability', ratio: traceabilityRatio, weight: EPP_SCORE_WEIGHTS.traceability },
  ];
  const score = Math.round(
    redistributeWeightedScore(dimensions.map(({ ratio, weight }) => ({ ratio, weight }))),
  );

  const workersWithInactiveJobProfile = workersWithInactiveProfile.length;

  return {
    score,
    dimensions: {
      program: { ratio: programRatio, evaluable: programRatio !== null },
      coverage: { ratio: coverageRatio, evaluable: coverageRatio !== null },
      validityCondition: { ratio: validityConditionRatio, evaluable: validityConditionRatio !== null },
      traceability: { ratio: traceabilityRatio, evaluable: traceabilityRatio !== null },
    },
    details: {
      program: { ratio: programRatio, numerator: jobProfilesWithMatrix, denominator: jobProfilesWithWorkers },
      coverage: {
        ratio: coverageRatio,
        numerator: coveredRequirements,
        denominator: applicableRequirements,
        coveredRequirements,
        applicableRequirements,
        fullyCoveredWorkers,
        workersWithRequirements,
        workersWithoutJobProfile: workersWithoutJobProfile.length,
      },
      validityCondition: {
        ratio: validityConditionRatio,
        numerator: validitySum,
        denominator: activeApplicableDeliveries.length,
      },
      traceability: {
        ratio: traceabilityRatio,
        numerator: traceableDeliveries.length,
        denominator: applicableDeliveries.length,
      },
    },
    counters: {
      catalogItems,
      catalogActive,
      jobProfilesActive: activeJobProfileById.size,
      jobProfilesWithWorkers,
      jobProfilesWithMatrix,
      jobProfilesWithoutMatrix,
      inactiveItemReferences,
      workersWithRequirements,
      fullyCoveredWorkers,
      workersWithoutJobProfile: workersWithoutJobProfile.length,
      workersWithInactiveJobProfile,
      applicableRequirements,
      coveredRequirements,
      activeDeliveries: activeApplicableDeliveries.length,
      activeValidDeliveries,
      overdue: overdueDeliveries.length,
      replaced: deliveries.filter((d) => String(d.status) === 'REPLACED').length,
      returned: deliveries.filter((d) => String(d.status) === 'RETURNED').length,
      damaged: deliveries.filter((d) => String(d.status) === 'DAMAGED').length,
      withEvidence,
      traceable: traceableDeliveries.length,
      deficientCondition: deficientCondition.length,
      severeCondition: severeCondition.length,
      deliveriesOutsideApplicability: deliveriesOutside.length,
      activeRequiringAction,
    },
    hasCatalog,
    hasApplicableRequirements: applicableRequirements > 0,
    hasEvaluableDeliveries: applicableDeliveries.length > 0,
    jobProfilesWithoutMatrix: jobProfilesWithoutMatrix > 0,
    workersWithoutJobProfile: workersWithoutJobProfile.length > 0,
    workersWithInactiveJobProfile: workersWithInactiveJobProfile > 0,
    inactiveItemReferences: inactiveItemReferences > 0,
    deliveriesOutsideApplicability: deliveriesOutside.length > 0,
  };
}


