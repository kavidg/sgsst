import { Types } from 'mongoose';
import { AlertsService } from '../../alerts/alerts.service';
import { AlertSeverity } from '../../alerts/schemas/alert.schema';
import { ActivityPriority } from '../../annual-work-plan/schemas/plan-activity.schema';
import { AnnualWorkPlanService } from '../../annual-work-plan/services/annual-work-plan.service';
import { DocumentType } from '../../document-management/schemas/document-master.schema';
import { DocumentMasterService } from '../../document-management/services/document-master.service';
import { ExecutionError } from '../enums/execution-error.enum';
import { ExecutionStatus } from '../enums/execution-status.enum';
import { ExecutionStep } from '../enums/execution-step.enum';
import { ExecutionContext } from '../interfaces/execution-context.interface';
import { ExecutionTask } from '../interfaces/execution-task.interface';
import { ExecutionPlan } from './execution-planner';
import { buildExecutionSummary } from './execution-summary';

/** Motivo estándar de SKIPPED cuando un servicio no está disponible. */
export const SKIP_REASON_SERVICE_UNAVAILABLE = 'Servicio no disponible';

/**
 * Resultado de la ejecución de un paso.
 */
export interface StepOutcome {
  status: ExecutionStatus.COMPLETED | ExecutionStatus.SKIPPED | ExecutionStatus.FAILED;
  skipReason?: string;
  error?: ExecutionError;
  retryable?: boolean;
}

/**
 * Contrato de un ejecutor de paso (patrón Strategy).
 *
 * Cada tipo de ExecutionStep tiene un ejecutor independiente con una única
 * responsabilidad. Si el servicio requerido no existe o no puede invocarse,
 * el ejecutor retorna SKIPPED con motivo "Servicio no disponible".
 */
export interface StepExecutor {
  execute(task: ExecutionTask, context: ExecutionContext): Promise<StepOutcome>;
}

/** Estadísticas de la ejecución (sin identidad ni duración). */
export interface ExecutionRunStats {
  status: ExecutionStatus;
  completedSteps: number;
  skippedSteps: number;
  failedSteps: number;
  summary: string;
  warnings: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Ejecutores independientes
// ---------------------------------------------------------------------------

/**
 * DOCUMENT → DocumentMasterService.registerDocument.
 * Registra un documento del SG-SST derivado de la acción de automatización.
 */
class DocumentExecutor implements StepExecutor {
  constructor(private readonly documentMasterService: DocumentMasterService) {}

  async execute(task: ExecutionTask, context: ExecutionContext): Promise<StepOutcome> {
    const action = task.action;
    if (!action) {
      return { status: ExecutionStatus.SKIPPED, skipReason: 'Acción de automatización no disponible' };
    }

    const code = `AUTO-${context.automationId}-${task.stepId}`;
    await this.documentMasterService.registerDocument({
      companyId: context.companyId,
      code,
      name: action.title,
      description: action.description,
      documentType: DocumentType.RECORD,
      sourceModule: 'COMPLIANCE_EXECUTION',
    });

    return { status: ExecutionStatus.COMPLETED };
  }
}

/**
 * OBJECTIVE → PhvaAdvancedService no está exportado por su módulo.
 * Sin acceso al servicio, el paso se registra como SKIPPED.
 */
class ObjectiveExecutor implements StepExecutor {
  async execute(_task: ExecutionTask, _context: ExecutionContext): Promise<StepOutcome> {
    return { status: ExecutionStatus.SKIPPED, skipReason: SKIP_REASON_SERVICE_UNAVAILABLE };
  }
}

/**
 * ACTIVITY → AnnualWorkPlanService.createActivityFromModule.
 * Crea una actividad del plan anual desde la acción de automatización.
 */
class ActivityExecutor implements StepExecutor {
  constructor(private readonly annualWorkPlanService: AnnualWorkPlanService) {}

  async execute(task: ExecutionTask, context: ExecutionContext): Promise<StepOutcome> {
    const action = task.action;
    if (!action) {
      return { status: ExecutionStatus.SKIPPED, skipReason: 'Acción de automatización no disponible' };
    }

    if (!context.user) {
      return { status: ExecutionStatus.SKIPPED, skipReason: 'Usuario ejecutor no disponible' };
    }

    const startDate = context.executionDate;
    const endDate = new Date(startDate.getTime() + (action.estimatedDurationDays || 7) * 86_400_000);

    await this.annualWorkPlanService.createActivityFromModule({
      companyId: context.companyId,
      sourceModule: 'COMPLIANCE_EXECUTION',
      externalId: new Types.ObjectId(),
      title: action.title,
      description: action.description,
      startDate,
      endDate,
      responsibleUser: context.user._id,
      priority: ActivityPriority.MEDIUM,
      user: context.user,
    });

    return { status: ExecutionStatus.COMPLETED };
  }
}

/**
 * INDICATOR → no existe un servicio de indicadores en el sistema.
 * Se registra como SKIPPED.
 */
class IndicatorExecutor implements StepExecutor {
  async execute(_task: ExecutionTask, _context: ExecutionContext): Promise<StepOutcome> {
    return { status: ExecutionStatus.SKIPPED, skipReason: SKIP_REASON_SERVICE_UNAVAILABLE };
  }
}

/**
 * TASK → AnnualWorkPlanService.createTaskFromModule requiere una actividad
 * previamente creada; en esta fase no hay referencia de actividad, por lo que
 * el paso se registra como SKIPPED.
 */
class TaskExecutor implements StepExecutor {
  async execute(_task: ExecutionTask, _context: ExecutionContext): Promise<StepOutcome> {
    return { status: ExecutionStatus.SKIPPED, skipReason: 'Requiere una actividad previamente creada' };
  }
}

/**
 * ALERT → AlertsService.createUnique.
 * Notifica la ejecución automática mediante una alerta operativa.
 */
class AlertExecutor implements StepExecutor {
  constructor(private readonly alertsService: AlertsService) {}

