/**
 * Plantilla de acción que el Intelligent Action Plan Engine puede generar.
 *
 * Cada plantilla agrupa los parámetros estándar de un plan de acción:
 * título, rol responsable, duración estimada e impacto esperado.
 */
export enum ActionTemplate {
  DOCUMENTS_UPDATE = 'DOCUMENTS_UPDATE',
  TRAINING_SCHEDULE = 'TRAINING_SCHEDULE',
  RISK_CONTROLS = 'RISK_CONTROLS',
  INCIDENT_INVESTIGATION = 'INCIDENT_INVESTIGATION',
  LEGAL_UPDATE = 'LEGAL_UPDATE',
  ANNUAL_PLAN_RESCHEDULE = 'ANNUAL_PLAN_RESCHEDULE',
  PHVA_ACTIVITIES = 'PHVA_ACTIVITIES',
}
