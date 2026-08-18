import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { RequestWithUser } from '../auth/auth.types';
import { ComplianceOverviewDto } from './dto/compliance-overview.dto';
import { ComplianceEngineService } from './compliance-engine.service';

@Controller('compliance-engine')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class ComplianceEngineController {
  constructor(private readonly complianceEngineService: ComplianceEngineService) {}

  /**
   * Devuelve el overview de cumplimiento SG-SST de una empresa.
   *
   * AUDIT-13: Migrado de @Param('companyId') a request.companyId.
   */
  @Get('overview')
  @Roles('owner', 'admin', 'manager')
  async getOverview(@Req() request: RequestWithUser): Promise<ComplianceOverviewDto> {
    const companyId = request.companyId?.toString() ?? '';
    return this.complianceEngineService.getOverview(companyId);
  }
}
