import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { SstInductionService } from './sst-induction.service';
import { CreateSstInductionDto } from './dto/create-sst-induction.dto';
import { UpdateSstInductionDto } from './dto/update-sst-induction.dto';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../questions/roles.guard';
import { Roles } from '../questions/roles.decorator';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('risks/sst-inductions')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class SstInductionController {
  constructor(private readonly service: SstInductionService) {}

  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(@CurrentUser() user: any) {
    return this.service.findAll(user.companyId);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.findById(id, user.companyId);
  }

  @Post()
  @Roles('owner', 'admin')
  async create(@Body() dto: CreateSstInductionDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.companyId);
  }

  @Put(':id')
  @Roles('owner', 'admin')
  async update(@Param('id') id: string, @Body() dto: UpdateSstInductionDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user.companyId);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user.companyId);
  }
}
