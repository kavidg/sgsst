import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { ApproveMatrixDto, GenerateMatrixDto, ReorderItemsDto, ResponsibilityItemDto, UpdateItemDto, VersionSnapshotDto } from './dto/responsibility-matrix.dto';
import { AcceptResponsibilityDto, AssignResponsibilityBatchDto, CreateAcceptanceCycleDto, RejectResponsibilityDto, RequestCorrectionDto, ResolveCorrectionDto, SendReminderDto } from './dto/responsibility-acceptance.dto';
import { ResponsibilityMatrixService } from './responsibility-matrix.service';

interface RequestWithUser extends Request { user?: { _id: string; email: string; role: string }; }

@Controller('responsibility-matrix')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class ResponsibilityMatrixController {
  constructor(private readonly service: ResponsibilityMatrixService) {}

  private resolveCompanyId(request: RequestWithUser): Types.ObjectId {
    const companyId = (request as any).companyId || (request.headers as any)['x-company-id'];
    if (!companyId) throw new Error('Company ID no encontrado');
    return new Types.ObjectId(companyId);
  }

  @Get()
  async getMatrix(@Req() request: RequestWithUser) {
    const userEmail = request.user?.email ?? 'system';
    return this.service.getOrCreate(this.resolveCompanyId(request));
  }

  @Post('generate')
  async generate(@Req() request: RequestWithUser, @Body() dto: GenerateMatrixDto) {
    const userEmail = request.user?.email ?? 'system';
    return this.service.generate(this.resolveCompanyId(request), dto, userEmail);
  }

  @Patch('items/:itemId')
  async updateItem(@Req() request: RequestWithUser, @Param('itemId') itemId: string, @Body() dto: UpdateItemDto) {
    const userEmail = request.user?.email ?? 'system';
    return this.service.updateItem(this.resolveCompanyId(request), itemId, dto, userEmail);
  }

  @Post('items')
  async addItem(@Req() request: RequestWithUser, @Body() dto: ResponsibilityItemDto) {
    const userEmail = request.user?.email ?? 'system';
    return this.service.addItem(this.resolveCompanyId(request), dto, userEmail);
  }

  @Delete('items/:itemId')
  async deleteItem(@Req() request: RequestWithUser, @Param('itemId') itemId: string) {
    const userEmail = request.user?.email ?? 'system';
    return this.service.deleteItem(this.resolveCompanyId(request), itemId, userEmail);
  }

  @Post('items/:itemId/duplicate')
  async duplicateItem(@Req() request: RequestWithUser, @Param('itemId') itemId: string) {
    const userEmail = request.user?.email ?? 'system';
    return this.service.duplicateItem(this.resolveCompanyId(request), itemId, userEmail);
  }

  @Post('reorder')
  async reorderItems(@Req() request: RequestWithUser, @Body() dto: ReorderItemsDto) {
    const userEmail = request.user?.email ?? 'system';
    return this.service.reorderItems(this.resolveCompanyId(request), dto, userEmail);
  }

  @Post('submit-approval')
  async submitForApproval(@Req() request: RequestWithUser) {
    const userEmail = request.user?.email ?? 'system';
    return this.service.submitForApproval(this.resolveCompanyId(request), userEmail);
  }

  @Post('approve')
  @Roles('owner', 'admin')
  async approve(@Req() request: RequestWithUser, @Body() dto: ApproveMatrixDto) {
    const userEmail = request.user?.email ?? 'system';
    return this.service.approve(this.resolveCompanyId(request), dto, userEmail);
  }

  @Post('archive')
  async archive(@Req() request: RequestWithUser) {
    const userEmail = request.user?.email ?? 'system';
    return this.service.archive(this.resolveCompanyId(request), userEmail);
  }

  @Post('versions')
  async createVersion(@Req() request: RequestWithUser, @Body() dto: VersionSnapshotDto) {
    const userEmail = request.user?.email ?? 'system';
    return this.service.createVersion(this.resolveCompanyId(request), dto, userEmail);
  }

  @Get('history')
  async getHistory(@Req() request: RequestWithUser) {
    return this.service.getHistory(this.resolveCompanyId(request));
  }

  // ==================== ACCEPTANCE & SIGNATURE ENDPOINTS ====================

  @Post('acceptances/assign')
  @Roles('owner', 'admin', 'manager')
  async assignBatch(@Req() request: RequestWithUser, @Body() dto: AssignResponsibilityBatchDto) {
    const userEmail = request.user?.email ?? 'system';
    return this.service.assignResponsibilitiesBatch(this.resolveCompanyId(request), dto, userEmail);
  }

  @Get('acceptances/pending')
  async getPendingAcceptances(@Req() request: RequestWithUser) {
    const userId = request.user?._id;
    return this.service.getPendingAcceptances(this.resolveCompanyId(request), userId);
  }

  @Get('acceptances/my')
  async getMyAcceptances(@Req() request: RequestWithUser) {
    const userId = request.user?._id;
    if (!userId) throw new Error('Usuario no identificado');
    return this.service.getMyAcceptances(this.resolveCompanyId(request), userId);
  }

  @Get('acceptances/stats')
  async getAcceptanceStats(@Req() request: RequestWithUser) {
    return this.service.getAcceptanceStats(this.resolveCompanyId(request));
  }

  @Get('acceptances/user/:userId')
  async getAcceptanceForUser(@Req() request: RequestWithUser, @Param('userId') userId: string) {
    return this.service.getAcceptanceForUser(this.resolveCompanyId(request), userId);
  }

  @Post('acceptances/accept')
  async accept(@Req() request: RequestWithUser, @Body() dto: AcceptResponsibilityDto) {
    const userEmail = request.user?.email ?? 'system';
    return this.service.acceptResponsibilities(this.resolveCompanyId(request), dto, userEmail);
  }

  @Post('acceptances/reject')
  async reject(@Req() request: RequestWithUser, @Body() dto: RejectResponsibilityDto) {
    const userEmail = request.user?.email ?? 'system';
    return this.service.rejectResponsibilities(this.resolveCompanyId(request), dto, userEmail);
  }

  @Post('acceptances/request-correction')
  async requestCorrection(@Req() request: RequestWithUser, @Body() dto: RequestCorrectionDto) {
    const userEmail = request.user?.email ?? 'system';
    return this.service.requestCorrection(this.resolveCompanyId(request), dto, userEmail);
  }

  @Post('acceptances/resolve-correction/:userId')
  @Roles('owner', 'admin', 'manager')
  async resolveCorrection(@Req() request: RequestWithUser, @Param('userId') userId: string, @Body() dto: ResolveCorrectionDto) {
    const userEmail = request.user?.email ?? 'system';
    return this.service.resolveCorrection(this.resolveCompanyId(request), userId, dto, userEmail);
  }

  @Post('acceptances/create-cycle')
  @Roles('owner', 'admin', 'manager')
  async createAcceptanceCycle(@Req() request: RequestWithUser, @Body() dto: CreateAcceptanceCycleDto) {
    const userEmail = request.user?.email ?? 'system';
    return this.service.createAcceptanceCycle(this.resolveCompanyId(request), dto, userEmail);
  }

  @Get('acceptances/reminders')
  @Roles('owner', 'admin', 'manager')
  async getReminders(@Req() request: RequestWithUser) {
    return this.service.getPendingReminders(this.resolveCompanyId(request));
  }

  @Get('acceptances/history')
  async getAcceptanceHistory(@Req() request: RequestWithUser) {
    return this.service.getAcceptanceHistory(this.resolveCompanyId(request));
  }

  @Get('compliance')
  async getComplianceStatus(@Req() request: RequestWithUser) {
    return this.service.getComplianceStatus(this.resolveCompanyId(request));
  }

  @Get('campaign-info')
  async getCampaignInfo(@Req() request: RequestWithUser) {
    return this.service.getCampaignInfo(this.resolveCompanyId(request));
  }

  @Post('acceptances/process-renewals')
  @Roles('owner', 'admin')
  async processRenewals(@Req() request: RequestWithUser) {
    return this.service.processRenewals(this.resolveCompanyId(request));
  }
}
