import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { RolesGuard } from '../questions/roles.guard';
import { Roles } from '../questions/roles.decorator';
import { RequestWithUser } from '../auth/auth.types';
import { CreateAbsenteeismDto } from './dto/create-absenteeism.dto';
import { UpdateAbsenteeismDto } from './dto/update-absenteeism.dto';
import { AbsenteeismService } from './absenteeism.service';

@Controller('absenteeism')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class AbsenteeismController {
  constructor(private readonly absenteeismService: AbsenteeismService) {}

  @Post()
  @Roles('owner', 'admin', 'manager')
  create(@Req() request: RequestWithUser, @Body() createAbsenteeismDto: CreateAbsenteeismDto) {
    const companyId = request.companyId?.toString() ?? '';
    return this.absenteeismService.create({ ...createAbsenteeismDto, companyId });
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  findAll(@Req() request: RequestWithUser) {
    const companyId = request.companyId?.toString() ?? '';
    return this.absenteeismService.findAllByCompany(companyId);
  }

  @Get('user/:userId')
  @Roles('owner', 'admin', 'manager')
  findAllByUser(@Req() request: RequestWithUser, @Param('userId') userId: string) {
    const companyId = request.companyId?.toString() ?? '';
    return this.absenteeismService.findAllByUser(userId, companyId);
  }

  @Get('stats')
  @Roles('owner', 'admin', 'manager')
  getCompanyStats(@Req() request: RequestWithUser) {
    const companyId = request.companyId?.toString() ?? '';
    return this.absenteeismService.getCompanyStats(companyId);
  }

  @Patch(':id')
  @Roles('owner', 'admin', 'manager')
  update(@Req() request: RequestWithUser, @Param('id') id: string, @Body() updateAbsenteeismDto: UpdateAbsenteeismDto) {
    const companyId = request.companyId?.toString() ?? '';
    return this.absenteeismService.update(id, companyId, updateAbsenteeismDto);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  remove(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = request.companyId?.toString() ?? '';
    return this.absenteeismService.remove(id, companyId);
  }
}
