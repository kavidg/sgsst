import { Injectable } from '@nestjs/common';
import { ComplianceEngineService } from '../compliance-engine/compliance-engine.service';
import { ActionRecommendationDto } from './dto/action-recommendation.dto';
import { ActionRecommendation } from './interfaces/action-recommendation.interface';
import { generateActionRecommendations } from './utils/action-generator';

/**
 * Servicio del Intelligent Action Plan Engine.
 *
 * Recibe únicamente el ComplianceOverviewDto del Compliance Engine y genera
 * recomendaciones estructuradas de planes de acción mediante reglas.
 * No consulta MongoDB, no recalcula cumplimiento y no crea actividades reales.
 */
@Injectable()
export class ComplianceActionEngineService {
  constructor(private readonly complianceEngineService: ComplianceEngineService) {}

  /**
   * Genera las recomendaciones de planes de acción de una empresa.
   *
   * @param companyId - Identificador de la empresa.
   */
  async getRecommendations(companyId: string): Promise<ActionRecommendationDto[]> {
    const overview = await this.complianceEngineService.getOverview(companyId);
    const recommendations = generateActionRecommendations(overview);
    return recommendations.map((recommendation) => this.toDto(recommendation));
  }

  private toDto(recommendation: ActionRecommendation): ActionRecommendationDto {
    return {
      id: recommendation.id,
      title: recommendation.title,
      description: recommendation.description,
      priority: recommendation.priority,
      estimatedImpact: recommendation.estimatedImpact,
      estimatedDurationDays: recommendation.estimatedDurationDays,
      recommendedResponsibleRole: recommendation.recommendedResponsibleRole,
      relatedFindingId: recommendation.relatedFindingId,
      relatedModule: recommendation.relatedModule,
      affectedPhase: recommendation.affectedPhase,
      estimatedCost: recommendation.estimatedCost,
      canCreateAnnualPlanActivity: recommendation.canCreateAnnualPlanActivity,
      canCreateObjective: recommendation.canCreateObjective,
      canCreateIndicator: recommendation.canCreateIndicator,
      createdAutomatically: recommendation.createdAutomatically,
      accepted: recommendation.accepted,
      implemented: recommendation.implemented,
      generatedActivityId: recommendation.generatedActivityId,
    };
  }
}
