import { ActionTemplate } from '../enums/action-template.enum';

const TEMPLATE_DURATION_DAYS: Record<ActionTemplate, number> = {
  [ActionTemplate.DOCUMENTS_UPDATE]: 7,
  [ActionTemplate.TRAINING_SCHEDULE]: 15,
  [ActionTemplate.RISK_CONTROLS]: 10,
  [ActionTemplate.INCIDENT_INVESTIGATION]: 5,
  [ActionTemplate.LEGAL_UPDATE]: 7,
  [ActionTemplate.ANNUAL_PLAN_RESCHEDULE]: 3,
  [ActionTemplate.PHVA_ACTIVITIES]: 10,
};

/**
 * Calcula la duración estimada (en días) de ejecutar una recomendación,
 * según la plantilla de acción.
 */
export function calculateEstimatedDurationDays(template: ActionTemplate): number {
  return TEMPLATE_DURATION_DAYS[template];
}
