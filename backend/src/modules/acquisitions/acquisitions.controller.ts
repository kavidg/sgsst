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
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { RolesGuard } from '../questions/roles.guard';
import { Roles } from '../questions/roles.decorator';
import { UsersService } from '../users/users.service';
import { AcquisitionsService } from './acquisitions.service';
import { ApprovalWorkflowService } from '../approval-workflow/approval-workflow.service';
import { ApprovalEntity } from '../approval-workflow/enums/approval-entity.enum';
import { ApprovalDecision } from '../approval-workflow/enums/approval-decision.enum';
import { ApprovalActor } from '../approval-workflow/interfaces/approval-actor.interface';
import { buildApprovalActor } from '../approval-workflow/helpers/approval-actor.helper';
import { User, UserDocument } from '../users/schemas/user.schema';

@Controller('acquisitions')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class AcquisitionsController {
  constructor(
    private readonly acquisitionsService: AcquisitionsService,
    private readonly usersService: UsersService,
    private readonly approvalWorkflowService: ApprovalWorkflowService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  // ==================== DASHBOARD ====================

  @Get('dashboard')
  @Roles('owner', 'admin', 'manager', 'member')
  async getDashboard(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.acquisitionsService.getDashboard(companyId);
  }

  // ==================== SUPPLIERS ====================

  @Get('suppliers')
  @Roles('owner', 'admin', 'manager', 'member')
  async getSuppliers(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.acquisitionsService.findSuppliers(companyId);
  }

  @Get('suppliers/:id')
  @Roles('owner', 'admin', 'manager', 'member')
  async getSupplier(@Req() request: RequestWithUser, @Param('id') id: string) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    return this.acquisitionsService.findSupplierById(companyId, id);
  }

  @Post('suppliers')
  @Roles('owner', 'admin', 'manager')
  async createSupplier(@Req() request: RequestWithUser, @Body() body: any) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.acquisitionsService.createSupplier(
      companyId,
      body,
      user._id,
      user.email,
      `${user.firstName} ${user.lastName}`.trim(),
    );
  }

  @Patch('suppliers/:id')
  @Roles('owner', 'admin', 'manager')
  async updateSupplier(@Req() request: RequestWithUser, @Param('id') id: string, @Body() body: any) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.acquisitionsService.updateSupplier(companyId, id, body, user._id, user.email);
  }

  @Delete('suppliers/:id')
  @Roles('owner', 'admin')
  async deleteSupplier(@Req() request: RequestWithUser, @Param('id') id: string) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.acquisitionsService.deleteSupplier(companyId, id, user._id, user.email);
  }

  // ==================== ACQUISITIONS ====================

  @Get()
  @Roles('owner', 'admin', 'manager', 'member')
  async getAcquisitions(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.acquisitionsService.findAcquisitions(companyId);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager', 'member')
  async getAcquisition(@Req() request: RequestWithUser, @Param('id') id: string) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    return this.acquisitionsService.findAcquisitionById(companyId, id);
  }

  @Post()
  @Roles('owner', 'admin', 'manager')
  async createAcquisition(@Req() request: RequestWithUser, @Body() body: any) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.acquisitionsService.createAcquisition(
      companyId,
      body,
      user._id,
      user.email,
      `${user.firstName} ${user.lastName}`.trim(),
    );
  }

  @Patch(':id')
  @Roles('owner', 'admin', 'manager')
  async updateAcquisition(@Req() request: RequestWithUser, @Param('id') id: string, @Body() body: any) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.acquisitionsService.updateAcquisition(companyId, id, body, user._id, user.email);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  async deleteAcquisition(@Req() request: RequestWithUser, @Param('id') id: string) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.acquisitionsService.deleteAcquisition(companyId, id, user._id, user.email);
  }

  @Post(':id/status')
  @Roles('owner', 'admin', 'manager')
  async changeStatus(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    this.assertValidObjectId(id);
    if (!status) throw new BadRequestException('Status is required');
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.acquisitionsService.changeStatus(companyId, id, status, user._id, user.email);
  }

  @Post(':id/supplier')
  @Roles('owner', 'admin', 'manager')
  async assignSupplier(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body('supplierId') supplierId: string,
  ) {
    this.assertValidObjectId(id);
    if (!supplierId) throw new BadRequestException('Supplier ID is required');
    this.assertValidObjectId(supplierId, 'supplierId');
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.acquisitionsService.assignSupplier(companyId, id, supplierId, user._id, user.email);
  }

  // ==================== HISTORY ====================

  @Get('history')
  @Roles('owner', 'admin', 'manager', 'member')
  async getHistory(
    @Req() request: RequestWithUser,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.acquisitionsService.getHistory(companyId, Number(limit) || 100, Number(skip) || 0);
  }

  // ==================== APPROVAL WORKFLOW ====================

  @Post(':id/submit-approval')
  @Roles('owner', 'admin', 'manager')
  async submitForApproval(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body('comments') comments?: string,
  ) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);

    // Preparar (valida y actualiza approvalStatus)
    const prepared = await this.acquisitionsService.prepareForApproval(companyId, id, {
      userId: user._id.toString(),
      userEmail: user.email,
    });

    // Crear ApprovalRequest en el workflow core
    const actor = await this.buildActor(request);
    const approvalRequest = await this.approvalWorkflowService.createRequest(
      companyId.toString(),
      {
        module: ApprovalEntity.ACQUISITION,
        entityType: 'Acquisition',
        entityId: prepared.acquisitionId,
        assignedRoles: ['owner', 'manager'],
        comments: comments ?? `Aprobación de adquisición ${prepared.requestNumber}`,
      },
      actor,
    );

    // Notificar a aprobadores (mensaje incluye requestNumber para evitar deduplicación entre ciclos)
    void this.acquisitionsService.notifyApprovalEvent(companyId, {
      type: 'ACQUISITION_APPROVAL_SUBMITTED',
      message: `Adquisición ${prepared.requestNumber} enviada al flujo de aprobación y requiere revisión.`,
      severity: 'HIGH' as any,
      acquisitionId: prepared.acquisitionId,
      requestNumber: prepared.requestNumber,
      submittedBy: user.email,
      actionUrl: `/acquisitions`,
    });

    return {
      acquisitionId: prepared.acquisitionId,
      requestNumber: prepared.requestNumber,
      title: prepared.title,
      requestId: approvalRequest._id.toString(),
      status: approvalRequest.status,
    };
  }

  @Get(':id/approval')
  @Roles('owner', 'admin', 'manager', 'member')
  async getApprovalStatus(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
  ) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    return this.acquisitionsService.getApprovalStatus(companyId, id);
  }

  @Get(':id/approval/history')
  @Roles('owner', 'admin', 'manager', 'member')
  async getApprovalHistory(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
  ) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);

    // Buscar la solicitud de aprobación más reciente para esta adquisición
    const request_ = await this.approvalWorkflowService.findRequestByEntity(
      companyId.toString(),
      ApprovalEntity.ACQUISITION,
      id,
    );

    if (!request_) {
      return { history: [], requestId: null };
    }

    const history = await this.approvalWorkflowService.getHistory(
      companyId.toString(),
      request_._id.toString(),
    );

    return {
      requestId: request_._id.toString(),
      status: request_.status,
      history,
    };
  }

  @Post(':id/request-adjustments')
  @Roles('owner', 'manager')
  async requestAdjustments(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    this.assertValidObjectId(id);
    if (!reason || !reason.trim()) {
      throw new BadRequestException('Reason is required to request adjustments');
    }
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);

    const result = await this.acquisitionsService.requestAdjustments(companyId, id, reason.trim(), {
      userId: user._id.toString(),
      userEmail: user.email,
    });

    // Notificar solicitud de ajustes (mensaje incluye requestNumber para deduplicación correcta)
    void this.acquisitionsService.notifyApprovalEvent(companyId, {
      type: 'ACQUISITION_ADJUSTMENTS_REQUESTED',
      message: `Adquisición ${result.requestNumber}: se solicitaron ajustes antes de continuar con la aprobación.`,
      severity: 'MEDIUM' as any,
      acquisitionId: result.acquisitionId,
      requestNumber: result.requestNumber,
      submittedBy: user.email,
      actionUrl: `/acquisitions`,
    });

    return {
      acquisitionId: result.acquisitionId,
      requestNumber: result.requestNumber,
      status: result.approvalStatus,
    };
  }

  @Post(':id/approve')
  @Roles('owner', 'manager')
  async approve(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body('comments') comments?: string,
  ) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    const actor = await this.buildActor(request);

    const result = await this.approvalWorkflowService.decideAndApply(
      companyId.toString(),
      ApprovalEntity.ACQUISITION,
      id,
      { decision: ApprovalDecision.APPROVED, comments },
      actor,
    );

    // Notificar aprobación (mensaje incluye ID para evitar deduplicación entre ciclos)
    void this.acquisitionsService.notifyApprovalEvent(companyId, {
      type: 'ACQUISITION_APPROVED',
      message: `Adquisición ${id} fue aprobada correctamente.`,
      severity: 'MEDIUM' as any,
      acquisitionId: id,
      requestNumber: id,
      submittedBy: actor.email,
      actionUrl: `/acquisitions`,
    });

    return {
      acquisitionId: id,
      requestId: result.request?._id?.toString(),
      status: result.request?.status,
    };
  }

  @Post(':id/reject')
  @Roles('owner', 'manager')
  async reject(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body('reason') reason?: string,
    @Body('comments') comments?: string,
  ) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    const actor = await this.buildActor(request);

    const result = await this.approvalWorkflowService.decideAndApply(
      companyId.toString(),
      ApprovalEntity.ACQUISITION,
      id,
      { decision: ApprovalDecision.REJECTED, reason, comments },
      actor,
    );

    // Notificar rechazo (mensaje incluye ID para evitar deduplicación entre ciclos)
    void this.acquisitionsService.notifyApprovalEvent(companyId, {
      type: 'ACQUISITION_REJECTED',
      message: `Adquisición ${id} fue rechazada y requiere revisión.`,
      severity: 'HIGH' as any,
      acquisitionId: id,
      requestNumber: id,
      submittedBy: actor.email,
      actionUrl: `/acquisitions`,
    });

    return {
      acquisitionId: id,
      requestId: result.request?._id?.toString(),
      status: result.request?.status,
    };
  }

  // ==================== HELPERS ====================

  private assertValidObjectId(id: string, label = 'id') {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${label}: ${id}`);
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

  private async buildActor(request: RequestWithUser): Promise<ApprovalActor> {
    const uid = request.user?.uid ?? 'unknown';
    const user = await this.userModel
      .findOne({ firebaseUid: uid }, { _id: 1, email: 1, role: 1, firstName: 1, lastName: 1 })
      .lean()
      .exec();
    return buildApprovalActor({
      userId: user?._id?.toString(),
      firebaseUid: uid,
      email: user?.email,
      name: user ? `${user.firstName} ${user.lastName}`.trim() : undefined,
      role: user?.role,
    });
  }
}
