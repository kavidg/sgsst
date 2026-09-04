import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { UsersService } from '../users/users.service';
import { CreateIndicatorDto } from './dto/create-indicator.dto';
import { UpdateIndicatorDto } from './dto/update-indicator.dto';
import { CreateMeasurementDto } from './dto/create-measurement.dto';
import { CreatePeriodDto } from './dto/create-period.dto';
import { IndicatorsService } from './indicators.service';

@Controller('indicators')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class IndicatorsController {
  constructor(
    private readonly indicatorsService: IndicatorsService,
    private readonly usersService: UsersService,
  ) {}

  // ==================== DASHBOARD (PERIOD-BASED) ====================

  @Get('dashboard/:period')
  @Roles('owner', 'admin', 'manager', 'member')
  async getDashboard(
    @Req() request: RequestWithUser,
    @Param('period') period: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.indicatorsService.getDashboard(companyId, period);
  }

  @Get('dashboard/:period/:indicatorCode')
  @Roles('owner', 'admin', 'manager', 'member')
  async getIndicatorDetail(
    @Req() request: RequestWithUser,
    @Param('period') period: string,
    @Param('indicatorCode') indicatorCode: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.indicatorsService.getIndicatorDetail(companyId, period, indicatorCode);
  }

  // ==================== DEFINITIONS ====================

  @Post()
  @Roles('owner', 'admin')
  async createDefinition(
    @Req() request: RequestWithUser,
    @Body() dto: CreateIndicatorDto,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.indicatorsService.createDefinition(companyId, dto);
  }

  @Get()
  @Roles('owner', 'admin', 'manager', 'member')
  async findAllDefinitions(@Req() request: RequestWithUser) {
    const companyId = await this.resolveCompanyId(request);
    return this.indicatorsService.findAllDefinitions(companyId);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager', 'member')
  async findDefinition(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.indicatorsService.findDefinitionById(companyId, id);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  async updateDefinition(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateIndicatorDto,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.indicatorsService.updateDefinition(companyId, id, dto);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  async softDeleteDefinition(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.indicatorsService.softDeleteDefinition(companyId, id);
  }

  // ==================== MEASUREMENTS ====================

  @Get(':id/measurements')
  @Roles('owner', 'admin', 'manager', 'member')
  async findMeasurements(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.indicatorsService.findMeasurements(companyId, id);
  }

  @Post(':id/measurements')
  @Roles('owner', 'admin', 'manager')
  async createMeasurement(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: CreateMeasurementDto,
  ) {
    const companyId = await this.resolveCompanyId(request);
    // Override indicatorId from URL param
    dto.indicatorId = id;
    return this.indicatorsService.createMeasurement(companyId, dto);
  }

  // ==================== PERIODS ====================

  @Get('periods/all')
  @Roles('owner', 'admin', 'manager', 'member')
  async findPeriods(@Req() request: RequestWithUser) {
    const companyId = await this.resolveCompanyId(request);
    return this.indicatorsService.findPeriods(companyId);
  }

  @Post('periods')
  @Roles('owner', 'admin')
  async createPeriod(
    @Req() request: RequestWithUser,
    @Body() dto: CreatePeriodDto,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.indicatorsService.createPeriod(companyId, dto);
  }

  @Post('periods/:period/close')
  @Roles('owner', 'admin')
  async closePeriod(
    @Req() request: RequestWithUser,
    @Param('period') period: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.indicatorsService.closePeriod(companyId, period);
  }

  // ==================== CALCULATION ====================

  @Post('calculate/:period')
  @Roles('owner', 'admin')
  async calculatePeriod(
    @Req() request: RequestWithUser,
    @Param('period') period: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.indicatorsService.calculateAllAutomatic(companyId, period);
  }

  // ==================== SEED ====================

  @Post('seed')
  @Roles('owner', 'admin')
  async ensureSeedIndicators(@Req() request: RequestWithUser) {
    const companyId = await this.resolveCompanyId(request);
    return this.indicatorsService.ensureSeedIndicators(companyId);
  }

  // ==================== DASHBOARD ====================

  @Get('dashboard/summary')
  @Roles('owner', 'admin', 'manager', 'member')
  async getDashboardSummary(@Req() request: RequestWithUser) {
    const companyId = await this.resolveCompanyId(request);
    return this.indicatorsService.getDashboardSummary(companyId);
  }

  // ==================== HELPERS ====================

  private async resolveCompanyId(request: RequestWithUser): Promise<Types.ObjectId> {
    const firebaseUid = request.user?.uid;

    if (!firebaseUid) {
      throw new ForbiddenException('Missing authenticated user');
    }

    const user = await this.usersService.findByFirebaseUid(firebaseUid);

    if (!user) {
      throw new ForbiddenException('Authenticated user is not registered');
    }

    return user.companyId;
  }
}
