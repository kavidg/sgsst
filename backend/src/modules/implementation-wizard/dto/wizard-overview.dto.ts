import { StepId, StepStatus } from '../schemas/implementation-wizard.schema';

/**
 * Paso individual del overview del Centro de Implementación.
 */
export interface WizardOverviewStepDto {
  stepId: StepId;
  title: string;
  moduleRoute: string;
  percentage: number;
  status: StepStatus;
  completed: boolean;
  criteria: string[];
  pendingCriteria: string[];
  /**
   * Impacto estimado de completar este paso: "+X% implementación", donde X es
   * el peso del paso × porcentaje restante (peso × (100 − percentage)).
   * Es null cuando el paso está completo (100%) o su aporte restante es
   * despreciable.
   */
  estimatedImpact?: string | null;
}

/**
 * Respuesta de GET /implementation-wizard/overview.
 *
 * Es un DTO propio: no expone schemas Mongo directamente.
 */
export class WizardOverviewDto {
  overallPercentage!: number;
  overallScore!: number;
  level!: string;
  completedSteps!: number;
  totalSteps!: number;
  isImplementationComplete!: boolean;
  lastValidatedAt!: string | null;
  steps!: WizardOverviewStepDto[];
}
