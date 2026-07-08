import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { ConvivenciaService } from './convivencia.service';

@Controller('convivencia')
export class ConvivenciaController {
  constructor(private readonly convivenciaService: ConvivenciaService) {}

  @Get('summary')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager', 'member')
  getSummary(@Req() req: RequestWithUser) {
    return this.convivenciaService.getSummary(new Types.ObjectId(req.companyId as unknown as string));
  }

  @Get('current')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager', 'member')
  getCurrent(@Req() req: RequestWithUser) {
    return this.convivenciaService.getCurrent(new Types.ObjectId(req.companyId as unknown as string));
  }

  @Post('periods')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  createPeriod(@Req() req: RequestWithUser, @Body() dto: { periodName: string; startDate: string }) {
    return this.convivenciaService.createPeriod(new Types.ObjectId(req.companyId as unknown as string), dto, req.user?.email ?? 'system');
  }

  @Get('periods/:periodId/members')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager', 'member')
  getMembers(@Param('periodId') periodId: string) {
    return this.convivenciaService.getMembers(periodId);
  }

  @Post('periods/:periodId/members')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  addMember(@Param('periodId') periodId: string, @Req() req: RequestWithUser, @Body() dto: { userId: string; userName: string; committeeRole: string; representationType: string; principalType: string; startDate: string }) {
    return this.convivenciaService.addMember(periodId, dto, req.user?.email ?? 'system');
  }

  @Delete('periods/:periodId/members/:index')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  removeMember(@Param('periodId') periodId: string, @Param('index') index: string, @Req() req: RequestWithUser) {
    return this.convivenciaService.removeMember(periodId, parseInt(index), req.user?.email ?? 'system');
  }

  @Post('periods/:periodId/campaign')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  startCampaign(@Param('periodId') periodId: string, @Req() req: RequestWithUser, @Body() dto: { openingDate: string; closingDate: string; includedDepartments?: string[]; requirements?: string[] }) {
    return this.convivenciaService.startRegistrationCampaign(periodId, dto, req.user?.email ?? 'system');
  }

  @Get('campaign/:token')
  getCampaignInfo(@Param('token') token: string) {
    return this.convivenciaService.getCampaignInfo(token);
  }

  @Post('campaign/:token/register')
  registerCandidate(@Param('token') token: string, @Body() dto: { name: string; document: string; phone: string; area: string; position: string; motivation: string; acceptedTerms: boolean; email?: string; ipAddress?: string; device?: string }) {
    return this.convivenciaService.registerCandidatePublic(token, dto);
  }

  @Post('periods/:periodId/review-candidate/:index')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  reviewCandidate(@Param('periodId') periodId: string, @Param('index') index: string, @Req() req: RequestWithUser, @Body() dto: { adminStatus: 'APROBADO' | 'RECHAZADO' | 'INFO_REQUESTED'; adminComment?: string }) {
    return this.convivenciaService.reviewCandidate(periodId, parseInt(index), dto, req.user?.email ?? 'system');
  }

  @Post('periods/:periodId/voting/init')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  initVoting(@Param('periodId') periodId: string, @Req() req: RequestWithUser) {
    return this.convivenciaService.initVoting(periodId, req.user?.email ?? 'system');
  }

  @Post('elections/otp')
  sendOtp(@Body() dto: { electionId: string; document: string; phone: string }) {
    return this.convivenciaService.sendOtp(dto);
  }

  @Post('elections/vote')
  vote(@Body() dto: { electionId: string; document: string; phone: string; otpCode: string; candidateDocument: string; ipAddress?: string; device?: string }) {
    return this.convivenciaService.vote(dto);
  }

  @Get('periods/:periodId/results')
  getResults(@Param('periodId') periodId: string) {
    return this.convivenciaService.getVotingResults(periodId);
  }

  @Post('periods/:periodId/auto-committee')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  autoCreateCommittee(@Param('periodId') periodId: string, @Body() dto: { numPositions: number }, @Req() req: RequestWithUser) {
    return this.convivenciaService.autoCreateCommittee(periodId, dto.numPositions, req.user?.email ?? 'system');
  }

  @Post('periods/:periodId/meetings')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  scheduleMeeting(@Param('periodId') periodId: string, @Req() req: RequestWithUser, @Body() dto: { meetingDate: string; agenda: string; topicList?: string[] }) {
    return this.convivenciaService.scheduleMeeting(periodId, dto, req.user?.email ?? 'system');
  }

