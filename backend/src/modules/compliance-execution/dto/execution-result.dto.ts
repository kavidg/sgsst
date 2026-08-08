import { ExecutionError } from '../enums/execution-error.enum';
import { ExecutionStatus } from '../enums/execution-status.enum';
import { ExecutionStep } from '../enums/execution-step.enum';

/**
 * Trazabilidad de un paso dentro de la respuesta de ejecución.
 */
export class ExecutionStepDto {
  stepId!: string;
  type!: ExecutionStep;
  title!: string;
  status!: ExecutionStatus;
  startedAt!: Date | null;
  finishedAt!: Date | null;
  error!: ExecutionError | null;
  retryable!: boolean;
  skipReason!: string | null;
}

/**
 * Respuesta del Compliance Execution Engine.
 */
export class ExecutionResultDto {
  executionId!: string;
  status!: ExecutionStatus;
  completedSteps!: number;
  skippedSteps!: number;
  failedSteps!: number;
  duration!: number;
  summary!: string;
  warnings!: string[];
  errors!: string[];
  steps!: ExecutionStepDto[];
}
