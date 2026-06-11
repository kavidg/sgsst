import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { RolesGuard } from '../questions/roles.guard';
import { Roles } from '../questions/roles.decorator';
import { UsersService } from '../users/users.service';
import { AccountabilityService } from './services/accountability.service';
import { AccountabilityReportService } from './services/accountability-report.service';
import { AccountabilityMeetingService } from './services/accountability-meeting.service';
import { AccountabilityCommitmentService } from './services/accountability-commitment.service';
import { AccountabilityHistoryService } from './services/accountability-history.service';
import {
  CreateReportDto,
  UpdateReportDto,
  SignReportDto,
  CreateMeetingDto,
  UpdateMeetingDto,
  CompleteMeetingDto,
  CreateCommitmentDto,
  UpdateCommitmentDto,
  SubmitJustificationDto,
  ApproveJustificationDto,
} from './dto/accountability.dto';
import { ReportType } from './schemas/accountability-report.schema';
import { CommitmentPriority } from './schemas/accountability-commitment.schema';

@Controller('accountability')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class AccountabilityController {
  constructor(
    private readonly accountabilityService: AccountabilityService,
    private readonly reportService: AccountabilityReportService,
    private readonly meetingService: AccountabilityMeetingService,
    private readonly commitmentService: AccountabilityCommitmentService,
    private readonly historyService: AccountabilityHistoryService,
    private readonly usersService: UsersService,
  ) {}

  // ==================== DASHBOARD / METRICS ====================

  @Get('dashboard')
  @Roles('owner', 'admin', 'manager', 'member')
  async getDashboard(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.accountabilityService.getDashboardMetrics(companyId);
  }

  @Get('auto-compliance')
  @Roles('owner', 'admin', 'manager')
  async getAutoCompliance(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.accountabilityService.checkAutoCompliance(companyId);
  }

  // ==================== REPORTS ====================

  @Get('reports')
  @Roles('owner', 'admin', 'manager', 'member')
  async getReports(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.reportService.findAll(companyId);
  }

  @Get('reports/stats')
  @Roles('owner', 'admin', 'manager', 'member')
  async getReportStats(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.reportService.getReportStats(companyId);
  }

  @Get('reports/type/:type')
  @Roles('owner', 'admin', 'manager', 'member')
  async getReportsByType(
    @Req() request: RequestWithUser,
    @Param('type') type: ReportType,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.reportService.findByType(companyId, type);
  }

  @Get('reports/current')
  @Roles('owner', 'admin', 'manager', 'member')
  async getCurrentPeriodReport(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.reportService.getCurrentPeriodReport(companyId);
  }

  @Get('reports/:id')
  @Roles('owner', 'admin', 'manager', 'member')
  async getReport(@Param('id') id: string) {
    return this.reportService.findById(new Types.ObjectId(id));
  }

  @Post('reports')
  @Roles('owner', 'admin', 'manager')
  async createReport(
    @Req() request: RequestWithUser,
    @Body() dto: CreateReportDto,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.reportService.create(
      companyId,
      {
        reportType: dto.reportType,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        executiveSummary: dto.executiveSummary,
        achievements: dto.achievements,
        pendingActions: dto.pendingActions,
        riskAreas: dto.riskAreas,
        compliancePercentage: dto.compliancePercentage,
        criticalFindings: dto.criticalFindings,
        recommendations: dto.recommendations,
        nextActions: dto.nextActions,
      },
      user._id,
      user.email,
    );
  }

  @Post('reports/individual')
  @Roles('owner', 'admin', 'manager', 'member')
  async createIndividualReport(
    @Req() request: RequestWithUser,
    @Body() dto: {
      activitiesPerformed: string;
      activitiesPending: string;
      difficulties?: string;
      correctiveActions?: string;
      recommendations?: string;
      observations?: string;
    },
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.accountabilityService.createIndividualReport(companyId, {
      userId: user._id,
      userEmail: user.email,
      activitiesPerformed: dto.activitiesPerformed,
      activitiesPending: dto.activitiesPending,
      difficulties: dto.difficulties,
      correctiveActions: dto.correctiveActions,
      recommendations: dto.recommendations,
      observations: dto.observations,
    });
  }

  @Patch('reports/:id')
  @Roles('owner', 'admin', 'manager')
  async updateReport(
    @Param('id') id: string,
    @Body() dto: UpdateReportDto,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.reportService.update(
      new Types.ObjectId(id),
      companyId,
      dto as any,
      user._id,
      user.email,
    );
  }

  @Post('reports/:id/sign')
  @Roles('owner', 'manager')
  async signReport(
    @Param('id') id: string,
    @Body() dto: SignReportDto,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.reportService.sign(
      new Types.ObjectId(id),
      companyId,
      new Types.ObjectId(dto.signedBy),
      user.email,
      dto.signatureHash,
      dto.signatureUrl,
    );
  }

  @Post('reports/:id/archive')
  @Roles('owner', 'admin')
  async archiveReport(
    @Param('id') id: string,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.reportService.archive(
      new Types.ObjectId(id),
      companyId,
      user._id,
      user.email,
    );
  }

  // ==================== MEETINGS ====================

  @Get('meetings')
  @Roles('owner', 'admin', 'manager', 'member')
  async getMeetings(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.meetingService.findAll(companyId);
  }

  @Get('meetings/upcoming')
  @Roles('owner', 'admin', 'manager', 'member')
  async getUpcomingMeetings(
    @Req() request: RequestWithUser,
    @Query('days') days?: number,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.meetingService.getUpcomingMeetings(companyId, days || 30);
  }

  @Get('meetings/:id')
  @Roles('owner', 'admin', 'manager', 'member')
  async getMeeting(@Param('id') id: string) {
    return this.meetingService.findById(new Types.ObjectId(id));
  }

  @Post('meetings')
  @Roles('owner', 'admin', 'manager')
  async createMeeting(
    @Req() request: RequestWithUser,
    @Body() dto: CreateMeetingDto,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.meetingService.create(
      companyId,
      {
        title: dto.title,
        date: new Date(dto.date),
        time: dto.time,
        location: dto.location,
        meetingType: dto.meetingType,
        participants: dto.participants?.map((p) => new Types.ObjectId(p)),
        topicsDiscussed: dto.topicsDiscussed,
        decisions: dto.decisions,
      },
      user._id,
      user.email,
    );
  }

  @Patch('meetings/:id')
  @Roles('owner', 'admin', 'manager')
  async updateMeeting(
    @Param('id') id: string,
    @Body() dto: UpdateMeetingDto,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.meetingService.update(
      new Types.ObjectId(id),
      companyId,
      dto as any,
      user._id,
      user.email,
    );
  }

  @Post('meetings/:id/complete')
  @Roles('owner', 'admin', 'manager')
  async completeMeeting(
    @Param('id') id: string,
    @Body() dto: CompleteMeetingDto,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.meetingService.complete(
      new Types.ObjectId(id),
      companyId,
      {
        topicsDiscussed: dto.topicsDiscussed,
        decisions: dto.decisions,
        minutesContent: dto.minutesContent,
      },
      user._id,
      user.email,
    );
  }

  @Delete('meetings/:id')
  @Roles('owner', 'admin')
  async deleteMeeting(
    @Param('id') id: string,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    await this.meetingService.remove(
      new Types.ObjectId(id),
      companyId,
      user._id,
      user.email,
    );
    return { message: 'Meeting deleted successfully' };
  }

  // ==================== COMMITMENTS ====================

  @Get('commitments')
  @Roles('owner', 'admin', 'manager', 'member')
  async getCommitments(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.commitmentService.findAll(companyId);
  }

  @Get('commitments/stats')
  @Roles('owner', 'admin', 'manager', 'member')
  async getCommitmentStats(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.commitmentService.getCommitmentStats(companyId);
  }

  @Get('commitments/my')
  @Roles('owner', 'admin', 'manager', 'member')
  async getMyCommitments(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.commitmentService.findByResponsibleUser(companyId, user._id);
  }

  @Get('commitments/meeting/:meetingId')
  @Roles('owner', 'admin', 'manager', 'member')
  async getCommitmentsByMeeting(@Param('meetingId') meetingId: string) {
    return this.commitmentService.findByMeeting(new Types.ObjectId(meetingId));
  }

  @Get('commitments/:id')
  @Roles('owner', 'admin', 'manager', 'member')
  async getCommitment(@Param('id') id: string) {
    return this.commitmentService.findById(new Types.ObjectId(id));
  }

  @Post('commitments')
  @Roles('owner', 'admin', 'manager')
  async createCommitment(
    @Req() request: RequestWithUser,
    @Body() dto: CreateCommitmentDto,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.commitmentService.create(
      companyId,
      {
        title: dto.title,
        description: dto.description,
        responsibleUser: new Types.ObjectId(dto.responsibleUser),
        dueDate: new Date(dto.dueDate),
        priority: dto.priority,
        meetingId: dto.meetingId ? new Types.ObjectId(dto.meetingId) : undefined,
      },
      user._id,
      user.email,
    );
  }

  @Patch('commitments/:id')
  @Roles('owner', 'admin', 'manager')
  async updateCommitment(
    @Param('id') id: string,
    @Body() dto: UpdateCommitmentDto,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.commitmentService.update(
      new Types.ObjectId(id),
      companyId,
      {
        title: dto.title,
        description: dto.description,
        responsibleUser: dto.responsibleUser ? new Types.ObjectId(dto.responsibleUser) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        priority: dto.priority,
        status: dto.status,
      },
      user._id,
      user.email,
    );
  }

  @Post('commitments/:id/complete')
  @Roles('owner', 'admin', 'manager', 'member')
  async completeCommitment(
    @Param('id') id: string,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.commitmentService.complete(
      new Types.ObjectId(id),
      companyId,
      user._id,
      user.email,
    );
  }

  @Post('commitments/:id/justify')
  @Roles('owner', 'admin', 'manager', 'member')
  async submitJustification(
    @Param('id') id: string,
    @Body() dto: SubmitJustificationDto,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.commitmentService.submitJustification(
      new Types.ObjectId(id),
      companyId,
      {
        reason: dto.reason,
        correctiveAction: dto.correctiveAction,
        newProposedDate: dto.newProposedDate ? new Date(dto.newProposedDate) : undefined,
      },
      user._id,
      user.email,
    );
  }

  @Post('commitments/:id/justify/approve')
  @Roles('owner', 'manager')
  async approveJustification(
    @Param('id') id: string,
    @Body() dto: ApproveJustificationDto,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.commitmentService.approveJustification(
      new Types.ObjectId(id),
      companyId,
      dto.approved,
      user._id,
      user.email,
      dto.rejectionReason,
    );
  }

  // ==================== HISTORY ====================

  @Get('history')
  @Roles('owner', 'admin', 'manager', 'member')
  async getHistory(
    @Req() request: RequestWithUser,
    @Query('limit') limit?: number,
    @Query('skip') skip?: number,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.historyService.findByCompany(
      companyId,
      limit || 100,
      skip || 0,
    );
  }

  @Get('history/:entityType/:entityId')
  @Roles('owner', 'admin', 'manager', 'member')
  async getEntityHistory(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.historyService.findByEntity(
      entityType,
      new Types.ObjectId(entityId),
    );
  }

  // ==================== AUTO-PROCESSING ====================

  @Post('check-alerts')
  @Roles('owner', 'admin', 'manager')
  async checkAlerts(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.accountabilityService.checkAndGenerateAlerts(companyId);
  }

  @Post('check-overdue')
  @Roles('owner', 'admin', 'manager')
  async checkOverdue(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    const count = await this.commitmentService.checkOverdueCommitments(companyId);
    return { message: `Checked ${count} overdue commitments`, overdueCount: count };
  }

  // ==================== HELPERS ====================

  private resolveCompanyId(request: RequestWithUser): Types.ObjectId {
    if (!request.companyId) throw new ForbiddenException('Missing active company context');
    return request.companyId;
  }

  private async resolveUserFromRequest(request: RequestWithUser) {
    const firebaseUid = request.user?.uid;
    if (!firebaseUid) throw new ForbiddenException('Missing authenticated user');

    const user = await this.usersService.findByFirebaseUid(firebaseUid);
    if (!user) throw new ForbiddenException('Authenticated user is not registered');
    return user;
  }
}
