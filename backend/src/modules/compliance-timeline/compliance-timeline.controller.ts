import {
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { RequestWithUser } from '../auth/auth.types';
import { ComplianceTimelineService } from './compliance-timeline.service';
import { ComplianceSnapshotDto } from './dto/compliance-snapshot.dto';
import { MonthlyTrendPointDto } from './dto/monthly-trend.dto';

@Controller('compliance-timeline')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class ComplianceTimelineController {
  constructor(private readonly complianceTimelineService: ComplianceTimelineService) {}

  private getCompanyId(request: RequestWithUser): string {
    return request.companyId?.toString() ?? '';
  }

  /**
   * Devuelve todos los snapshots de cumplimiento de una empresa.
   */
  @Get()
  @Roles('owner', 'admin', 'manager')
  async getTimeline(@Req() request: RequestWithUser): Promise<ComplianceSnapshotDto[]> {
    return this.complianceTimelineService.getTimeline(this.getCompanyId(request));
  }

  /**
   * Devuelve el snapshot de cumplimiento más reciente de una empresa.
   */
  @Get('latest')
  @Roles('owner', 'admin', 'manager')
  async getLatest(@Req() request: RequestWithUser): Promise<ComplianceSnapshotDto | null> {
    return this.complianceTimelineService.getLatest(this.getCompanyId(request));
  }

  /**
   * Devuelve la tendencia mensual de cumplimiento de una empresa.
   */
  @Get('trend')
  @Roles('owner', 'admin', 'manager')
  async getMonthlyTrend(
    @Req() request: RequestWithUser,
  ): Promise<MonthlyTrendPointDto[]> {
    return this.complianceTimelineService.getMonthlyTrend(this.getCompanyId(request));
  }

  /**
   * Crea (o actualiza) el snapshot de cumplimiento del día para una empresa.
   */
  @Post('snapshot')
  @Roles('owner', 'admin', 'manager')
  async createSnapshot(@Req() request: RequestWithUser): Promise<ComplianceSnapshotDto> {
    return this.complianceTimelineService.createSnapshot(this.getCompanyId(request));
  }
}
