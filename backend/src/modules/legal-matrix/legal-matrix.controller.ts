import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import { LegalMatrixService } from './legal-matrix.service';

interface RequestWithHeaders extends Request {
  headers: { authorization?: string; 'x-company-id'?: string; [key: string]: any };
  user?: AuthenticatedUser;
}

@Controller('legal-matrix')
@UseGuards(FirebaseAuthGuard)
export class LegalMatrixController {
  constructor(private readonly legalMatrixService: LegalMatrixService) {}

  private getCompanyId(request: RequestWithHeaders): string {
    const header = request.headers['x-company-id'];
    if (!header || typeof header !== 'string') throw new UnauthorizedException('Missing x-company-id header');
    return header;
  }

  // ==================== SECTOR TEMPLATES (TAB 2) ====================

  @Get('sectors')
  async getAllSectors() { return this.legalMatrixService.getAllSectorTemplates(); }

  @Get('sectors/:sector')
  async getSectorRegulations(@Param('sector') sector: string) {
    return this.legalMatrixService.getRegulationsBySector(sector);
  }

  @Post('sectors/:sector/regulations')
  async createRegulationTemplate(
    @Param('sector') sector: string,
    @Body() body: { regulationCode: string; regulationName: string; description?: string },
  ) {
    return this.legalMatrixService.createRegulationTemplate(sector, body);
  }

  @Patch('sectors/regulations/:id')
  async updateRegulationTemplate(
    @Param('id') id: string,
    @Body() body: { regulationName?: string; description?: string; isActive?: boolean },
  ) {
    return this.legalMatrixService.updateRegulationTemplate(id, body);
  }

  @Delete('sectors/regulations/:id')
  async deleteRegulationTemplate(@Param('id') id: string) {
    return this.legalMatrixService.deleteRegulationTemplate(id);
  }

  @Post('seed')
  async seedAll() { await this.legalMatrixService.seedAllSectors(); return { message: 'All sectors seeded successfully' }; }

  // ==================== COMPANY MATRIX (TAB 1 & 2) ====================

  @Get('company/current')
  async getCurrentCompanyMatrix(@CurrentUser() user: AuthenticatedUser | undefined, @Req() req: RequestWithHeaders) {
    if (!user) throw new UnauthorizedException();
    return this.legalMatrixService.getCompanyMatrix(this.getCompanyId(req));
  }

  @Get('company/current/compliance')
  async getCurrentMatrixCompliance(@CurrentUser() user: AuthenticatedUser | undefined, @Req() req: RequestWithHeaders) {
    if (!user) throw new UnauthorizedException();
    return this.legalMatrixService.getMatrixCompliance(this.getCompanyId(req));
  }

  @Patch('company/current/item/:regulationCode')
  async updateCurrentMatrixItem(
    @CurrentUser() user: AuthenticatedUser | undefined, @Req() req: RequestWithHeaders,
    @Param('regulationCode') regulationCode: string,
    @Body() body: { status?: string; observation?: string },
  ) {
    if (!user) throw new UnauthorizedException();
    return this.legalMatrixService.updateMatrixItemStatus(this.getCompanyId(req), regulationCode, (body.status as any) ?? 'PENDIENTE', body.observation, user.uid);
  }

  @Post('company/current/items')
  async addCustomRegulationToCurrent(
    @CurrentUser() user: AuthenticatedUser | undefined, @Req() req: RequestWithHeaders,
    @Body() body: { regulationCode: string; regulationName: string; description?: string },
  ) {
    if (!user) throw new UnauthorizedException();
    return this.legalMatrixService.addCustomRegulation(this.getCompanyId(req), body.regulationCode, body.regulationName, body.description, user.uid);
  }

  @Delete('company/current/item/:regulationCode')
  async removeRegulationFromCurrent(
    @CurrentUser() user: AuthenticatedUser | undefined, @Req() req: RequestWithHeaders,
    @Param('regulationCode') regulationCode: string,
  ) {
    if (!user) throw new UnauthorizedException();
    return this.legalMatrixService.removeRegulationFromMatrix(this.getCompanyId(req), regulationCode);
  }

  // ==================== DASHBOARD (TAB 1) ====================

  @Get('dashboard')
  async getDashboard(@CurrentUser() user: AuthenticatedUser | undefined, @Req() req: RequestWithHeaders) {
    if (!user) throw new UnauthorizedException();
    return this.legalMatrixService.getAdvancedDashboard(this.getCompanyId(req));
  }

  // ==================== LEGAL REQUIREMENTS (TAB 3) ====================

  @Get('requirements')
  async getRequirements(@Req() req: RequestWithHeaders, @Query('regulationCode') regulationCode?: string) {
    return this.legalMatrixService.getRequirements(this.getCompanyId(req), regulationCode);
  }

