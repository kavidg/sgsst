import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ComplianceActionEngineService } from '../compliance-action-engine/compliance-action-engine.service';
import { ComplianceEngineService } from '../compliance-engine/compliance-engine.service';
import { AcceptRecommendationDto } from './dto/accept-recommendation.dto';
import { AutomationActionDto, AutomationResultDto } from './dto/automation-result.dto';
import { AutomationStatus } from './enums/automation-status.enum';
import { AutomationResult } from './interfaces/automation-result.interface';
import {
  buildActionsForRecommendation,
  buildAutomationSummary,
  computeGeneratedCounts,
} from './utils/automation-factory';
import {
  isAcceptableRecommendation,
  validateAcceptRequest,
  validateRecommendationState,
} from './utils/automation-validator';

/**
 * Servicio del Compliance Automation Engine.
 *
 * Convierte una recomendación inteligente del Compliance Action Engine en
 * una automatización PREPARADA: solo describe las acciones futuras y cuenta
 * los registros que podrán generarse. No consulta MongoDB más allá de lo que
 * ya hacen los motores, no llama a AnnualWorkPlanService / ObjectiveService /
 * IndicatorService y NO crea registros reales en esta fase.
 */
@Injectable()
export class ComplianceAutomationService {
  constructor(
    private readonly complianceEngineService: ComplianceEngineService,
    private readonly complianceActionEngineService: ComplianceActionEngineService,
  ) {}

  /**
   * Acepta una recomendación y prepara su automatización.
   *
   * @param dto - Datos de aceptación (recommendationId, companyId, acceptedBy, acceptDate).
   */
  async acceptRecommendation(dto: AcceptRecommendationDto): Promise<AutomationResultDto> {
    const requestValidation = validateAcceptRequest(dto);
    if (!requestValidation.valid) {
      throw new BadRequestException(requestValidation.errors);
    }

    // 1 y 2. Consulta el overview y las recomendaciones en paralelo
    // (datos reales; sin recalcular cumplimiento).
    const [, recommendations] = await Promise.all([
      this.complianceEngineService.getOverview(dto.companyId),
      this.complianceActionEngineService.getRecommendations(dto.companyId),
    ]);

    const recommendation = recommendations.find((item) => item.id === dto.recommendationId) ?? null;

    // 3 y 4. Validaciones: existe, no aceptada, pertenece a la empresa
    // (la lista se genera para la empresa indicada, por lo que pertenecer
    // queda garantizado por construcción).
    if (!isAcceptableRecommendation(recommendation)) {
      const errors = validateRecommendationState(recommendation).errors;
      if (recommendation === null) {
        throw new NotFoundException(errors);
      }
      // La recomendación existe pero ya fue aceptada.
      throw new BadRequestException(errors);
    }

    const actions = buildActionsForRecommendation(recommendation);
    const counts = computeGeneratedCounts(recommendation, actions);

    const warnings: string[] = [];
    if (actions.length === 0) {
      warnings.push('No se pudieron preparar acciones automáticas para esta recomendación.');
    }

    const result: AutomationResult = {
      accepted: true,
      automationStatus: AutomationStatus.READY,
      generatedActions: actions,
      generatedActivities: counts.activities,
      generatedObjectives: counts.objectives,
      generatedIndicators: counts.indicators,
      estimatedImpact: recommendation.estimatedImpact,
      estimatedDuration: recommendation.estimatedDurationDays,
      estimatedCost: recommendation.estimatedCost,
      warnings,
      summary: buildAutomationSummary(recommendation, actions),
      createdAutomatically: true,
    };

    return this.toDto(result);
  }

  private toDto(result: AutomationResult): AutomationResultDto {
    const toActionDto = (action: AutomationResult['generatedActions'][number]): AutomationActionDto => ({
      actionId: action.actionId,
      template: action.template,
      title: action.title,
      description: action.description,
      module: action.module,
      affectedPhase: action.affectedPhase,
      responsibleRole: action.responsibleRole,
      estimatedDurationDays: action.estimatedDurationDays,
      executable: action.executable,
    });

    return {
      accepted: result.accepted,
      automationStatus: result.automationStatus,
      generatedActions: result.generatedActions.map(toActionDto),
      generatedActivities: result.generatedActivities,
      generatedObjectives: result.generatedObjectives,
      generatedIndicators: result.generatedIndicators,
      estimatedImpact: result.estimatedImpact,
      estimatedDuration: result.estimatedDuration,
      estimatedCost: result.estimatedCost,
      warnings: result.warnings,
      summary: result.summary,
      createdAutomatically: result.createdAutomatically,
    };
  }
}
