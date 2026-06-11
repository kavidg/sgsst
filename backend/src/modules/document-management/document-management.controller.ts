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
import { DocumentMasterService } from './services/document-master.service';
import { DocumentRetentionService } from './services/document-retention.service';
import { DocumentSearchService } from './services/document-search.service';
import { DocumentHistoryService } from './services/document-history.service';
import { DocumentAlertService } from './services/document-alert.service';
import {
  CreateDocumentDto,
  UpdateDocumentDto,
  UploadDocumentVersionDto,
  SubmitForApprovalDto,
  ApproveDocumentDto,
  RejectDocumentDto,
  CreateRetentionRuleDto,
  UpdateRetentionRuleDto,
  SearchDocumentDto,
  ChangeDocumentStatusDto,
} from './dto/create-document.dto';
import { DocumentType, DocumentStatus } from './schemas/document-master.schema';

@Controller('document-management')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class DocumentManagementController {
  constructor(
    private readonly documentService: DocumentMasterService,
    private readonly retentionService: DocumentRetentionService,
    private readonly searchService: DocumentSearchService,
    private readonly historyService: DocumentHistoryService,
    private readonly alertService: DocumentAlertService,
    private readonly usersService: UsersService,
  ) {}

  // ==================== DOCUMENT CRUD ====================

  @Get()
  @Roles('owner', 'admin', 'manager', 'member')
  async findAll(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.documentService.findAll(companyId);
  }

  @Get('stats')
  @Roles('owner', 'admin', 'manager', 'member')
  async getStats(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.searchService.getDocumentStats(companyId);
  }

  @Get('search')
  @Roles('owner', 'admin', 'manager', 'member')
  async search(@Req() request: RequestWithUser, @Query() params: SearchDocumentDto) {
    const companyId = this.resolveCompanyId(request);
    return this.searchService.search({
      companyId,
      query: params.query,
      documentType: params.documentType,
      status: params.status,
      process: params.process,
      ownerUser: params.ownerUser ? new Types.ObjectId(params.ownerUser) : undefined,
      approvalUser: params.approvalUser ? new Types.ObjectId(params.approvalUser) : undefined,
      version: params.version,
      expirationBefore: params.expirationBefore ? new Date(params.expirationBefore) : undefined,
      expirationAfter: params.expirationAfter ? new Date(params.expirationAfter) : undefined,
      code: params.code,
      name: params.name,
      year: params.year ? Number(params.year) : undefined,
    });
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager', 'member')
  async findOne(@Param('id') id: string) {
    return this.documentService.findById(new Types.ObjectId(id));
  }

  @Get('code/:code')
  @Roles('owner', 'admin', 'manager', 'member')
  async findByCode(@Req() request: RequestWithUser, @Param('code') code: string) {
    const companyId = this.resolveCompanyId(request);
    return this.documentService.findByCompanyAndCode(companyId, code);
  }

  @Post()
  @Roles('owner', 'admin', 'manager')
  async create(@Req() request: RequestWithUser, @Body() dto: CreateDocumentDto) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.documentService.create(companyId, {
      code: dto.code,
      name: dto.name,
      description: dto.description,
      documentType: dto.documentType,
      process: dto.process,
      version: dto.version,
      status: dto.status,
      ownerUser: dto.ownerUser ? new Types.ObjectId(dto.ownerUser) : undefined,
      approvalUser: dto.approvalUser ? new Types.ObjectId(dto.approvalUser) : undefined,
      approvalDate: dto.approvalDate ? new Date(dto.approvalDate) : undefined,
      expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : undefined,
    }, user);
  }

  @Patch(':id')
  @Roles('owner', 'admin', 'manager')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.documentService.update(
      new Types.ObjectId(id),
      companyId,
      dto as unknown as Record<string, unknown>,
      user,
    );
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  async remove(@Param('id') id: string, @Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    await this.documentService.remove(new Types.ObjectId(id), companyId, user);
    return { message: 'Document deleted successfully' };
  }

  // ==================== STATUS MANAGEMENT ====================

  @Patch(':id/status')
  @Roles('owner', 'admin', 'manager')
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeDocumentStatusDto,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.documentService.updateStatus(
      new Types.ObjectId(id),
      companyId,
      dto.status,
      dto.reason,
      user,
    );
  }

  // ==================== VERSIONING ====================

  @Post(':id/versions')
  @Roles('owner', 'admin', 'manager')
  async uploadVersion(
    @Param('id') id: string,
    @Body() dto: UploadDocumentVersionDto,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.documentService.uploadVersion(
      new Types.ObjectId(id),
      companyId,
      dto.fileUrl,
      dto.changeDescription,
      user,
    );
  }

  @Get(':id/versions')
  @Roles('owner', 'admin', 'manager', 'member')
  async getVersions(@Param('id') id: string) {
    return this.documentService.getVersions(new Types.ObjectId(id));
  }

  @Get(':id/versions/current')
  @Roles('owner', 'admin', 'manager', 'member')
  async getCurrentVersion(@Param('id') id: string) {
    return this.documentService.getCurrentVersion(new Types.ObjectId(id));
  }

  // ==================== APPROVAL WORKFLOW ====================

  @Post(':id/submit-approval')
  @Roles('owner', 'admin', 'manager')
  async submitForApproval(
    @Param('id') id: string,
    @Body() dto: SubmitForApprovalDto,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.documentService.submitForApproval(
      new Types.ObjectId(id),
      companyId,
      user._id,
      dto.comments,
    );
  }

  @Get('approvals/pending')
  @Roles('owner', 'admin', 'manager')
  async getPendingApprovals(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.documentService.getPendingApprovals(companyId);
  }

  @Get('approvals/history')
  @Roles('owner', 'admin', 'manager', 'member')
  async getApprovalHistory(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.documentService.getApprovalHistory(companyId);
  }

  @Post('approvals/:approvalId/approve')
  @Roles('owner', 'manager')
  async approve(
    @Param('approvalId') approvalId: string,
    @Body() dto: ApproveDocumentDto,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.documentService.approve(
      new Types.ObjectId(approvalId),
      companyId,
      new Types.ObjectId(dto.approvedBy),
      dto.comments,
      dto.signatureHash,
      dto.signatureUrl,
      dto.signerName,
      dto.signerEmail,
    );
  }

  @Post('approvals/:approvalId/reject')
  @Roles('owner', 'manager')
  async reject(
    @Param('approvalId') approvalId: string,
    @Body() dto: RejectDocumentDto,
  ) {
    return this.documentService.reject(
      new Types.ObjectId(approvalId),
      dto.rejectionReason,
      dto.comments,
    );
  }

  // ==================== DIGITAL SIGNATURES ====================

  @Post(':id/signatures')
  @Roles('owner', 'admin', 'manager')
  async addSignature(
    @Param('id') id: string,
    @Body() dto: { signerName: string; signerEmail?: string; signatureHash?: string; signatureUrl?: string; comments?: string; isExecutiveSignature?: boolean },
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.documentService.addSignature({
      companyId,
      documentId: new Types.ObjectId(id),
      userId: user._id,
      signerName: dto.signerName,
      signerEmail: dto.signerEmail,
      signatureHash: dto.signatureHash,
      signatureUrl: dto.signatureUrl,
      comments: dto.comments,
      isExecutiveSignature: dto.isExecutiveSignature || false,
    });
  }

  @Get(':id/signatures')
  @Roles('owner', 'admin', 'manager', 'member')
  async getSignatures(@Param('id') id: string) {
    return this.documentService.getSignatures(new Types.ObjectId(id));
  }

  // ==================== RETENTION RULES ====================

  @Get('retention-rules')
  @Roles('owner', 'admin', 'manager')
  async getRetentionRules(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.retentionService.getRules(companyId);
  }

  @Post('retention-rules')
  @Roles('owner', 'admin')
  async createRetentionRule(
    @Req() request: RequestWithUser,
    @Body() dto: CreateRetentionRuleDto,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.retentionService.setRule({
      companyId,
      documentType: dto.documentType,
      retentionYears: dto.retentionYears,
      description: dto.description,
    });
  }

  @Patch('retention-rules/:documentType')
  @Roles('owner', 'admin')
  async updateRetentionRule(
    @Req() request: RequestWithUser,
    @Param('documentType') documentType: DocumentType,
    @Body() dto: UpdateRetentionRuleDto,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.retentionService.updateRule(companyId, documentType, dto);
  }

  @Delete('retention-rules/:documentType')
  @Roles('owner', 'admin')
  async deleteRetentionRule(
    @Req() request: RequestWithUser,
    @Param('documentType') documentType: DocumentType,
  ) {
    const companyId = this.resolveCompanyId(request);
    await this.retentionService.deleteRule(companyId, documentType);
    return { message: 'Retention rule deleted' };
  }

  // ==================== EXPIRATION ====================

  @Get(':id/expiration')
  @Roles('owner', 'admin', 'manager', 'member')
  async checkExpiration(@Param('id') id: string, @Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.retentionService.checkExpiration(companyId, new Types.ObjectId(id));
  }

  @Get('expiring/:withinDays')
  @Roles('owner', 'admin', 'manager')
  async getExpiringDocuments(
    @Req() request: RequestWithUser,
    @Param('withinDays') withinDays: number,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.retentionService.getExpiringDocuments(companyId, withinDays);
  }

  @Get('expired')
  @Roles('owner', 'admin', 'manager')
  async getExpiredDocuments(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.retentionService.getExpiredDocuments(companyId);
  }

  // ==================== HISTORY / AUDIT TRAIL ====================

  @Get(':id/history')
  @Roles('owner', 'admin', 'manager', 'member')
  async getDocumentHistory(@Param('id') id: string, @Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.historyService.findByDocument(new Types.ObjectId(id), companyId);
  }

  @Get('history/all')
  @Roles('owner', 'admin', 'manager')
  async getAllHistory(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.historyService.findByCompany(companyId);
  }

  // ==================== ALERTS ====================

  @Post('alerts/check')
  @Roles('owner', 'admin', 'manager')
  async checkAlerts(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    await this.alertService.checkExpirationAlerts(companyId);
    await this.alertService.checkDocumentStatusAlerts(companyId);
    return { message: 'Document alerts checked and generated' };
  }

  // ==================== MODULE INTEGRATION ENDPOINTS ====================

  @Post('register/policy')
  @Roles('owner', 'admin', 'manager')
  async registerPolicyDocument(
    @Body() dto: { code: string; name: string; fileUrl?: string; description?: string },
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.documentService.registerPolicyDocument({ companyId, ...dto });
  }

  @Post('register/objective')
  @Roles('owner', 'admin', 'manager')
  async registerObjectiveDocument(
    @Body() dto: { code: string; name: string; fileUrl?: string; description?: string },
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.documentService.registerObjectiveDocument({ companyId, ...dto });
  }

  @Post('register/plan')
  @Roles('owner', 'admin', 'manager')
  async registerPlanDocument(
    @Body() dto: { code: string; name: string; fileUrl?: string; description?: string },
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.documentService.registerPlanDocument({ companyId, ...dto });
  }

  @Post('register/copasst')
  @Roles('owner', 'admin', 'manager')
  async registerCopasstDocument(
    @Body() dto: { code: string; name: string; fileUrl?: string; description?: string },
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.documentService.registerCopasstDocument({ companyId, ...dto });
  }

  @Post('register/committee')
  @Roles('owner', 'admin', 'manager')
  async registerCommitteeDocument(
    @Body() dto: { code: string; name: string; fileUrl?: string; description?: string },
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.documentService.registerCommitteeDocument({ companyId, ...dto });
  }

  @Post('register/audit')
  @Roles('owner', 'admin', 'manager')
  async registerAuditDocument(
    @Body() dto: { code: string; name: string; fileUrl?: string; description?: string },
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.documentService.registerAuditDocument({ companyId, ...dto });
  }

  @Post('register/training')
  @Roles('owner', 'admin', 'manager')
  async registerTrainingDocument(
    @Body() dto: { code: string; name: string; fileUrl?: string; description?: string },
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.documentService.registerTrainingDocument({ companyId, ...dto });
  }

  @Post('register/inspection')
  @Roles('owner', 'admin', 'manager')
  async registerInspectionDocument(
    @Body() dto: { code: string; name: string; fileUrl?: string; description?: string },
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.documentService.registerInspectionDocument({ companyId, ...dto });
  }

  @Post('register/meeting-minutes')
  @Roles('owner', 'admin', 'manager')
  async registerMeetingMinutes(
    @Body() dto: { code: string; name: string; fileUrl?: string; description?: string },
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.documentService.registerMeetingMinutes({ companyId, ...dto });
  }

  @Post('register/emergency-plan')
  @Roles('owner', 'admin', 'manager')
  async registerEmergencyPlan(
    @Body() dto: { code: string; name: string; fileUrl?: string; description?: string },
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.documentService.registerEmergencyPlan({ companyId, ...dto });
  }

  @Post('register/medical-record')
  @Roles('owner', 'admin', 'manager')
  async registerMedicalRecord(
    @Body() dto: { code: string; name: string; fileUrl?: string; description?: string; expirationDate?: string },
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.documentService.registerMedicalRecord({
      companyId,
      code: dto.code,
      name: dto.name,
      fileUrl: dto.fileUrl,
      description: dto.description,
      expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : undefined,
    });
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
