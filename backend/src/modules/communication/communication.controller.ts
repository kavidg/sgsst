import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Headers, UseGuards } from '@nestjs/common';
import { CommunicationService } from './communication.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('communication')
@UseGuards(FirebaseAuthGuard)
export class CommunicationController {
  constructor(private readonly service: CommunicationService) {}

  private getCompanyId(@Headers('x-company-id') companyId: string): string {
    return companyId;
  }

  // ========== DASHBOARD ==========
  @Get('dashboard')
  getDashboard(@Headers('x-company-id') companyId: string) {
    return this.service.getDashboard('', this.getCompanyId(companyId));
  }

  @Get('auto-compliance')
  getAutoCompliance(@Headers('x-company-id') companyId: string) {
    return this.service.getAutoCompliance(this.getCompanyId(companyId));
  }

  // ========== COMMUNICATIONS ==========
  @Post()
  create(@Headers('x-company-id') companyId: string, @CurrentUser() user: any, @Body() body: any) {
    return this.service.createComm('', this.getCompanyId(companyId), user?.uid || '', user?.email || '', body);
  }

  @Get()
  findAll(@Headers('x-company-id') companyId: string) {
    return this.service.findAllComms(this.getCompanyId(companyId));
  }

  @Get(':id')
  findOne(@Headers('x-company-id') companyId: string, @Param('id') id: string) {
    return this.service.findCommById(this.getCompanyId(companyId), id);
  }

  @Patch(':id')
  update(@Headers('x-company-id') companyId: string, @Param('id') id: string, @Body() body: any) {
    return this.service.updateComm(this.getCompanyId(companyId), id, body);
  }

  @Post(':id/publish')
  publish(@Headers('x-company-id') companyId: string, @Param('id') id: string) {
    return this.service.publishComm('', this.getCompanyId(companyId), id);
  }

  @Post(':id/archive')
  archive(@Headers('x-company-id') companyId: string, @Param('id') id: string) {
    return this.service.archiveComm(this.getCompanyId(companyId), id);
  }

  @Delete(':id')
  delete(@Headers('x-company-id') companyId: string, @Param('id') id: string) {
    return this.service.deleteComm(this.getCompanyId(companyId), id);
  }

  // ========== RECIPIENTS ==========
  @Get(':id/recipients')
  getRecipients(@Headers('x-company-id') companyId: string, @Param('id') id: string) {
    return this.service.getRecipients(this.getCompanyId(companyId), id);
  }

  @Post(':id/recipients')
  addRecipients(@Headers('x-company-id') companyId: string, @Param('id') id: string, @Body('employeeIds') employeeIds: string[]) {
    return this.service.addRecipients(this.getCompanyId(companyId), id, employeeIds);
  }

  // ========== READ RECEIPTS ==========
  @Post(':id/read')
  registerRead(
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body('employeeId') employeeId: string,
    @Body('employeeName') employeeName: string,
  ) {
    return this.service.registerRead(this.getCompanyId(companyId), id, employeeId, employeeName);
  }

  @Get(':id/read-receipts')
  getReadReceipts(@Headers('x-company-id') companyId: string, @Param('id') id: string) {
    return this.service.getReadReceipts(this.getCompanyId(companyId), id);
  }

  // ========== SIGNATURES ==========
  @Post(':id/sign')
  addSignature(
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() body: { employeeId: string; employeeName: string; employeeEmail: string; signatureHash?: string; signatureUrl?: string; comments?: string },
  ) {
    return this.service.addSignature(this.getCompanyId(companyId), id, body.employeeId, body.employeeName, body.employeeEmail, body);
  }

  @Get(':id/signatures')
  getSignatures(@Headers('x-company-id') companyId: string, @Param('id') id: string) {
    return this.service.getSignatures(this.getCompanyId(companyId), id);
  }

