import { ActionTemplate } from '../../compliance-action-engine/enums/action-template.enum';
import { ActionRecommendationDto } from '../../compliance-action-engine/dto/action-recommendation.dto';
import { AutomationAction } from '../interfaces/automation-action.interface';

/**
 * Mapeo determinista de módulo fuente (relatedModule del DTO) a plantilla de
 * acción.
 *
 * El ActionRecommendationDto no expone el campo interno `template`; se
 * resuelve desde `relatedModule`, cuyos valores coinciden con FindingSource
 * del Compliance Engine (documents, trainings, risks, incidents,
 * legal-matrix, annual-work-plan, phva).
 */
const MODULE_TO_TEMPLATE = new Map<string, ActionTemplate>([
  ['documents', ActionTemplate.DOCUMENTS_UPDATE],
  ['trainings', ActionTemplate.TRAINING_SCHEDULE],
  ['risks', ActionTemplate.RISK_CONTROLS],
  ['incidents', ActionTemplate.INCIDENT_INVESTIGATION],
  ['legal-matrix', ActionTemplate.LEGAL_UPDATE],
  ['annual-work-plan', ActionTemplate.ANNUAL_PLAN_RESCHEDULE],
  ['phva', ActionTemplate.PHVA_ACTIVITIES],
]);

/** Etiqueta legible por módulo para el resumen generado. */
const MODULE_LABELS = new Map<string, string>([
  ['documents', 'actualizar la documentación del SG-SST'],
  ['trainings', 'fortalecer el programa de capacitación'],
  ['risks', 'actualizar los controles de riesgo'],
  ['incidents', 'gestionar los incidentes abiertos'],
  ['legal-matrix', 'actualizar los requisitos legales'],
  ['annual-work-plan', 'reprogramar las actividades del plan anual'],
  ['phva', 'generar actividades de mejora del ciclo PHVA'],
]);

interface ActionStepDefinition {
  title: string;
  description: string;
}

/**
 * Pasos futuros que describe cada plantilla de acción.
 * Únicamente se describen; no se ejecutan en esta fase.
 */
const TEMPLATE_STEPS: Record<ActionTemplate, ActionStepDefinition[]> = {
  [ActionTemplate.DOCUMENTS_UPDATE]: [
    { title: 'Actualizar documento', description: 'Actualizar el contenido del documento del SG-SST según los hallazgos detectados.' },
    { title: 'Programar revisión', description: 'Programar la revisión del documento por parte del responsable SST.' },
    { title: 'Solicitar aprobación', description: 'Solicitar la aprobación formal del documento actualizado.' },
    { title: 'Registrar versión', description: 'Registrar la nueva versión, su fecha de vigencia y el historial de cambios.' },
  ],
  [ActionTemplate.TRAINING_SCHEDULE]: [
    { title: 'Programar sesión', description: 'Programar la sesión de capacitación pendiente dentro del programa anual.' },
    { title: 'Registrar asistencia', description: 'Registrar la asistencia y evidencias de la capacitación ejecutada.' },
    { title: 'Verificar evaluación', description: 'Aplicar y verificar la evaluación de aprendizaje de los participantes.' },
  ],
  [ActionTemplate.RISK_CONTROLS]: [
    { title: 'Actualizar controles', description: 'Actualizar las medidas de control de los riesgos identificados.' },
    { title: 'Verificar efectividad', description: 'Verificar la efectividad de los controles implementados.' },
  ],
  [ActionTemplate.INCIDENT_INVESTIGATION]: [
    { title: 'Investigar incidente', description: 'Investigar los incidentes abiertos y documentar las causas.' },
    { title: 'Definir plan de acción', description: 'Definir las acciones correctivas y preventivas derivadas de la investigación.' },
    { title: 'Cerrar incidente', description: 'Verificar la ejecución de las acciones y cerrar el incidente.' },
  ],
  [ActionTemplate.LEGAL_UPDATE]: [
    { title: 'Actualizar requisitos', description: 'Actualizar los requisitos legales pendientes de la matriz legal.' },
    { title: 'Solicitar aprobación', description: 'Solicitar la aprobación de los requisitos actualizados.' },
    { title: 'Registrar cumplimiento', description: 'Registrar el estado de cumplimiento de cada requisito legal.' },
  ],
  [ActionTemplate.ANNUAL_PLAN_RESCHEDULE]: [
    { title: 'Reprogramar actividades', description: 'Reprogramar las actividades vencidas o pendientes del plan anual.' },
    { title: 'Notificar responsables', description: 'Notificar a los responsables los nuevos plazos de las actividades.' },
  ],
  [ActionTemplate.PHVA_ACTIVITIES]: [
    { title: 'Definir actividades de mejora', description: 'Definir actividades de mejora para la fase afectada del ciclo PHVA.' },
    { title: 'Asignar responsables', description: 'Asignar responsables y plazos a las actividades definidas.' },
  ],
};

/**
 * Resuelve la plantilla de acción a partir del módulo fuente de la
 * recomendación. Devuelve null si el módulo no es reconocido.
 */
export function resolveTemplate(relatedModule: string): ActionTemplate | null {
  return MODULE_TO_TEMPLATE.get(relatedModule) ?? null;
}

/**
 * Traduce la recomendación aceptada en una lista de acciones futuras.
 *
 * Cada paso de la plantilla se convierte en una AutomationAction con
 * executable=false: solo se describe, nunca se ejecuta.
 */
export function buildActionsForRecommendation(
  recommendation: ActionRecommendationDto,
): AutomationAction[] {
  const template = resolveTemplate(recommendation.relatedModule);

  if (!template) {
    return [];
  }

  const steps = TEMPLATE_STEPS[template];

  return steps.map((step, index) => ({
    actionId: `${recommendation.id}-step-${index + 1}`,
    template,
    title: step.title,
    description: step.description,
    module: recommendation.relatedModule,
    affectedPhase: recommendation.affectedPhase,
    responsibleRole: recommendation.recommendedResponsibleRole,
    estimatedDurationDays: recommendation.estimatedDurationDays,
    executable: false,
  }));
}

/**
 * Calcula los conteos de registros que la recomendación podrá generar.
 *
 * Se apoya en las banderas del Action Engine (canCreateAnnualPlanActivity,
 * canCreateObjective, canCreateIndicator); no crea ningún registro.
 */
export function computeGeneratedCounts(
  recommendation: ActionRecommendationDto,
  actions: AutomationAction[],
): { activities: number; objectives: number; indicators: number } {
  return {
    activities: recommendation.canCreateAnnualPlanActivity ? actions.length : 0,
    objectives: recommendation.canCreateObjective ? 1 : 0,
    indicators: recommendation.canCreateIndicator ? 1 : 0,
  };
}

/**
 * Genera el resumen de la automatización preparada.
 */
export function buildAutomationSummary(
  recommendation: ActionRecommendationDto,
  actions: AutomationAction[],
): string {
  const moduleLabel = MODULE_LABELS.get(recommendation.relatedModule) ?? recommendation.relatedModule;

  if (actions.length === 0) {
    return `La recomendación "${recommendation.title}" fue aceptada, pero no se pudieron preparar acciones automáticas.`;
  }

  return (
    `La recomendación "${recommendation.title}" fue aceptada. Se prepararon ${actions.length} ` +
    `acciones automáticas para ${moduleLabel}. Estas acciones podrán ejecutarse en la siguiente fase.`
  );
}