  @Get('requirements/:id')
  async getRequirement(@Param('id') id: string) {
    return this.legalMatrixService.getRequirement(id);
  }

  @Post('requirements')
  async createRequirement(
    @CurrentUser() user: AuthenticatedUser | undefined, @Req() req: RequestWithHeaders,
    @Body() body: { regulationCode: string; regulationName: string; article?: string; requirement: string; responsibleUser?: string; reviewFrequency?: string },
  ) {
    if (!user) throw new UnauthorizedException();
    return this.legalMatrixService.createRequirement({
      companyId: this.getCompanyId(req), ...body, userId: user.uid, userEmail: user.email ?? '',
    });
  }

  @Patch('requirements/:id')
  async updateRequirement(
    @CurrentUser() user: AuthenticatedUser | undefined, @Param('id') id: string,
    @Body() body: { complianceStatus?: string; responsibleUser?: string; reviewFrequency?: string; article?: string; requirement?: string; notes?: string; linkedModules?: any[] },
  ) {
    if (!user) throw new UnauthorizedException();
    return this.legalMatrixService.updateRequirement(id, body as any, user.uid, user.email ?? '');
  }

  @Delete('requirements/:id')
  async deleteRequirement(@Param('id') id: string) {
    return this.legalMatrixService.deleteRequirement(id);
  }

  @Post('requirements/:id/link-module')
  async linkModule(
    @Param('id') id: string,
    @Body() body: { module: string; entityId: string; entityName?: string; isCompliant?: boolean },
  ) {
    return this.legalMatrixService.linkModuleToRequirement(id, body);
  }

  // ==================== EVIDENCE (TAB 4) ====================

  @Get('evidence')
  async getEvidenceByCompany(@Req() req: RequestWithHeaders) {
    return this.legalMatrixService.getEvidenceByCompany(this.getCompanyId(req));
  }

  @Get('evidence/requirement/:requirementId')
  async getEvidenceByRequirement(@Param('requirementId') requirementId: string) {
    return this.legalMatrixService.getEvidenceByRequirement(requirementId);
  }

  @Post('evidence')
  async linkEvidence(
    @CurrentUser() user: AuthenticatedUser | undefined, @Req() req: RequestWithHeaders,
    @Body() body: { requirementId: string; documentId?: string; documentName?: string; documentVersion?: string; fileUrl?: string; description: string },
  ) {
    if (!user) throw new UnauthorizedException();
    return this.legalMatrixService.linkEvidence({
      companyId: this.getCompanyId(req), ...body, uploadedBy: user.uid,
    });
  }

  @Delete('evidence/:id')
  async removeEvidence(@Param('id') id: string) {
    return this.legalMatrixService.removeEvidence(id);
  }

  // ==================== FOLLOW-UP (TAB 5) ====================

  @Get('follow-ups')
  async getFollowUps(@Req() req: RequestWithHeaders) {
    return this.legalMatrixService.getFollowUpsByCompany(this.getCompanyId(req));
  }

  @Get('follow-ups/requirement/:requirementId')
  async getFollowUpsByRequirement(@Param('requirementId') requirementId: string) {
    return this.legalMatrixService.getFollowUpsByRequirement(requirementId);
  }

  @Post('follow-ups')
  async createFollowUp(
    @CurrentUser() user: AuthenticatedUser | undefined, @Req() req: RequestWithHeaders,
    @Body() body: { requirementId: string; reviewDate: string; reviewerName?: string; findings?: string; recommendations?: string; complianceResult: string; nextReviewDate?: string },
  ) {
    if (!user) throw new UnauthorizedException();
    return this.legalMatrixService.createFollowUp({
      companyId: this.getCompanyId(req),
      requirementId: body.requirementId,
      reviewDate: new Date(body.reviewDate),
      reviewer: user.uid,
      reviewerName: body.reviewerName,
      findings: body.findings,
      recommendations: body.recommendations,
      complianceResult: body.complianceResult,
      nextReviewDate: body.nextReviewDate ? new Date(body.nextReviewDate) : undefined,
    });
  }

  @Post('follow-ups/:id/sign')
  async signFollowUp(
    @CurrentUser() user: AuthenticatedUser | undefined, @Param('id') id: string,
    @Body() body: { signedByName: string; signatureHash?: string; signatureUrl?: string },
  ) {
    if (!user) throw new UnauthorizedException();
    return this.legalMatrixService.signFollowUp(id, {
      signedBy: user.uid, signedByName: body.signedByName, signatureHash: body.signatureHash, signatureUrl: body.signatureUrl,
    });
  }

  // ==================== REGULATORY CHANGES (TAB 6) ====================

  @Get('regulatory-changes')
  async getRegulatoryChanges(@Req() req: RequestWithHeaders, @Query('unreviewed') unreviewed?: string) {
    return this.legalMatrixService.getRegulatoryChanges(this.getCompanyId(req), unreviewed === 'true');
  }

