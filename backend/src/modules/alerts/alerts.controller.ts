import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { RequestWithUser } from '../auth/auth.types';
import { CreateAlertDto } from './dto/create-alert.dto';
import { AlertsService } from './alerts.service';

@Controller('alerts')
@UseGuards(FirebaseAuthGuard, CompanyAccessGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  // F2 — Sin contexto de empresa se responde con error HTTP claro: NUNCA se
  // propaga '' al service (new ObjectId('') → BSONError).
  @Post()
  create(@Req() request: RequestWithUser, @Body() createAlertDto: CreateAlertDto) {
    const companyId = this.requireCompanyId(request);
    return this.alertsService.create({ ...createAlertDto, companyId });
  }

  @Get()
  findByCompany(
    @Req() request: RequestWithUser,
    @Query('userId') userId?: string,
  ) {
    const companyId = this.requireCompanyId(request);
    if (userId) {
      return this.alertsService.findByCompanyAndUser(companyId, userId);
    }
    return this.alertsService.findByCompany(companyId);
  }

  /** Contexto de empresa obligatorio para endpoints company-bound (F2). */
  private requireCompanyId(request: RequestWithUser): string {
    if (!request.companyId) {
      throw new ForbiddenException('Missing active company context');
    }
    return request.companyId.toString();
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string) {
    return this.alertsService.markAsRead(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.alertsService.remove(id);
  }
}
