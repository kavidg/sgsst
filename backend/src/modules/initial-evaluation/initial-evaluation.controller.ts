import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { UsersService } from '../users/users.service';
import { ApprovalWorkflowService } from '../approval-workflow/approval-workflow.service';
import { ApprovalEntity } from '../approval-workflow/enums/approval-entity.enum';
import { ApprovalDecision } from '../approval-workflow/enums/approval-decision.enum';
import { ApprovalActor } from '../approval-workflow/interfaces/approval-actor.interface';
import { buildApprovalActor } from '../approval-workflow/helpers/approval-actor.helper';
import { UserDocument } from '../users/schemas/user.schema';
import { SignApprovalDto, SubmitApprovalDto, UpdateStandardDto, UpsertActionDto, UpsertFindingDto } from './dto/initial-evaluation.dto';
import { InitialEvaluationService } from './initial-evaluation.service';

@Controller('advanced-management/initial-evaluation')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class InitialEvaluationController {
  constructor(
    private readonly initialEvaluationService: InitialEvaluationService,
    private readonly usersService: UsersService,
    private readonly approvalWorkflowService: ApprovalWorkflowService,
  ) {}

  @Get()
  @Roles('owner', 'admin', 'manager', 'member')
  async getCurrent(@Req() request: RequestWithUser) {
    return this.initialEvaluationService.findOrCreate(this.resolveCompanyId(request));
  }

  @Post('auto-diagnostic')
  @Roles('owner', 'admin', 'manager')
  async autoDiagnostic(@Req() request: RequestWithUser) {
    return this.initialEvaluationService.runAutoDiagnostic(this.resolveCompanyId(request), await this.resolveUser(request));
  }

  @Patch('standards/:code')
  @Roles('owner', 'admin')
  async updateStandard(@Req() request: RequestWithUser, @Param('code') code: string, @Body() dto: UpdateStandardDto) {
    return this.initialEvaluationService.updateStandard(this.resolveCompanyId(request), code, dto, await this.resolveUser(request));
  }

  @Post('findings')
  @Roles('owner', 'admin')
  async upsertFinding(@Req() request: RequestWithUser, @Body() dto: UpsertFindingDto) {
    return this.initialEvaluationService.upsertFinding(this.resolveCompanyId(request), dto, await this.resolveUser(request));
  }

  @Post('actions')
  @Roles('owner', 'admin')
  async upsertAction(@Req() request: RequestWithUser, @Body() dto: UpsertActionDto) {
    return this.initialEvaluationService.upsertAction(this.resolveCompanyId(request), dto, await this.resolveUser(request));
  }

  @Post('actions/generate')
  @Roles('owner', 'admin')
  async generateActions(@Req() request: RequestWithUser) {
    return this.initialEvaluationService.generateActionPlan(this.resolveCompanyId(request), await this.resolveUser(request));
  }

  @Post('submit-approval')
  @Roles('owner', 'admin')
  async submitApproval(@Req() request: RequestWithUser, @Body() dto: SubmitApprovalDto) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUser(request);

    // Lógica documental existente (valida estándares + plan de acción y pasa a
    // PENDING_APPROVAL manteniendo historial y alertas).
    const evaluation = await this.initialEvaluationService.submitForApproval(
      companyId,
      dto,
      user,
    );

    // Fase 3 — Registrar la solicitud en el Approval Workflow Core.
    await this.approvalWorkflowService.createRequest(
      companyId.toString(),
      {
        module: ApprovalEntity.INITIAL_EVALUATION,
        entityType: 'InitialEvaluation',
        entityId: evaluation._id.toString(),
        assignedRoles: ['owner', 'manager'],
        comments: dto.comments,
      },
      this.buildActor(user),
    );

    return evaluation;
  }

  @Post('manager-sign')
  @Roles('owner', 'manager')
  async managerSign(@Req() request: RequestWithUser, @Body() dto: SignApprovalDto) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUser(request);

    // Fase 3 — Delegar al Approval Workflow Core. El adapter reutiliza
    // InitialEvaluationService.managerSign (conserva firma, approvalDocumentUrl
    // y auditoría local) y `result.applied` mantiene la misma respuesta frontend.
    const result = await this.approvalWorkflowService.decideAndApply(
      companyId.toString(),
      ApprovalEntity.INITIAL_EVALUATION,
      await this.currentEvaluationId(companyId),
      {
        decision: ApprovalDecision.APPROVED,
        comments: dto.comments,
        metadata: {
          approvedById: user._id.toString(),
          signerName: dto.signerName,
          signerEmail: dto.signerEmail,
          signatureUrl: dto.signatureUrl,
        },
      },
      this.buildActor(user),
    );

    // Mantiene la misma respuesta del frontend (la evaluación actualizada).
    return result.applied;
  }

  @Get('executive-dashboard')
  @Roles('owner', 'admin', 'manager')
  async executiveDashboard(@Req() request: RequestWithUser) {
    return this.initialEvaluationService.executiveDashboard(this.resolveCompanyId(request));
  }

  private resolveCompanyId(request: RequestWithUser) {
    if (!request.companyId || !Types.ObjectId.isValid(request.companyId)) throw new ForbiddenException('Missing company context');
    return request.companyId;
  }

  private async resolveUser(request: RequestWithUser) {
    const firebaseUid = request.user?.uid;
    if (!firebaseUid) throw new ForbiddenException('Missing authenticated user');
    const user = await this.usersService.findByFirebaseUid(firebaseUid);
    if (!user) throw new ForbiddenException('Authenticated user is not registered');
    return user;
  }

  private async currentEvaluationId(companyId: Types.ObjectId) {
    const evaluation = await this.initialEvaluationService.findCurrent(companyId);
    return evaluation._id.toString();
  }

  /**
   * Construye el actor del Approval Workflow Core a partir del usuario real
   * usando el helper central buildApprovalActor (ObjectId + firebaseUid).
   */
  private buildActor(user: UserDocument): ApprovalActor {
    return buildApprovalActor({
      userId: user._id.toString(),
      firebaseUid: user.firebaseUid,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`.trim(),
      role: user.role,
    });
  }
}
