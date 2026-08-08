import { BadRequestException, Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { ComplianceAutomationService } from './compliance-automation.service';
import { AcceptRecommendationDto } from './dto/accept-recommendation.dto';
import { AutomationResultDto } from './dto/automation-result.dto';

@Controller('compliance-automation')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class ComplianceAutomationController {
  constructor(private readonly complianceAutomationService: ComplianceAutomationService) {}

  /**
   * Acepta una recomendación inteligente y prepara su automatización.
   *
   * Flujo: consulta ComplianceEngineService.getOverview() y
   * ComplianceActionEngineService.getRecommendations(), localiza la
   * recomendación indicada, la valida y construye el AutomationResult
   * (sin crear actividades, objetivos ni indicadores reales).
   */
  @Post('company/:companyId/accept')
  @Roles('owner', 'admin', 'manager')
  async acceptRecommendation(
    @Param('companyId') companyId: string,
    @Body() body: AcceptRecommendationDto,
  ): Promise<AutomationResultDto> {
    if (!Types.ObjectId.isValid(companyId)) {
      throw new BadRequestException('Invalid companyId');
    }

    // El companyId del path es la fuente autoritativa; se fusiona con el body.
    return this.complianceAutomationService.acceptRecommendation({ ...body, companyId });
  }
}
