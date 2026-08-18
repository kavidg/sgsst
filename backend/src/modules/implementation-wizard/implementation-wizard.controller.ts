import { Controller, Post, Get, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ImplementationWizardService } from './implementation-wizard.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { Types } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';

@Controller('implementation-wizard')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class ImplementationWizardController {
  constructor(private readonly wizardService: ImplementationWizardService) {}

  private parseCompanyId(request: RequestWithUser): Types.ObjectId {
    // AUDIT-9: CompanyAccessGuard ya validó membresía y seteó request.companyId.
    if (!request.companyId) throw new Error('Company ID no encontrado');
    return request.companyId;
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  async getWizard(@Req() request: RequestWithUser) {
    return this.wizardService.getWizard(this.parseCompanyId(request));
  }

  @Get('overview')
  @Roles('owner', 'admin', 'manager')
  async getOverview(@Req() request: RequestWithUser) {
    return this.wizardService.getOverview(this.parseCompanyId(request));
  }

  @Get('dashboard')
  @Roles('owner', 'admin', 'manager')
  async getDashboard(@Req() request: RequestWithUser) {
    return this.wizardService.getDashboardMetrics(this.parseCompanyId(request));
  }

  @Patch('step/:stepId')
  @Roles('owner', 'admin', 'manager')
  async validateStep(
    @Param('stepId') stepId: string,
    @Body() body: { score: number; status: string; details?: string },
    @Req() request: RequestWithUser,
  ) {
    return this.wizardService.updateStepStatus(
      this.parseCompanyId(request),
      stepId as any,
      body.status as any,
      request.user?._id ?? request.user?.uid ?? 'system',
      request.user?.email,
    );
  }

  @Post('auto-validate')
  @Roles('owner', 'admin', 'manager')
  async autoValidate(@Req() request: RequestWithUser) {
    return this.wizardService.validateImplementation(this.parseCompanyId(request));
  }

  @Post('complete-onboarding')
  @Roles('owner', 'admin', 'manager')
  async completeOnboarding(@Req() request: RequestWithUser) {
    return this.wizardService.completeOnboarding(this.parseCompanyId(request));
  }

  @Post('generate-certificate')
  @Roles('owner', 'admin', 'manager')
  async generateCertificate(@Req() request: RequestWithUser) {
    return this.wizardService.generateCertificate(
      this.parseCompanyId(request),
      new Types.ObjectId(request.user?._id ?? '000000000000000000000000'),
    );
  }

  @Get('module-route/:stepId')
  @Roles('owner', 'admin', 'manager')
  getModuleRoute(@Param('stepId') stepId: string) {
    return { route: this.wizardService.getStepModuleRoute(stepId as any) };
  }
}
