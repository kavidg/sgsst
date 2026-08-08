import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { ComplianceTimelineService } from './compliance-timeline.service';
import { ComplianceSnapshotDto } from './dto/compliance-snapshot.dto';
import { MonthlyTrendPointDto } from './dto/monthly-trend.dto';

@Controller('compliance-timeline')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class ComplianceTimelineController {
  constructor(private readonly complianceTimelineService: ComplianceTimelineService) {}

  /**
   * Devuelve todos los snapshots de cumplimiento de una empresa.
   */
  @Get('company/:companyId')
  @Roles('owner', 'admin', 'manager')
  async getTimeline(@Param('companyId') companyId: string): Promise<ComplianceSnapshotDto[]> {
    this.assertValidCompanyId(companyId);
    return this.complianceTimelineService.getTimeline(companyId);
  }

  /**
   * Devuelve el snapshot de cumplimiento más reciente de una empresa.
   */
  @Get('company/:companyId/latest')
  @Roles('owner', 'admin', 'manager')
  async getLatest(@Param('companyId') companyId: string): Promise<ComplianceSnapshotDto | null> {
    this.assertValidCompanyId(companyId);
    return this.complianceTimelineService.getLatest(companyId);
  }

  /**
   * Devuelve la tendencia mensual de cumplimiento de una empresa.
   */
  @Get('company/:companyId/trend')
  @Roles('owner', 'admin', 'manager')
  async getMonthlyTrend(
    @Param('companyId') companyId: string,
  ): Promise<MonthlyTrendPointDto[]> {
    this.assertValidCompanyId(companyId);
    return this.complianceTimelineService.getMonthlyTrend(companyId);
  }

  /**
   * Crea (o actualiza) el snapshot de cumplimiento del día para una empresa.
   */
  @Post('company/:companyId/snapshot')
  @Roles('owner', 'admin', 'manager')
  async createSnapshot(@Param('companyId') companyId: string): Promise<ComplianceSnapshotDto> {
    this.assertValidCompanyId(companyId);
    return this.complianceTimelineService.createSnapshot(companyId);
  }

  private assertValidCompanyId(companyId: string): void {
    if (!Types.ObjectId.isValid(companyId)) {
      throw new BadRequestException('Invalid companyId');
    }
  }
}
