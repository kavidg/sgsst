import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequestWithUser } from '../auth/auth.types';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { UsersService } from '../users/users.service';
import { PolicyTemplateService, CreatePolicyTemplateDto, UpdatePolicyTemplateDto } from './policy-template.service';

@Controller('policy-templates')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class PolicyTemplateController {
  constructor(
    private readonly policyTemplateService: PolicyTemplateService,
  ) {}

  @Get()
  @Roles('owner', 'admin', 'manager', 'member')
  async findAll(@Req() request: RequestWithUser, @Query('activeOnly') activeOnly?: string) {
    // Seed defaults on first access (idempotent)
    await this.policyTemplateService.seedDefaults();
    return this.policyTemplateService.findAll(activeOnly === 'true');
  }

  @Get('seed')
  @Roles('owner')
  async seed(@Req() request: RequestWithUser) {
    const count = await this.policyTemplateService.seedDefaults();
    return { message: `${count} plantillas insertadas por defecto`, count };
  }

  @Get(':sector')
  @Roles('owner', 'admin', 'manager', 'member')
  async findBySector(@Req() request: RequestWithUser, @Param('sector') sector: string) {
    return this.policyTemplateService.findBySector(sector);
  }

  @Post()
  @Roles('owner')
  async create(@Req() request: RequestWithUser, @Body() dto: CreatePolicyTemplateDto) {
    if (!dto.sector?.trim()) throw new BadRequestException('El sector es requerido');
    return this.policyTemplateService.create(dto);
  }

  @Patch(':id')
  @Roles('owner')
  async update(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: UpdatePolicyTemplateDto) {
    return this.policyTemplateService.update(id, dto);
  }

  @Delete(':id')
  @Roles('owner')
  async remove(@Req() request: RequestWithUser, @Param('id') id: string) {
    await this.policyTemplateService.remove(id);
    return { message: 'Plantilla eliminada correctamente' };
  }

}
