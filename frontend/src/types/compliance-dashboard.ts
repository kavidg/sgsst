/**
 * Modelos de UI del Dashboard Inteligente.
 *
 * Reflejan los contratos JSON del Compliance Intelligence Engine
 * (GET /compliance-engine/company/:companyId/overview) y del
 * Compliance Action Engine (GET /compliance-action-engine/company/:companyId/recommendations).
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
