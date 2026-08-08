import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { ApprovalDecision } from '../approval-workflow/enums/approval-decision.enum';
import { ApprovalEntity } from '../approval-workflow/enums/approval-entity.enum';
import { buildApprovalActor } from '../approval-workflow/helpers/approval-actor.helper';
import { ApprovalWorkflowService } from '../approval-workflow/approval-workflow.service';
import { CopasstService } from './copasst.service';

@Controller('copasst')
export class CopasstController {
  constructor(
    private readonly copasstService: CopasstService,
    private readonly approvalWorkflowService: ApprovalWorkflowService,
  ) {}

  // ─── SUMMARY ───
  @Get('summary')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager', 'member')
  getSummary(@Req() req: RequestWithUser) {
    return this.copasstService.getSummary(new Types.ObjectId(req.companyId as unknown as string));
  }

  // ─── PERIODS ───
  @Get('current')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager', 'member')
  getCurrent(@Req() req: RequestWithUser) {
    return this.copasstService.getCurrent(new Types.ObjectId(req.companyId as unknown as string));
  }

  @Post('periods')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  createPeriod(@Req() req: RequestWithUser, @Body() dto: { periodName: string; startDate: string }) {
    return this.copasstService.createPeriod(new Types.ObjectId(req.companyId as unknown as string), dto, req.user?.email ?? 'system');
  }

  @Patch('periods/:periodId')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  updatePeriod(@Param('periodId') periodId: string, @Body() dto: Partial<{ periodName: string; startDate: string; endDate: string; status: string }>) {
    return this.copasstService.updatePeriod(periodId, dto);
  }

  // ─── MEMBERS ───
  @Get('periods/:periodId/members')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager', 'member')
  getMembers(@Param('periodId') periodId: string) {
    return this.copasstService.getMembers(periodId);
  }

  @Post('periods/:periodId/members')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  addMember(@Param('periodId') periodId: string, @Req() req: RequestWithUser, @Body() dto: {
    userId: string; userName: string; committeeRole: string;
    representationType: string; principalType: string; startDate: string;
  }) {
    return this.copasstService.addMember(periodId, dto, req.user?.email ?? 'system');
  }

  @Delete('periods/:periodId/members/:index')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  removeMember(@Param('periodId') periodId: string, @Param('index') index: string, @Req() req: RequestWithUser) {
    return this.copasstService.removeMember(periodId, parseInt(index), req.user?.email ?? 'system');
  }

  // ─── REGISTRATION CAMPAIGN ───
  @Post('periods/:periodId/campaign')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  startCampaign(@Param('periodId') periodId: string, @Req() req: RequestWithUser, @Body() dto: {
    openingDate: string; closingDate: string; includedDepartments?: string[]; requirements?: string[];
  }) {
    return this.copasstService.startRegistrationCampaign(periodId, dto, req.user?.email ?? 'system');
  }

  @Get('campaign/:token')
  getCampaignInfo(@Param('token') token: string) {
    return this.copasstService.getCampaignInfo(token);
  }

  @Post('campaign/:token/register')
  registerCandidate(@Param('token') token: string, @Body() dto: {
    name: string; document: string; phone: string; area: string;
    position: string; motivation: string; acceptedTerms: boolean;
    email?: string; ipAddress?: string; device?: string;
  }) {
    return this.copasstService.registerCandidatePublic(token, dto);
  }

  @Post('periods/:periodId/review-candidate/:index')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  reviewCandidate(@Param('periodId') periodId: string, @Param('index') index: string, @Req() req: RequestWithUser, @Body() dto: {
    adminStatus: 'APROBADO' | 'RECHAZADO' | 'INFO_REQUESTED'; adminComment?: string;
  }) {
    return this.copasstService.reviewCandidate(periodId, parseInt(index), dto, req.user?.email ?? 'system');
  }

  // ─── VOTING ───
  @Post('periods/:periodId/voting/init')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  initVoting(@Param('periodId') periodId: string, @Req() req: RequestWithUser) {
    return this.copasstService.initVoting(periodId, req.user?.email ?? 'system');
  }

  @Post('elections/otp')
  sendOtp(@Body() dto: { electionId: string; document: string; phone: string }) {
    return this.copasstService.sendOtp(dto);
  }

  @Post('elections/vote')
  vote(@Body() dto: {
    electionId: string; document: string; phone: string;
    otpCode: string; candidateDocument: string; ipAddress?: string; device?: string;
  }) {
    return this.copasstService.vote(dto);
  }

  @Get('periods/:periodId/results')
  getResults(@Param('periodId') periodId: string) {
    return this.copasstService.getVotingResults(periodId);
  }

  @Post('periods/:periodId/auto-committee')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  autoCreateCommittee(@Param('periodId') periodId: string, @Body() dto: { numPositions: number }, @Req() req: RequestWithUser) {
    return this.copasstService.autoCreateCommittee(periodId, dto.numPositions, req.user?.email ?? 'system');
  }

  // ─── MEETINGS ───
  @Post('periods/:periodId/meetings')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  scheduleMeeting(@Param('periodId') periodId: string, @Req() req: RequestWithUser, @Body() dto: {
    meetingDate: string; agenda: string; topicList?: string[];
  }) {
    return this.copasstService.scheduleMeeting(periodId, dto, req.user?.email ?? 'system');
  }

  @Post('periods/:periodId/meetings/auto-schedule')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  autoScheduleMonthlyMeetings(@Param('periodId') periodId: string, @Req() req: RequestWithUser) {
    return this.copasstService.autoScheduleMonthlyMeetings(periodId, req.user?.email ?? 'system');
  }

