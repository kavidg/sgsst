import { classifyImplementationLevel } from '../implementation-validator/implementation-calculator';
import { calculateStepImpact } from '../implementation-validator/implementation-impact';
import { getImplementationWeights } from '../implementation-validator/implementation-weights';
import { ImplementationWizardDoc } from './schemas/implementation-wizard.schema';
import { WizardOverviewDto, WizardOverviewStepDto } from './dto/wizard-overview.dto';
import { STEP_LABELS, STEP_MODULE_ROUTES } from './implementation-wizard.constants';

/** Tiempo mínimo entre ejecuciones de la auto-validación (5 minutos). */
export const AUTO_VALIDATION_TTL_MS = 5 * 60 * 1000;

/**
 * Indica si debe ejecutarse una nueva auto-validación real.
 *
 * Devuelve true cuando nunca se ha validado o la última ejecución supera
 * el TTL de 5 minutos. Evita exceso de procesamiento en lecturas repetidas.
 */
export function shouldRunAutoValidation(lastAutoValidationAt?: string | null): boolean {
  if (!lastAutoValidationAt) return true;
  const last = new Date(lastAutoValidationAt).getTime();
  if (Number.isNaN(last)) return true;
  return Date.now() - last > AUTO_VALIDATION_TTL_MS;
}

/**
 * Construye el DTO del overview del Centro de Implementación a partir del
 * wizard persistido (cuyos pasos ya fueron actualizados por el motor real).
 *
 * No devuelve schemas Mongo: transforma cada paso a WizardOverviewStepDto.
 */
export function buildWizardOverview(wizard: ImplementationWizardDoc): WizardOverviewDto {
  // Pesos de una sola vez (no copiar el mapa por cada uno de los 14 pasos).
  const weights = getImplementationWeights();

  const steps: WizardOverviewStepDto[] = wizard.steps.map((step) => ({
    stepId: step.stepId,
    title: STEP_LABELS[step.stepId] ?? step.stepId,
    moduleRoute: STEP_MODULE_ROUTES[step.stepId] ?? '',
    percentage: step.score ?? 0,
    status: step.status,
    completed: step.status === 'COMPLETED',
    criteria: step.criteria ?? [],
    pendingCriteria: step.pendingCriteria ?? [],
    // Impacto estimado: porcentaje ponderado recuperable de completar el paso
    // (peso × porcentaje restante). null cuando el paso está al 100% o su
    // aporte restante es despreciable. Nota: un paso COMPLETED (>=80%) aún
    // puede emitir impacto pequeño, p. ej. sst_policy al 85% → "+2%".
    estimatedImpact: calculateStepImpact(step.stepId, step.score ?? 0, weights),
  }));

  const completedSteps = steps.filter((s) => s.completed).length;

  return {
    overallPercentage: wizard.completionPercentage,
    overallScore: wizard.overallScore,
    level: classifyImplementationLevel(wizard.completionPercentage),
    completedSteps,
    totalSteps: steps.length,
    isImplementationComplete: wizard.isImplementationComplete,
    lastValidatedAt: wizard.lastAutoValidationAt ?? null,
    steps,
  };
}
