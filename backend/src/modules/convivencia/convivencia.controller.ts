import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
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
import { UserDocument } from '../users/schemas/user.schema';
import { ConvivenciaDocumentService } from './convivencia-document.service';
import { ConvivenciaService } from './convivencia.service';

@Controller('convivencia')
export class ConvivenciaController {
  constructor(
    private readonly convivenciaService: ConvivenciaService,
    private readonly approvalWorkflowService: ApprovalWorkflowService,
    // Fase 5 (1.1.8): generación documental del Comité de Convivencia.
    private readonly convivenciaDocumentService: ConvivenciaDocumentService,
  ) {}

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

  /**
   * Fase 6 (1.1.8) — Snapshot de cumplimiento del Comité de Convivencia.
   *
   * Endpoint READ-ONLY: delega directamente en ConvivenciaService
   * .getComplianceSnapshot(companyId), la ÚNICA fuente de verdad del estado de
   * cumplimiento (Fase 2). NO duplica ni traslada resolveCompliance() al
   * controller, NO acepta companyId desde query/body (siempre req.companyId
   * del contexto autenticado) y NO persiste nada. Propaga NotFoundException del
   * dominio cuando no existe periodo vigente.
   */
  @Get('compliance')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager', 'member')
  getCompliance(@Req() req: RequestWithUser) {
    return this.convivenciaService.getComplianceSnapshot(this.companyIdOf(req));
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
  getMembers(@Req() req: RequestWithUser, @Param('periodId') periodId: string) {
    // Fase 1: companyId SIEMPRE del contexto autenticado (el dominio valida pertenencia).
    return this.convivenciaService.getMembers(this.companyIdOf(req), periodId);
  }

  @Post('periods/:periodId/members')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  addMember(@Param('periodId') periodId: string, @Req() req: RequestWithUser, @Body() dto: { userId: string; userName: string; committeeRole: string; representationType: string; principalType: string; startDate: string }) {
    return this.convivenciaService.addMember(this.companyIdOf(req), periodId, dto, req.user?.email ?? 'system');
  }

  @Delete('periods/:periodId/members/:index')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  removeMember(@Param('periodId') periodId: string, @Param('index') index: string, @Req() req: RequestWithUser) {
    return this.convivenciaService.removeMember(this.companyIdOf(req), periodId, parseInt(index), req.user?.email ?? 'system');
  }

  @Post('periods/:periodId/campaign')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  startCampaign(@Param('periodId') periodId: string, @Req() req: RequestWithUser, @Body() dto: { openingDate: string; closingDate: string; includedDepartments?: string[]; requirements?: string[] }) {
    return this.convivenciaService.startRegistrationCampaign(this.companyIdOf(req), periodId, dto, req.user?.email ?? 'system');
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
    return this.convivenciaService.reviewCandidate(this.companyIdOf(req), periodId, parseInt(index), dto, req.user?.email ?? 'system');
  }

  @Post('periods/:periodId/voting/init')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  initVoting(@Param('periodId') periodId: string, @Req() req: RequestWithUser) {
    return this.convivenciaService.initVoting(this.companyIdOf(req), periodId, req.user?.email ?? 'system');
  }

  /**
   * F7B-3 (1.1.8): cierre administrativo de la elección (OPEN → CLOSED).
   * companyId SIEMPRE del contexto autenticado (el dominio valida pertenencia);
   * nunca se acepta companyId del body/query.
   */
  @Post('periods/:periodId/voting/close')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  closeVoting(@Param('periodId') periodId: string, @Req() req: RequestWithUser) {
    return this.convivenciaService.closeVoting(this.companyIdOf(req), periodId, req.user?.email ?? 'system');
  }

  @Post('elections/otp')
  sendOtp(@Body() dto: { electionId: string; document: string; phone: string }) {
    return this.convivenciaService.sendOtp(dto);
  }

  @Post('elections/vote')
  vote(@Body() dto: { electionId: string; document: string; phone: string; otpCode: string; candidateDocument: string; ipAddress?: string; device?: string }) {
    return this.convivenciaService.vote(dto);
  }

  /**
   * Resultados electorales 1.1.8 (F7B-4).
   *
   * Endpoint AHORA ADMINISTRATIVO Y PROTEGIDO (dejó de ser público): requiere
   * autenticación + rol owner/admin, y companyId SIEMPRE del contexto
   * autenticado (nunca de query/body/params). El dominio valida pertenencia
   * (NotFound tenant-safe) y la política de estado (NOT_STARTED/OPEN → rechazo
   * controlado; solo CLOSED devuelve resultados). Read-only: no genera votos,
   * no modifica el periodo ni registra auditoría.
   */
  @Get('periods/:periodId/results')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  getResults(@Param('periodId') periodId: string, @Req() req: RequestWithUser) {
    return this.convivenciaService.getVotingResults(this.companyIdOf(req), periodId);
  }

  @Post('periods/:periodId/auto-committee')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  autoCreateCommittee(@Param('periodId') periodId: string, @Body() dto: { numPositions: number }, @Req() req: RequestWithUser) {
    return this.convivenciaService.autoCreateCommittee(this.companyIdOf(req), periodId, dto.numPositions, req.user?.email ?? 'system');
  }

  @Post('periods/:periodId/meetings')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  scheduleMeeting(@Param('periodId') periodId: string, @Req() req: RequestWithUser, @Body() dto: { meetingDate: string; agenda: string; topicList?: string[] }) {
    return this.convivenciaService.scheduleMeeting(this.companyIdOf(req), periodId, dto, req.user?.email ?? 'system');
  }

  @Post('periods/:periodId/meetings/auto-schedule')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  autoScheduleMonthlyMeetings(@Param('periodId') periodId: string, @Req() req: RequestWithUser) {
    return this.convivenciaService.autoScheduleMonthlyMeetings(this.companyIdOf(req), periodId, req.user?.email ?? 'system');
  }

  @Patch('periods/:periodId/meetings/:index')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  updateMeeting(@Param('periodId') periodId: string, @Param('index') index: string, @Req() req: RequestWithUser, @Body() dto: Partial<{ meetingDate: string; agenda: string; development: string; status: string; attendees: string[]; topicList: string[] }>) {
    return this.convivenciaService.updateMeeting(this.companyIdOf(req), periodId, parseInt(index), dto, req.user?.email ?? 'system');
  }

  @Post('periods/:periodId/meetings/:index/complete')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  completeMeeting(@Param('periodId') periodId: string, @Param('index') index: string, @Req() req: RequestWithUser, @Body() dto: { development: string; attendees: string[]; topicList?: string[] }) {
    return this.convivenciaService.completeMeeting(this.companyIdOf(req), periodId, parseInt(index), dto, req.user?.email ?? 'system');
  }

  @Post('periods/:periodId/commitments')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  addCommitment(@Param('periodId') periodId: string, @Req() req: RequestWithUser, @Body() dto: { description: string; responsibleParty: string; deadline: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; meetingId?: string }) {
    return this.convivenciaService.addCommitment(this.companyIdOf(req), periodId, dto, req.user?.email ?? 'system');
  }

  @Patch('periods/:periodId/commitments/:commitmentId')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  updateCommitment(@Param('periodId') periodId: string, @Param('commitmentId') commitmentId: string, @Req() req: RequestWithUser, @Body() dto: Partial<{ description: string; responsibleParty: string; deadline: string; priority: string; status: string; evidenceUrl: string }>) {
    return this.convivenciaService.updateCommitment(this.companyIdOf(req), periodId, commitmentId, dto, req.user?.email ?? 'system');
  }

  @Post('periods/:periodId/evidence')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  addEvidence(@Param('periodId') periodId: string, @Req() req: RequestWithUser, @Body() dto: { type: string; title: string; fileName: string; fileUrl: string; meetingId?: string }) {
    return this.convivenciaService.addEvidence(this.companyIdOf(req), periodId, dto, req.user?.email ?? 'system');
  }

  @Delete('periods/:periodId/evidence/:index')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  removeEvidence(@Param('periodId') periodId: string, @Param('index') index: string, @Req() req: RequestWithUser) {
    return this.convivenciaService.removeEvidence(this.companyIdOf(req), periodId, parseInt(index), req.user?.email ?? 'system');
  }

  // ─── CASES ───
  @Post('periods/:periodId/cases')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager')
  createCase(@Param('periodId') periodId: string, @Req() req: RequestWithUser, @Body() dto: { complainantName: string; respondentName: string; description: string; isAnonymous?: boolean; evidence?: string[] }) {
    return this.convivenciaService.createCase(this.companyIdOf(req), periodId, dto, req.user?.email ?? 'system');
  }

  @Patch('periods/:periodId/cases/:index')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager')
  updateCase(@Param('periodId') periodId: string, @Param('index') index: string, @Req() req: RequestWithUser, @Body() dto: { status?: string; assignedCommitteeMember?: string; recommendations?: string; evidence?: string[] }) {
    return this.convivenciaService.updateCase(this.companyIdOf(req), periodId, parseInt(index), dto, req.user?.email ?? 'system');
  }

  // ─── APPROVAL ───
  @Post('periods/:periodId/submit-approval')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  async submitForApproval(@Param('periodId') periodId: string, @Req() req: RequestWithUser) {
    const userEmail = req.user?.email ?? 'system';
    // Fase 1: companyId SIEMPRE del contexto autenticado (el dominio valida pertenencia).
    const companyId = this.companyIdOf(req);
    const period = await this.convivenciaService.submitForApproval(companyId, periodId, userEmail);

    // Crear la solicitud de aprobación en el Approval Workflow Core.
    await this.approvalWorkflowService.createRequest(
      companyId.toString(),
      {
        module: ApprovalEntity.CONVIVENCIA,
        entityType: 'ConvivenciaPeriod',
        entityId: periodId,
        assignedRoles: ['owner', 'manager'],
        comments: 'Aprobación del periodo Comité de Convivencia',
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
    // ConvivenciaService.approve a través del adapter (conserva
    // APPROVED_AND_SIGNED, auditHistory, approvedBy y alertas). La respuesta
    // conserva compatibilidad con el frontend actual.
    const result = await this.approvalWorkflowService.decideAndApply(
      this.companyIdOf(req).toString(),
      ApprovalEntity.CONVIVENCIA,
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
    // ConvivenciaService.reject a través del adapter.
    const result = await this.approvalWorkflowService.decideAndApply(
      this.companyIdOf(req).toString(),
      ApprovalEntity.CONVIVENCIA,
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
   * Resuelve el companyId EXCLUSIVAMENTE del contexto autenticado (Fase 1).
   * Nunca se acepta companyId desde body/query/params como fuente de autoridad
   * y nunca se deriva del periodo consultado (evita validación circular).
   */
  private companyIdOf(req: RequestWithUser): Types.ObjectId {
    if (!req.companyId) throw new ForbiddenException('Missing active company context');
    return new Types.ObjectId(req.companyId as unknown as string);
  }

  /**
   * Usuario mínimo para trazabilidad (generatedBy) desde el request autenticado.
   * Solo se construye cuando el id es un ObjectId válido de MongoDB; un UID de
   * Firebase u otro identificador no rompe la generación (generatedBy queda sin
   * resolver y el historial registra el email o 'system').
   */
  private userOf(req: RequestWithUser): UserDocument | undefined {
    const userId = req.user?._id;
    if (!userId) return undefined;
    // El id puede venir como string (UID) o como ObjectId; solo se construye un
    // usuario trazable cuando es un ObjectId válido de MongoDB.
    const raw = String(userId);
    if (!Types.ObjectId.isValid(raw)) return undefined;
    return { _id: new Types.ObjectId(raw), email: req.user?.email } as UserDocument;
  }

  // ─── DOCUMENTOS (1.1.8, Fase 5) ───

  /**
   * Genera el Acta de conformación del Comité de Convivencia (1.1.8) y la
   * registra en el periodo (constitutionMinutesPdfUrl) y en DocumentInstance.
   * companyId SIEMPRE del contexto autenticado; el dominio valida pertenencia.
   */
  @Post('periods/:periodId/documents/constitution')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager')
  generateConstitutionMinutes(@Req() req: RequestWithUser, @Param('periodId') periodId: string) {
    return this.convivenciaDocumentService.generateConstitutionMinutes(
      this.companyIdOf(req),
      this.userOf(req),
      periodId,
    );
  }

  /**
   * Genera el Reporte de cumplimiento del Comité de Convivencia (1.1.8),
   * consumiendo SOLO el snapshot del dominio (sin recalcular compliance).
   */
  @Post('periods/:periodId/documents/compliance-report')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager')
  generateComplianceReport(@Req() req: RequestWithUser, @Param('periodId') periodId: string) {
    return this.convivenciaDocumentService.generateComplianceReport(
      this.companyIdOf(req),
      this.userOf(req),
      periodId,
    );
  }

  /**
   * Trazabilidad documental de la entidad 1.1.8 de la empresa (DocumentInstance
   * generadas para CONVIVENCIA). Scoped por companyId.
   */
  @Get('periods/:periodId/documents')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager', 'member')
  async listDocuments(@Req() req: RequestWithUser, @Param('periodId') periodId: string) {
    const instances = await this.convivenciaDocumentService.listDocuments(
      this.companyIdOf(req),
      periodId,
    );
    return {
      documents: instances.map((instance) => ({
        id: instance._id.toString(),
        version: instance.version,
        status: instance.status,
        // F7B-7: identificación documental explícita (PHVA-1.1.8-ACTA /
        // PHVA-1.1.8-COMP). null explícito para instancias legacy sin código
        // (nunca se inventa). Permite al frontend clasificar sin comparar URLs.
        documentCode: instance.documentCode ?? null,
        fileUrl: instance.fileUrl,
        storagePath: instance.storagePath,
        generatedAt: instance.generatedAt,
      })),
    };
  }

  @Get('periods/:periodId/audit')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager', 'member')
  getAuditHistory(@Req() req: RequestWithUser, @Param('periodId') periodId: string) {
    // Fase 1: companyId SIEMPRE del contexto autenticado (el dominio valida pertenencia).
    return this.convivenciaService.getAuditHistory(this.companyIdOf(req), periodId);
  }

  @Get('dashboard')
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager', 'member')
  getDashboard(@Req() req: RequestWithUser) {
    return this.convivenciaService.getDashboard(new Types.ObjectId(req.companyId as unknown as string));
  }
}
