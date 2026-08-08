import { ComplianceOverviewDto } from '../../compliance-engine/dto/compliance-overview.dto';
import { FindingPriority } from '../../compliance-engine/enums/finding-priority.enum';
import { CompliancePhaseKey } from '../../compliance-engine/interfaces/compliance-engine.interface';
import { identifyWeakestPhases } from '../../compliance-engine/utils/compliance-calculator';
import { PHASE_LABELS } from '../../compliance-engine/utils/executive-summary';
import { ActionTemplate } from '../enums/action-template.enum';
import { RecommendedRole } from '../enums/recommended-role.enum';
import { ActionRecommendation } from '../interfaces/action-recommendation.interface';
import { calculateEstimatedDurationDays } from './due-date-calculator';
import { calculateEstimatedCost, calculateEstimatedImpact } from './impact-calculator';
import { calculatePriority, calculatePriorityFromCount } from './priority-calculator';

const DOCUMENTS_THRESHOLD = 80;
const TRAININGS_THRESHOLD = 70;
const RISKS_THRESHOLD = 75;
const LEGAL_MATRIX_THRESHOLD = 80;
const ANNUAL_WORK_PLAN_THRESHOLD = 70;
const OPEN_INCIDENTS_THRESHOLD = 3;
const PHASE_THRESHOLD = 80;

/**
 * Genera recomendaciones de planes de acción mediante reglas deterministas.
 *
 * ÚNICA fuente de recomendaciones de acción del Compliance Action Engine.
 * Recibe únicamente el ComplianceOverviewDto: no consulta MongoDB, no
 * recalcula cumplimiento y no depende de otros módulos.
 */