  @Post('periods/:periodId/meetings/auto-schedule')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  autoScheduleMonthlyMeetings(@Param('periodId') periodId: string, @Req() req: RequestWithUser) {
    return this.convivenciaService.autoScheduleMonthlyMeetings(periodId, req.user?.email ?? 'system');
  }

  @Patch('periods/:periodId/meetings/:index')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  updateMeeting(@Param('periodId') periodId: string, @Param('index') index: string, @Req() req: RequestWithUser, @Body() dto: Partial<{ meetingDate: string; agenda: string; development: string; status: string; attendees: string[]; topicList: string[] }>) {
    return this.convivenciaService.updateMeeting(periodId, parseInt(index), dto, req.user?.email ?? 'system');
  }

  @Post('periods/:periodId/meetings/:index/complete')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  completeMeeting(@Param('periodId') periodId: string, @Param('index') index: string, @Req() req: RequestWithUser, @Body() dto: { development: string; attendees: string[]; topicList?: string[] }) {
    return this.convivenciaService.completeMeeting(periodId, parseInt(index), dto, req.user?.email ?? 'system');
  }

  @Post('periods/:periodId/commitments')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  addCommitment(@Param('periodId') periodId: string, @Req() req: RequestWithUser, @Body() dto: { description: string; responsibleParty: string; deadline: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; meetingId?: string }) {
    return this.convivenciaService.addCommitment(periodId, dto, req.user?.email ?? 'system');
  }

  @Patch('periods/:periodId/commitments/:commitmentId')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  updateCommitment(@Param('periodId') periodId: string, @Param('commitmentId') commitmentId: string, @Req() req: RequestWithUser, @Body() dto: Partial<{ description: string; responsibleParty: string; deadline: string; priority: string; status: string; evidenceUrl: string }>) {
    return this.convivenciaService.updateCommitment(periodId, commitmentId, dto, req.user?.email ?? 'system');
  }

  @Post('periods/:periodId/evidence')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  addEvidence(@Param('periodId') periodId: string, @Req() req: RequestWithUser, @Body() dto: { type: string; title: string; fileName: string; fileUrl: string; meetingId?: string }) {
    return this.convivenciaService.addEvidence(periodId, dto, req.user?.email ?? 'system');
  }

  @Delete('periods/:periodId/evidence/:index')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  removeEvidence(@Param('periodId') periodId: string, @Param('index') index: string, @Req() req: RequestWithUser) {
    return this.convivenciaService.removeEvidence(periodId, parseInt(index), req.user?.email ?? 'system');
  }

  // ─── CASES ───
  @Post('periods/:periodId/cases')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager')
  createCase(@Param('periodId') periodId: string, @Req() req: RequestWithUser, @Body() dto: { complainantName: string; respondentName: string; description: string; isAnonymous?: boolean; evidence?: string[] }) {
    return this.convivenciaService.createCase(periodId, dto, req.user?.email ?? 'system');
  }

  @Patch('periods/:periodId/cases/:index')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager')
  updateCase(@Param('periodId') periodId: string, @Param('index') index: string, @Req() req: RequestWithUser, @Body() dto: { status?: string; assignedCommitteeMember?: string; recommendations?: string; evidence?: string[] }) {
    return this.convivenciaService.updateCase(periodId, parseInt(index), dto, req.user?.email ?? 'system');
  }

  // ─── APPROVAL ───
  @Post('periods/:periodId/submit-approval')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  submitForApproval(@Param('periodId') periodId: string, @Req() req: RequestWithUser) {
    return this.convivenciaService.submitForApproval(periodId, req.user?.email ?? 'system');
  }

  @Post('periods/:periodId/approve')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'manager')
  approvePeriod(@Param('periodId') periodId: string, @Req() req: RequestWithUser) {
    return this.convivenciaService.approve(periodId, req.user?.email ?? '', req.user?.role ?? '');
  }

  @Post('periods/:periodId/reject')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'manager')
  rejectPeriod(@Param('periodId') periodId: string, @Req() req: RequestWithUser, @Body() dto: { reason: string }) {
    if (!dto.reason || !dto.reason.trim()) throw new Error('Rejection reason is required');
    return this.convivenciaService.reject(periodId, dto.reason, req.user?.email ?? 'system');
  }

  @Get('periods/:periodId/audit')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager', 'member')
  getAuditHistory(@Param('periodId') periodId: string) {
    return this.convivenciaService.getAuditHistory(periodId);
  }

  @Get('dashboard')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager', 'member')
  getDashboard(@Req() req: RequestWithUser) {
    return this.convivenciaService.getDashboard(new Types.ObjectId(req.companyId as unknown as string));
  }
}
