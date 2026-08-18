import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { CompanyAccessGuard } from '../../auth/company-access.guard';
import { Roles } from '../../questions/roles.decorator';
import { RolesGuard } from '../../questions/roles.guard';
import { RequestWithUser } from '../../auth/auth.types';
import { ComplianceActionEngineService } from '../compliance-action-engine.service';
import { ActionRecommendationDto } from '../dto/action-recommendation.dto';

@Controller('compliance-action-engine')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class ComplianceActionEngineController {
  constructor(private readonly complianceActionEngineService: ComplianceActionEngineService) {}

  /**
   * Genera recomendaciones de planes de acción para una empresa.
   *
   * AUDIT-13: Migrado de @Param('companyId') a request.companyId.
   */
  @Get('recommendations')
  @Roles('owner', 'admin', 'manager')
  async getRecommendations(@Req() request: RequestWithUser): Promise<ActionRecommendationDto[]> {
    const companyId = request.companyId?.toString() ?? '';
    return this.complianceActionEngineService.getRecommendations(companyId);
  }
}
