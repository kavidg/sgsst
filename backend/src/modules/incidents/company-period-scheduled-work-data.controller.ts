import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { RolesGuard } from '../questions/roles.guard';
import { Roles } from '../questions/roles.decorator';
import { RequestWithUser } from '../auth/auth.types';
import { UpsertScheduledWorkDataDto } from './dto/upsert-scheduled-work-data.dto';
import { CompanyPeriodScheduledWorkDataService } from './company-period-scheduled-work-data.service';

/**
 * Endpoints administrativos del denominador mensual de 3.3.6 (FASE 35E-2).
 *
 * Seguridad (§26):
 * - companyId SIEMPRE server-side: se deriva de request.companyId resuelto por
 *   CompanyAccessGuard (FirebaseAuthGuard + membership CompanyUser). El
 *   companyId del payload NUNCA es autoridad: si llega y no coincide con el
 *   tenant resuelto, se rechaza (evita escritura cross-tenant Company B).
 * - WRITE: owner/admin (rol administrativo). MEMBER/manager sin acceso de
 *   escritura al denominador. READ: owner/admin/manager.
 */
@Controller('scheduled-work-data')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class CompanyPeriodScheduledWorkDataController {
  constructor(
    private readonly scheduledWorkDataService: CompanyPeriodScheduledWorkDataService,
  ) {}

  @Post()
  @Roles('owner', 'admin')
  async upsert(@Req() request: RequestWithUser, @Body() dto: UpsertScheduledWorkDataDto) {
    const companyId = this.resolveTenant(request);
    if (dto.companyId && dto.companyId !== companyId) {
      throw new ForbiddenException('companyId del payload no coincide con el tenant del usuario autenticado');
    }
    const actorUserId = request.user?._id && Types.ObjectId.isValid(request.user._id)
      ? new Types.ObjectId(request.user._id)
      : undefined;
    return this.scheduledWorkDataService.upsert(
      new Types.ObjectId(companyId),
      dto.period,
      dto.scheduledWorkDays,
      actorUserId,
    );
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  findAll(@Req() request: RequestWithUser) {
    const companyId = this.resolveTenant(request);
    return this.scheduledWorkDataService.findAll(new Types.ObjectId(companyId));
  }

  @Get('period/:period')
  @Roles('owner', 'admin', 'manager')
  findByPeriod(@Req() request: RequestWithUser, @Param('period') period: string) {
    const companyId = this.resolveTenant(request);
    return this.scheduledWorkDataService.findByPeriod(new Types.ObjectId(companyId), period);
  }

  @Delete('period/:period')
  @Roles('owner', 'admin')
  remove(@Req() request: RequestWithUser, @Param('period') period: string) {
    const companyId = this.resolveTenant(request);
    return this.scheduledWorkDataService.remove(new Types.ObjectId(companyId), period);
  }

  /** Tenant resuelto server-side (única autoridad de companyId). */
  private resolveTenant(request: RequestWithUser): string {
    const companyId = request.companyId?.toString() ?? '';
    if (!companyId) {
      throw new ForbiddenException('Tenant no resuelto para el usuario autenticado');
    }
    return companyId;
  }
}
