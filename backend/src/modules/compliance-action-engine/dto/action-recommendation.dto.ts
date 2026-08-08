import { FindingPriority } from '../../compliance-engine/enums/finding-priority.enum';
import { CompliancePhaseKey } from '../../compliance-engine/interfaces/compliance-engine.interface';
import { RecommendedRole } from '../enums/recommended-role.enum';

/**
 * DTO de una recomendación de plan de acción del Compliance Action Engine.
 */
export class ActionRecommendationDto {
  id!: string;
  title!: string;
  description!: string;
  priority!: FindingPriority;
  estimatedImpact!: number;
  estimatedDurationDays!: number;
  recommendedResponsibleRole!: RecommendedRole;
  relatedFindingId!: string | null;
  relatedModule!: string;
  affectedPhase!: CompliancePhaseKey | null;
  estimatedCost!: number;
  canCreateAnnualPlanActivity!: boolean;
  canCreateObjective!: boolean;
  canCreateIndicator!: boolean;
  createdAutomatically!: boolean;
  /** Preparado para el futuro: aceptación de la recomendación. */
  accepted!: boolean | null;
  /** Preparado para el futuro: implementación de la recomendación. */
  implemented!: boolean | null;
  /** Preparado para el futuro: actividad del plan anual generada. */
  generatedActivityId!: string | null;
}
