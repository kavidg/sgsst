import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CreateAlertDto } from './dto/create-alert.dto';
import { AlertsService } from './alerts.service';

@Controller('alerts')
@UseGuards(FirebaseAuthGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post()
  create(@Body() createAlertDto: CreateAlertDto) {
    return this.alertsService.create(createAlertDto);
  }

  @Get('company/:companyId')
  findByCompany(
    @Param('companyId') companyId: string,
    @Query('userId') userId?: string,
  ) {
    // If userId is provided, filter alerts by targetUserId (show only alerts targeted to that user)
    // Otherwise return all alerts for the company
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
