import { ActionTemplate } from '../../compliance-action-engine/enums/action-template.enum';
import { RecommendedRole } from '../../compliance-action-engine/enums/recommended-role.enum';
import { CompliancePhaseKey } from '../../compliance-engine/interfaces/compliance-engine.interface';
import { AutomationStatus } from '../enums/automation-status.enum';

/**
 * Acción futura preparada (DTO de presentación del AutomationResult).
 */
export class AutomationActionDto {
  actionId!: string;
  template!: ActionTemplate;
  title!: string;
  description!: string;
  module!: string;
  affectedPhase!: CompliancePhaseKey | null;
  responsibleRole!: RecommendedRole;
  estimatedDurationDays!: number;
  executable!: boolean;
}

/**
 * Respuesta del Compliance Automation Engine tras aceptar una recomendación.
 */
export class AutomationResultDto {
  accepted!: boolean;
  automationStatus!: AutomationStatus;
  generatedActions!: AutomationActionDto[];
  generatedActivities!: number;
  generatedObjectives!: number;
  generatedIndicators!: number;
  estimatedImpact!: number;
  estimatedDuration!: number;
  estimatedCost!: number;
  warnings!: string[];
  summary!: string;
  createdAutomatically!: boolean;
}
