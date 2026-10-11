import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
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

  // F2 — Sin contexto de empresa se responde con error HTTP claro: NUNCA se
  // propaga '' al service (new ObjectId('') → BSONError).
  @Post()
  @Roles('owner', 'admin', 'manager')
  create(@Req() request: RequestWithUser, @Body() createAbsenteeismDto: CreateAbsenteeismDto) {
    const companyId = this.requireCompanyId(request);
    return this.absenteeismService.create({ ...createAbsenteeismDto, companyId });
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  findAll(@Req() request: RequestWithUser) {
    const companyId = this.requireCompanyId(request);
    return this.absenteeismService.findAllByCompany(companyId);
  }

  @Get('user/:userId')
  @Roles('owner', 'admin', 'manager')
  findAllByUser(@Req() request: RequestWithUser, @Param('userId') userId: string) {
    const companyId = this.requireCompanyId(request);
    return this.absenteeismService.findAllByUser(userId, companyId);
  }

  @Get('stats')
  @Roles('owner', 'admin', 'manager')
  getCompanyStats(@Req() request: RequestWithUser) {
    const companyId = this.requireCompanyId(request);
    return this.absenteeismService.getCompanyStats(companyId);
  }

  @Patch(':id')
  @Roles('owner', 'admin', 'manager')
  update(@Req() request: RequestWithUser, @Param('id') id: string, @Body() updateAbsenteeismDto: UpdateAbsenteeismDto) {
    const companyId = this.requireCompanyId(request);
    return this.absenteeismService.update(id, companyId, updateAbsenteeismDto);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  remove(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = this.requireCompanyId(request);
    return this.absenteeismService.remove(id, companyId);
  }

  /** Contexto de empresa obligatorio para endpoints company-bound (F2). */
  private requireCompanyId(request: RequestWithUser): string {
    if (!request.companyId) {
      throw new ForbiddenException('Missing active company context');
    }
    return request.companyId.toString();
  }
}
