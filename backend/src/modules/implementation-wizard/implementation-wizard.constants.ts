import { StepId } from './schemas/implementation-wizard.schema';

/** Orden canónico de los 14 pasos del Centro de Implementación. */
export const ALL_STEPS: StepId[] = [
  'company_info', 'users_roles', 'responsible_sst', 'course_50_hours',
  'sst_policy', 'sst_objectives', 'initial_evaluation', 'annual_plan',
  'copasst', 'convivencia_committee', 'training', 'communication',
  'legal_matrix', 'document_management',
];

/** Etiqueta legible de cada paso (usada en dashboard, overview y UI). */
export const STEP_LABELS: Record<StepId, string> = {
  company_info: 'Información Empresa',
  users_roles: 'Usuarios y Roles',
  responsible_sst: 'Responsable SG-SST',
  course_50_hours: 'Curso 50 Horas',
  sst_policy: 'Política SST',
  sst_objectives: 'Objetivos SST',
  initial_evaluation: 'Evaluación Inicial',
  annual_plan: 'Plan Anual',
  copasst: 'COPASST',
  convivencia_committee: 'Comité de Convivencia',
  training: 'Capacitación',
  communication: 'Comunicación',
  legal_matrix: 'Matriz Legal',
  document_management: 'Gestión Documental',
};

/** Descripción de cada paso para el historial y la UI. */
export const STEP_DESCRIPTIONS: Record<StepId, string> = {
  company_info: 'Complete los datos generales de la empresa: nombre, NIT, sector económico, nivel de riesgo, ARL y total de empleados.',
  users_roles: 'Configure al menos un administrador y un miembro en el sistema para la gestión del SG-SST.',
  responsible_sst: 'Asigne un responsable del SG-SST con su cargo y datos de contacto.',
  course_50_hours: 'Valide que el responsable SST cuenta con el certificado del curso de 50 horas vigente.',
  sst_policy: 'Cree, apruebe y firme la Política de Seguridad y Salud en el Trabajo.',
  sst_objectives: 'Defina al menos un objetivo SST medible con indicadores.',
  initial_evaluation: 'Complete la evaluación inicial del SG-SST según la normativa aplicable.',
  annual_plan: 'Cree el Plan Anual de Trabajo con al menos una actividad asignada.',
  copasst: 'Configure el COPASST o registre una justificación de exención.',
  convivencia_committee: 'Configure el Comité de Convivencia o registre una justificación de exención.',
  training: 'Defina el plan anual de capacitaciones en SST.',
  communication: 'Genere al menos una comunicación interna sobre temas SST.',
  legal_matrix: 'Genere la Matriz Legal de requisitos aplicables a la empresa.',
  document_management: 'Active el repositorio maestro de documentos del SG-SST.',
};

/** Ruta frontend del módulo que alimenta cada paso. */
export const STEP_MODULE_ROUTES: Record<StepId, string> = {
  company_info: '/company-configuration',
  users_roles: '/users',
  responsible_sst: '/company-configuration',
  course_50_hours: '/company-configuration',
  sst_policy: '/documents/plan',
  sst_objectives: '/documents/plan',
  // FASE 3.4.1: el paso initial_evaluation consume el módulo InitialEvaluation
  // (advanced-management), cuya UI funcional vive en PlanPage (ítem 2.3.1).
  // Antes apuntaba a /evaluations (página legacy rota).
  initial_evaluation: '/documents/plan',
  annual_plan: '/annual-work-plan',
  copasst: '/documents/do',
  convivencia_committee: '/documents/do',
  training: '/trainings',
  communication: '/documents/do',
  legal_matrix: '/legal-matrix',
  document_management: '/document-management',
};
