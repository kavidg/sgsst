import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import {
  AddWorkersDto, CampaignQueryDto, CampaignStatusDto, CreateCampaignDto,
  ResendLinkDto, SendOtpDto, SendReminderDto, SignDocumentDto,
  UpdateCampaignDto, ValidateIdentityDto, ValidateOtpDto,
} from './dto/worker-signature-campaign.dto';
import { WorkerSignatureCampaignService } from './worker-signature-campaign.service';

interface RequestWithUser extends Request { user?: { _id: string; email: string; role: string }; companyId?: Types.ObjectId }

@Controller('worker-signature-campaign')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class WorkerSignatureCampaignController {
  constructor(private readonly service: WorkerSignatureCampaignService) {}

  private resolveCompanyId(request: RequestWithUser): Types.ObjectId {
    if (!request.companyId) throw new Error('Company ID no encontrado');
    return request.companyId;
  }

  // ==================== CAMPAIGN CRUD ====================

  @Post()
  @Roles('owner', 'admin', 'manager')
  async create(@Req() request: RequestWithUser, @Body() dto: CreateCampaignDto) {
    return this.service.create(this.resolveCompanyId(request), dto, request.user?.email ?? 'system');
  }

  @Get()
  @Roles('owner', 'admin', 'manager', 'member')
  async findAll(@Req() request: RequestWithUser, @Query() query: CampaignQueryDto) {
    return this.service.findAll(this.resolveCompanyId(request), query);
  }

  @Get('stats')
  @Roles('owner', 'admin', 'manager')
  async getStats(@Req() request: RequestWithUser) {
    return this.service.getStats(this.resolveCompanyId(request));
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager', 'member')
  async findById(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.findById(this.resolveCompanyId(request), id);
  }

  @Patch(':id')
  @Roles('owner', 'admin', 'manager')
  async update(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.service.update(this.resolveCompanyId(request), id, dto, request.user?.email ?? 'system');
  }

  @Patch(':id/status')
  @Roles('owner', 'admin', 'manager')
  async updateStatus(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: CampaignStatusDto) {
    return this.service.updateStatus(this.resolveCompanyId(request), id, dto, request.user?.email ?? 'system');
  }

  @Get(':id/report')
  @Roles('owner', 'admin', 'manager')
  async getReport(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.getCampaignReport(this.resolveCompanyId(request), id);
  }

  // ==================== WORKERS ====================

  @Post(':id/workers')
  @Roles('owner', 'admin', 'manager')
  async addWorkers(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: AddWorkersDto) {
    return this.service.addWorkers(this.resolveCompanyId(request), id, dto, request.user?.email ?? 'system');
  }

  @Get(':id/workers')
  @Roles('owner', 'admin', 'manager', 'member')
  async getWorkers(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.getWorkers(this.resolveCompanyId(request), id);
  }

  @Delete(':campaignId/workers/:workerId')
  @Roles('owner', 'admin', 'manager')
  async removeWorker(@Req() request: RequestWithUser, @Param('campaignId') campaignId: string, @Param('workerId') workerId: string) {
    return this.service.removeWorker(this.resolveCompanyId(request), campaignId, workerId, request.user?.email ?? 'system');
  }

  // ==================== LINKS & TOKENS ====================

  @Post(':id/workers/:workerId/generate-link')
  @Roles('owner', 'admin', 'manager')
  async generateLink(@Req() request: RequestWithUser, @Param('id') id: string, @Param('workerId') workerId: string) {
    return this.service.generateLink(this.resolveCompanyId(request), workerId, request.user?.email ?? 'system');
  }

  @Post(':id/workers/resend-link')
  @Roles('owner', 'admin', 'manager')
  async resendLink(@Req() request: RequestWithUser, @Body() dto: ResendLinkDto) {
    return this.service.resendLink(this.resolveCompanyId(request), dto, request.user?.email ?? 'system');
  }

  // ==================== REMINDERS ====================

  @Post(':id/reminders')
  @Roles('owner', 'admin', 'manager')
  async sendReminders(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: SendReminderDto) {
    return this.service.sendReminders(this.resolveCompanyId(request), id, dto, request.user?.email ?? 'system');
  }

  @Get('reminders/pending')
  @Roles('owner', 'admin', 'manager')
  async getPendingReminders(@Req() request: RequestWithUser) {
    return this.service.getPendingReminders(this.resolveCompanyId(request));
  }

  // ==================== EVIDENCE ====================

  @Get(':id/evidence')
  @Roles('owner', 'admin', 'manager')
  async getEvidence(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.getEvidence(this.resolveCompanyId(request), id);
  }

  @Get('evidence/all')
  @Roles('owner', 'admin', 'manager')
  async getAllEvidence(@Req() request: RequestWithUser) {
    return this.service.getAllEvidence(this.resolveCompanyId(request));
  }

  // ==================== AUDIT ====================

  @Get('audit')
  @Roles('owner', 'admin', 'manager')
  async getAudit(@Req() request: RequestWithUser, @Query('campaignId') campaignId?: string) {
    return this.service.getAuditHistory(this.resolveCompanyId(request), campaignId);
  }

  // ==================== SYSTEM ====================

  @Post('process-expired')
  @Roles('owner', 'admin')
  async processExpired() {
    return this.service.processExpiredTokens();
  }
}

// ==================== PUBLIC ENDPOINTS (NO AUTH) ====================

@Controller('public/sign')
export class PublicSignController {
  constructor(private readonly service: WorkerSignatureCampaignService) {}

  @Get(':token')
  async getWorkerByToken(@Param('token') token: string) {
    return this.service.getWorkerByToken(token);
  }

  @Post(':token/validate-identity')
  async validateIdentity(@Param('token') token: string, @Body() dto: ValidateIdentityDto) {
    return this.service.validateIdentity(token, dto);
  }

  @Post(':token/send-otp')
  async sendOtp(@Param('token') token: string, @Body() dto: SendOtpDto) {
    return this.service.sendOtp(token, dto);
  }

  @Post(':token/validate-otp')
  async validateOtp(@Param('token') token: string, @Body() dto: ValidateOtpDto) {
    return this.service.validateOtp(token, dto);
  }

  @Get(':token/document')
  async getDocument(@Param('token') token: string) {
    return this.service.getDocumentForWorker(token);
  }

  @Post(':token/sign')
  async sign(@Param('token') token: string, @Body() dto: SignDocumentDto) {
    return this.service.signDocument(token, dto);
  }
}
