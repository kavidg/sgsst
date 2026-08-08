import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
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
 * Fase 0: expone endpoints NUEVOS del motor de aprobaciones. No modifica ni
 * reemplaza ningún endpoint existente de los módulos actuales (los adapters
 * llegarán en fases posteriores).
 */
@Controller('approval-workflow')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class ApprovalWorkflowController {
  constructor(
    private readonly service: ApprovalWorkflowService,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Crea una solicitud de aprobación para una entidad de la empresa.
   */
  @Post('company/:companyId/requests')
  @Roles('owner', 'admin', 'manager')
  async createRequest(
    @Param('companyId') companyId: string,
    @Body() dto: CreateRequestDto,
    @Req() request: RequestWithUser,
  ) {
    return this.service.createRequest(companyId, dto, await this.buildActor(request));
  }

  /**
   * Decide sobre una solicitud pendiente (aprobar, rechazar o solicitar ajustes).
   */
  @Post('company/:companyId/requests/:requestId/decide')
  @Roles('owner', 'admin', 'manager')
  async decideRequest(
    @Param('companyId') companyId: string,
    @Param('requestId') requestId: string,
    @Body() dto: DecideRequestDto,
    @Req() request: RequestWithUser,
  ) {
    return this.service.decideRequest(companyId, requestId, dto, await this.buildActor(request));
  }

  /**
   * Devuelve el detalle de una solicitud de aprobación.
   */
  @Get('company/:companyId/requests/:requestId')
  @Roles('owner', 'admin', 'manager')
  async getRequest(
    @Param('companyId') companyId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.service.getRequest(companyId, requestId);
  }

  /**
   * Bandeja de solicitudes pendientes de una empresa.
   */
  @Get('company/:companyId/pending')
  @Roles('owner', 'admin', 'manager', 'member')
  async getPending(
    @Param('companyId') companyId: string,
    @Query() query: PendingRequestsDto,
  ) {
    return this.service.getPending(companyId, query);
  }

  /**
   * Historial de eventos de una solicitud (append-only).
   */
  @Get('company/:companyId/requests/:requestId/history')
  @Roles('owner', 'admin', 'manager', 'member')
  async getHistory(
    @Param('companyId') companyId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.service.getHistory(companyId, requestId);
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
