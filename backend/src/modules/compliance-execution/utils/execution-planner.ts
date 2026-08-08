import { AutomationActionDto, AutomationResultDto } from '../../compliance-automation/dto/automation-result.dto';
import { ExecutionStatus } from '../enums/execution-status.enum';
import { ExecutionStep } from '../enums/execution-step.enum';
import { ExecutionTask } from '../interfaces/execution-task.interface';

/**
 * Plan de ejecución construido a partir de un AutomationResult READY.
 */
export interface ExecutionPlan {
  steps: ExecutionTask[];
  /** Dependencias entre pasos: { from: stepId, to: stepId } (from depende de to). */
  dependencies: Array<{ from: string; to: string }>;
  estimatedDuration: number;
  estimatedImpact: number;
  estimatedCost: number;
  summary: string;
}

/** Mapeo de módulo fuente del SG-SST al tipo de paso de ejecución. */
const MODULE_TO_STEP: Partial<Record<string, ExecutionStep>> = {
  documents: ExecutionStep.DOCUMENT,
  trainings: ExecutionStep.ACTIVITY,
  risks: ExecutionStep.ACTIVITY,
  incidents: ExecutionStep.ACTIVITY,
  'legal-matrix': ExecutionStep.ACTIVITY,
  'annual-work-plan': ExecutionStep.ACTIVITY,
  phva: ExecutionStep.ACTIVITY,
  alerts: ExecutionStep.ALERT,
};

function resolveStepType(module: string): ExecutionStep {
  return MODULE_TO_STEP[module] ?? ExecutionStep.ACTIVITY;
}

function createTask(
  stepId: string,
  type: ExecutionStep,
  title: string,
  action: AutomationActionDto | null,
): ExecutionTask {
  return {
    stepId,
    type,
    title,
    status: ExecutionStatus.PENDING,
    startedAt: null,
    finishedAt: null,
    error: null,
    retryable: false,
    skipReason: null,
    action,
  };
}

/**
 * Construye el ExecutionPlan a partir del AutomationResult.
 *
 * Una tarea por cada acción generada, más pasos agregados por los conteos del
 * resultado (objetivos, indicadores) y un paso final de notificación por
 * alerta. No recalcula cumplimiento ni crea registros.
 */
export function buildExecutionPlan(automationResult: AutomationResultDto): ExecutionPlan {
  const steps: ExecutionTask[] = automationResult.generatedActions.map((action, index) =>
    createTask(`step-${index + 1}`, resolveStepType(action.module), action.title, action),
  );

  let stepIndex = steps.length;

  if (automationResult.generatedObjectives > 0) {
    stepIndex += 1;
    steps.push(createTask(`step-${stepIndex}`, ExecutionStep.OBJECTIVE, 'Crear objetivo SST', null));
  }

  if (automationResult.generatedIndicators > 0) {
    stepIndex += 1;
    steps.push(createTask(`step-${stepIndex}`, ExecutionStep.INDICATOR, 'Crear indicador de gestión', null));
  }

  // Paso final de notificación: alerta de ejecución automática.
  stepIndex += 1;
  steps.push(createTask(`step-${stepIndex}`, ExecutionStep.ALERT, 'Notificar ejecución automática', null));

  const dependencies = buildDependencies(steps);

  return {
    steps,
    dependencies,
    estimatedDuration: automationResult.estimatedDuration,
    estimatedImpact: automationResult.estimatedImpact,
    estimatedCost: automationResult.estimatedCost,
    summary: automationResult.summary,
  };
}

/**
 * Deriva dependencias simples entre pasos:
 * - El indicador depende del objetivo (si existe).
 * - El paso de alerta depende de todos los demás (se ejecuta al final).
 */
function buildDependencies(steps: ExecutionTask[]): Array<{ from: string; to: string }> {
  const dependencies: Array<{ from: string; to: string }> = [];

  const objectiveStep = steps.find((step) => step.type === ExecutionStep.OBJECTIVE);
  const indicatorStep = steps.find((step) => step.type === ExecutionStep.INDICATOR);
  const alertStep = steps.find((step) => step.type === ExecutionStep.ALERT);

  if (objectiveStep && indicatorStep) {
    dependencies.push({ from: indicatorStep.stepId, to: objectiveStep.stepId });
  }

  if (alertStep) {
    for (const step of steps) {
      if (step.stepId !== alertStep.stepId) {
        dependencies.push({ from: alertStep.stepId, to: step.stepId });
      }
    }
  }

  return dependencies;
}
