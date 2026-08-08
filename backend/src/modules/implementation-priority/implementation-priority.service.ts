import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { classifyImplementationLevel } from '../implementation-validator/implementation-calculator';
import { getImplementationWeights } from '../implementation-validator/implementation-weights';
import { ALL_STEPS } from '../implementation-wizard/implementation-wizard.constants';
import { WizardOverviewDto } from '../implementation-wizard/dto/wizard-overview.dto';
import { ImplementationWizardService } from '../implementation-wizard/implementation-wizard.service';
import {
  DEFAULT_PRIORITY_SCORE_WEIGHTS,
  STEP_PRIORITY_CONFIG,
} from './constants/step-priority.config';
import { PriorityItemDto } from './dto/priority-item.dto';
import { PriorityOverviewDto } from './dto/priority-overview.dto';
import {
  PriorityCriticality,
  PriorityRiskLevel,
} from './interfaces/priority-config.interface';
import { PriorityInput } from './interfaces/priority-input.interface';
import { buildDependencyGraph } from './utils/dependency-graph';
import { computeImpactMetrics } from './utils/impact-metrics';
import { buildPriorityOverview } from './utils/priority-dto.builder';
import { computePriorityScore } from './utils/priority-score';

/** Número máximo de prioridades devueltas (top N). */
const PRIORITY_TOP_N = 5;

/** Normalización de la criticidad normativa para la fórmula PS(s). */
const CRITICALITY_NORM: Record<PriorityCriticality, number> = {
  ALTA: 1,
  MEDIA: 0.5,
  BAJA: 0.25,
};

/**
 * Deriva el nivel de riesgo del paso a partir de la criticidad y el avance.
 *
 * - >= 80%              → BAJO
 * - >= 40%              → MEDIO
 * - < 40% y crítica alta → ALTO
 * - < 40% y resto       → MEDIO
 */
function deriveRiskLevel(criticality: PriorityCriticality, percentage: number): PriorityRiskLevel {
  if (percentage >= 80) return 'BAJO';
  if (percentage >= 40) return 'MEDIO';
  return criticality === 'ALTA' ? 'ALTO' : 'MEDIO';
}

/** Mapea el overview del wizard (DTO) a la vista normalizada del motor. */
function toPriorityInput(overview: WizardOverviewDto, companyId: string): PriorityInput {
  return {
    companyId,
    overallPercentage: overview.overallPercentage,
    overallScore: overview.overallScore,
    level: overview.level,
    completedSteps: overview.completedSteps,
    totalSteps: overview.totalSteps,
    lastValidatedAt: overview.lastValidatedAt,
    steps: overview.steps.map((step) => ({
      stepId: step.stepId,
      title: step.title,
      moduleRoute: step.moduleRoute,
      percentage: step.percentage,
      status: step.status,
      criteria: step.criteria,
      pendingCriteria: step.pendingCriteria,
      estimatedImpact: step.estimatedImpact,
    })),
  };
}

/**
 * Calcula las prioridades deterministas a partir del input normalizado.
 *
 * Solo los pasos incompletos (status !== COMPLETED y percentage < 100) entran
 * al ranking. El grafo de dependencias (FASE 3) activa Û(s) y B(s) en la
 * fórmula PS(s): los pasos con prerrequisitos incompletos se penalizan y
 * los que desbloquean más dependientes se priorizan.
 */
function computePriorityItems(input: PriorityInput): PriorityItemDto[] {
  const stepWeights = getImplementationWeights();
  const graph = buildDependencyGraph(input.steps, STEP_PRIORITY_CONFIG);
  const items: PriorityItemDto[] = [];

  for (const step of input.steps) {
    if (step.status === 'COMPLETED' || step.percentage >= 100) continue;

    // Lectura defensiva: si un StepId futuro no tiene config, se omite.
    const config = STEP_PRIORITY_CONFIG[step.stepId];
    if (!config) continue;

    const resolution = graph[step.stepId] ?? {
      blockedBy: [],
      unlocks: [],
      ready: true,
      unlockPotential: 0,
    };

    const metrics = computeImpactMetrics(step.stepId, step.percentage, stepWeights);
    const impactNorm = (100 - step.percentage) / 100;

    const priorityScore = computePriorityScore({
      impact: impactNorm,
      criticality: CRITICALITY_NORM[config.criticality],
      unlockPotential: resolution.unlockPotential,
      blocked: !resolution.ready,
      weights: DEFAULT_PRIORITY_SCORE_WEIGHTS,
    });

    items.push({
      stepId: step.stepId,
      title: step.title,
      moduleRoute: step.moduleRoute,
      status: step.status,
      percentage: step.percentage,
      priorityScore,
      rank: 0,
      estimatedImpact: metrics.estimatedImpact,
      impactPoints: metrics.impactPoints,
      criticality: config.criticality,
      riskLevel: deriveRiskLevel(config.criticality, step.percentage),
      blockedBy: resolution.blockedBy,
      unlocks: resolution.unlocks,
      ready: resolution.ready,
      unlockPotential: resolution.unlockPotential,
      pendingCriteria: step.pendingCriteria,
      recommendedAction: step.pendingCriteria?.[0] ?? config.actionTemplate,
      estimatedEffort: config.estimatedEffort,
    });
  }

  // Orden desc por priorityScore; desempate por impacto recuperable.
  items.sort((a, b) => b.priorityScore - a.priorityScore || b.impactPoints - a.impactPoints);
  items.forEach((item, index) => {
    item.rank = index + 1;
  });

  return items.slice(0, PRIORITY_TOP_N);
}

/**
 * ImplementationPriorityEngine — orquestador del motor de prioridades.
 *
 * Módulo de SOLO LECTURA: no modifica datos, no ejecuta providers y no escribe
 * en Mongo. Consume el overview ya validado del ImplementationWizardService
 * (TTL de 5 minutos) y calcula prioridades deterministas con la fórmula PS(s).
 */
@Injectable()
export class ImplementationPriorityService {
  constructor(
    private readonly wizardService: ImplementationWizardService,
  ) {}

  /**
   * Devuelve las prioridades dinámicas del Centro de Implementación.
   *
   * Tolerante: si el overview del wizard falla (no debería, ya es tolerante),
   * devuelve un DTO vacío preparado sin romper el endpoint.
   */
  async getPriorities(companyId: string): Promise<PriorityOverviewDto> {
    try {
      const overview = await this.wizardService.getOverview(new Types.ObjectId(companyId));
      const input = toPriorityInput(overview, companyId);
      return buildPriorityOverview(input, computePriorityItems(input));
    } catch {
      return buildPriorityOverview(
        {
          companyId,
          overallPercentage: 0,
          overallScore: 0,
          level: classifyImplementationLevel(0),
          completedSteps: 0,
          totalSteps: ALL_STEPS.length,
          steps: [],
        },
        [],
      );
    }
  }
}
