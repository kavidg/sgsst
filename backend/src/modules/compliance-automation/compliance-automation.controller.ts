import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { RequestWithUser } from '../auth/auth.types';
import { ComplianceAutomationService } from './compliance-automation.service';
import { AcceptRecommendationDto } from './dto/accept-recommendation.dto';
import { AutomationResultDto } from './dto/automation-result.dto';

@Controller('compliance-automation')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class ComplianceAutomationController {
  constructor(private readonly complianceAutomationService: ComplianceAutomationService) {}

  /**
   * Acepta una recomendación inteligente y prepara su automatización.
   *
   * AUDIT-13: Migrado de @Param('companyId') a request.companyId.
   */
  @Post('accept')
  @Roles('owner', 'admin', 'manager')
  async acceptRecommendation(
    @Req() request: RequestWithUser,
    @Body() body: AcceptRecommendationDto,
  ): Promise<AutomationResultDto> {
    const companyId = request.companyId?.toString() ?? '';
    return this.complianceAutomationService.acceptRecommendation({ ...body, companyId });
  }
}