  @Patch('periods/:periodId/meetings/:index')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  updateMeeting(@Param('periodId') periodId: string, @Param('index') index: string, @Req() req: RequestWithUser, @Body() dto: Partial<{
    meetingDate: string; agenda: string; development: string; status: string;
    attendees: string[]; topicList: string[];
  }>) {
    return this.copasstService.updateMeeting(periodId, parseInt(index), dto, req.user?.email ?? 'system');
  }

  @Post('periods/:periodId/meetings/:index/complete')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  completeMeeting(@Param('periodId') periodId: string, @Param('index') index: string, @Req() req: RequestWithUser, @Body() dto: {
    development: string; attendees: string[]; topicList?: string[];
  }) {
    return this.copasstService.completeMeeting(periodId, parseInt(index), dto, req.user?.email ?? 'system');
  }

  // ─── COMMITMENTS ───
  @Post('periods/:periodId/commitments')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  addCommitment(@Param('periodId') periodId: string, @Req() req: RequestWithUser, @Body() dto: {
    description: string; responsibleParty: string; deadline: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; meetingId?: string;
  }) {
    return this.copasstService.addCommitment(periodId, dto, req.user?.email ?? 'system');
  }

  @Patch('periods/:periodId/commitments/:commitmentId')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  updateCommitment(@Param('periodId') periodId: string, @Param('commitmentId') commitmentId: string, @Req() req: RequestWithUser, @Body() dto: Partial<{
    description: string; responsibleParty: string; deadline: string;
    priority: string; status: string; evidenceUrl: string;
  }>) {
    return this.copasstService.updateCommitment(periodId, commitmentId, dto, req.user?.email ?? 'system');
  }

  // ─── EVIDENCE ───
  @Post('periods/:periodId/evidence')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  addEvidence(@Param('periodId') periodId: string, @Req() req: RequestWithUser, @Body() dto: {
    type: string; title: string; fileName: string; fileUrl: string; meetingId?: string;
  }) {
    return this.copasstService.addEvidence(periodId, dto, req.user?.email ?? 'system');
  }

  @Delete('periods/:periodId/evidence/:index')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  removeEvidence(@Param('periodId') periodId: string, @Param('index') index: string, @Req() req: RequestWithUser) {
    return this.copasstService.removeEvidence(periodId, parseInt(index), req.user?.email ?? 'system');
  }

  // ─── APPROVAL ───
  @Post('periods/:periodId/submit-approval')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  async submitForApproval(@Param('periodId') periodId: string, @Req() req: RequestWithUser) {
    const userEmail = req.user?.email ?? 'system';
    const period = await this.copasstService.submitForApproval(periodId, userEmail);

    // Crear la solicitud de aprobación en el Approval Workflow Core.
    await this.approvalWorkflowService.createRequest(
      req.companyId?.toString() ?? period.companyId.toString(),
      {
        module: ApprovalEntity.COPASST,
        entityType: 'CopasstPeriod',
        entityId: periodId,
        assignedRoles: ['owner', 'manager'],
        comments: 'Aprobación del periodo COPASST',
      },
      buildApprovalActor({
        userId: req.user?._id,
        firebaseUid: req.user?.uid,
        email: req.user?.email,
        role: req.user?.role,
      }),
    );

    return period;
  }

  @Post('periods/:periodId/approve')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'manager')
  async approvePeriod(@Param('periodId') periodId: string, @Req() req: RequestWithUser) {
    // Delegar la aprobación al Approval Workflow Core, que reutiliza
    // CopasstService.approve a través del adapter (conserva APPROVED_AND_SIGNED,
    // acta PDF, auditHistory y alertas). La respuesta conserva compatibilidad.
    const result = await this.approvalWorkflowService.decideAndApply(
      await this.resolveCompanyId(req, periodId),
      ApprovalEntity.COPASST,
      periodId,
      {
        decision: ApprovalDecision.APPROVED,
        metadata: {
          signerEmail: req.user?.email,
          signerRole: req.user?.role,
        },
      },
      buildApprovalActor({
        userId: req.user?._id,
        firebaseUid: req.user?.uid,
        email: req.user?.email,
        role: req.user?.role,
      }),
    );

    return result.applied;
  }

  @Post('periods/:periodId/reject')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'manager')
  async rejectPeriod(@Param('periodId') periodId: string, @Req() req: RequestWithUser, @Body() dto: { reason: string }) {
    if (!dto.reason || !dto.reason.trim()) throw new Error('Rejection reason is required');

    // Delegar el rechazo al Approval Workflow Core, que reutiliza
    // CopasstService.reject a través del adapter.
    const result = await this.approvalWorkflowService.decideAndApply(
      await this.resolveCompanyId(req, periodId),
      ApprovalEntity.COPASST,
      periodId,
      {
        decision: ApprovalDecision.REJECTED,
        reason: dto.reason,
      },
      buildApprovalActor({
        userId: req.user?._id,
        firebaseUid: req.user?.uid,
        email: req.user?.email,
        role: req.user?.role,
      }),
    );

    return result.applied;
  }

  /**
   * Resuelve el companyId: lo toma del request (guardias) o, como fallback,
   * lo lee del periodo para mantener consistencia en los tres endpoints.
   */
  private async resolveCompanyId(req: RequestWithUser, periodId: string): Promise<string> {
    if (req.companyId) return req.companyId.toString();
    const period = await this.copasstService.findById(new Types.ObjectId(periodId));
    return period.companyId.toString();
  }

  // ─── AUDIT ───
  @Get('periods/:periodId/audit')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager', 'member')
  getAuditHistory(@Param('periodId') periodId: string) {
    return this.copasstService.getAuditHistory(periodId);
  }

  // ─── DASHBOARD ───
  @Get('dashboard')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager', 'member')
  getDashboard(@Req() req: RequestWithUser) {
    return this.copasstService.getDashboard(new Types.ObjectId(req.companyId as unknown as string));
  }
}
