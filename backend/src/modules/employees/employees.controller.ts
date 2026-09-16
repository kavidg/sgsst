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
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RequestWithUser } from '../auth/auth.types';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { UsersService } from '../users/users.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { BulkCreateEmployeesDto } from './dto/bulk-create-employees.dto';
import { AssignJobProfileDto } from './dto/assign-job-profile.dto';
import { EmployeesService } from './employees.service';

@Controller('employees')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  @Roles('owner', 'admin')
  async create(@Req() request: RequestWithUser, @Body() createEmployeeDto: CreateEmployeeDto) {
    const companyId = await this.resolveCompanyId(request);
    return this.employeesService.create(companyId, createEmployeeDto);
  }

  @Post('bulk')
  @Roles('owner', 'admin')
  async bulkCreate(@Req() request: RequestWithUser, @Body() bulkCreateEmployeesDto: BulkCreateEmployeesDto) {
    const companyId = await this.resolveCompanyId(request);
    return this.employeesService.bulkCreate(companyId, bulkCreateEmployeesDto.employees);
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(@Req() request: RequestWithUser) {
    const companyId = await this.resolveCompanyId(request);
    return this.employeesService.findAll(companyId);
  }

  @Get('sociodemographic-stats')
  @Roles('owner', 'admin', 'manager')
  async getSociodemographicStats(@Req() request: RequestWithUser) {
    const companyId = await this.resolveCompanyId(request);
    return this.employeesService.getSociodemographicStats(companyId);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  async findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.employeesService.findOne(id, companyId);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.employeesService.update(id, companyId, updateEmployeeDto);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  async remove(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.employeesService.remove(id, companyId);
  }

  // ── FASE 30D-2: Relación Employee → JobProfile (3.1.3) ──

  /** Asocia un JobProfile del mismo tenant al empleado. */
  @Patch(':id/job-profile')
  @Roles('owner', 'admin')
  async assignJobProfile(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: AssignJobProfileDto,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.employeesService.assignJobProfile(id, companyId, dto.jobProfileId);
  }

  /** Desasocia el JobProfile del empleado. */
  @Delete(':id/job-profile')
  @Roles('owner', 'admin')
  async unassignJobProfile(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.employeesService.unassignJobProfile(id, companyId);
  }

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
