import { CompliancePhaseDto } from './compliance-phase.dto';
import { FindingDto } from './finding.dto';
import { ModuleComplianceDto } from './module-compliance.dto';
import { PredictionDto } from './prediction.dto';
import { RecommendationDto } from './recommendation.dto';
import { FindingPriority } from '../enums/finding-priority.enum';

/**
 * Alerta operativa derivada del análisis de cumplimiento.
 */
export class ComplianceAlertDto {
  id!: string;
  severity!: FindingPriority;
  title!: string;
  message!: string;
  createdAt!: string;
}

/**
 * Punto de la serie temporal de cumplimiento.
 */
export class ComplianceTrendPointDto {
  period!: string;
  compliance!: number;
}

/**
 * Respuesta principal del Compliance Intelligence Engine para una empresa.
 */
export class ComplianceOverviewDto {
  overallCompliance!: number;
  phaseCompliance!: CompliancePhaseDto;
  moduleCompliance!: ModuleComplianceDto[];
  findings!: FindingDto[];
  recommendations!: RecommendationDto[];
  alerts!: ComplianceAlertDto[];
  prediction!: PredictionDto | null;
  trend!: ComplianceTrendPointDto[] | null;
  executiveSummary!: string;
  lastUpdated!: string;
}
