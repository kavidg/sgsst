import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ApprovalWorkflowService } from './approval-workflow.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { DecideRequestDto } from './dto/decide-request.dto';
import { PendingRequestsDto } from './dto/pending-requests.dto';
import { ApprovalActor } from './interfaces/approval-actor.interface';
import { buildApprovalActor } from './helpers/approval-actor.helper';

/**
 * Controlador del Approval Workflow Core.
 *
 * AUDIT-13: Migrado de @Param('companyId') a request.companyId con
 * CompanyAccessGuard para garantizar tenant isolation.
 */
@Controller('approval-workflow')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class ApprovalWorkflowController {
  constructor(
    private readonly service: ApprovalWorkflowService,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  private getCompanyId(request: RequestWithUser): string {
    return request.companyId?.toString() ?? '';
  }

  /**
   * Crea una solicitud de aprobación para una entidad de la empresa.
   */
  @Post('requests')
  @Roles('owner', 'admin', 'manager')
  async createRequest(
    @Req() request: RequestWithUser,
    @Body() dto: CreateRequestDto,
  ) {
    return this.service.createRequest(this.getCompanyId(request), dto, await this.buildActor(request));
  }

  /**
   * Decide sobre una solicitud pendiente (aprobar, rechazar o solicitar ajustes).
   */
  @Post('requests/:requestId/decide')
  @Roles('owner', 'admin', 'manager')
  async decideRequest(
    @Req() request: RequestWithUser,
    @Param('requestId') requestId: string,
    @Body() dto: DecideRequestDto,
  ) {
    return this.service.decideRequest(this.getCompanyId(request), requestId, dto, await this.buildActor(request));
  }

  /**
   * Devuelve el detalle de una solicitud de aprobación.
   */
  @Get('requests/:requestId')
  @Roles('owner', 'admin', 'manager')
  async getRequest(
    @Req() request: RequestWithUser,
    @Param('requestId') requestId: string,
  ) {
    return this.service.getRequest(this.getCompanyId(request), requestId);
  }

  /**
   * Bandeja de solicitudes pendientes de una empresa.
   */
  @Get('pending')
  @Roles('owner', 'admin', 'manager', 'member')
  async getPending(
    @Req() request: RequestWithUser,
    @Query() query: PendingRequestsDto,
  ) {
    return this.service.getPending(this.getCompanyId(request), query);
  }

  /**
   * Historial de eventos de una solicitud (append-only).
   */
  @Get('requests/:requestId/history')
  @Roles('owner', 'admin', 'manager', 'member')
  async getHistory(
    @Req() request: RequestWithUser,
    @Param('requestId') requestId: string,
  ) {
    return this.service.getHistory(this.getCompanyId(request), requestId);
  }

  /**
   * Construye el actor con datos reales del usuario (role y email desde la DB),
   * porque FirebaseAuthGuard solo expone el uid. Mismo patrón de RolesGuard.
   * Usa el helper central buildApprovalActor: prefiere el ObjectId del usuario
   * y conserva el firebaseUid para compatibilidad.
   */
  private async buildActor(request: RequestWithUser): Promise<ApprovalActor> {
    const uid = request.user?.uid ?? 'unknown';
    const user = await this.userModel
      .findOne(
        { firebaseUid: uid },
        { _id: 1, email: 1, role: 1, firstName: 1, lastName: 1 },
      )
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
