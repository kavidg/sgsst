/**
 * E2-lite (3.2.3) — SCORER PURO del registro y análisis estadístico de
 * accidentes de trabajo y enfermedades laborales.
 *
 * Semánticamente NEUTRO: replica EXACTAMENTE las reglas inline del provider
 * previo (misma fórmula 25/25/25/25, mismos umbrales, mismos casos límite).
 * El provider se convierte en adaptador: consulta Incident/Employee
 * tenant-scoped, prepara el input serializable y delega el cálculo aquí.
 *
 * IDENTIDAD DEL ESTÁNDAR (E2-lite): la identidad vive ahora en código
 * ejecutable (no solo comentarios del provider):
 *   standardCode: '3.2.3'
 *   title: 'Registro y análisis estadístico de accidentes y enfermedades laborales'
 *   formula: 'dimensions:v1' — target 90
 *
 * REGLAS EXACTAS PRESERVADAS (provider previo):
 * - 0 incidentes → NO_DATA (finding 'accident-statistics-no-data').
 * - C1 (25%): (con fecha × 50 + con descripción>5 chars × 50) / total.
 * - C2 (25%): clasificados ACCIDENT/DISEASE / total (INCIDENTE se evalúa como
 *   no clasificado; InvestigationType del dominio incidents no tiene ese valor).
 * - C3 (25%): min(100, meses-distintos × 15).
 * - C4 (25%): 100 si hay trabajadores (Employee) del tenant, 0 si no.
 * - percentage = round(C1*0.25 + C2*0.25 + C3*0.25 + C4*0.25).
 * - Sin caps adicionales, sin redistribución de pesos, sin fuentes externas.
 *
 * FUENTES PERMITIDAS: Incident (operativa) + Employee (población de
 * referencia). PROHIBIDO: AccountabilityMeeting/Commitment, AnnualAudit,
 * ManagementReview, indicadores de 6.1.1 u otros estándares (frontera E0).
 */

import { InvestigationType } from '../../incidents/schemas/incident.schema';

/** Identidad del estándar 3.2.3 (código ejecutable, no comentarios). */
export const ACCIDENT_STATISTICS_MODULE = 'accident-statistics';
export const ACCIDENT_STATISTICS_STANDARD_CODE = '3.2.3';
export const ACCIDENT_STATISTICS_STANDARD_TITLE =
  'Registro y análisis estadístico de accidentes y enfermedades laborales';
export const ACCIDENT_STATISTICS_FORMULA = 'dimensions:v1';
export const ACCIDENT_STATISTICS_TARGET = 90;

/** Pesos por dimensión (fórmula 25/25/25/25 — fija por diseño del estándar). */
export const ACCIDENT_STATISTICS_SCORE_WEIGHTS = {
  existence: 25,
  classification: 25,
  temporalAnalysis: 25,
  workerPopulation: 25,
} as const;

/** Entrada serializable del scorer (sin tipos de Mongo). */
export interface AccidentStatisticsInput {
  /** Registros de incidentes del tenant (lean). */
  incidents: Array<{
    date?: Date | string | null;
    description?: string | null;
    investigationType?: string | null;
    daysLost?: number | null;
  }>;
  /** Trabajadores del tenant (población de referencia, C4). */
  workerCount: number;
}

/** Detalle por dimensión (patrón dimensions:v1 — ratio 0–1; null = NO_DATA). */
export interface AccidentStatisticsDimensionDetail {
  ratio: number | null;
  numerator: number | null;
  denominator: number | null;
  weight: number;
}

export interface AccidentStatisticsDimensions {
  existence: AccidentStatisticsDimensionDetail;
  classification: AccidentStatisticsDimensionDetail;
  temporalAnalysis: AccidentStatisticsDimensionDetail;
  workerPopulation: AccidentStatisticsDimensionDetail;
}

export interface AccidentStatisticsCounters {
  totalEvents: number;
  accidentCount: number;
  diseaseCount: number;
  unclassifiedCount: number;
  totalDaysLost: number;
  distinctMonths: number;
  workerCount: number;
}

export interface AccidentStatisticsScoreBreakdown {
  percentage: number;
  noData: boolean;
  noDataReason: 'no-incident-records' | null;
  dimensions: AccidentStatisticsDimensions;
  counters: AccidentStatisticsCounters;
}

