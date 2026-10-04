/**
 * Modelos de UI del Dashboard Inteligente.
 *
 * Reflejan los contratos JSON del Compliance Intelligence Engine
 * (GET /compliance-engine/overview) y del
 * Compliance Action Engine (GET /compliance-action-engine/recommendations).
 * AUDIT-16: URLs simplificadas — backend usa CompanyAccessGuard + request.companyId.
 * Contienen únicamente modelos de presentación; sin lógica de negocio.
 */

export type FindingSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type FindingPriority = FindingSeverity;

export type CompliancePhaseKey = 'plan' | 'do' | 'check' | 'act';

export type ComplianceLevel = 'CRITICAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'EXCELLENT';

/** Cumplimiento porcentual por etapa PHVA (0-100). */
export interface DashboardPhase {
  plan: number;
  do: number;
  check: number;
  act: number;
}

/** Alerta operativa derivada del análisis de cumplimiento. */
export interface DashboardAlert {
  id: string;
  severity: FindingSeverity;
  title: string;
  message: string;
  createdAt: string;
}

/**
 * Hallazgo del Compliance Engine.
 *
 * Los hallazgos operativos de los providers solo exponen los campos base;
 * los hallazgos del Intelligent Findings Engine agregan metadatos
 * enriquecidos (severity, category, sourceModule, affectedPhase,
 * recommendedAction, estimatedImpact, createdAutomatically), por lo que se
 * modelan como opcionales.
 */
export interface DashboardFinding {
  id: string;
  module: string;
  title: string;
  description: string;
  priority: FindingPriority;
  status: string;
  responsible: string;
  dueDate: string;
  createdAt: string;
  /** Metadatos enriquecidos (solo hallazgos inteligentes). */
  severity?: FindingSeverity;
  category?: string;
  sourceModule?: string;
  affectedPhase?: CompliancePhaseKey | null;
  recommendedAction?: string;
  estimatedImpact?: string;
  createdAutomatically?: boolean;
}

/** Cumplimiento de un módulo fuente del SG-SST. */
export interface DashboardModuleCompliance {
  module: string;
  compliance: number;
  level: ComplianceLevel;
  lastUpdated: string;
  /**
   * ETAPA 4 (4.2.6): campos ADITIVOS transportados desde
   * ProviderComplianceResult por el Compliance Engine (Etapa 3 backend).
   * Providers que no los producen quedan `undefined` (omitted en JSON).
   */
  status?: string;
  pending?: number;
  completed?: number;
  overdue?: number;
  phases?: Record<string, number>;
  /** Metadata del provider (para 4.2.6: metadata V2 — ver EppComplianceMetadataV2). */
  metadata?: Record<string, unknown>;
}

/** Recomendación general generada por el Compliance Engine (overview.recommendations). */
export interface ComplianceEngineRecommendation {
  id: string;
  module: string;
  title: string;
  description: string;
  priority: FindingPriority;
  targetPhase: CompliancePhaseKey;
  createdAt: string;
}

/** Punto de una serie temporal de cumplimiento. */
export interface DashboardTrendPoint {
  period: string;
  compliance: number;
}

/** Predicción de cumplimiento proyectado (null hasta que exista histórico). */
export interface DashboardPrediction {
  projectedCompliance: number;
  confidence: number;
  horizonMonths: number;
  methodology: string;
  generatedAt: string;
}

/** Respuesta principal del Compliance Intelligence Engine para una empresa. */
export interface ComplianceDashboardData {
  overallCompliance: number;
  phaseCompliance: DashboardPhase;
  moduleCompliance: DashboardModuleCompliance[];
  findings: DashboardFinding[];
  recommendations: ComplianceEngineRecommendation[];
  alerts: DashboardAlert[];
  prediction: DashboardPrediction | null;
  trend: DashboardTrendPoint[] | null;
  executiveSummary: string;
  lastUpdated: string;
}

/** Acción recomendada generada por el Compliance Action Engine. */
export interface DashboardRecommendation {
  id: string;
  title: string;
  description: string;
  priority: FindingPriority;
  estimatedImpact: number;
  estimatedDurationDays: number;
  recommendedResponsibleRole: string;
  relatedFindingId: string | null;
  relatedModule: string;
  affectedPhase: CompliancePhaseKey | null;
  estimatedCost: number;
  canCreateAnnualPlanActivity: boolean;
  canCreateObjective: boolean;
  canCreateIndicator: boolean;
  createdAutomatically: boolean;
  /** Preparado para el futuro: aceptación de la recomendación. */
  accepted: boolean | null;
  /** Preparado para el futuro: implementación de la recomendación. */
  implemented: boolean | null;
  /** Preparado para el futuro: actividad del plan anual generada. */
  generatedActivityId: string | null;
}

// ============================================================
// ETAPA 4 (4.2.6) — Metadata V2 del proveedor EPP
// ============================================================
// Refleja SIN transformación la metadata producida por epp-scoring.ts
// (backend/src/modules/compliance-engine/providers/epp-scoring.ts) y
// transportada por ModuleComplianceDto desde la Etapa 3.
// Todos los campos son opcionales: el frontend NO recalcula nada.

/** Dimensión V2 (espejo de EppDimensionDetail del backend). */
export interface EppComplianceDimensionV2 {
  /** 0–1; null = NO evaluable (sin denominador válido). NUNCA convertir null en 0. */
  ratio?: number | null;
  numerator?: number;
  denominator?: number;
}

/** Dimensión COBERTURA (espejo de EppCoverageDetail: M2 principal + M1 complementaria). */
export interface EppComplianceCoverageMetadataV2 extends EppComplianceDimensionV2 {
  coveredRequirements?: number;
  applicableRequirements?: number;
  fullyCoveredWorkers?: number;
  workersWithRequirements?: number;
  /** Indicador de calidad de datos (NO es una penalización). */
  workersWithoutJobProfile?: number;
}

/**
 * Metadata V2 de 4.2.6 (module 'epp-compliance').
 * El score OFICIAL es moduleCompliance.compliance; esta metadata solo se
 * muestra. Los pesos NO deben usarse para recalcular nada en el frontend.
 */
export interface EppComplianceMetadataV2 {
  formula?: string;
  standardCode?: string;
  phase?: string;
  weights?: {
    program: number;
    coverage: number;
    validityCondition: number;
    traceability: number;
  };
  dimensions?: {
    program?: EppComplianceDimensionV2;
    coverage?: EppComplianceCoverageMetadataV2;
    validityCondition?: EppComplianceDimensionV2;
    traceability?: EppComplianceDimensionV2;
  };
  /** Contadores reales del backend (p. ej. overdue, withEvidence, traceable…). */
  counters?: Record<string, number>;
}

/** Type guard: verifica que una metadata genérica sea la V2 de 4.2.6. */
export function isEppComplianceMetadataV2(value: unknown): value is EppComplianceMetadataV2 {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.formula !== 'dimensions:v2') return false;
  return typeof v.weights === 'object' || typeof v.dimensions === 'object';
}
