import { FindingPriority } from '../../compliance-engine/enums/finding-priority.enum';
import { CompliancePhaseKey } from '../../compliance-engine/interfaces/compliance-engine.interface';
import { ActionTemplate } from '../enums/action-template.enum';
import { RecommendedRole } from '../enums/recommended-role.enum';

/**
 * Plan de acción recomendado por el Intelligent Action Plan Engine.
 *
 * Se genera automáticamente a partir del ComplianceOverviewDto del
 * Compliance Engine (sin consultar MongoDB ni recalcular cumplimiento).
 * No crea actividades reales: solo recomendaciones estructuradas.
 */
export interface ActionRecommendation {
  id: string;
  title: string;
  description: string;
  priority: FindingPriority;
  estimatedImpact: number;
  estimatedDurationDays: number;
  recommendedResponsibleRole: RecommendedRole;
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
  /** Plantilla de acción utilizada para generar la recomendación. */
  template: ActionTemplate;
}
