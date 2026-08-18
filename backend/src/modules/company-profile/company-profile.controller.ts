import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { CompanyProfileService } from './company-profile.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestWithUser } from '../auth/auth.types';

@Controller('company-profile')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class CompanyProfileController {
  constructor(private readonly service: CompanyProfileService) {}

  @Get()
  @Roles('owner', 'admin', 'manager')
  getProfile(@Req() request: RequestWithUser) {
    return this.service.getProfile(request.companyId as any);
  }

  @Patch()
  @Roles('owner', 'admin', 'manager')
  updateProfile(
    @Req() request: RequestWithUser,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: any,
  ) {
    return this.service.updateProfile(request.companyId as any, body, user?.uid || '', user?.email || '');
  }

  // Work Centers
  @Post('work-centers')
  @Roles('owner', 'admin', 'manager')
  addWorkCenter(
    @Req() request: RequestWithUser,
    @Body() body: { name: string; address?: string; city?: string; riskLevel?: string; employeeCount?: number },
    @CurrentUser() user: any,
  ) {
    return this.service.addWorkCenter(request.companyId as any, body, user?.uid || '');
  }

  @Patch('work-centers/:index')
  @Roles('owner', 'admin', 'manager')
  updateWorkCenter(
    @Req() request: RequestWithUser,
    @Param('index') index: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: any,
  ) {
    return this.service.updateWorkCenter(request.companyId as any, parseInt(index), body, user?.uid || '');
  }

  @Delete('work-centers/:index')
  @Roles('owner', 'admin', 'manager')
  removeWorkCenter(
    @Req() request: RequestWithUser,
    @Param('index') index: string,
    @CurrentUser() user: any,
  ) {
    return this.service.removeWorkCenter(request.companyId as any, parseInt(index), user?.uid || '');
  }

  // Contacts
  @Post('contacts')
  @Roles('owner', 'admin', 'manager')
  upsertContact(
    @Req() request: RequestWithUser,
    @Body() body: { type: string; name: string; position?: string; phone?: string; email?: string },
    @CurrentUser() user: any,
  ) {
    return this.service.upsertContact(request.companyId as any, body, user?.uid || '');
  }

  // Documents
  @Post('documents')
  @Roles('owner', 'admin', 'manager')
  addDocument(
    @Req() request: RequestWithUser,
    @Body() body: { type: string; name: string; fileUrl?: string },
    @CurrentUser() user: any,
  ) {
    return this.service.addDocument(request.companyId as any, body, user?.uid || '');
  }

  @Delete('documents/:index')
  @Roles('owner', 'admin', 'manager')
  removeDocument(
    @Req() request: RequestWithUser,
    @Param('index') index: string,
    @CurrentUser() user: any,
  ) {
    return this.service.removeDocument(request.companyId as any, parseInt(index), user?.uid || '');
  }

  // SST Responsible
  @Post('sst-responsible')
  @Roles('owner', 'admin', 'manager')
  setSstResponsible(
    @Req() request: RequestWithUser,
    @Body('userId') userId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.setSstResponsible(request.companyId as any, userId as any, user?.email || '');
  }

  // Dashboard completion
  @Get('completion')
  @Roles('owner', 'admin', 'manager')
  getCompletion(@Req() request: RequestWithUser) {
    return this.service.getProfile(request.companyId as any).then((p) => ({ completionPercentage: p.completionPercentage }));
  }
}
