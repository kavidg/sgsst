import { ModuleCompliance, PhaseCompliance } from '../../compliance-engine/interfaces/compliance-engine.interface';
import { RiskPrediction, TimelineInsights, TrendPrediction } from '../interfaces/compliance-timeline.interface';

/**
 * Snapshot de cumplimiento SG-SST de una empresa en una fecha.
 */
export class ComplianceSnapshotDto {
  id!: string;
  companyId!: string;
  snapshotDate!: string;
  overallCompliance!: number;
  phaseCompliance!: PhaseCompliance;
  moduleCompliance!: ModuleCompliance[];
  findingsCount!: number;
  criticalFindings!: number;
  pendingActivities!: number;
  completedActivities!: number;
  activeAlerts!: number;
  generatedAutomatically!: boolean;

  // --- Estructuras preparadas para el futuro análisis con IA ---
  // Siempre null por ahora; se llenarán cuando el motor inteligente las genere.
  timelineInsights!: TimelineInsights | null;
  trendPrediction!: TrendPrediction | null;
  riskPrediction!: RiskPrediction | null;

  createdAt!: string;
  updatedAt!: string;
}
