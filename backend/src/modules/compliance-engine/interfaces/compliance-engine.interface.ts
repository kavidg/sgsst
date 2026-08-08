import { ComplianceLevel } from '../enums/compliance-level.enum';
import { FindingPriority } from '../enums/finding-priority.enum';

/**
 * Claves de las cuatro etapas del ciclo PHVA.
 */
export type CompliancePhaseKey = 'plan' | 'do' | 'check' | 'act';

/**
 * Cumplimiento porcentual por etapa PHVA.
 */
export interface PhaseCompliance {
  plan: number;
  do: number;
  check: number;
  act: number;
}

/**
 * Cumplimiento de un módulo fuente del SG-SST (riesgos, capacitaciones, etc.).
 */
export interface ModuleCompliance {
  module: string;
  compliance: number;
  level: ComplianceLevel;
  lastUpdated: string;
}

/**
 * Hallazgo detectado por el motor.
 */
export interface ComplianceFinding {
  id: string;
  module: string;
  title: string;
  description: string;
  priority: FindingPriority;
  status: string;
  responsible: string;
  dueDate: string;
  createdAt: string;
}

/**
 * Recomendación generada por el motor.
 */
export interface ComplianceRecommendation {
  id: string;
  module: string;
  title: string;
  description: string;
  priority: FindingPriority;
  targetPhase: CompliancePhaseKey;
  createdAt: string;
}

/**
 * Alerta operativa derivada del análisis.
 */
export interface ComplianceAlert {
  id: string;
  severity: FindingPriority;
  title: string;
  message: string;
  createdAt: string;
}

/**
 * Predicción de cumplimiento proyectado.
 */
export interface CompliancePrediction {
  projectedCompliance: number;
  confidence: number;
  horizonMonths: number;
  methodology: string;
  generatedAt: string;
}

/**
 * Punto de una serie temporal de cumplimiento.
 */
export interface ComplianceTrendPoint {
  period: string;
  compliance: number;
}

/**
 * Contrato principal del overview de cumplimiento de una empresa.
 */
export interface ComplianceOverview {
  overallCompliance: number;
  phaseCompliance: PhaseCompliance;
  moduleCompliance: ModuleCompliance[];
  findings: ComplianceFinding[];
  recommendations: ComplianceRecommendation[];
  alerts: ComplianceAlert[];
  prediction: CompliancePrediction | null;
  trend: ComplianceTrendPoint[] | null;
  executiveSummary: string;
  lastUpdated: string;
}
