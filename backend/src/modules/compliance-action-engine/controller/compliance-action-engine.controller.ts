import { BadRequestException, Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { Roles } from '../../questions/roles.decorator';
import { RolesGuard } from '../../questions/roles.guard';
import { ComplianceActionEngineService } from '../compliance-action-engine.service';
import { ActionRecommendationDto } from '../dto/action-recommendation.dto';

@Controller('compliance-action-engine')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class ComplianceActionEngineController {
  constructor(private readonly complianceActionEngineService: ComplianceActionEngineService) {}

  /**
   * Genera recomendaciones de planes de acción para una empresa.
   *
   * Consulta el ComplianceEngineService, obtiene el ComplianceOverviewDto,
   * ejecuta el ActionGenerator y retorna ActionRecommendationDto[].
   */
  @Get('company/:companyId/recommendations')
  @Roles('owner', 'admin', 'manager')
  async getRecommendations(@Param('companyId') companyId: string): Promise<ActionRecommendationDto[]> {
    if (!Types.ObjectId.isValid(companyId)) {
      throw new BadRequestException('Invalid companyId');
    }

    return this.complianceActionEngineService.getRecommendations(companyId);
  }
}
