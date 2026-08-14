import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { getStorage } from 'firebase-admin/storage';
import { Types } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { FirebaseAdminService } from '../auth/firebase-admin.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { ApprovalDecision } from '../approval-workflow/enums/approval-decision.enum';
import { ApprovalEntity } from '../approval-workflow/enums/approval-entity.enum';
import { ApprovalStatus } from '../approval-workflow/enums/approval-status.enum';
import { buildApprovalActor } from '../approval-workflow/helpers/approval-actor.helper';
import { ApprovalActor } from '../approval-workflow/interfaces/approval-actor.interface';
import { ApprovalWorkflowService } from '../approval-workflow/approval-workflow.service';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { UsersService } from '../users/users.service';
import { UpdateResponsableSstDto } from './dto/update-responsable-sst.dto';
import { UpdateResourceAssignmentDto } from './dto/update-resource-assignment.dto';
import { UploadResponsableSstDocumentDto } from './dto/upload-responsable-sst-document.dto';
import { PhvaAdvancedService } from './phva-advanced.service';
import { PhvaAdvancedCopasstTrainingService } from './phva-advanced-copasst-training.service';
import { UpdateCopasstTrainingDto } from './dto/update-copasst-training.dto';
import { CreateCopasstTrainingEvidenceDto } from './dto/create-copasst-training-evidence.dto';
import {
  GenerateCopasstTrainingAttendanceDto,
  GenerateCopasstTrainingCertificateDto,
} from './dto/generate-copasst-training-document.dto';
import { DecideCopasstTrainingApprovalDto } from './dto/decide-copasst-training-approval.dto';
import { CopasstTrainingDocumentService } from './copasst-training-document.service';
import { PHVA_SOURCE_ENTITY_COPASST_TRAINING } from '../document-generation/types/document-generation.types';
import { StorageService } from '../document-generation/services/storage.service';
import { UpdateArlAffiliationsDto } from './dto/update-arl-affiliations.dto';
import { ResponsibilityAssignmentEntry } from './schemas/phva-advanced-responsibilities.schema';
import { UpdateSpecialPensionDto } from './dto/update-special-pension.dto';
import { PHVA_SOURCE_ENTITY_RESPONSIBLE_SG_SST } from '../document-generation/types/document-generation.types';

