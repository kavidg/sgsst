/**
 * Núcleo PURO de scoring del estándar 6.1.1 — Indicadores SG-SST (VERIFICAR).
 *
 * Sin Mongo/Mongoose/servicios/HTTP: recibe únicamente datos serializables
 * (ya consultados tenant-scoped por IndicatorsService.getComplianceSnapshot)
 * y devuelve un breakdown completo (dimensions/counters/findings).
 * Patrón: emergency-brigade-scoring.ts (5.1.2) / epp-scoring.ts (4.2.6).
 *
 * DECISIONES FUNCIONALES (Etapa E1 — consolidación del provider oficial):
 *  - El score mide la GESTIÓN de indicadores (existencia, calidad de ficha,
 *    medición, metas, análisis y historial), NO el cumplimiento de los módulos
 *    fuente (eso ya lo puntúan sus propios providers).
 *  - Fuente oficial: colecciones IndicatorDefinition, IndicatorMeasurement e
 *    IndicatorPeriod del módulo indicators. NO se re-suman porcentajes del
 *    ComplianceEngine ni de dashboards.
 *  - "Período evaluado": el módulo no tiene un período global único; cada
 *    indicador se evalúa con su MEDICIÓN MÁS RECIENTE (period lexicográfico
 *    desc — formatos YYYY-MM/YYYY-QN/YYYY-SN/YYYY son comparables —, luego
 *    measuredAt desc). Política idéntica a getDashboardSummary. El período
 *    evaluado global (metadata) es el período más reciente con mediciones.
 *  - La evaluación de meta (TARGET_MET/TARGET_NOT_MET) ya la realiza el
 *    módulo (IndicatorsService.evaluateTarget); el scoring NO la recalcula.
 *  - Sin redistribución artificial de incidencias: una ficha incompleta o un
 *    indicador sin medición representa incumplimiento (no desaparece).
 *  - La dimensión de historial con un solo período medido se considera NO
 *    evaluable (null → redistribuida): no se exige artificialmente historia
 *    multiperíodo a tenants nuevos.
 *  - Integridad: la clave única companyId+indicatorId+period del schema debe
 *    garantizar 1 medición por período; duplicados detectados se reportan
 *    como incidencia (no generan puntos adicionales).
 */

export const INDICATORS_MODULE = 'indicators';
export const INDICATORS_STANDARD_CODE = '6.1.1';
export const INDICATORS_FORMULA = 'dimensions:v1';

/** Meta de cumplimiento oficial (patrón 5.1.x / 4.2.5 / 4.2.6). */
export const INDICATORS_COMPLIANCE_TARGET = 90;

/**
 * Pesos PROVISIONALES de las 6 dimensiones (suman exactamente 100).
 * La existencia puntúa poco (patrón 5.1.2: registrar es el piso mínimo);
 * la calidad de la ficha y la medición concentran el peso.
 */
export const INDICATORS_SCORE_WEIGHTS = {
  existence: 10,
  definitionQuality: 20,
  measurement: 25,
  targetCompliance: 20,
  analysisEvidence: 15,
  history: 10,
} as const;

// ── Entrada (serializable; sin tipos de Mongoose) ──

export interface IndicatorDefinitionLike {
  _id: string;
  code?: string;
  name?: string;
  description?: string;
  category?: string;
  subcategory?: string;
  sourceModule?: string;
  formulaType?: string;
  formula?: unknown;
  unit?: string;
  targetOperator?: string;
  targetValue?: number;
  targetMin?: number;
  targetMax?: number;
  frequency?: string;
  responsible?: string;
  responsibleArea?: string;
  isActive?: boolean;
  catalogCode?: string;
}

export interface IndicatorMeasurementLike {
  _id: string;
  indicatorId: string;
  period?: string;
  status?: string;
  source?: string;
  evidence?: string;
  notes?: string;
  measuredAt?: string;
}

export interface IndicatorPeriodLike {
  period?: string;
  status?: string;
  closedAt?: string;
}

export interface IndicatorsScoreInput {
  /** Definiciones de la empresa (activas e inactivas; tenant-scoped). */
  definitions: IndicatorDefinitionLike[];
  /** Mediciones de la empresa (todos los períodos; tenant-scoped). */
  measurements: IndicatorMeasurementLike[];
  /** Períodos gestionados por la empresa (OPEN/CLOSED). */
  periods: IndicatorPeriodLike[];
}

