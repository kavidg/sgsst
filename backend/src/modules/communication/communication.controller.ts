import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { CommunicationService } from './communication.service';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestWithUser } from '../auth/auth.types';

@Controller('communication')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class CommunicationController {
  constructor(private readonly service: CommunicationService) {}

  // ========== DASHBOARD ==========
  @Get('dashboard')
  @Roles('owner', 'admin', 'manager')
  getDashboard(@Req() request: RequestWithUser) {
    return this.service.getDashboard('', request.companyId?.toString() ?? '');
  }

  @Get('auto-compliance')
  @Roles('owner', 'admin', 'manager')
  getAutoCompliance(@Req() request: RequestWithUser) {
    return this.service.getAutoCompliance(request.companyId?.toString() ?? '');
  }

  // ========== COMMUNICATIONS ==========
  @Post()
  @Roles('owner', 'admin', 'manager')
  create(@Req() request: RequestWithUser, @CurrentUser() user: any, @Body() body: any) {
    return this.service.createComm('', request.companyId?.toString() ?? '', user?.uid || '', user?.email || '', body);
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  findAll(@Req() request: RequestWithUser) {
    return this.service.findAllComms(request.companyId?.toString() ?? '');
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.findCommById(request.companyId?.toString() ?? '', id);
  }

  @Patch(':id')
  @Roles('owner', 'admin', 'manager')
  update(@Req() request: RequestWithUser, @Param('id') id: string, @Body() body: any) {
    return this.service.updateComm(request.companyId?.toString() ?? '', id, body);
  }

  @Post(':id/publish')
  @Roles('owner', 'admin', 'manager')
  publish(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.publishComm('', request.companyId?.toString() ?? '', id);
  }

  @Post(':id/archive')
  @Roles('owner', 'admin', 'manager')
  archive(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.archiveComm(request.companyId?.toString() ?? '', id);
  }

  @Delete(':id')
  @Roles('owner', 'admin', 'manager')
  delete(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.deleteComm(request.companyId?.toString() ?? '', id);
  }

  // ========== RECIPIENTS ==========
  @Get(':id/recipients')
  @Roles('owner', 'admin', 'manager')
  getRecipients(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.getRecipients(request.companyId?.toString() ?? '', id);
  }

  @Post(':id/recipients')
  @Roles('owner', 'admin', 'manager')
  addRecipients(@Req() request: RequestWithUser, @Param('id') id: string, @Body('employeeIds') employeeIds: string[]) {
    return this.service.addRecipients(request.companyId?.toString() ?? '', id, employeeIds);
  }

  // ========== READ RECEIPTS ==========
  @Post(':id/read')
  registerRead(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body('employeeId') employeeId: string,
    @Body('employeeName') employeeName: string,
  ) {
    return this.service.registerRead(request.companyId?.toString() ?? '', id, employeeId, employeeName);
  }

  @Get(':id/read-receipts')
  @Roles('owner', 'admin', 'manager')
  getReadReceipts(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.getReadReceipts(request.companyId?.toString() ?? '', id);
  }

  // ========== SIGNATURES ==========
  @Post(':id/sign')
  addSignature(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() body: { employeeId: string; employeeName: string; employeeEmail: string; signatureHash?: string; signatureUrl?: string; comments?: string },
  ) {
    return this.service.addSignature(request.companyId?.toString() ?? '', id, body.employeeId, body.employeeName, body.employeeEmail, body);
  }

  @Get(':id/signatures')
  @Roles('owner', 'admin', 'manager')
  getSignatures(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.getSignatures(request.companyId?.toString() ?? '', id);
  }

  // ========== CAMPAIGNS ==========
  @Post('campaigns')
  @Roles('owner', 'admin', 'manager')
  createCampaign(@Req() request: RequestWithUser, @Body() body: any) {
    return this.service.createCampaign(request.companyId?.toString() ?? '', body);
  }

  @Get('campaigns')
  @Roles('owner', 'admin', 'manager')
  findAllCampaigns(@Req() request: RequestWithUser) {
    return this.service.findAllCampaigns(request.companyId?.toString() ?? '');
  }

  @Patch('campaigns/:id')
  @Roles('owner', 'admin', 'manager')
  updateCampaign(@Req() request: RequestWithUser, @Param('id') id: string, @Body() body: any) {
    return this.service.updateCampaign(request.companyId?.toString() ?? '', id, body);
  }

  @Delete('campaigns/:id')
  @Roles('owner', 'admin', 'manager')
  deleteCampaign(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.deleteCampaign(request.companyId?.toString() ?? '', id);
  }

  // ========== SURVEYS ==========
  @Post('surveys')
  @Roles('owner', 'admin', 'manager')
  createSurvey(@Req() request: RequestWithUser, @Body() body: any) {
    return this.service.createSurvey(request.companyId?.toString() ?? '', body);
  }

  @Get('surveys')
  @Roles('owner', 'admin', 'manager')
  findAllSurveys(@Req() request: RequestWithUser) {
    return this.service.findAllSurveys(request.companyId?.toString() ?? '');
  }

  @Patch('surveys/:id')
  @Roles('owner', 'admin', 'manager')
  updateSurvey(@Req() request: RequestWithUser, @Param('id') id: string, @Body() body: any) {
    return this.service.updateSurvey(request.companyId?.toString() ?? '', id, body);
  }

  @Delete('surveys/:id')
  @Roles('owner', 'admin', 'manager')
  deleteSurvey(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.deleteSurvey(request.companyId?.toString() ?? '', id);
  }

  @Post('surveys/:id/respond')
  submitSurveyResponse(@Req() request: RequestWithUser, @Param('id') surveyId: string, @Body() body: any) {
    return this.service.submitSurveyResponse(request.companyId?.toString() ?? '', { ...body, surveyId });
  }

  @Get('surveys/:id/results')
  @Roles('owner', 'admin', 'manager')
  getSurveyResults(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.getSurveyResults(request.companyId?.toString() ?? '', id);
  }

  @Get('surveys/:id/stats')
  @Roles('owner', 'admin', 'manager')
  getSurveyStats(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.getSurveyStats(request.companyId?.toString() ?? '', id);
  }

  // ========== MAILBOX ==========
  @Post('mailbox')
  createMailbox(@Req() request: RequestWithUser, @Body() body: any) {
    return this.service.createMailboxEntry(request.companyId?.toString() ?? '', body, body.employeeId);
  }

  @Get('mailbox')
  @Roles('owner', 'admin', 'manager')
  findAllMailbox(@Req() request: RequestWithUser, @Query('status') status?: string) {
    return this.service.findAllMailbox(request.companyId?.toString() ?? '', status);
  }

  @Post('mailbox/:id/respond')
  respondMailbox(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body('response') response: string,
    @Body('respondedBy') respondedBy: string,
  ) {
    return this.service.respondMailbox(request.companyId?.toString() ?? '', id, response, respondedBy);
  }

  @Delete('mailbox/:id')
  @Roles('owner', 'admin', 'manager')
  deleteMailbox(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.deleteMailboxEntry(request.companyId?.toString() ?? '', id);
  }

  // ========== HISTORY ==========
  @Get('history')
  @Roles('owner', 'admin', 'manager')
  getHistory(
    @Req() request: RequestWithUser,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.service.getHistory(request.companyId?.toString() ?? '', Number(limit) || 100, Number(skip) || 0);
  }

  @Get('history/:entityType/:entityId')
  @Roles('owner', 'admin', 'manager')
  getEntityHistory(@Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    return this.service.getEntityHistory(entityType, entityId);
  }

  // ========== ALERTS ==========
  @Post('check-alerts')
  @Roles('owner', 'admin', 'manager')
  checkAlerts(@Req() request: RequestWithUser) {
    return this.service.checkAlerts(request.companyId?.toString() ?? '');
  }
}