  // ========== CAMPAIGNS ==========
  @Post('campaigns')
  createCampaign(@Headers('x-company-id') companyId: string, @Body() body: any) {
    return this.service.createCampaign(this.getCompanyId(companyId), body);
  }

  @Get('campaigns')
  findAllCampaigns(@Headers('x-company-id') companyId: string) {
    return this.service.findAllCampaigns(this.getCompanyId(companyId));
  }

  @Patch('campaigns/:id')
  updateCampaign(@Headers('x-company-id') companyId: string, @Param('id') id: string, @Body() body: any) {
    return this.service.updateCampaign(this.getCompanyId(companyId), id, body);
  }

  @Delete('campaigns/:id')
  deleteCampaign(@Headers('x-company-id') companyId: string, @Param('id') id: string) {
    return this.service.deleteCampaign(this.getCompanyId(companyId), id);
  }

  // ========== SURVEYS ==========
  @Post('surveys')
  createSurvey(@Headers('x-company-id') companyId: string, @Body() body: any) {
    return this.service.createSurvey(this.getCompanyId(companyId), body);
  }

  @Get('surveys')
  findAllSurveys(@Headers('x-company-id') companyId: string) {
    return this.service.findAllSurveys(this.getCompanyId(companyId));
  }

  @Patch('surveys/:id')
  updateSurvey(@Headers('x-company-id') companyId: string, @Param('id') id: string, @Body() body: any) {
    return this.service.updateSurvey(this.getCompanyId(companyId), id, body);
  }

  @Delete('surveys/:id')
  deleteSurvey(@Headers('x-company-id') companyId: string, @Param('id') id: string) {
    return this.service.deleteSurvey(this.getCompanyId(companyId), id);
  }

  @Post('surveys/:id/respond')
  submitSurveyResponse(@Headers('x-company-id') companyId: string, @Param('id') surveyId: string, @Body() body: any) {
    return this.service.submitSurveyResponse(this.getCompanyId(companyId), { ...body, surveyId });
  }

  @Get('surveys/:id/results')
  getSurveyResults(@Headers('x-company-id') companyId: string, @Param('id') id: string) {
    return this.service.getSurveyResults(this.getCompanyId(companyId), id);
  }

  @Get('surveys/:id/stats')
  getSurveyStats(@Headers('x-company-id') companyId: string, @Param('id') id: string) {
    return this.service.getSurveyStats(this.getCompanyId(companyId), id);
  }

  // ========== MAILBOX ==========
  @Post('mailbox')
  createMailbox(@Headers('x-company-id') companyId: string, @Body() body: any) {
    return this.service.createMailboxEntry(this.getCompanyId(companyId), body, body.employeeId);
  }

  @Get('mailbox')
  findAllMailbox(@Headers('x-company-id') companyId: string, @Query('status') status?: string) {
    return this.service.findAllMailbox(this.getCompanyId(companyId), status);
  }

  @Post('mailbox/:id/respond')
  respondMailbox(
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body('response') response: string,
    @Body('respondedBy') respondedBy: string,
  ) {
    return this.service.respondMailbox(this.getCompanyId(companyId), id, response, respondedBy);
  }

  @Delete('mailbox/:id')
  deleteMailbox(@Headers('x-company-id') companyId: string, @Param('id') id: string) {
    return this.service.deleteMailboxEntry(this.getCompanyId(companyId), id);
  }

  // ========== HISTORY ==========
  @Get('history')
  getHistory(
    @Headers('x-company-id') companyId: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.service.getHistory(this.getCompanyId(companyId), Number(limit) || 100, Number(skip) || 0);
  }

  @Get('history/:entityType/:entityId')
  getEntityHistory(@Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    return this.service.getEntityHistory(entityType, entityId);
  }

  // ========== ALERTS ==========
  @Post('check-alerts')
  checkAlerts(@Headers('x-company-id') companyId: string) {
    return this.service.checkAlerts(this.getCompanyId(companyId));
  }
}
