import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { RequestWithUser } from '../auth/auth.types';
import { LegalMatrixService } from './legal-matrix.service';

@Controller('legal-matrix')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class LegalMatrixController {
  constructor(private readonly legalMatrixService: LegalMatrixService) {}

  // ==================== SECTOR TEMPLATES (TAB 2) ====================

  @Get('sectors')
  @Roles('owner', 'admin', 'manager')
  async getAllSectors() { return this.legalMatrixService.getAllSectorTemplates(); }

  @Get('sectors/:sector')
  @Roles('owner', 'admin', 'manager')
  async getSectorRegulations(@Param('sector') sector: string) {
    return this.legalMatrixService.getRegulationsBySector(sector);
  }

  @Post('sectors/:sector/regulations')
  @Roles('owner', 'admin')
  async createRegulationTemplate(
    @Param('sector') sector: string,
    @Body() body: { regulationCode: string; regulationName: string; description?: string },
  ) {
    return this.legalMatrixService.createRegulationTemplate(sector, body);
  }

  @Patch('sectors/regulations/:id')
  @Roles('owner', 'admin')
  async updateRegulationTemplate(
    @Param('id') id: string,
    @Body() body: { regulationName?: string; description?: string; isActive?: boolean },
  ) {
    return this.legalMatrixService.updateRegulationTemplate(id, body);
  }

  @Delete('sectors/regulations/:id')
  @Roles('owner', 'admin')
  async deleteRegulationTemplate(@Param('id') id: string) {
    return this.legalMatrixService.deleteRegulationTemplate(id);
  }

  @Post('seed')
  @Roles('owner', 'admin')
  async seedAll() { await this.legalMatrixService.seedAllSectors(); return { message: 'All sectors seeded successfully' }; }

  // ==================== COMPANY MATRIX (TAB 1 & 2) ====================

  @Get('company/current')
  @Roles('owner', 'admin', 'manager')
  async getCurrentCompanyMatrix(@Req() req: RequestWithUser) {
    return this.legalMatrixService.getCompanyMatrix(req.companyId?.toString() ?? '');
  }

  @Get('company/current/compliance')
  @Roles('owner', 'admin', 'manager')
  async getCurrentMatrixCompliance(@Req() req: RequestWithUser) {
    return this.legalMatrixService.getMatrixCompliance(req.companyId?.toString() ?? '');
  }

  @Patch('company/current/item/:regulationCode')
  @Roles('owner', 'admin', 'manager')
  async updateCurrentMatrixItem(
    @Req() req: RequestWithUser,
    @Param('regulationCode') regulationCode: string,
    @Body() body: { status?: string; observation?: string },
    @CurrentUser() user: any,
  ) {
    return this.legalMatrixService.updateMatrixItemStatus(req.companyId?.toString() ?? '', regulationCode, (body.status as any) ?? 'PENDIENTE', body.observation, user?.uid);
  }

  @Post('company/current/items')
  @Roles('owner', 'admin', 'manager')
  async addCustomRegulationToCurrent(
    @Req() req: RequestWithUser,
    @Body() body: { regulationCode: string; regulationName: string; description?: string },
    @CurrentUser() user: any,
  ) {
    return this.legalMatrixService.addCustomRegulation(req.companyId?.toString() ?? '', body.regulationCode, body.regulationName, body.description, user?.uid);
  }

  @Delete('company/current/item/:regulationCode')
  @Roles('owner', 'admin', 'manager')
  async removeRegulationFromCurrent(
    @Req() req: RequestWithUser,
    @Param('regulationCode') regulationCode: string,
  ) {
    return this.legalMatrixService.removeRegulationFromMatrix(req.companyId?.toString() ?? '', regulationCode);
  }

  // ==================== DASHBOARD (TAB 1) ====================

  @Get('dashboard')
  @Roles('owner', 'admin', 'manager')
  async getDashboard(@Req() req: RequestWithUser) {
    return this.legalMatrixService.getAdvancedDashboard(req.companyId?.toString() ?? '');
  }

  // ==================== LEGAL REQUIREMENTS (TAB 3) ====================

  @Get('requirements')
  @Roles('owner', 'admin', 'manager')
  async getRequirements(@Req() req: RequestWithUser, @Query('regulationCode') regulationCode?: string) {
    return this.legalMatrixService.getRequirements(req.companyId?.toString() ?? '', regulationCode);
  }

  @Get('requirements/:id')
  @Roles('owner', 'admin', 'manager')
  async getRequirement(@Param('id') id: string) {
    return this.legalMatrixService.getRequirement(id);
  }

  @Post('requirements')
  @Roles('owner', 'admin', 'manager')
  async createRequirement(
    @Req() req: RequestWithUser,
    @Body() body: { regulationCode: string; regulationName: string; article?: string; requirement: string; responsibleUser?: string; reviewFrequency?: string },
    @CurrentUser() user: any,
  ) {
    return this.legalMatrixService.createRequirement({
      companyId: req.companyId?.toString() ?? '', ...body, userId: user?.uid ?? '', userEmail: user?.email ?? '',
    });
  }

  @Patch('requirements/:id')
  @Roles('owner', 'admin', 'manager')
  async updateRequirement(
    @CurrentUser() user: any, @Param('id') id: string,
    @Body() body: { complianceStatus?: string; responsibleUser?: string; reviewFrequency?: string; article?: string; requirement?: string; notes?: string; linkedModules?: any[] },
  ) {
    return this.legalMatrixService.updateRequirement(id, body as any, user?.uid ?? '', user?.email ?? '');
  }

  @Delete('requirements/:id')
  @Roles('owner', 'admin')
  async deleteRequirement(@Param('id') id: string) {
    return this.legalMatrixService.deleteRequirement(id);
  }

  @Post('requirements/:id/link-module')
  @Roles('owner', 'admin', 'manager')
  async linkModule(
    @Param('id') id: string,
    @Body() body: { module: string; entityId: string; entityName?: string; isCompliant?: boolean },
  ) {
    return this.legalMatrixService.linkModuleToRequirement(id, body);
  }

  // ==================== EVIDENCE (TAB 4) ====================

  @Get('evidence')
  @Roles('owner', 'admin', 'manager')
  async getEvidenceByCompany(@Req() req: RequestWithUser) {
    return this.legalMatrixService.getEvidenceByCompany(req.companyId?.toString() ?? '');
  }

  @Get('evidence/requirement/:requirementId')
  @Roles('owner', 'admin', 'manager')
  async getEvidenceByRequirement(@Param('requirementId') requirementId: string) {
    return this.legalMatrixService.getEvidenceByRequirement(requirementId);
  }

  @Post('evidence')
  @Roles('owner', 'admin', 'manager')
  async linkEvidence(
    @Req() req: RequestWithUser,
    @Body() body: { requirementId: string; documentId?: string; documentName?: string; documentVersion?: string; fileUrl?: string; description: string },
    @CurrentUser() user: any,
  ) {
    return this.legalMatrixService.linkEvidence({
      companyId: req.companyId?.toString() ?? '', ...body, uploadedBy: user?.uid ?? '',
    });
  }

  @Delete('evidence/:id')
  @Roles('owner', 'admin')
  async removeEvidence(@Param('id') id: string) {
    return this.legalMatrixService.removeEvidence(id);
  }

  // ==================== FOLLOW-UP (TAB 5) ====================

  @Get('follow-ups')
  @Roles('owner', 'admin', 'manager')
  async getFollowUps(@Req() req: RequestWithUser) {
    return this.legalMatrixService.getFollowUpsByCompany(req.companyId?.toString() ?? '');
  }

  @Get('follow-ups/requirement/:requirementId')
  @Roles('owner', 'admin', 'manager')
  async getFollowUpsByRequirement(@Param('requirementId') requirementId: string) {
    return this.legalMatrixService.getFollowUpsByRequirement(requirementId);
  }

  @Post('follow-ups')
  @Roles('owner', 'admin', 'manager')
  async createFollowUp(
    @Req() req: RequestWithUser,
    @Body() body: { requirementId: string; reviewDate: string; reviewerName?: string; findings?: string; recommendations?: string; complianceResult: string; nextReviewDate?: string },
    @CurrentUser() user: any,
  ) {
    return this.legalMatrixService.createFollowUp({
      companyId: req.companyId?.toString() ?? '',
      requirementId: body.requirementId,
      reviewDate: new Date(body.reviewDate),
      reviewer: user?.uid ?? '',
      reviewerName: body.reviewerName,
      findings: body.findings,
      recommendations: body.recommendations,
      complianceResult: body.complianceResult,
      nextReviewDate: body.nextReviewDate ? new Date(body.nextReviewDate) : undefined,
    });
  }

  @Post('follow-ups/:id/sign')
  @Roles('owner', 'admin', 'manager')
  async signFollowUp(
    @CurrentUser() user: any, @Param('id') id: string,
    @Body() body: { signedByName: string; signatureHash?: string; signatureUrl?: string },
  ) {
    return this.legalMatrixService.signFollowUp(id, {
      signedBy: user?.uid ?? '', signedByName: body.signedByName, signatureHash: body.signatureHash, signatureUrl: body.signatureUrl,
    });
  }

  // ==================== REGULATORY CHANGES (TAB 6) ====================

  @Get('regulatory-changes')
  @Roles('owner', 'admin', 'manager')
  async getRegulatoryChanges(@Req() req: RequestWithUser, @Query('unreviewed') unreviewed?: string) {
    return this.legalMatrixService.getRegulatoryChanges(req.companyId?.toString() ?? '', unreviewed === 'true');
  }

  @Post('regulatory-changes')
  @Roles('owner', 'admin', 'manager')
  async createRegulatoryChange(
    @Req() req: RequestWithUser,
    @Body() body: { changeType: string; regulationCode: string; regulationName: string; previousRegulationCode?: string; description?: string; impact: string; effectiveDate: string; source?: string; url?: string },
    @CurrentUser() user: any,
  ) {
    return this.legalMatrixService.createRegulatoryChange({
      companyId: req.companyId?.toString() ?? '', ...body, effectiveDate: new Date(body.effectiveDate),
    });
  }

  @Patch('regulatory-changes/:id/review')
  @Roles('owner', 'admin', 'manager')
  async markRegulatoryChangeReviewed(@CurrentUser() user: any, @Param('id') id: string) {
    return this.legalMatrixService.markRegulatoryChangeReviewed(id, user?.uid ?? '');
  }

  // ==================== ACTION PLAN (TAB 7) ====================

  @Get('action-plans')
  @Roles('owner', 'admin', 'manager')
  async getActionPlans(@Req() req: RequestWithUser, @Query('requirementId') requirementId?: string) {
    return this.legalMatrixService.getActionPlans(req.companyId?.toString() ?? '', requirementId);
  }

  @Post('action-plans')
  @Roles('owner', 'admin', 'manager')
  async createActionPlan(
    @Req() req: RequestWithUser,
    @Body() body: { requirementId: string; title: string; description?: string; responsibleUser?: string; dueDate?: string },
    @CurrentUser() user: any,
  ) {
    return this.legalMatrixService.createActionPlan({
      companyId: req.companyId?.toString() ?? '',
      requirementId: body.requirementId,
      title: body.title,
      description: body.description,
      responsibleUser: body.responsibleUser,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      createdBy: user?.uid ?? '',
    });
  }

  @Patch('action-plans/:id')
  @Roles('owner', 'admin', 'manager')
  async updateActionPlan(@Param('id') id: string, @Body() body: any) {
    return this.legalMatrixService.updateActionPlan(id, body);
  }

  @Post('action-plans/:id/sync')
  @Roles('owner', 'admin', 'manager')
  async syncActionPlan(
    @Param('id') id: string,
    @Body() body: { activityId: string; activityTitle: string },
  ) {
    return this.legalMatrixService.syncActionPlanToAnnualWorkPlan(id, body.activityId, body.activityTitle);
  }

  // ==================== HISTORY (TAB 8) ====================

  @Get('history')
  @Roles('owner', 'admin', 'manager')
  async getHistory(@Req() req: RequestWithUser, @Query('limit') limit?: string, @Query('skip') skip?: string) {
    return this.legalMatrixService.getHistory(req.companyId?.toString() ?? '', limit ? parseInt(limit, 10) : 100, skip ? parseInt(skip, 10) : 0);
  }

  @Get('history/:entityType/:entityId')
  @Roles('owner', 'admin', 'manager')
  async getEntityHistory(@Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    return this.legalMatrixService.getEntityHistory(entityType, entityId);
  }

  // ==================== AUTO COMPLIANCE & ALERTS ====================

  @Get('auto-compliance')
  @Roles('owner', 'admin', 'manager')
  async getAutoCompliance(@Req() req: RequestWithUser) {
    return this.legalMatrixService.evaluateAutoCompliance(req.companyId?.toString() ?? '');
  }

  @Post('check-alerts')
  @Roles('owner', 'admin', 'manager')
  async checkAlerts(@Req() req: RequestWithUser) {
    return this.legalMatrixService.checkAndGenerateAlerts(req.companyId?.toString() ?? '');
  }

  // ==================== PARAM-BASED ROUTES (FIXED: usa tenant autenticado) ====================

  @Get('company/:companyId')
  @Roles('owner', 'admin', 'manager')
  async getCompanyMatrix(@Req() req: RequestWithUser) {
    // AUDIT-9: CompanyAccessGuard ya validó membresía. Se ignora el companyId de la URL.
    return this.legalMatrixService.getCompanyMatrix(req.companyId?.toString() ?? '');
  }

  @Get('company/:companyId/compliance')
  @Roles('owner', 'admin', 'manager')
  async getMatrixCompliance(@Req() req: RequestWithUser) {
    return this.legalMatrixService.getMatrixCompliance(req.companyId?.toString() ?? '');
  }

  @Patch('company/:companyId/item/:regulationCode')
  @Roles('owner', 'admin', 'manager')
  async updateMatrixItem(
    @Req() req: RequestWithUser, @Param('regulationCode') regulationCode: string,
    @Body() body: { status?: string; observation?: string },
  ) {
    return this.legalMatrixService.updateMatrixItemStatus(req.companyId?.toString() ?? '', regulationCode, (body.status as any) ?? 'PENDIENTE', body.observation);
  }

  @Post('company/:companyId/items')
  @Roles('owner', 'admin', 'manager')
  async addCustomRegulation(
    @Req() req: RequestWithUser,
    @Body() body: { regulationCode: string; regulationName: string; description?: string },
  ) {
    return this.legalMatrixService.addCustomRegulation(req.companyId?.toString() ?? '', body.regulationCode, body.regulationName, body.description);
  }
}