/** Registro lean de incidente (misma forma que consume el provider). */
interface LeanIncident {
  date?: Date | string | null;
  description?: string | null;
  investigationType?: string | null;
  daysLost?: number | null;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Scorer puro y determinístico. Sin Mongo, sin NestJS, sin side effects.
 * No depende de la fecha del sistema: la continuidad (C3) se mide por
 * meses-distintos presentes en los datos.
 */
export function computeAccidentStatisticsScore(
  input: AccidentStatisticsInput,
): AccidentStatisticsScoreBreakdown {
  const incidents: LeanIncident[] = input.incidents ?? [];
  const total = incidents.length;

  // ── NO_DATA: 0 incidentes (regla exacta del provider previo) ──
  if (total === 0) {
    return {
      percentage: 0,
      noData: true,
      noDataReason: 'no-incident-records',
      dimensions: {
        existence: { ratio: null, numerator: null, denominator: null, weight: ACCIDENT_STATISTICS_SCORE_WEIGHTS.existence },
        classification: { ratio: null, numerator: null, denominator: null, weight: ACCIDENT_STATISTICS_SCORE_WEIGHTS.classification },
        temporalAnalysis: { ratio: null, numerator: null, denominator: null, weight: ACCIDENT_STATISTICS_SCORE_WEIGHTS.temporalAnalysis },
        workerPopulation: { ratio: null, numerator: null, denominator: null, weight: ACCIDENT_STATISTICS_SCORE_WEIGHTS.workerPopulation },
      },
      counters: {
        totalEvents: 0,
        accidentCount: 0,
        diseaseCount: 0,
        unclassifiedCount: 0,
        totalDaysLost: 0,
        distinctMonths: 0,
        workerCount: input.workerCount ?? 0,
      },
    };
  }

  // ── C1 — Existencia de registros estadísticos (25%) ──
  // (con fecha × 50 + con descripción>5 × 50) / total
  const withDate = incidents.filter((i) => i.date != null).length;
  const withDescription = incidents.filter(
    (i) => typeof i.description === 'string' && i.description.length > 5,
  ).length;
  const existenceScore = Math.round((withDate / total) * 50 + (withDescription / total) * 50);

  // ── C2 — Clasificación de eventos AT/EL (25%) ──
  const classifiedEvents = incidents.filter(
    (i) =>
      i.investigationType === InvestigationType.ACCIDENT ||
      i.investigationType === InvestigationType.DISEASE,
  );
  const classificationScore = Math.round((classifiedEvents.length / total) * 100);

  // ── C3 — Análisis temporal documentado (25%) ──
  const uniqueMonths = new Set(
    incidents
      .filter((i) => i.date != null)
      .map((i) => {
        const d = new Date(i.date as Date | string);
        return monthKey(d);
      }),
  );
  const temporalScore = Math.min(100, uniqueMonths.size * 15);

  // ── C4 — Población trabajadora de referencia (25%) ──
  const workerCount = input.workerCount ?? 0;
  const workerScore = workerCount > 0 ? 100 : 0;

  const percentage = Math.round(
    existenceScore * 0.25 +
      classificationScore * 0.25 +
      temporalScore * 0.25 +
      workerScore * 0.25,
  );

  // ── Counters (resumen estadístico; misma semántica del provider previo) ──
  const accidentCount = incidents.filter((i) => i.investigationType === InvestigationType.ACCIDENT).length;
  const diseaseCount = incidents.filter((i) => i.investigationType === InvestigationType.DISEASE).length;
  const totalDaysLost = incidents.reduce((sum, i) => sum + (i.daysLost ?? 0), 0);

  const dim = (ratio: number, numerator: number, denominator: number, weight: number): AccidentStatisticsDimensionDetail => ({
    ratio: Math.max(0, Math.min(1, ratio)),
    numerator,
    denominator,
    weight,
  });

  return {
    percentage,
    noData: false,
    noDataReason: null,
    dimensions: {
      existence: dim(existenceScore / 100, withDate, total, ACCIDENT_STATISTICS_SCORE_WEIGHTS.existence),
      classification: dim(classificationScore / 100, classifiedEvents.length, total, ACCIDENT_STATISTICS_SCORE_WEIGHTS.classification),
      temporalAnalysis: dim(temporalScore / 100, uniqueMonths.size, total, ACCIDENT_STATISTICS_SCORE_WEIGHTS.temporalAnalysis),
      workerPopulation: dim(workerScore / 100, workerCount > 0 ? 1 : 0, 1, ACCIDENT_STATISTICS_SCORE_WEIGHTS.workerPopulation),
    },
    counters: {
      totalEvents: total,
      accidentCount,
      diseaseCount,
      unclassifiedCount: total - classifiedEvents.length,
      totalDaysLost,
      distinctMonths: uniqueMonths.size,
      workerCount,
    },
  };
}
