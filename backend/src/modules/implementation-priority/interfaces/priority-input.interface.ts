import { StepId, StepStatus } from '../../implementation-wizard/schemas/implementation-wizard.schema';

/**
 * Paso normalizado de entrada para el motor de prioridades.
 *
 * Es una representación independiente del WizardOverviewStepDto del wizard:
 * el motor no debe acoplarse al DTO del wizard, sino a esta vista normalizada
 * que se mapea desde él (FASE 2).
 */
export interface PriorityStepInput {
  stepId: StepId;
  title: string;
  moduleRoute: string;
  percentage: number;
  status: StepStatus;
  criteria: string[];
  pendingCriteria: string[];
  estimatedImpact?: string | null;
}

/**
 * Datos de entrada normalizados del ImplementationPriorityEngine.
 *
 * Agrupa el contexto global del wizard validado más los pasos individuales.
 */
export interface PriorityInput {
  companyId: string;
  overallPercentage: number;
  overallScore: number;
  level: string;
  completedSteps: number;
  totalSteps: number;
  lastValidatedAt?: string | null;
  steps: PriorityStepInput[];
}
