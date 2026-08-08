/**
 * Entidades del sistema que pueden participar en un flujo de aprobación.
 *
 * Fase 0: solo se registran los tipos soportados; los adapters que conectan
 * cada módulo se implementarán en fases posteriores.
 */
export enum ApprovalEntity {
  DOCUMENT = 'DOCUMENT',
  ANNUAL_WORK_PLAN = 'ANNUAL_WORK_PLAN',
  INITIAL_EVALUATION = 'INITIAL_EVALUATION',
  RESPONSIBILITY_MATRIX = 'RESPONSIBILITY_MATRIX',
  COPASST = 'COPASST',
  CONVIVENCIA = 'CONVIVENCIA',
  PHVA_ADVANCED = 'PHVA_ADVANCED',
}
