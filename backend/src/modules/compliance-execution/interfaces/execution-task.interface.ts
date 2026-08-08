import { AutomationActionDto } from '../../compliance-automation/dto/automation-result.dto';
import { ExecutionError } from '../enums/execution-error.enum';
import { ExecutionStatus } from '../enums/execution-status.enum';
import { ExecutionStep } from '../enums/execution-step.enum';

/**
 * Paso de un ExecutionPlan.
 *
 * Cada paso describe una acción atómica del plan (crear actividad, registrar
 * documento, notificar alerta, etc.). `action` conserva la AutomationActionDto
 * que lo originó cuando el paso deriva de una acción de automatización.
 */
export interface ExecutionTask {
  stepId: string;
  type: ExecutionStep;
  title: string;
  status: ExecutionStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  error: ExecutionError | null;
  /** Indica si el paso puede reintentarse en caso de fallo. */
  retryable: boolean;
  /** Motivo del SKIPPED (por ejemplo, "Servicio no disponible"). */
  skipReason: string | null;
  /** Acción de automatización origen (null para pasos agregados). */
  action: AutomationActionDto | null;
}