  async execute(task: ExecutionTask, context: ExecutionContext): Promise<StepOutcome> {
    await this.alertsService.createUnique({
      companyId: context.companyId,
      type: 'COMPLIANCE_EXECUTION',
      message: task.title,
      severity: AlertSeverity.MEDIUM,
      moduleCode: 'compliance-execution',
      moduleName: 'Compliance Execution Engine',
      submittedBy: context.executedBy,
    });

    return { status: ExecutionStatus.COMPLETED };
  }
}

// ---------------------------------------------------------------------------
// Registro de estrategias
// ---------------------------------------------------------------------------

/** Mapa de ejecutores por tipo de paso (un ejecutor independiente por tipo). */
export interface StepExecutorRegistry {
  [ExecutionStep.DOCUMENT]: StepExecutor;
  [ExecutionStep.OBJECTIVE]: StepExecutor;
  [ExecutionStep.ACTIVITY]: StepExecutor;
  [ExecutionStep.INDICATOR]: StepExecutor;
  [ExecutionStep.TASK]: StepExecutor;
  [ExecutionStep.ALERT]: StepExecutor;
}

/**
 * Construye el registro de ejecutores inyectando los servicios existentes.
 */
export function createStepExecutors(services: {
  annualWorkPlanService: AnnualWorkPlanService;
  alertsService: AlertsService;
  documentMasterService: DocumentMasterService;
}): StepExecutorRegistry {
  return {
    [ExecutionStep.DOCUMENT]: new DocumentExecutor(services.documentMasterService),
    [ExecutionStep.OBJECTIVE]: new ObjectiveExecutor(),
    [ExecutionStep.ACTIVITY]: new ActivityExecutor(services.annualWorkPlanService),
    [ExecutionStep.INDICATOR]: new IndicatorExecutor(),
    [ExecutionStep.TASK]: new TaskExecutor(),
    [ExecutionStep.ALERT]: new AlertExecutor(services.alertsService),
  };
}

/**
 * Ejecuta el ExecutionPlan paso por paso usando el ejecutor correspondiente
 * a cada tipo. No implementa rollback (diseño preparado para el futuro).
 */
export async function executePlan(
  plan: ExecutionPlan,
  context: ExecutionContext,
  executors: StepExecutorRegistry,
): Promise<ExecutionRunStats> {
  const warnings: string[] = [];
  const errors: string[] = [];
  let completedSteps = 0;
  let skippedSteps = 0;
  let failedSteps = 0;

  for (const task of plan.steps) {
    task.status = ExecutionStatus.RUNNING;
    task.startedAt = new Date();

    try {
      const outcome = await executors[task.type].execute(task, context);
      task.status = outcome.status;
      task.skipReason = outcome.skipReason ?? null;
      task.error = outcome.error ?? null;
      task.retryable = outcome.retryable ?? false;

      if (outcome.status === ExecutionStatus.COMPLETED) {
        completedSteps += 1;
      } else if (outcome.status === ExecutionStatus.SKIPPED) {
        skippedSteps += 1;
        warnings.push(`Paso "${task.title}" omitido: ${outcome.skipReason ?? 'sin motivo'}`);
      } else {
        failedSteps += 1;
        errors.push(`Paso "${task.title}" falló: ${outcome.error ?? 'error desconocido'}`);
      }
    } catch (err) {
      task.status = ExecutionStatus.FAILED;
      task.error = ExecutionError.EXECUTION_FAILED;
      task.retryable = true;
      failedSteps += 1;
      errors.push(`Paso "${task.title}" falló: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      task.finishedAt = new Date();
    }
  }

  // PARTIAL si hubo fallos u omisiones; FAILED solo si todo falló.
  const status: ExecutionStatus =
    failedSteps > 0
      ? completedSteps > 0
        ? ExecutionStatus.PARTIAL
        : ExecutionStatus.FAILED
      : skippedSteps > 0
        ? ExecutionStatus.PARTIAL
        : ExecutionStatus.COMPLETED;

  return {
    status,
    completedSteps,
    skippedSteps,
    failedSteps,
    summary: buildExecutionSummary({ completed: completedSteps, skipped: skippedSteps, failed: failedSteps }),
    warnings,
    errors,
  };
}
