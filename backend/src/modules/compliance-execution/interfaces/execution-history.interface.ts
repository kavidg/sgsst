import { Types } from 'mongoose';
import { ExecutionStatus } from '../enums/execution-status.enum';
import { ExecutionTask } from './execution-task.interface';

/**
 * Entrada de historial que se persiste en la colección ExecutionHistory.
 *
 * El historial guarda únicamente la trazabilidad de la ejecución; nunca el
 * AutomationResult completo ni modificaciones a recomendaciones o cumplimiento.
 */
export interface ExecutionHistoryEntry {
  companyId: Types.ObjectId;
  automationId: string;
  executedBy: string;
  startedAt: Date;
  finishedAt: Date;
  status: ExecutionStatus;
  steps: ExecutionTask[];
  summary: string;
  duration: number;
  errors: string[];
  createdAutomatically: boolean;
}