@Controller('phva-advanced')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class PhvaAdvancedController {
  constructor(
    private readonly phvaAdvancedService: PhvaAdvancedService,
    private readonly usersService: UsersService,
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly approvalWorkflowService: ApprovalWorkflowService,
    // Fase 1 (1.1.7) — service de dominio de Capacitación COPASST.
    private readonly copasstTrainingService: PhvaAdvancedCopasstTrainingService,
    // Fase 4 (1.1.7) — generación documental de la Capacitación COPASST.
    private readonly copasstTrainingDocumentService: CopasstTrainingDocumentService,
    // Fase 4 (1.1.7) — StorageService centralizado (reutilizado, NO se crea un
    // segundo servicio de Firebase Storage).
    private readonly storageService: StorageService,
  ) {}

  @Get('responsable-sst')
  @Roles('owner', 'admin', 'manager')
  async findResponsableSst(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.phvaAdvancedService.findOrCreateResponsableSst(companyId);
  }

  @Patch('responsable-sst')
  @Roles('owner', 'admin')
  async updateResponsableSst(@Req() request: RequestWithUser, @Body() dto: UpdateResponsableSstDto) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.updateResponsableSst(companyId, user, dto);
  }

  @Post('responsable-sst/documents')
  @Roles('owner', 'admin')
  @UseInterceptors(FileInterceptor('file'))
  async uploadResponsableSstDocument(
    @Req() request: RequestWithUser,
    @UploadedFile() file: UploadedBinaryFile,
    @Body() dto: UploadResponsableSstDocumentDto,
  ) {
    if (!file) throw new BadRequestException('File is required');

    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    const fileUrl = await this.uploadToFirebaseStorage(companyId, file);

    const isLicenseDoc = ['SST_LICENSE_PDF', 'SST_LICENSE_SCANNED', 'SST_LICENSE_RESOLUTION', 'SST_LICENSE_SUPPORTING'].includes(dto.type);

    if (isLicenseDoc) {
      return this.phvaAdvancedService.attachLicenseDocument({
        companyId,
        user,
        type: dto.type as any,
        fileName: file.originalname,
        fileUrl,
        ocrLicenseNumber: dto.ocrLicenseNumber,
        ocrIssueDate: dto.ocrIssueDate,
        ocrExpirationDate: dto.ocrExpirationDate,
        ocrIssuingAuthority: dto.ocrIssuingAuthority,
        ocrLicenseHolder: dto.ocrLicenseHolder,
        rawOcrText: dto.rawOcrText,
      });
    }

    return this.phvaAdvancedService.attachDocument({
      companyId,
      user,
      type: dto.type,
      fileName: file.originalname,
      fileUrl,
      finalUserDate: dto.finalUserDate,
    });
  }

  @Post('responsable-sst/license-ocr-modify')
  @Roles('owner', 'admin')
  async modifyLicenseOcr(
    @Req() request: RequestWithUser,
    @Body() dto: { ocrIndex: number; licenseNumber?: string; issueDate?: string; expirationDate?: string; issuingAuthority?: string },
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.registerLicenseOcrModification(companyId, user, dto.ocrIndex, {
      licenseNumber: dto.licenseNumber,
      issueDate: dto.issueDate,
      expirationDate: dto.expirationDate,
      issuingAuthority: dto.issuingAuthority,
    });
  }

  @Get('responsable-sst/license-dashboard')
  @Roles('owner', 'admin', 'manager', 'member')
  async getLicenseDashboard(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    const record = await this.phvaAdvancedService.findOrCreateResponsableSst(companyId);
    this.phvaAdvancedService['resolveLicenseStatus'](record as any);

    let remainingDays: number | null = null;
    if (record.licenseExpiresAt) {
      const now = new Date();
      remainingDays = Math.ceil((record.licenseExpiresAt.getTime() - now.getTime()) / 86_400_000);
    }

    return {
      responsibleName: record.fullName || 'Sin asignar',
      licenseNumber: record.sstLicenseNumber || '—',
      licenseType: record.licenseType || '—',
      status: record.licenseStatus || 'Pendiente',
      expirationDate: record.licenseExpiresAt?.toISOString() || null,
      remainingDays,
      hasLicenseDocument: record.documents.some((document) =>
        document.type === 'SST_LICENSE_PDF' || document.type === 'SST_LICENSE_SCANNED'
      ),
    };
  }

  @Get('responsable-sst/audit')
  @Roles('owner', 'admin')
  async responsableSstAudit(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.phvaAdvancedService.auditHistory(companyId);
  }

  @Post('responsable-sst/submit-approval')
  @Roles('owner', 'admin')
  async submitResponsableSstApproval(@Req() request: RequestWithUser) {
    const user = await this.resolveUserFromRequest(request);
    const companyId = this.resolveCompanyId(request);
    const record = await this.phvaAdvancedService.submitResponsableSst(companyId, user);

    // Crear la solicitud de aprobación en el Approval Workflow Core.
    await this.approvalWorkflowService.createRequest(
      companyId.toString(),
      {
        module: ApprovalEntity.PHVA_ADVANCED,
        entityType: PHVA_SOURCE_ENTITY_RESPONSIBLE_SG_SST,
        entityId: record._id.toString(),
        assignedRoles: ['owner', 'manager'],
        comments: 'Aprobación del Responsable del SG-SST (1.1.1)',
      },
      buildApprovalActor({
        userId: request.user?._id,
        firebaseUid: request.user?.uid,
        email: request.user?.email,
        role: request.user?.role,
      }),
    );

    return record;
  }

  @Post('responsable-sst/approve')
  @Roles('owner', 'manager')
  async approveResponsableSst(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    // El endpoint no recibe entityId (resuelve el registro por empresa); se
    // obtiene el registro vigente para delegar la decisión al motor.
    const record = await this.phvaAdvancedService.findResponsableSstByCompany(companyId);
    const actor = buildApprovalActor({
      userId: request.user?._id,
      firebaseUid: request.user?.uid,
      email: request.user?.email,
      role: request.user?.role,
    });

    // Delegar la aprobación al Approval Workflow Core, que reutiliza
    // PhvaAdvancedService.approveResponsableSst a través del
    // ResponsibleSgsstHandler (conserva APPROVED/APPROVED_AND_SIGNED,
    // approvedBy, auditHistory y alertas). La respuesta conserva
    // compatibilidad con el frontend actual.
    // Fase 2.1 — la generación del documento formal del Responsable del SG-SST
    // se dispara desde el Approval Workflow Core (ApprovalDocumentGeneration-
    // Listener + ResponsibleSgsstDocumentGenerator) tras el ApprovalEvent
    // APPROVED. Esto centraliza la generación en el Core y cubre también el
    // endpoint genérico POST /approval-workflow/.../decide. El controller solo
    // delega la decisión al motor.
    const result = await this.approvalWorkflowService.decideAndApply(
      companyId.toString(),
      ApprovalEntity.PHVA_ADVANCED,
      record._id.toString(),
      {
        decision: ApprovalDecision.APPROVED,
        metadata: {
          approvedByEmail: request.user?.email,
        },
      },
      actor,
    );

    return result.applied;
  }

  @Post('responsable-sst/reject')
  @Roles('owner', 'manager')
  async rejectResponsableSst(@Req() request: RequestWithUser, @Body() dto: { reason: string }) {
    if (!dto.reason || !dto.reason.trim()) throw new BadRequestException('Rejection reason is required');
    const companyId = this.resolveCompanyId(request);
    const record = await this.phvaAdvancedService.findResponsableSstByCompany(companyId);

    // Delegar el rechazo al Approval Workflow Core, que reutiliza
    // PhvaAdvancedService.rejectResponsableSst a través del handler.
    const result = await this.approvalWorkflowService.decideAndApply(
      companyId.toString(),
      ApprovalEntity.PHVA_ADVANCED,
      record._id.toString(),
      {
        decision: ApprovalDecision.REJECTED,
        reason: dto.reason,
      },
      buildApprovalActor({
        userId: request.user?._id,
        firebaseUid: request.user?.uid,
        email: request.user?.email,
        role: request.user?.role,
      }),
    );

    return result.applied;
  }

  @Get('responsibilities')
  @Roles('owner', 'admin', 'manager', 'member')
  async getResponsibilities(@Req() request: RequestWithUser) {
    return this.phvaAdvancedService.findOrCreateResponsibilities(this.resolveCompanyId(request));
  }

  @Patch('responsibilities')
  @Roles('owner', 'admin')
  async updateResponsibilities(@Req() request: RequestWithUser, @Body() dto: { responsibilities: ResponsibilityAssignmentEntry[] }) {
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.updateResponsibilities(this.resolveCompanyId(request), user, dto.responsibilities ?? []);
  }

  @Post('responsibilities/submit')
  @Roles('owner', 'admin')
  async submitResponsibilities(@Req() request: RequestWithUser) {
    const user = await this.resolveUserFromRequest(request);
    const companyId = this.resolveCompanyId(request);
    return this.phvaAdvancedService.submitResponsibilities(companyId, user);
  }

  @Post('responsibilities/approve')
  @Roles('owner', 'manager')
  async approveResponsibilities(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    // El endpoint no recibe entityId (resuelve el registro por empresa); se
    // obtiene el registro vigente para delegar la decisión al motor.
    const record = await this.phvaAdvancedService.findResponsibilitiesByCompany(companyId);
    const entityId = record._id.toString();
    const actor = buildApprovalActor({
      userId: request.user?._id,
      firebaseUid: request.user?.uid,
      email: request.user?.email,
      role: request.user?.role,
    });

    // El endpoint de aprobación puede llegar sin ApprovalRequest PENDING
    // previa (flujos legacy o ciclos rechazo → corrección → re-aprobación).
    // La mitigación de ciclo se garantiza en el helper centralizado.
    await this.ensurePendingResponsibilitiesRequest(companyId, entityId, actor);

    // Delegar la aprobación al Approval Workflow Core, que reutiliza
    // PhvaAdvancedService.approveResponsibilities a través del handler
    // (conserva __META__, auditHistory, versions, locked, representante
    // legal, firmas, notificaciones y compliance). La respuesta conserva
    // compatibilidad con el frontend actual.
    const result = await this.approvalWorkflowService.decideAndApply(
      companyId.toString(),
      ApprovalEntity.PHVA_ADVANCED,
      entityId,
      {
        decision: ApprovalDecision.APPROVED,
        metadata: {
          approvedByEmail: request.user?.email,
        },
      },
      actor,
    );

    return result.applied;
  }

  @Post('responsibilities/reject')
  @Roles('owner', 'manager')
  async rejectResponsibilities(@Req() request: RequestWithUser, @Body() dto: { reason: string }) {
    if (!dto.reason || !dto.reason.trim()) throw new BadRequestException('Rejection reason is required');
    const companyId = this.resolveCompanyId(request);
    const record = await this.phvaAdvancedService.findResponsibilitiesByCompany(companyId);
    const entityId = record._id.toString();
    const actor = buildApprovalActor({
      userId: request.user?._id,
      firebaseUid: request.user?.uid,
      email: request.user?.email,
      role: request.user?.role,
    });

    // Misma mitigación de ciclo que approve (helper centralizado): garantiza
    // una solicitud PENDING antes de decidir para conservar rechazo →
    // corrección → re-aprobación.
    await this.ensurePendingResponsibilitiesRequest(companyId, entityId, actor);

    // Delegar el rechazo al Approval Workflow Core, que reutiliza
    // PhvaAdvancedService.rejectResponsibilities a través del handler
    // (conserva REJECTED, rejectionReason y auditHistory). La respuesta
    // conserva compatibilidad con el frontend actual.
    const result = await this.approvalWorkflowService.decideAndApply(
      companyId.toString(),
      ApprovalEntity.PHVA_ADVANCED,
      entityId,
      {
        decision: ApprovalDecision.REJECTED,
        reason: dto.reason,
      },
      actor,
    );

    return result.applied;
  }


  @Get('arl-affiliations')
  @Roles('owner', 'admin', 'manager', 'member')
  async getArlAffiliations(@Req() request: RequestWithUser) {
    return this.phvaAdvancedService.findOrCreateArlAffiliations(this.resolveCompanyId(request));
  }

  @Patch('arl-affiliations')
  @Roles('owner', 'admin')
  async updateArlAffiliations(@Req() request: RequestWithUser, @Body() dto: UpdateArlAffiliationsDto) {
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.updateArlAffiliations(this.resolveCompanyId(request), user, dto);
  }


  @Get('special-pension')
  @Roles('owner', 'admin', 'manager', 'member')
  async getSpecialPension(@Req() request: RequestWithUser) {
    return this.phvaAdvancedService.findOrCreateSpecialPension(this.resolveCompanyId(request));
  }

  @Patch('special-pension')
  @Roles('owner', 'admin')
  async updateSpecialPension(@Req() request: RequestWithUser, @Body() dto: UpdateSpecialPensionDto) {
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.updateSpecialPension(this.resolveCompanyId(request), user, dto);
  }


  @Get('training-management')
  @Roles('owner', 'admin', 'manager', 'member')
  async getTrainingManagement(@Req() request: RequestWithUser) {
    return this.phvaAdvancedService.findOrCreateTrainingManagement(this.resolveCompanyId(request));
  }

  @Patch('training-management')
  @Roles('owner', 'admin', 'member')
  async updateTrainingManagement(@Req() request: RequestWithUser, @Body() dto: Record<string, unknown>) {
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.updateTrainingManagement(this.resolveCompanyId(request), user, dto as never);
  }

  @Get('copasst-training')
  @Roles('owner', 'admin', 'manager', 'member')
  async getCopasstTraining(@Req() request: RequestWithUser) {
    // Fase 1 (1.1.7) — endpoint mínimo de dominio (sin Approval/evidencias aún).
    return this.copasstTrainingService.findOrCreate(this.resolveCompanyId(request));
  }

  @Get('copasst-training/members')
  @Roles('owner', 'admin', 'manager', 'member')
  async getCopasstTrainingMembers(@Req() request: RequestWithUser) {
    // Fase 2 (1.1.7) — miembros ACTIVOS del periodo vigente (selector de participantes).
    return this.copasstTrainingService.getAvailableMembers(this.resolveCompanyId(request));
  }

  @Get('copasst-training/coverage')
  @Roles('owner', 'admin', 'manager', 'member')
  async getCopasstTrainingCoverage(@Req() request: RequestWithUser) {
    // Fase 2 (1.1.7) — cobertura recalculada de forma determinista + snapshot por miembro.
    const companyId = this.resolveCompanyId(request);
    const record = await this.copasstTrainingService.findOrCreate(companyId);
    const coverage = await this.copasstTrainingService.recalculateCoverage(companyId, record);
    return { ...coverage, memberCoverage: record.memberCoverage };
  }

  @Patch('copasst-training')
  @Roles('owner', 'admin')
  async updateCopasstTraining(@Req() request: RequestWithUser, @Body() dto: UpdateCopasstTrainingDto) {
    const user = await this.resolveUserFromRequest(request);
    return this.copasstTrainingService.update(this.resolveCompanyId(request), user, dto as never);
  }

  // ─────────────────────────────────────────────
  // FASE 4 (1.1.7) — EVIDENCIAS Y GENERACIÓN DOCUMENTAL
  // ─────────────────────────────────────────────

  /**
   * Carga una evidencia de la Capacitación COPASST (1.1.7, Fase 4).
   *
   * El archivo se sube con el StorageService centralizado a una ruta separada
   * por companyId / estándar 1.1.7 / año / sesión / tipo:
   *   phva-advanced/{companyId}/copasst-training/{year}/sessions/{sessionIndex|general}/{type}/...
   * El companyId NUNCA proviene del body: se resuelve desde x-company-id.
   *
   * DECISIÓN (Fase 5): la carga de evidencias permanece disponible durante el
   * ciclo de aprobación (PENDING/APPROVED). Solo la edición de datos base
   * (PATCH /copasst-training) queda bloqueada por `locked`; adjuntar soportes
   * documentales durante la aprobación es un escenario válido y NO modifica
   * programa/sesiones/participantes (los snapshots históricos se conservan).
   */
  @Post('copasst-training/evidence')
  @Roles('owner', 'admin')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCopasstTrainingEvidence(
    @Req() request: RequestWithUser,
    @UploadedFile() file: UploadedBinaryFile,
    @Body() dto: CreateCopasstTrainingEvidenceDto,
  ) {
    if (!file) throw new BadRequestException('File is required');

    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    const record = await this.copasstTrainingService.findOrCreate(companyId);

    const sessionKey =
      dto.sessionIndex !== undefined ? `sessions/${dto.sessionIndex}` : 'general';
    const folder = `phva-advanced/${companyId.toString()}/copasst-training/${record.year}/${sessionKey}/${dto.type}`;
    const upload = await this.storageService.upload(file.buffer, file.originalname, folder);

    return this.copasstTrainingService.addEvidence(companyId, user, {
      type: dto.type,
      fileName: file.originalname,
      fileUrl: upload.fileUrl,
      storagePath: upload.storagePath,
      sessionIndex: dto.sessionIndex,
      metadata: dto.metadata,
    });
  }

  /**
   * Lista las evidencias estructuradas de la Capacitación COPASST (1.1.7).
   * Devuelve la entidad completa (las evidencias viven en `record.evidences`)
   * más el arreglo plano para consumo directo de la UI.
   */
  @Get('copasst-training/evidence')
  @Roles('owner', 'admin', 'manager', 'member')
  async listCopasstTrainingEvidences(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    const record = await this.copasstTrainingService.findOrCreate(companyId);
    return { evidences: record.evidences ?? [] };
  }

  /**
   * Genera el certificado de capacitación de un participante de una sesión
   * EJECUTADA (1.1.7).
   */
  @Post('copasst-training/documents/certificate')
  @Roles('owner', 'admin', 'manager')
  async generateCopasstTrainingCertificate(
    @Req() request: RequestWithUser,
    @Body() dto: GenerateCopasstTrainingCertificateDto,
  ) {
    const user = await this.resolveUserFromRequest(request);
    return this.copasstTrainingDocumentService.generateCertificate(
      this.resolveCompanyId(request),
      user,
      { sessionIndex: dto.sessionIndex, participantUserId: dto.participantUserId },
    );
  }

  /**
   * Genera la lista de asistencia de una sesión (1.1.7) usando el snapshot
   * histórico de participantes (inmutable).
   */
  @Post('copasst-training/documents/attendance')
  @Roles('owner', 'admin', 'manager')
  async generateCopasstTrainingAttendance(
    @Req() request: RequestWithUser,
    @Body() dto: GenerateCopasstTrainingAttendanceDto,
  ) {
    const user = await this.resolveUserFromRequest(request);
    return this.copasstTrainingDocumentService.generateAttendance(
      this.resolveCompanyId(request),
      user,
      { sessionIndex: dto.sessionIndex },
    );
  }

  /** Genera el informe documental de la capacitación COPASST (1.1.7). */
  @Post('copasst-training/documents/report')
  @Roles('owner', 'admin', 'manager')
  async generateCopasstTrainingReport(@Req() request: RequestWithUser) {
    const user = await this.resolveUserFromRequest(request);
    return this.copasstTrainingDocumentService.generateReport(
      this.resolveCompanyId(request),
      user,
    );
  }

  /**
   * Genera el reporte de cumplimiento (1.1.7) consumiendo el estado actual
   * del dominio (sin reglas del Compliance Engine).
   */
  @Post('copasst-training/documents/compliance-report')
  @Roles('owner', 'admin', 'manager')
  async generateCopasstTrainingComplianceReport(@Req() request: RequestWithUser) {
    const user = await this.resolveUserFromRequest(request);
    return this.copasstTrainingDocumentService.generateComplianceReport(
      this.resolveCompanyId(request),
      user,
    );
  }

  /**
   * Reporte de cumplimiento parametrizable (1.1.7, Fase 4). Expone el estado
   * actual del dominio para ser reutilizado posteriormente por
   * Compliance/PHVA. No implementa reglas del Compliance Engine.
   */
  @Get('copasst-training/compliance')
  @Roles('owner', 'admin', 'manager', 'member')
  async getCopasstTrainingCompliance(@Req() request: RequestWithUser) {
    return this.copasstTrainingDocumentService.getComplianceReportData(
      this.resolveCompanyId(request),
    );
  }

  /**
   * Trazabilidad documental de la entidad 1.1.7 de la empresa (DocumentInstance
   * generadas para COPASST_TRAINING).
   */
  @Get('copasst-training/documents')
  @Roles('owner', 'admin', 'manager', 'member')
  async listCopasstTrainingDocuments(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    const instances = await this.copasstTrainingDocumentService.listDocuments(companyId);
    return {
      documents: instances.map((instance) => ({
        id: instance._id.toString(),
        version: instance.version,
        status: instance.status,
        fileUrl: instance.fileUrl,
        storagePath: instance.storagePath,
        generatedAt: instance.generatedAt,
      })),
    };
  }

  // ─────────────────────────────────────────────
  // FASE 5 (1.1.7) — APPROVAL WORKFLOW
  // ─────────────────────────────────────────────

  /**
   * Estado de aprobación de la Capacitación COPASST (1.1.7, Fase 5).
   *
   * Devuelve el ApprovalStatus canónico (DRAFT si nunca se envió — la fuente
   * de verdad del ciclo es la ApprovalRequest más reciente), el estado local
   * embebido del dominio, locking, versión y la solicitud/eventos asociados
   * (scoped por empresa).
   */
  @Get('copasst-training/approval')
  @Roles('owner', 'admin', 'manager', 'member')
  async getCopasstTrainingApproval(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    const record = await this.copasstTrainingService.findOrCreate(companyId);
    const entityId = record._id.toString();

    const approvalRequest = await this.approvalWorkflowService.findRequestByEntity(
      companyId.toString(),
      ApprovalEntity.PHVA_ADVANCED,
      entityId,
    );
    const events = approvalRequest
      ? await this.approvalWorkflowService.getHistory(
          companyId.toString(),
          approvalRequest._id.toString(),
        )
      : [];

    return {
      entityId,
      // La solicitud es la fuente de verdad del ciclo: sin solicitud → DRAFT.
      status: approvalRequest?.status ?? ApprovalStatus.DRAFT,
      approvalStatus: record.approval?.status,
      locked: record.locked,
      currentVersion: record.approval?.version ?? 1,
      requestId: approvalRequest?._id?.toString(),
      requestedBy: approvalRequest?.requestedBy,
      // createdAt lo aporta Mongoose (timestamps: true), aunque la clase no lo
      // declare explícitamente en el tipo.
      submittedAt: (approvalRequest as unknown as { createdAt?: Date })?.createdAt,
      assignedRoles: approvalRequest?.assignedRoles ?? ['owner', 'manager'],
      rejectionReason: approvalRequest?.rejectionReason,
      comments: record.approval?.comments,
      approvedBy: record.approval?.approvedBy,
      approvedAt: record.approval?.approvedAt,
      history: events.map((event) => ({
        action: event.action,
        previousStatus: event.previousStatus,
        newStatus: event.newStatus,
        reason: event.reason,
        actor: event.actor,
        createdAt: event.createdAt,
      })),
    };
  }

  /**
   * Envía la Capacitación COPASST a aprobación (Fase 5): DRAFT →
   * PENDING_APPROVAL.
   *
   * 1. Verifica la pertenencia de la entidad a la empresa (findOrCreate + el
   *    dominio nunca acepta companyId del body).
   * 2. El actor debe tener rol owner/admin (@Roles).
   * 3. El dominio marca PENDING + locked (submitCopasstTraining rechaza si ya
   *    está pendiente/aprobada → evita duplicados).
   * 4. Crea la ApprovalRequest PENDING_APPROVAL SOLO si no existe una pendiente
   *    (findRequestByEntity + guardia de estado).
   */
  @Patch('copasst-training/approval')
  @Roles('owner', 'admin')
  async submitCopasstTrainingApproval(@Req() request: RequestWithUser) {
    const user = await this.resolveUserFromRequest(request);
    const companyId = this.resolveCompanyId(request);
    const actor = buildApprovalActor({
      userId: request.user?._id,
      firebaseUid: request.user?.uid,
      email: request.user?.email,
      role: request.user?.role,
    });

    // 1. Dominio: marca PENDING + locked (valida que no esté ya pendiente/aprobada).
    const record = await this.copasstTrainingService.submitCopasstTraining(companyId, user);
    const entityId = record._id.toString();

    // 2. Approval Workflow: solicitud PENDING_APPROVAL sin duplicados.
    const existing = await this.approvalWorkflowService.findRequestByEntity(
      companyId.toString(),
      ApprovalEntity.PHVA_ADVANCED,
      entityId,
    );
    if (!existing || existing.status !== ApprovalStatus.PENDING_APPROVAL) {
      await this.approvalWorkflowService.createRequest(
        companyId.toString(),
        {
          module: ApprovalEntity.PHVA_ADVANCED,
          entityType: PHVA_SOURCE_ENTITY_COPASST_TRAINING,
          entityId,
          assignedRoles: ['owner', 'manager'],
          comments: 'Aprobación de la Capacitación COPASST (1.1.7)',
        },
        actor,
      );
    }

    return record;
  }

  /**
   * Decide sobre la aprobación de 1.1.7 (Fase 5): APPROVED | REJECTED |
   * ADJUSTMENTS_REQUESTED.
   *
   * Reutiliza ApprovalWorkflowService.decideAndApply (sin lógica paralela).
   * Si no existe una solicitud PENDING (flujo legacy o ciclo rechazo →
   * corrección → reenvío), se crea una nueva antes de decidir (mismo patrón
   * que 1.2.1). Solo APPROVED activa la generación documental del
   * ApprovalDocumentGenerationListener (Informe de capacitación vía
   * CopasstTrainingDocumentGenerator).
   *
   * Corrección M1 (Fase 9): la decisión opera SOLO sobre una entidad
   * existente — si no hay entidad 1.1.7 para la empresa se rechaza la
   * decisión y NUNCA se crea una entidad implícitamente (findByCompany + 404).
   * La validación de contenido mínimo para APPROVED vive en el dominio
   * (PhvaAdvancedCopasstTrainingService.approveCopasstTraining).
   */
  @Post('copasst-training/approval/decide')
  @Roles('owner', 'manager')
  async decideCopasstTrainingApproval(
    @Req() request: RequestWithUser,
    @Body() dto: DecideCopasstTrainingApprovalDto,
  ) {
    // El motivo es obligatorio para el rechazo (patrón de los módulos PHVA).
    if (
      dto.decision === ApprovalDecision.REJECTED &&
      (!dto.reason || !dto.reason.trim())
    ) {
      throw new BadRequestException('Rejection reason is required');
    }

    const companyId = this.resolveCompanyId(request);
    const record = await this.copasstTrainingService.findByCompany(companyId);
    if (!record) {
      throw new NotFoundException('Capacitación COPASST no encontrada');
    }
    const entityId = record._id.toString();
    const actor = buildApprovalActor({
      userId: request.user?._id,
      firebaseUid: request.user?.uid,
      email: request.user?.email,
      role: request.user?.role,
    });

    // Ciclo rechazo/ajustes → corrección → re-aprobación: si no existe una
    // solicitud PENDING se crea una nueva antes de decidir (evita duplicados
    // cuando ya hay una pendiente).
    const existing = await this.approvalWorkflowService.findRequestByEntity(
      companyId.toString(),
      ApprovalEntity.PHVA_ADVANCED,
      entityId,
    );
    if (!existing || existing.status !== ApprovalStatus.PENDING_APPROVAL) {
      await this.approvalWorkflowService.createRequest(
        companyId.toString(),
        {
          module: ApprovalEntity.PHVA_ADVANCED,
          entityType: PHVA_SOURCE_ENTITY_COPASST_TRAINING,
          entityId,
          assignedRoles: ['owner', 'manager'],
          comments: 'Aprobación de la Capacitación COPASST (1.1.7)',
        },
        actor,
      );
    }

    // Delegar al Approval Workflow Core, que reutiliza
    // PhvaAdvancedCopasstTrainingService.approveCopasstTraining a través del
    // CopasstTrainingHandler (conserva approval, history, approvedBy/At,
    // comments, version y locking).
    const result = await this.approvalWorkflowService.decideAndApply(
      companyId.toString(),
      ApprovalEntity.PHVA_ADVANCED,
      entityId,
      {
        decision: dto.decision,
        reason: dto.reason,
        comments: dto.comments,
        metadata: {
          decidedByEmail: request.user?.email,
        },
      },
      actor,
    );

    return result.applied;
  }

  @Patch('training-management/approval')
  @Roles('owner', 'manager')
  async approveTrainingManagement(@Req() request: RequestWithUser, @Body() dto: { status: 'APPROVED'|'REJECTED'|'ADJUSTMENTS_REQUESTED'; comments?: string; }) {
    const companyId = this.resolveCompanyId(request);
    // El endpoint no recibe entityId (resuelve el registro por empresa); se
    // obtiene el registro vigente para delegar la decisión al motor.
    const record = await this.phvaAdvancedService.findTrainingManagementByCompany(companyId);
    const entityId = record._id.toString();
    const actor = buildApprovalActor({
      userId: request.user?._id,
      firebaseUid: request.user?.uid,
      email: request.user?.email,
      role: request.user?.role,
    });

    // Training Management no posee paso de submit: cada decisión directa
    // requiere una solicitud PENDING. Si no existe (o la anterior ya está
    // resuelta, p.ej. tras un rechazo), se crea una nueva para conservar el
    // ciclo rechazo → corrección → re-aprobación que funciona hoy.
    const existing = await this.approvalWorkflowService.findRequestByEntity(
      companyId.toString(),
      ApprovalEntity.PHVA_ADVANCED,
      entityId,
    );
    if (!existing || existing.status !== ApprovalStatus.PENDING_APPROVAL) {
      await this.approvalWorkflowService.createRequest(
        companyId.toString(),
        {
          module: ApprovalEntity.PHVA_ADVANCED,
          entityType: 'PhvaAdvancedTrainingManagement',
          entityId,
          assignedRoles: ['owner', 'manager'],
          comments: 'Aprobación del programa de capacitaciones (1.2.1)',
        },
        actor,
      );
    }

    // Delegar al Approval Workflow Core, que reutiliza
    // PhvaAdvancedService.approveTrainingManagement a través del
    // TrainingManagementHandler (conserva approval, history, approvedBy/At,
    // comments, version y TrainingSignature). La respuesta conserva
    // compatibilidad con el frontend actual.
    const result = await this.approvalWorkflowService.decideAndApply(
      companyId.toString(),
      ApprovalEntity.PHVA_ADVANCED,
      entityId,
      {
        decision: this.mapTrainingStatusToDecision(dto.status),
        comments: dto.comments,
        metadata: {
          approvedByEmail: request.user?.email,
          comments: dto.comments,
        },
      },
      actor,
    );

    return result.applied;
  }


  @Get('sst-policy')
  @Roles('owner', 'admin', 'manager', 'member')
  async getSstPolicy(@Req() request: RequestWithUser) {
    return this.phvaAdvancedService.findOrCreateSstPolicy(this.resolveCompanyId(request));
  }

  @Post('sst-policy/generate')
  @Roles('owner', 'admin', 'manager')
  async generateSstPolicy(@Req() request: RequestWithUser) {
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.generateSstPolicy(this.resolveCompanyId(request), user);
  }

  @Patch('sst-policy')
  @Roles('owner', 'admin', 'manager')
  async updateSstPolicy(@Req() request: RequestWithUser, @Body() dto: Record<string, unknown>) {
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.updateSstPolicy(this.resolveCompanyId(request), user, dto as never);
  }

  @Post('sst-policy/versions')
  @Roles('owner', 'admin', 'manager')
  async createSstPolicyVersion(@Req() request: RequestWithUser) {
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.createSstPolicyVersion(this.resolveCompanyId(request), user);
  }

  @Patch('sst-policy/versions/:version/archive')
  @Roles('owner', 'admin', 'manager')
  async archiveSstPolicyVersion(@Req() request: RequestWithUser, @Param('version') version: string) {
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.archiveSstPolicyVersion(this.resolveCompanyId(request), user, version);
  }

  @Patch('sst-policy/signatures')
  @Roles('owner', 'admin', 'manager')
  async updateSstPolicySignature(@Req() request: RequestWithUser, @Body() dto: { role: string; signerName?: string; signerEmail?: string; required?: boolean; status?: string; evidence?: string; rejectionReason?: string }) {
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.updateSstPolicySignature(this.resolveCompanyId(request), user, dto as never);
  }

  @Post('sst-policy/approve')
  @Roles('owner', 'manager')
  async approveSstPolicy(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    // El endpoint no recibe entityId (resuelve el registro por empresa); se
    // obtiene la política vigente para delegar la decisión al motor.
    const record = await this.phvaAdvancedService.findSstPolicyByCompany(companyId);
    const entityId = record._id.toString();
    const actor = buildApprovalActor({
      userId: request.user?._id,
      firebaseUid: request.user?.uid,
      email: request.user?.email,
      role: request.user?.role,
    });

    // SST Policy no posee paso de submit: cada aprobación directa requiere una
    // solicitud PENDING. Si no existe (o la anterior ya está resuelta, p.ej.
    // tras una política vencida), se crea una nueva para conservar el ciclo de
    // re-aprobación que funciona hoy.
    const existing = await this.approvalWorkflowService.findRequestByEntity(
      companyId.toString(),
      ApprovalEntity.PHVA_ADVANCED,
      entityId,
    );
    if (!existing || existing.status !== ApprovalStatus.PENDING_APPROVAL) {
      await this.approvalWorkflowService.createRequest(
        companyId.toString(),
        {
          module: ApprovalEntity.PHVA_ADVANCED,
          entityType: 'PhvaAdvancedSstPolicy',
          entityId,
          assignedRoles: ['owner', 'manager'],
          comments: 'Aprobación de la Política de Seguridad y Salud en el Trabajo (2.1.1)',
        },
        actor,
      );
    }

    // Delegar la aprobación al Approval Workflow Core, que reutiliza
    // PhvaAdvancedService.approveSstPolicy a través del SstPolicyHandler
    // (conserva la validación de firmas obligatorias, PolicySignature,
    // PolicyHistory, PolicyVersion, PolicySocialization, las comunicaciones
    // automáticas, el approvalDocument, el auditHistory y las versiones). La
    // respuesta conserva compatibilidad con el frontend actual.
    const result = await this.approvalWorkflowService.decideAndApply(
      companyId.toString(),
      ApprovalEntity.PHVA_ADVANCED,
      entityId,
      {
        decision: ApprovalDecision.APPROVED,
        metadata: {
          approvedByEmail: request.user?.email,
        },
      },
      actor,
    );

    return result.applied;
  }

  @Post('sst-policy/socializations/assign')
  @Roles('owner', 'admin', 'manager')
  async assignSstPolicySocialization(@Req() request: RequestWithUser, @Body() dto: { mode?: 'all' | 'selected' | 'area'; employeeIds?: string[]; area?: string }) {
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.assignSstPolicySocialization(this.resolveCompanyId(request), user, dto);
  }

  @Patch('sst-policy/socializations')
  @Roles('owner', 'admin', 'manager', 'member')
  async updateSstPolicySocialization(@Req() request: RequestWithUser, @Body() dto: { employeeId: string; status: string; evidence?: string }) {
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.updateSstPolicySocialization(this.resolveCompanyId(request), user, dto as never);
  }

  @Get('sst-policy/master-list')
  @Roles('owner', 'admin', 'manager', 'member')
  async getSstPolicyMasterList(@Req() request: RequestWithUser) {
    return this.phvaAdvancedService.getSstPolicyMasterList(this.resolveCompanyId(request));
  }


  @Get('sst-objectives')
  @Roles('owner', 'admin', 'manager', 'member')
  async getSstObjectives(@Req() request: RequestWithUser) {
    return this.phvaAdvancedService.findOrCreateSstObjectives(this.resolveCompanyId(request));
  }

  @Patch('sst-objectives')
  @Roles('owner', 'admin', 'manager')
  async updateSstObjectives(@Req() request: RequestWithUser, @Body() dto: Record<string, unknown>) {
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.updateSstObjectives(this.resolveCompanyId(request), user, dto as never);
  }

  @Patch('sst-objectives/:objectiveId/progress')
  @Roles('owner', 'admin', 'manager')
  async updateSstObjectiveProgress(@Req() request: RequestWithUser, @Param('objectiveId') objectiveId: string, @Body() dto: Record<string, unknown>) {
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.updateSstObjectiveProgress(this.resolveCompanyId(request), user, objectiveId, dto as never);
  }

  @Patch('sst-objectives/:objectiveId/activities')
  @Roles('owner', 'admin', 'manager')
  async updateSstObjectiveActivities(@Req() request: RequestWithUser, @Param('objectiveId') objectiveId: string, @Body() dto: { activities?: unknown[] }) {
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.updateSstObjectiveActivities(this.resolveCompanyId(request), user, objectiveId, dto.activities ?? []);
  }


  @Get('annual-work-plan')
  @Roles('owner', 'admin', 'manager', 'member')
  async getAnnualWorkPlan(@Req() request: RequestWithUser) {
    return this.phvaAdvancedService.findOrCreateAnnualWorkPlan(this.resolveCompanyId(request));
  }

  @Patch('annual-work-plan')
  @Roles('owner', 'admin', 'manager')
  async updateAnnualWorkPlan(@Req() request: RequestWithUser, @Body() dto: Record<string, unknown>) {
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.updateAnnualWorkPlan(this.resolveCompanyId(request), user, dto as never);
  }

  @Patch('annual-work-plan/:objectiveId/activities')
  @Roles('owner', 'admin', 'manager', 'member')
  async updateAnnualWorkPlanActivities(@Req() request: RequestWithUser, @Param('objectiveId') objectiveId: string, @Body() dto: { activities?: unknown[] }) {
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.updateAnnualWorkPlanActivities(this.resolveCompanyId(request), user, objectiveId, dto.activities ?? []);
  }

  @Get('resource-assignment')
  @Roles('owner', 'admin', 'manager', 'member')
  async getResourceAssignment(@Req() request: RequestWithUser) {
    return this.phvaAdvancedService.findOrCreateResourceAssignment(this.resolveCompanyId(request));
  }

  @Patch('resource-assignment')
  @Roles('owner', 'admin', 'manager')
  async updateResourceAssignment(@Req() request: RequestWithUser, @Body() dto: UpdateResourceAssignmentDto) {
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.updateResourceAssignment(this.resolveCompanyId(request), user, dto);
  }

  @Post('resource-assignment/submit')
  @Roles('owner', 'admin')
  async submitResourceAssignment(@Req() request: RequestWithUser) {
    const user = await this.resolveUserFromRequest(request);
    const companyId = this.resolveCompanyId(request);
    const record = await this.phvaAdvancedService.submitResourceAssignment(companyId, user);

    // Crear la solicitud de aprobación en el Approval Workflow Core.
    await this.approvalWorkflowService.createRequest(
      companyId.toString(),
      {
        module: ApprovalEntity.PHVA_ADVANCED,
        entityType: 'PhvaAdvancedResourceAssignment',
        entityId: record._id.toString(),
        assignedRoles: ['owner', 'manager'],
        comments: 'Aprobación del módulo Asignación de Recursos SG-SST (1.1.3)',
      },
      buildApprovalActor({
        userId: request.user?._id,
        firebaseUid: request.user?.uid,
        email: request.user?.email,
        role: request.user?.role,
      }),
    );

    return record;
  }

  @Post('resource-assignment/approve')
  @Roles('owner', 'manager')
  async approveResourceAssignment(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    // El endpoint no recibe entityId (resuelve el registro por empresa); se
    // obtiene el registro vigente para delegar la decisión al motor.
    const record = await this.phvaAdvancedService.findResourceAssignmentByCompany(companyId);

    // Delegar la aprobación al Approval Workflow Core, que reutiliza
    // PhvaAdvancedService.approveResourceAssignment a través del handler
    // (conserva APPROVED/APPROVED_AND_SIGNED, auditHistory, approvedBy y
    // alertas). La respuesta conserva compatibilidad con el frontend actual.
    const result = await this.approvalWorkflowService.decideAndApply(
      companyId.toString(),
      ApprovalEntity.PHVA_ADVANCED,
      record._id.toString(),
      {
        decision: ApprovalDecision.APPROVED,
        metadata: {
          signerEmail: request.user?.email,
          signerRole: request.user?.role,
        },
      },
      buildApprovalActor({
        userId: request.user?._id,
        firebaseUid: request.user?.uid,
        email: request.user?.email,
        role: request.user?.role,
      }),
    );

    return result.applied;
  }

  @Post('resource-assignment/reject')
  @Roles('owner', 'manager')
  async rejectResourceAssignment(@Req() request: RequestWithUser, @Body() dto: { reason: string }) {
    if (!dto.reason || !dto.reason.trim()) throw new BadRequestException('Rejection reason is required');
    const companyId = this.resolveCompanyId(request);
    const record = await this.phvaAdvancedService.findResourceAssignmentByCompany(companyId);

    // Delegar el rechazo al Approval Workflow Core, que reutiliza
    // PhvaAdvancedService.rejectResourceAssignment a través del handler.
    const result = await this.approvalWorkflowService.decideAndApply(
      companyId.toString(),
      ApprovalEntity.PHVA_ADVANCED,
      record._id.toString(),
      {
        decision: ApprovalDecision.REJECTED,
        reason: dto.reason,
      },
      buildApprovalActor({
        userId: request.user?._id,
        firebaseUid: request.user?.uid,
        email: request.user?.email,
        role: request.user?.role,
      }),
    );

    return result.applied;
  }

  /**
   * Garantiza que exista una solicitud PENDING_APPROVAL para Responsibilities
   * antes de delegar la decisión al motor (mitigación de ciclo rechazo →
   * corrección → re-aprobación). Evita duplicar la creación de la solicitud
   * entre approve y reject.
   */
  private async ensurePendingResponsibilitiesRequest(
    companyId: Types.ObjectId,
    entityId: string,
    actor: ApprovalActor,
  ): Promise<void> {
    const existing = await this.approvalWorkflowService.findRequestByEntity(
      companyId.toString(),
      ApprovalEntity.PHVA_ADVANCED,
      entityId,
    );
    if (!existing || existing.status !== ApprovalStatus.PENDING_APPROVAL) {
      await this.approvalWorkflowService.createRequest(
        companyId.toString(),
        {
          module: ApprovalEntity.PHVA_ADVANCED,
          entityType: 'PhvaAdvancedResponsibilities',
          entityId,
          assignedRoles: ['owner', 'manager'],
          comments: 'Aprobación de la matriz de responsabilidades (1.1.2)',
        },
        actor,
      );
    }
  }

  private mapTrainingStatusToDecision(
    status: 'APPROVED' | 'REJECTED' | 'ADJUSTMENTS_REQUESTED',
  ): ApprovalDecision {
    switch (status) {
      case 'APPROVED':
        return ApprovalDecision.APPROVED;
      case 'REJECTED':
        return ApprovalDecision.REJECTED;
      case 'ADJUSTMENTS_REQUESTED':
        return ApprovalDecision.ADJUSTMENTS_REQUESTED;
    }
  }

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

  private async uploadToFirebaseStorage(companyId: Types.ObjectId, file: UploadedBinaryFile): Promise<string> {
    const app = this.firebaseAdminService.getApp();
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET ?? this.resolveStorageBucketName(app);

    if (!bucketName) {
      throw new InternalServerErrorException('Missing Firebase Storage bucket configuration');
    }

    const bucket = getStorage(app).bucket(bucketName);
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `phva-advanced/${companyId.toString()}/responsable-sst/${Date.now()}-${sanitizedName}`;
    const bucketFile = bucket.file(filePath);

    try {
      await bucketFile.save(file.buffer, {
        metadata: { contentType: file.mimetype },
        resumable: false,
      });
      await bucketFile.makePublic();
      return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';
      throw new InternalServerErrorException(`Failed to upload PHVA advanced document: ${errorMessage}`);
    }
  }

  private resolveStorageBucketName(app: ReturnType<FirebaseAdminService['getApp']>): string | undefined {
    const options = app.options as { storageBucket?: string };
    return options.storageBucket;
  }
}

type UploadedBinaryFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};