export function generateActionRecommendations(overview: ComplianceOverviewDto): ActionRecommendation[] {
  const recommendations: ActionRecommendation[] = [];
  let sequence = 0;

  const push = (params: {
    title: string;
    description: string;
    priority: FindingPriority;
    template: ActionTemplate;
    relatedModule: string;
    affectedPhase: CompliancePhaseKey | null;
    relatedFindingId: string | null;
    canCreateAnnualPlanActivity: boolean;
    canCreateObjective: boolean;
    canCreateIndicator: boolean;
  }): void => {
    sequence += 1;
    recommendations.push({
      id: `action-${sequence}`,
      title: params.title,
      description: params.description,
      priority: params.priority,
      estimatedImpact: calculateEstimatedImpact(params.template),
      estimatedDurationDays: calculateEstimatedDurationDays(params.template),
      recommendedResponsibleRole: RecommendedRole.SST_RESPONSIBLE,
      relatedFindingId: params.relatedFindingId,
      relatedModule: params.relatedModule,
      affectedPhase: params.affectedPhase,
      estimatedCost: calculateEstimatedCost(params.template),
      canCreateAnnualPlanActivity: params.canCreateAnnualPlanActivity,
      canCreateObjective: params.canCreateObjective,
      canCreateIndicator: params.canCreateIndicator,
      createdAutomatically: true,
      accepted: null,
      implemented: null,
      generatedActivityId: null,
      template: params.template,
    });
  };

  const getModuleCompliance = (module: string): number | undefined =>
    overview.moduleCompliance.find((entry) => entry.module === module)?.compliance;

  const findRelatedFindingId = (module: string): string | null =>
    overview.findings.find((finding) => finding.module === module)?.id ?? null;

  // Regla DOCUMENTOS: cumplimiento documental < 80%.
  const documents = getModuleCompliance('documents');
  if (documents !== undefined && documents < DOCUMENTS_THRESHOLD) {
    push({
      title: 'Actualizar documentos',
      description: `El cumplimiento documental es del ${documents}%, por debajo del umbral recomendado del ${DOCUMENTS_THRESHOLD}%. Actualizar y aprobar los documentos del SG-SST.`,
      priority: calculatePriority(documents),
      template: ActionTemplate.DOCUMENTS_UPDATE,
      relatedModule: 'documents',
      affectedPhase: 'check',
      relatedFindingId: findRelatedFindingId('documents'),
      canCreateAnnualPlanActivity: true,
      canCreateObjective: true,
      canCreateIndicator: false,
    });
  }

  // Regla CAPACITACIONES: capacitación < 70%.
  const trainings = getModuleCompliance('trainings');
  if (trainings !== undefined && trainings < TRAININGS_THRESHOLD) {
    push({
      title: 'Programar capacitación',
      description: `El cumplimiento del programa de capacitación es del ${trainings}%, por debajo del umbral recomendado del ${TRAININGS_THRESHOLD}%. Programar las capacitaciones pendientes.`,
      priority: calculatePriority(trainings),
      template: ActionTemplate.TRAINING_SCHEDULE,
      relatedModule: 'trainings',
      affectedPhase: 'do',
      relatedFindingId: findRelatedFindingId('trainings'),
      canCreateAnnualPlanActivity: true,
      canCreateObjective: true,
      canCreateIndicator: true,
    });
  }

  // Regla RIESGOS: gestión del riesgo < 75%.
  const risks = getModuleCompliance('risks');
  if (risks !== undefined && risks < RISKS_THRESHOLD) {
    push({
      title: 'Actualizar controles',
      description: `La gestión del riesgo tiene un cumplimiento del ${risks}%, por debajo del umbral recomendado del ${RISKS_THRESHOLD}%. Actualizar los controles de los riesgos identificados.`,
      priority: calculatePriority(risks),
      template: ActionTemplate.RISK_CONTROLS,
      relatedModule: 'risks',
      affectedPhase: 'do',
      relatedFindingId: findRelatedFindingId('risks'),
      canCreateAnnualPlanActivity: true,
      canCreateObjective: true,
      canCreateIndicator: true,
    });
  }

  // Regla INCIDENTES: incidentes abiertos superiores al umbral.
  const openIncidents = overview.findings.filter((finding) => finding.module === 'incidents').length;
  if (openIncidents > OPEN_INCIDENTS_THRESHOLD) {
    push({
      title: 'Investigar incidente',
      description: `Existen ${openIncidents} incidentes abiertos, por encima del umbral de ${OPEN_INCIDENTS_THRESHOLD}. Investigar y cerrar los incidentes pendientes.`,
      priority: calculatePriorityFromCount(openIncidents),
      template: ActionTemplate.INCIDENT_INVESTIGATION,
      relatedModule: 'incidents',
      affectedPhase: 'do',
      relatedFindingId: findRelatedFindingId('incidents'),
      canCreateAnnualPlanActivity: true,
      canCreateObjective: false,
      canCreateIndicator: false,
    });
  }

  // Regla MATRIZ LEGAL: cumplimiento legal < 80%.
  const legalMatrix = getModuleCompliance('legal-matrix');
  if (legalMatrix !== undefined && legalMatrix < LEGAL_MATRIX_THRESHOLD) {
    push({
      title: 'Actualizar requisitos legales',
      description: `El cumplimiento de la matriz legal es del ${legalMatrix}%, por debajo del umbral recomendado del ${LEGAL_MATRIX_THRESHOLD}%. Actualizar los requisitos legales pendientes.`,
      priority: calculatePriority(legalMatrix),
      template: ActionTemplate.LEGAL_UPDATE,
      relatedModule: 'legal-matrix',
      affectedPhase: 'act',
      relatedFindingId: findRelatedFindingId('legal-matrix'),
      canCreateAnnualPlanActivity: true,
      canCreateObjective: true,
      canCreateIndicator: false,
    });
  }

  // Regla PLAN ANUAL: ejecución del plan < 70%.
  const annualWorkPlan = getModuleCompliance('annual-work-plan');
  if (annualWorkPlan !== undefined && annualWorkPlan < ANNUAL_WORK_PLAN_THRESHOLD) {
    push({
      title: 'Reprogramar actividades',
      description: `La ejecución del plan anual es del ${annualWorkPlan}%, por debajo del umbral recomendado del ${ANNUAL_WORK_PLAN_THRESHOLD}%. Reprogramar las actividades vencidas o pendientes.`,
      priority: calculatePriority(annualWorkPlan),
      template: ActionTemplate.ANNUAL_PLAN_RESCHEDULE,
      relatedModule: 'annual-work-plan',
      affectedPhase: 'act',
      relatedFindingId: findRelatedFindingId('annual-work-plan'),
      canCreateAnnualPlanActivity: true,
      canCreateObjective: true,
      canCreateIndicator: false,
    });
  }

  // Regla PHVA: generar actividades según las fases afectadas.
  const weakPhases = identifyWeakestPhases(overview.phaseCompliance, PHASE_THRESHOLD);
  for (const phase of weakPhases) {
    const phaseCompliance = overview.phaseCompliance[phase];
    push({
      title: `Generar actividades para la fase ${PHASE_LABELS[phase]}`,
      description: `La fase ${PHASE_LABELS[phase]} tiene un cumplimiento del ${phaseCompliance}%, por debajo del umbral recomendado del ${PHASE_THRESHOLD}%. Definir actividades de mejora para la fase.`,
      priority: calculatePriority(phaseCompliance),
      template: ActionTemplate.PHVA_ACTIVITIES,
      relatedModule: 'phva',
      affectedPhase: phase,
      relatedFindingId: findRelatedFindingId('phva'),
      canCreateAnnualPlanActivity: true,
      canCreateObjective: true,
      canCreateIndicator: true,
    });
  }

  return recommendations;
}
