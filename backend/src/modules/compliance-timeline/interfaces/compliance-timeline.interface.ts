import {
  CompliancePhaseKey,
  ModuleCompliance,
  PhaseCompliance,
} from '../../compliance-engine/interfaces/compliance-engine.interface';

/**
 * Dirección de la tendencia mensual de cumplimiento.
 */
export type MonthlyTrendDirection = 'UP' | 'DOWN' | 'STABLE';

/**
 * Datos almacenados en un snapshot de cumplimiento.
 *
 * Esta es la forma canónica que persiste el timeline; se construye
 * exclusivamente a partir de ComplianceEngineService.getOverview().
 */
export interface ComplianceSnapshotData {
  snapshotDate: Date;
  overallCompliance: number;
  phaseCompliance: PhaseCompliance;
  moduleCompliance: ModuleCompliance[];
  findingsCount: number;
  criticalFindings: number;
  pendingActivities: number;
  completedActivities: number;
  activeAlerts: number;
  generatedAutomatically: boolean;
}

/**
 * Punto de la tendencia mensual de cumplimiento.
 */
export interface MonthlyTrendPoint {
  month: string;
  overallCompliance: number;
  variation: number | null;
  trend: MonthlyTrendDirection;
}

/**
 * Diferencia entre dos snapshots. Solo se incluyen los campos que cambian.
 */
export interface SnapshotComparison {
  overall?: { from: number; to: number; variation: number | null };
  phaseCompliance?: Partial<Record<CompliancePhaseKey, { from: number; to: number }>>;
  moduleCompliance?: Array<{ module: string; from: number; to: number }>;
  findings?: { from: number; to: number };
  alerts?: { from: number; to: number };
  pendingActivities?: { from: number; to: number };
}

// ---------------------------------------------------------------------------
// Estructuras preparadas para el futuro análisis con IA.
// Hoy se exponen en el DTO siempre como null; estas interfaces definen la forma
// que adoptarán cuando el motor inteligente las llene.
// ---------------------------------------------------------------------------

/**
 * Resumen de hallazgos clave generado por análisis inteligente.
 */
export interface TimelineInsights {
  keyFindings: string[];
  improvementAreas: string[];
}

/**
 * Predicción de la tendencia de cumplimiento.
 */
export interface TrendPrediction {
  direction: MonthlyTrendDirection;
  confidence: number;
  message: string;
}

/**
 * Predicción de módulos con riesgo de descenso de cumplimiento.
 */
export interface RiskPrediction {
  modulesAtRisk: Array<{ module: string; level: string }>;
}
