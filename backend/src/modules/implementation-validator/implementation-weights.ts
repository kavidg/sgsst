import { StepId } from '../implementation-wizard/schemas/implementation-wizard.schema';

/**
 * Pesos por defecto de cada paso del Centro de Implementación para el cálculo
 * del progreso ponderado real. La suma de los pesos es 1.
 *
 * Los pesos priorizan los pasos que la Resolución 0312 de 2019 exige como
 * habilitantes del SG-SST: datos de la empresa, responsable SST, política,
 * evaluación inicial, plan anual y gestión documental.
 *
 * PLACEHOLDER: en el futuro los pesos podrán provenir de configuración por
 * empresa o de la plantilla de estándares (7/21/60).
 */
export const DEFAULT_STEP_WEIGHTS: Record<StepId, number> = {
  company_info: 0.1,
  users_roles: 0.05,
  responsible_sst: 0.1,
  course_50_hours: 0.05,
  sst_policy: 0.1,
  sst_objectives: 0.05,
  initial_evaluation: 0.1,
  annual_plan: 0.1,
  copasst: 0.05,
  convivencia_committee: 0.05,
  training: 0.05,
  communication: 0.05,
  legal_matrix: 0.05,
  document_management: 0.1,
};

/**
 * Devuelve una copia de los pesos para evitar mutaciones accidentales.
 */
export function getImplementationWeights(): Record<StepId, number> {
  return { ...DEFAULT_STEP_WEIGHTS };
}
