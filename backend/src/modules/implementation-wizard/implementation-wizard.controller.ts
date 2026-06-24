import { Controller, Post, Get, Patch, Body, Param, Headers, UseGuards } from '@nestjs/common';
import { ImplementationWizardService } from './implementation-wizard.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { Types } from 'mongoose';

@Controller('implementation-wizard')
@UseGuards(FirebaseAuthGuard, CompanyAccessGuard)
export class ImplementationWizardController {
  constructor(private readonly wizardService: ImplementationWizardService) {}

  private parseCompanyId(headers: Record<string, string>): Types.ObjectId {
    return new Types.ObjectId(headers['x-company-id']);
  }

  @Get()
  async getWizard(@Headers() headers: Record<string, string>) {
    return this.wizardService.getWizard(this.parseCompanyId(headers));
  }

  @Get('dashboard')
  async getDashboard(@Headers() headers: Record<string, string>) {
    return this.wizardService.getDashboardMetrics(this.parseCompanyId(headers));
  }

  @Patch('step/:stepId')
  async validateStep(
    @Param('stepId') stepId: string,
    @Body() body: { score: number; status: string; details?: string },
    @Headers() headers: Record<string, string>,
  ) {
    return this.wizardService.updateStepStatus(
      this.parseCompanyId(headers),
      stepId as any,
      body.status as any,
      headers['x-user-id'] || 'system',
      headers['x-user-email'],
    );
  }

  @Post('auto-validate')
  async autoValidate(
    @Body() body: Record<string, { score: number; status: string }>,
    @Headers() headers: Record<string, string>,
  ) {
    return this.wizardService.runAutoValidation(
      this.parseCompanyId(headers),
      body as any,
    );
  }

  @Post('complete-onboarding')
  async completeOnboarding(@Headers() headers: Record<string, string>) {
    return this.wizardService.completeOnboarding(this.parseCompanyId(headers));
  }

  @Post('generate-certificate')
  async generateCertificate(@Headers() headers: Record<string, string>) {
    return this.wizardService.generateCertificate(
      this.parseCompanyId(headers),
      new Types.ObjectId(headers['x-user-id'] || '000000000000000000000000'),
    );
  }

  @Get('module-route/:stepId')
  getModuleRoute(@Param('stepId') stepId: string) {
    return { route: this.wizardService.getStepModuleRoute(stepId as any) };
  }
}