  @Post('regulatory-changes')
  async createRegulatoryChange(
    @CurrentUser() user: AuthenticatedUser | undefined, @Req() req: RequestWithHeaders,
    @Body() body: { changeType: string; regulationCode: string; regulationName: string; previousRegulationCode?: string; description?: string; impact: string; effectiveDate: string; source?: string; url?: string },
  ) {
    if (!user) throw new UnauthorizedException();
    return this.legalMatrixService.createRegulatoryChange({
      companyId: this.getCompanyId(req), ...body, effectiveDate: new Date(body.effectiveDate),
    });
  }

  @Patch('regulatory-changes/:id/review')
  async markRegulatoryChangeReviewed(@CurrentUser() user: AuthenticatedUser | undefined, @Param('id') id: string) {
    if (!user) throw new UnauthorizedException();
    return this.legalMatrixService.markRegulatoryChangeReviewed(id, user.uid);
  }

  // ==================== ACTION PLAN (TAB 7) ====================

  @Get('action-plans')
  async getActionPlans(@Req() req: RequestWithHeaders, @Query('requirementId') requirementId?: string) {
    return this.legalMatrixService.getActionPlans(this.getCompanyId(req), requirementId);
  }

  @Post('action-plans')
  async createActionPlan(
    @CurrentUser() user: AuthenticatedUser | undefined, @Req() req: RequestWithHeaders,
    @Body() body: { requirementId: string; title: string; description?: string; responsibleUser?: string; dueDate?: string },
  ) {
    if (!user) throw new UnauthorizedException();
    return this.legalMatrixService.createActionPlan({
      companyId: this.getCompanyId(req),
      requirementId: body.requirementId,
      title: body.title,
      description: body.description,
      responsibleUser: body.responsibleUser,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      createdBy: user.uid,
    });
  }

  @Patch('action-plans/:id')
  async updateActionPlan(@Param('id') id: string, @Body() body: any) {
    return this.legalMatrixService.updateActionPlan(id, body);
  }

  @Post('action-plans/:id/sync')
  async syncActionPlan(
    @Param('id') id: string,
    @Body() body: { activityId: string; activityTitle: string },
  ) {
    return this.legalMatrixService.syncActionPlanToAnnualWorkPlan(id, body.activityId, body.activityTitle);
  }

  // ==================== HISTORY (TAB 8) ====================

  @Get('history')
  async getHistory(@Req() req: RequestWithHeaders, @Query('limit') limit?: string, @Query('skip') skip?: string) {
    return this.legalMatrixService.getHistory(this.getCompanyId(req), limit ? parseInt(limit, 10) : 100, skip ? parseInt(skip, 10) : 0);
  }

  @Get('history/:entityType/:entityId')
  async getEntityHistory(@Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    return this.legalMatrixService.getEntityHistory(entityType, entityId);
  }

  // ==================== AUTO COMPLIANCE & ALERTS ====================

  @Get('auto-compliance')
  async getAutoCompliance(@CurrentUser() user: AuthenticatedUser | undefined, @Req() req: RequestWithHeaders) {
    if (!user) throw new UnauthorizedException();
    return this.legalMatrixService.evaluateAutoCompliance(this.getCompanyId(req));
  }

  @Post('check-alerts')
  async checkAlerts(@CurrentUser() user: AuthenticatedUser | undefined, @Req() req: RequestWithHeaders) {
    if (!user) throw new UnauthorizedException();
    return this.legalMatrixService.checkAndGenerateAlerts(this.getCompanyId(req));
  }

  // ==================== PARAM-BASED ROUTES (admin/owner direct access) ====================

  @Get('company/:companyId')
  async getCompanyMatrix(@Param('companyId') companyId: string) {
    return this.legalMatrixService.getCompanyMatrix(companyId);
  }

  @Get('company/:companyId/compliance')
  async getMatrixCompliance(@Param('companyId') companyId: string) {
    return this.legalMatrixService.getMatrixCompliance(companyId);
  }

  @Patch('company/:companyId/item/:regulationCode')
  async updateMatrixItem(
    @Param('companyId') companyId: string, @Param('regulationCode') regulationCode: string,
    @Body() body: { status?: string; observation?: string },
  ) {
    return this.legalMatrixService.updateMatrixItemStatus(companyId, regulationCode, (body.status as any) ?? 'PENDIENTE', body.observation);
  }

  @Post('company/:companyId/items')
  async addCustomRegulation(
    @Param('companyId') companyId: string,
    @Body() body: { regulationCode: string; regulationName: string; description?: string },
  ) {
    return this.legalMatrixService.addCustomRegulation(companyId, body.regulationCode, body.regulationName, body.description);
  }
}
