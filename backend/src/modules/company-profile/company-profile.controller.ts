import { Controller, Get, Post, Patch, Delete, Body, Param, Headers, UseGuards } from '@nestjs/common';
import { CompanyProfileService } from './company-profile.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('company-profile')
@UseGuards(FirebaseAuthGuard)
export class CompanyProfileController {
  constructor(private readonly service: CompanyProfileService) {}

  private getCompanyId(@Headers('x-company-id') companyId: string) {
    return companyId;
  }

  @Get()
  getProfile(@Headers('x-company-id') companyId: string) {
    return this.service.getProfile(this.getCompanyId(companyId) as any);
  }

  @Patch()
  updateProfile(
    @Headers('x-company-id') companyId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: any,
  ) {
    return this.service.updateProfile(this.getCompanyId(companyId) as any, body, user?.uid || '', user?.email || '');
  }

  // Work Centers
  @Post('work-centers')
  addWorkCenter(
    @Headers('x-company-id') companyId: string,
    @Body() body: { name: string; address?: string; city?: string; riskLevel?: string; employeeCount?: number },
    @CurrentUser() user: any,
  ) {
    return this.service.addWorkCenter(this.getCompanyId(companyId) as any, body, user?.uid || '');
  }

  @Patch('work-centers/:index')
  updateWorkCenter(
    @Headers('x-company-id') companyId: string,
    @Param('index') index: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: any,
  ) {
    return this.service.updateWorkCenter(this.getCompanyId(companyId) as any, parseInt(index), body, user?.uid || '');
  }

  @Delete('work-centers/:index')
  removeWorkCenter(
    @Headers('x-company-id') companyId: string,
    @Param('index') index: string,
    @CurrentUser() user: any,
  ) {
    return this.service.removeWorkCenter(this.getCompanyId(companyId) as any, parseInt(index), user?.uid || '');
  }

  // Contacts
  @Post('contacts')
  upsertContact(
    @Headers('x-company-id') companyId: string,
    @Body() body: { type: string; name: string; position?: string; phone?: string; email?: string },
    @CurrentUser() user: any,
  ) {
    return this.service.upsertContact(this.getCompanyId(companyId) as any, body, user?.uid || '');
  }

  // Documents
  @Post('documents')
  addDocument(
    @Headers('x-company-id') companyId: string,
    @Body() body: { type: string; name: string; fileUrl?: string },
    @CurrentUser() user: any,
  ) {
    return this.service.addDocument(this.getCompanyId(companyId) as any, body, user?.uid || '');
  }

  @Delete('documents/:index')
  removeDocument(
    @Headers('x-company-id') companyId: string,
    @Param('index') index: string,
    @CurrentUser() user: any,
  ) {
    return this.service.removeDocument(this.getCompanyId(companyId) as any, parseInt(index), user?.uid || '');
  }

  // SST Responsible
  @Post('sst-responsible')
  setSstResponsible(
    @Headers('x-company-id') companyId: string,
    @Body('userId') userId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.setSstResponsible(this.getCompanyId(companyId) as any, userId as any, user?.email || '');
  }

  // Dashboard completion
  @Get('completion')
  getCompletion(@Headers('x-company-id') companyId: string) {
    return this.service.getProfile(this.getCompanyId(companyId) as any).then((p) => ({ completionPercentage: p.completionPercentage }));
  }
}
