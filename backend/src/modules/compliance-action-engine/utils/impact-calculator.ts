import { ActionTemplate } from '../enums/action-template.enum';

const TEMPLATE_IMPACT: Record<ActionTemplate, number> = {
  [ActionTemplate.DOCUMENTS_UPDATE]: 2,
  [ActionTemplate.TRAINING_SCHEDULE]: 3,
  [ActionTemplate.RISK_CONTROLS]: 4,
  [ActionTemplate.INCIDENT_INVESTIGATION]: 2,
  [ActionTemplate.LEGAL_UPDATE]: 5,
  [ActionTemplate.ANNUAL_PLAN_RESCHEDULE]: 2,
  [ActionTemplate.PHVA_ACTIVITIES]: 3,
};

/**
 * Calcula el impacto estimado (en puntos porcentuales sobre el cumplimiento
 * global) de ejecutar una recomendación, según la plantilla de acción.
 */
export function calculateEstimatedImpact(template: ActionTemplate): number {
  return TEMPLATE_IMPACT[template];
}

/**
 * Calcula el costo estimado de ejecutar la recomendación.
 *
 * ESTADO ACTUAL: placeholder. No existe información de costos todavía,
 * por lo que siempre devuelve 0.
 */
export function calculateEstimatedCost(_template: ActionTemplate): number {
  return 0;
}
