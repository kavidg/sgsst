import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { RequestWithUser } from '../auth/auth.types';
import { CreateAlertDto } from './dto/create-alert.dto';
import { AlertsService } from './alerts.service';

@Controller('alerts')
@UseGuards(FirebaseAuthGuard, CompanyAccessGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post()
  create(@Req() request: RequestWithUser, @Body() createAlertDto: CreateAlertDto) {
    const companyId = request.companyId?.toString() ?? '';
    return this.alertsService.create({ ...createAlertDto, companyId });
  }

  @Get()
  findByCompany(
    @Req() request: RequestWithUser,
    @Query('userId') userId?: string,
  ) {
    const companyId = request.companyId?.toString() ?? '';
    if (userId) {
      return this.alertsService.findByCompanyAndUser(companyId, userId);
    }
    return this.alertsService.findByCompany(companyId);
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
