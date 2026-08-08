import { BadRequestException, Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { ComplianceOverviewDto } from './dto/compliance-overview.dto';
import { ComplianceEngineService } from './compliance-engine.service';

@Controller('compliance-engine')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class ComplianceEngineController {
  constructor(private readonly complianceEngineService: ComplianceEngineService) {}

  /**
   * Devuelve el overview de cumplimiento SG-SST de una empresa.
   *
   * ESTADO ACTUAL: respuesta MOCK con la estructura definitiva. No consulta
   * MongoDB ni otros módulos todavía.
   */
  @Get('company/:companyId/overview')
  @Roles('owner', 'admin', 'manager')
  async getOverview(@Param('companyId') companyId: string): Promise<ComplianceOverviewDto> {
    if (!Types.ObjectId.isValid(companyId)) {
      throw new BadRequestException('Invalid companyId');
    }

    return this.complianceEngineService.getOverview(companyId);
  }
}
