import { ExecutionStatus } from '../enums/execution-status.enum';

/**
 * Resultado de una ejecución del Compliance Execution Engine.
 *
 * Se construye después de ejecutar el ExecutionPlan paso a paso; el resumen
 * se genera con execution-summary y el historial se persiste aparte.
 */
export interface ExecutionResult {
  executionId: string;
  status: ExecutionStatus;
  completedSteps: number;
  skippedSteps: number;
  failedSteps: number;
  /** Duración total en milisegundos. */
  duration: number;
  summary: string;
  warnings: string[];
  errors: string[];
}
