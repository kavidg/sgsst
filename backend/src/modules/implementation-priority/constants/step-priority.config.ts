import { StepId } from '../../implementation-wizard/schemas/implementation-wizard.schema';
import {
  PriorityScoreWeights,
  StepPriorityConfig,
} from '../interfaces/priority-config.interface';

/**
 * ÚNICA fuente estática del ImplementationPriorityEngine.
 *
 * Define exclusivamente datos de configuración por paso:
 * - criticality: criticidad normativa según Resolución 0312 (habilitantes =
 *   ALTA; herramientas e independientes = MEDIA/BAJA).
 * - estimatedEffort: esfuerzo estático (no derivable de los datos actuales).
 * - dependencies: ÚNICAMENTE dependencias verificadas (FASE 3):
 *   responsible_sst → course_50_hours · responsible_sst → sst_policy ·
 *   initial_evaluation → annual_plan · sst_policy → sst_objectives ·
 *   annual_plan → training · legal_matrix → document_management.
 *   Sin dependencias especulativas.
 * - actionTemplate: plantilla de acción recomendada cuando no hay
 *   pendingCriteria.
 *
 * NO contiene lógica ni cálculos. Los pesos de impacto NO se duplican aquí:
 * impact-metrics reutiliza DEFAULT_STEP_WEIGHTS (implementation-weights).
 */
export const STEP_PRIORITY_CONFIG: Record<StepId, StepPriorityConfig> = {
  company_info: {
    criticality: 'ALTA',
    estimatedEffort: 'ALTO',
    dependencies: [],
    actionTemplate: 'Completar la información general de la empresa',
  },
  users_roles: {
    criticality: 'BAJA',
    estimatedEffort: 'BAJO',
    dependencies: [],
    actionTemplate: 'Configurar los usuarios y roles del sistema',
  },
  responsible_sst: {
    criticality: 'ALTA',
    estimatedEffort: 'MEDIO',
    dependencies: [],
    actionTemplate: 'Asignar el Responsable del SG-SST',
  },
  course_50_hours: {
    criticality: 'ALTA',
    estimatedEffort: 'MEDIO',
    dependencies: ['responsible_sst'],
    actionTemplate: 'Validar el certificado del curso de 50 horas del responsable',
  },
  sst_policy: {
    criticality: 'ALTA',
    estimatedEffort: 'MEDIO',
    dependencies: ['responsible_sst'],
    actionTemplate: 'Completar y aprobar la Política SST',
  },
  sst_objectives: {
    criticality: 'MEDIA',
    estimatedEffort: 'MEDIO',
    dependencies: ['sst_policy'],
    actionTemplate: 'Definir los objetivos SST con indicadores',
  },
  initial_evaluation: {
    criticality: 'ALTA',
    estimatedEffort: 'ALTO',
    dependencies: [],
    actionTemplate: 'Completar la evaluación inicial del SG-SST',
  },
  annual_plan: {
    criticality: 'ALTA',
    estimatedEffort: 'ALTO',
    dependencies: ['initial_evaluation'],
    actionTemplate: 'Crear el Plan Anual de Trabajo',
  },
  copasst: {
    criticality: 'MEDIA',
    estimatedEffort: 'MEDIO',
    dependencies: [],
    actionTemplate: 'Configurar el COPASST o registrar la exención',
  },
  convivencia_committee: {
    criticality: 'BAJA',
    estimatedEffort: 'BAJO',
    dependencies: [],
    actionTemplate: 'Configurar el Comité de Convivencia o registrar la exención',
  },
  training: {
    criticality: 'MEDIA',
    estimatedEffort: 'MEDIO',
    dependencies: ['annual_plan'],
    actionTemplate: 'Definir el programa anual de capacitaciones',
  },
  communication: {
    criticality: 'MEDIA',
    estimatedEffort: 'BAJO',
    dependencies: [],
    actionTemplate: 'Generar la comunicación interna del SG-SST',
  },
  legal_matrix: {
    criticality: 'MEDIA',
    estimatedEffort: 'MEDIO',
    dependencies: [],
    actionTemplate: 'Completar la Matriz Legal',
  },
  document_management: {
    criticality: 'ALTA',
    estimatedEffort: 'ALTO',
    dependencies: ['legal_matrix'],
    actionTemplate: 'Activar el repositorio documental del SG-SST',
  },
};

/**
 * Coeficientes por defecto de la fórmula PS(s) (FASE 2).
 *
 * Configurables en el futuro por empresa/producto. Suma = 1.
 */
export const DEFAULT_PRIORITY_SCORE_WEIGHTS: PriorityScoreWeights = {
  impact: 0.45,
  criticality: 0.3,
  unlock: 0.15,
  block: 0.1,
};
