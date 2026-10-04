/**
 * Metadata V1 del estándar 5.1.2 — Brigada de emergencia (HACER).
 *
 * Refleja SIN transformación la metadata producida por
 * emergency-brigade-scoring.ts (backend/src/modules/compliance-engine/providers/)
 * y transportada por EmergencyBrigadeProvider vía ModuleComplianceDto desde el
 * Compliance Engine. Todos los campos son OPCIONALES: el frontend NO recalcula
 * nada — el score oficial es moduleCompliance.compliance y los pesos son solo
 * informativos.
 *
 * Nombres verificados contra EMERGENCY_BRIGADE_SCORE_WEIGHTS, la interfaz
 * EmergencyBrigadeScoreBreakdown y BrigadeDimensionDetail del backend
 * (formula 'dimensions:v1', module 'emergency-brigade').
 */

/** Dimensión 5.1.2 (espejo de BrigadeDimensionDetail: ratio + counters propios). */
export interface EmergencyBrigadeComplianceDimensionV1 {
  /** 0–1; null = NO evaluable (sin denominador válido). NUNCA convertir null en 0. */
  ratio?: number | null;
  numerator?: number | null;
  denominator?: number | null;
  /**
   * Detalle adicional de la dimensión (counters específicos por dimensión,
   * p. ej. leaderPresent, missingCoreFunctions, latestMeetingDate…).
   * Modelado abierto: se lee con helpers de tipo seguro, sin casts.
   */
  [key: string]: unknown;
}

/**
 * Metadata V1 de 5.1.2 (module 'emergency-brigade').
 * El score OFICIAL es moduleCompliance.compliance; esta metadata solo se
 * muestra. Los pesos NO deben usarse para recalcular nada en el frontend.
 */
export interface EmergencyBrigadeComplianceMetadataV1 {
  formula?: string;
  standardCode?: string;
  phase?: string;
  semantic?: string;
  weights?: {
    existence: number;
    composition: number;
    functionalCoverage: number;
    training: number;
    alternates: number;
    traceability: number;
    operation: number;
  };
  dimensions?: {
    existence?: EmergencyBrigadeComplianceDimensionV1;
    composition?: EmergencyBrigadeComplianceDimensionV1;
    functionalCoverage?: EmergencyBrigadeComplianceDimensionV1;
    training?: EmergencyBrigadeComplianceDimensionV1;
    alternates?: EmergencyBrigadeComplianceDimensionV1;
    traceability?: EmergencyBrigadeComplianceDimensionV1;
    operation?: EmergencyBrigadeComplianceDimensionV1;
  };
  /** Contadores reales del backend (ver EmergencyBrigadeScoreBreakdown.counters). */
  counters?: Record<string, number>;
}

/** Type guard: verifica que una metadata genérica sea la V1 de 5.1.2. */
export function isEmergencyBrigadeComplianceMetadataV1(
  value: unknown,
): value is EmergencyBrigadeComplianceMetadataV1 {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.formula !== 'dimensions:v1') return false;
  return typeof v.dimensions === 'object' || typeof v.weights === 'object';
}

/** Helpers de lectura segura de campos extendidos de una dimensión (sin any). */
export function readDimensionBoolean(dim: unknown, key: string): boolean | undefined {
  if (typeof dim !== 'object' || dim === null) return undefined;
  const v = (dim as Record<string, unknown>)[key];
  return typeof v === 'boolean' ? v : undefined;
}

export function readDimensionNumber(dim: unknown, key: string): number | undefined {
  if (typeof dim !== 'object' || dim === null) return undefined;
  const v = (dim as Record<string, unknown>)[key];
  return typeof v === 'number' ? v : undefined;
}

export function readDimensionStringArray(dim: unknown, key: string): string[] | undefined {
  if (typeof dim !== 'object' || dim === null) return undefined;
  const v = (dim as Record<string, unknown>)[key];
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === 'string');
}

export function readDimensionString(dim: unknown, key: string): string | undefined {
  if (typeof dim !== 'object' || dim === null) return undefined;
  const v = (dim as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : undefined;
}