// ── Estructura de salida ──

export interface IndicatorDimensionDetail {
  /** 0–1; null = NO evaluable (se redistribuye; NUNCA convertir null en 0). */
  ratio: number | null;
  numerator: number | null;
  denominator: number | null;
  weight: number;
  [key: string]: unknown;
}

export interface IndicatorFindingDraft {
  id: string;
  title: string;
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface IndicatorsScoreBreakdown {
  percentage: number;
  noData: boolean;
  /** Causa exacta del NO_DATA (para metadata y tests). */
  noDataReason: 'no-active-indicators' | 'no-valid-measurements' | null;
  /** Período más reciente con mediciones (contexto; null si no hay). */
  evaluatedPeriod: string | null;
  dimensions: {
    existence: IndicatorDimensionDetail;
    definitionQuality: IndicatorDimensionDetail;
    measurement: IndicatorDimensionDetail;
    targetCompliance: IndicatorDimensionDetail;
    analysisEvidence: IndicatorDimensionDetail;
    history: IndicatorDimensionDetail;
  };
  counters: {
    totalIndicators: number;
    activeIndicators: number;
    inactiveIndicators: number;
    completeDefinitions: number;
    incompleteDefinitions: number;
    indicatorsWithMeasurement: number;
    indicatorsWithoutMeasurement: number;
    validMeasurements: number;
    targetMet: number;
    targetNotMet: number;
    calculatedWithoutTarget: number;
    measurementsWithEvidence: number;
    measurementsWithNotes: number;
    totalMeasurements: number;
    distinctMeasuredPeriods: number;
    closedPeriods: number;
    openPeriods: number;
    duplicateMeasurementKeys: number;
  };
  findings: IndicatorFindingDraft[];
}

// ── Helpers puros ──

function truthyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function finiteNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Copia local del helper oficial de redistribución (patrón epp-scoring.ts /
 * maintenance-scoring.ts: cada scoring lleva su propia copia desacoplada).
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

/** Medición válida: período identificable y estado evaluable (NO_DATA excluido). */
function isValidMeasurement(status: unknown, period: unknown): boolean {
  if (!truthyText(period)) return false;
  return (
    status === 'TARGET_MET' ||
    status === 'TARGET_NOT_MET' ||
    status === 'CALCULATED'
  );
}

/** Ficha técnica completa según los campos REALES de IndicatorDefinition. */
function isDefinitionComplete(def: IndicatorDefinitionLike): boolean {
  const hasDescription = truthyText(def.description);
  const hasTarget =
    truthyText(def.targetOperator) &&
    (def.targetOperator === 'BETWEEN'
      ? finiteNum(def.targetMin) && finiteNum(def.targetMax)
      : finiteNum(def.targetValue));
  const hasFrequency = truthyText(def.frequency);
  const hasResponsible = truthyText(def.responsible) || truthyText(def.responsibleArea);
  // MANUAL no requiere fórmula declarativa; AUTOMATIC/SEMI_AUTOMATIC sí.
  const hasFormula =
    def.formulaType === 'MANUAL'
      ? true
      : typeof def.formula === 'object' &&
        def.formula !== null &&
        Object.keys(def.formula as Record<string, unknown>).length > 0;
  return hasDescription && hasTarget && hasFrequency && hasResponsible && hasFormula;
}

/** Selección defensiva de la medición más reciente por indicador. */
function latestMeasurementKey(m: IndicatorMeasurementLike): { period: string; at: number } {
  const at = m.measuredAt ? Date.parse(m.measuredAt) : NaN;
  return { period: String(m.period ?? ''), at: Number.isNaN(at) ? 0 : at };
}

/**
 * Calcula el score de 6.1.1. Función PURA (determinista, sin efectos).
 */
export function computeIndicatorsScore(input: IndicatorsScoreInput): IndicatorsScoreBreakdown {
  const definitions = Array.isArray(input.definitions) ? input.definitions : [];
  const measurements = Array.isArray(input.measurements) ? input.measurements : [];
  const periods = Array.isArray(input.periods) ? input.periods : [];

  const activeDefs = definitions.filter(
    (d) => d.isActive !== false && truthyText(d.code) && truthyText(d.name),
  );
  const inactiveIndicators = definitions.length - activeDefs.length;
  const activeCount = activeDefs.length;

  // ── Integridad: duplicados companyId+indicatorId+period (deben ser 0) ──
  const seenKeys = new Map<string, number>();
  for (const m of measurements) {
    const key = `${String(m.indicatorId ?? '')}::${String(m.period ?? '')}`;
    if (key === '::') continue;
    seenKeys.set(key, (seenKeys.get(key) ?? 0) + 1);
  }
  let duplicateMeasurementKeys = 0;
  for (const count of seenKeys.values()) {
    if (count > 1) duplicateMeasurementKeys += count - 1;
  }

  // ── Medición más reciente por indicador ACTIVO (política getDashboardSummary) ──
  const latestByIndicator = new Map<string, IndicatorMeasurementLike>();
  for (const m of measurements) {
    const id = String(m.indicatorId ?? '');
    if (!id || !activeDefs.some((d) => d._id === id)) continue;
    const current = latestByIndicator.get(id);
    if (!current) {
      latestByIndicator.set(id, m);
      continue;
    }
    const a = latestMeasurementKey(m);
    const b = latestMeasurementKey(current);
    if (a.period > b.period || (a.period === b.period && a.at > b.at)) {
      latestByIndicator.set(id, m);
    }
  }

  const latestOf = (def: IndicatorDefinitionLike): IndicatorMeasurementLike | undefined =>
    latestByIndicator.get(def._id);
  const isValidLatest = (def: IndicatorDefinitionLike): boolean => {
    const m = latestOf(def);
    return m !== undefined && isValidMeasurement(m.status, m.period);
  };

  // ── D1 — EXISTENCIA (10): al menos una definición activa y válida. ──
  const existenceRatio = activeCount > 0 ? 1 : 0;
  const existence: IndicatorDimensionDetail = {
    ratio: existenceRatio,
    numerator: existenceRatio,
    denominator: 1,
    weight: INDICATORS_SCORE_WEIGHTS.existence,
    totalDefinitions: definitions.length,
    activeIndicators: activeCount,
    inactiveIndicators,
  };

  // ── D2 — CALIDAD DE LA FICHA TÉCNICA (20) ──
  const completeDefs = activeDefs.filter(isDefinitionComplete);
  const definitionQualityRatio = activeCount > 0 ? completeDefs.length / activeCount : null;
  const definitionQuality: IndicatorDimensionDetail = {
    ratio: definitionQualityRatio,
    numerator: activeCount > 0 ? completeDefs.length : null,
    denominator: activeCount > 0 ? activeCount : null,
    weight: INDICATORS_SCORE_WEIGHTS.definitionQuality,
    completeDefinitions: completeDefs.length,
    incompleteDefinitions: activeCount - completeDefs.length,
  };

  // ── D3 — MEDICIÓN (25): activos con medición válida (más reciente). ──
  const withValidMeasurement = activeDefs.filter(isValidLatest);
  const measurementRatio = activeCount > 0 ? withValidMeasurement.length / activeCount : null;
  const measurement: IndicatorDimensionDetail = {
    ratio: measurementRatio,
    numerator: activeCount > 0 ? withValidMeasurement.length : null,
    denominator: activeCount > 0 ? activeCount : null,
    weight: INDICATORS_SCORE_WEIGHTS.measurement,
    indicatorsWithMeasurement: withValidMeasurement.length,
    indicatorsWithoutMeasurement: activeCount - withValidMeasurement.length,
    duplicateMeasurementKeys,
  };

  // ── D4 — CUMPLIMIENTO DE METAS (20): TARGET_MET / evaluables. ──
  // El estado de meta YA fue determinado por el módulo; no se recalcula.
  const targetMetDefs = withValidMeasurement.filter((d) => latestOf(d)?.status === 'TARGET_MET');
  const targetNotMetDefs = withValidMeasurement.filter((d) => latestOf(d)?.status === 'TARGET_NOT_MET');
  const calculatedWithoutTarget = withValidMeasurement.filter((d) => latestOf(d)?.status === 'CALCULATED').length;
  const targetEvaluable = targetMetDefs.length + targetNotMetDefs.length;
  const targetComplianceRatio = targetEvaluable > 0 ? targetMetDefs.length / targetEvaluable : null;
  const targetCompliance: IndicatorDimensionDetail = {
    ratio: targetComplianceRatio,
    numerator: targetEvaluable > 0 ? targetMetDefs.length : null,
    denominator: targetEvaluable > 0 ? targetEvaluable : null,
    weight: INDICATORS_SCORE_WEIGHTS.targetCompliance,
    targetMet: targetMetDefs.length,
    targetNotMet: targetNotMetDefs.length,
    calculatedWithoutTarget,
  };

  // ── D5 — ANÁLISIS Y EVIDENCIA (15): trazabilidad estructural de la medición. ──
  // Presencia de notes/evidence; la CALIDAD del análisis no es evaluable.
  const withEvidence = withValidMeasurement.filter((d) => truthyText(latestOf(d)?.evidence));
  const withNotes = withValidMeasurement.filter((d) => truthyText(latestOf(d)?.notes));
  const withAnalysis = withValidMeasurement.filter(
    (d) => truthyText(latestOf(d)?.evidence) || truthyText(latestOf(d)?.notes),
  );
  const analysisEvidenceRatio =
    withValidMeasurement.length > 0 ? withAnalysis.length / withValidMeasurement.length : null;
  const analysisEvidence: IndicatorDimensionDetail = {
    ratio: analysisEvidenceRatio,
    numerator: withValidMeasurement.length > 0 ? withAnalysis.length : null,
    denominator: withValidMeasurement.length > 0 ? withValidMeasurement.length : null,
    weight: INDICATORS_SCORE_WEIGHTS.analysisEvidence,
    measurementsWithEvidence: withEvidence.length,
    measurementsWithNotes: withNotes.length,
  };

  // ── D6 — GESTIÓN HISTÓRICA (10) ──
  // Períodos distintos con medición válida de indicadores activos.
  // 0 períodos → 0 (solo alcanzable fuera del NO_DATA en casos límite);
  // 1 período → null (NO evaluable: no se exige historia a tenants nuevos);
  // ≥2 períodos → 1 (seguimiento multiperíodo demostrado).
  const distinctPeriods = new Set<string>();
  for (const m of measurements) {
    if (
      isValidMeasurement(m.status, m.period) &&
      activeDefs.some((d) => d._id === String(m.indicatorId ?? ''))
    ) {
      distinctPeriods.add(String(m.period));
    }
  }
  const historyRatio =
    distinctPeriods.size >= 2 ? 1 : distinctPeriods.size === 1 ? null : 0;
  const closedPeriods = periods.filter((p) => p.status === 'CLOSED').length;
  const openPeriods = periods.filter((p) => p.status !== 'CLOSED').length;
  const history: IndicatorDimensionDetail = {
    ratio: historyRatio,
    numerator: distinctPeriods.size >= 2 ? 2 : null,
    denominator: distinctPeriods.size >= 2 ? 2 : null,
    weight: INDICATORS_SCORE_WEIGHTS.history,
    distinctMeasuredPeriods: distinctPeriods.size,
    closedPeriods,
    openPeriods,
  };

  // ── NO_DATA ──
  // Caso A: sin indicadores activos → no hay nada evaluable.
  // Caso B: activos pero NINGUNO con medición válida → sin datos evaluables
  // (política del módulo: NO_DATA no se transforma en incumplimiento).
  const noData = activeCount === 0 || withValidMeasurement.length === 0;
  const noDataReason: IndicatorsScoreBreakdown['noDataReason'] =
    activeCount === 0 ? 'no-active-indicators' : withValidMeasurement.length === 0 ? 'no-valid-measurements' : null;

  const w = INDICATORS_SCORE_WEIGHTS;
  const percentage = noData
    ? 0
    : redistributeWeightedScore([
        { ratio: existence.ratio, weight: w.existence },
        { ratio: definitionQuality.ratio, weight: w.definitionQuality },
        { ratio: measurement.ratio, weight: w.measurement },
        { ratio: targetCompliance.ratio, weight: w.targetCompliance },
        { ratio: analysisEvidence.ratio, weight: w.analysisEvidence },
        { ratio: history.ratio, weight: w.history },
      ]);

  // ── Período evaluado (contexto): el más reciente con mediciones. ──
  let evaluatedPeriod: string | null = null;
  for (const m of measurements) {
    if (truthyText(m.period) && (evaluatedPeriod === null || m.period! > evaluatedPeriod)) {
      evaluatedPeriod = m.period!;
    }
  }

  // ── Findings oficiales (solo lo demostrable desde los datos) ──
  const findings: IndicatorFindingDraft[] = [];
  if (activeCount === 0) {
    findings.push({
      id: 'indicators-no-active',
      title: 'No hay indicadores SG-SST activos',
      description: 'No existen indicadores activos configurados para medir el desempeño del SG-SST. Defina indicadores de estructura, proceso y resultado en el módulo de Indicadores.',
      priority: 'HIGH',
    });
  } else if (withValidMeasurement.length === 0) {
    findings.push({
      id: 'indicators-no-data',
      title: `${activeCount} indicador(es) activo(s) sin medición válida`,
      description: `${activeCount} indicadores activos no tienen medición válida registrada (sin medición o con estado NO_DATA). Registre mediciones del período para habilitar la evaluación.`,
      priority: 'HIGH',
    });
  } else {
    const incomplete = activeCount - completeDefs.length;
    if (incomplete > 0) {
      findings.push({
        id: 'indicators-definition-incomplete',
        title: `${incomplete} ficha(s) técnica(s) incompleta(s)`,
        description: `${incomplete} de ${activeCount} indicadores activos carecen de descripción, meta, frecuencia, responsable o fórmula (cuando aplica). Completar la ficha técnica mejora la calidad de la medición.`,
        priority: completeDefs.length === 0 ? 'HIGH' : 'MEDIUM',
      });
    }
    if (withValidMeasurement.length < activeCount) {
      findings.push({
        id: 'indicators-without-measurement',
        title: `${activeCount - withValidMeasurement.length} indicador(es) sin medición del período`,
        description: `${activeCount - withValidMeasurement.length} de ${activeCount} indicadores activos no tienen medición válida en su período más reciente.`,
        priority: 'MEDIUM',
      });
    }
    if (targetNotMetDefs.length > 0) {
      findings.push({
        id: 'indicators-target-not-met',
        title: `${targetNotMetDefs.length} indicador(es) no alcanzan la meta`,
        description: `${targetNotMetDefs.length} de ${targetEvaluable} indicadores evaluables tienen mediciones fuera de la meta establecida.`,
        priority: 'MEDIUM',
      });
    }
    if (withAnalysis.length < withValidMeasurement.length) {
      findings.push({
        id: 'indicators-analysis-missing',
        title: `${withValidMeasurement.length - withAnalysis.length} medición(es) sin análisis ni evidencia`,
        description: `${withValidMeasurement.length - withAnalysis.length} mediciones válidas no registran notes ni evidence (trazabilidad estructural del análisis).`,
        priority: 'LOW',
      });
    }
    if (distinctPeriods.size >= 2 && closedPeriods === 0) {
      findings.push({
        id: 'indicators-history-incomplete',
        title: 'Historial multiperíodo sin períodos cerrados',
        description: `Existen mediciones en ${distinctPeriods.size} períodos pero ningún período cerrado. Cierre los períodos para consolidar el histórico.`,
        priority: 'LOW',
      });
    }
    if (duplicateMeasurementKeys > 0) {
      findings.push({
        id: 'indicators-duplicate-measurements',
        title: `${duplicateMeasurementKeys} medición(es) duplicada(s)`,
        description: 'La clave companyId+indicatorId+period debe ser única; se detectaron mediciones repetidas para el mismo indicador y período (incidencia de integridad).',
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
      existence,
      definitionQuality,
      measurement,
      targetCompliance,
      analysisEvidence,
      history,
    },
    counters: {
      totalIndicators: definitions.length,
      activeIndicators: activeCount,
      inactiveIndicators,
      completeDefinitions: completeDefs.length,
      incompleteDefinitions: activeCount - completeDefs.length,
      indicatorsWithMeasurement: withValidMeasurement.length,
      indicatorsWithoutMeasurement: activeCount - withValidMeasurement.length,
      validMeasurements: withValidMeasurement.length,
      targetMet: targetMetDefs.length,
      targetNotMet: targetNotMetDefs.length,
      calculatedWithoutTarget,
      measurementsWithEvidence: withEvidence.length,
      measurementsWithNotes: withNotes.length,
      totalMeasurements: measurements.length,
      distinctMeasuredPeriods: distinctPeriods.size,
      closedPeriods,
      openPeriods,
      duplicateMeasurementKeys,
    },
    findings,
  };
}
