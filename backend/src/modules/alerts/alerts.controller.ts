import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
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
  findByCompany(@Param('companyId') companyId: string) {
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
