import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { UsersService } from '../users/users.service';
import { ImprovementPlansService } from './improvement-plans.service';
import {
  AddPlanActivityEvidenceDto,
  AddPlanMonitoringDto,
  CreateImprovementPlanDto,
  CreatePlanActivityDto,
  RegisterPlanActivityFollowUpDto,
  UpdateImprovementPlanDto,
  UpdateImprovementPlanStatusDto,
  UpdatePlanActivityDto,
  UpdatePlanActivityStatusDto,
} from './dto/improvement-plan.dto';

/**
 * E1 (7.1.4) — Controller del dominio IMPROVEMENT-PLANS (Plan de mejoramiento).
 *
 * Seguridad:
 * - companyId SIEMPRE server-side: resuelto del usuario autenticado vía
 *   UsersService.findByFirebaseUid (mecanismo estándar del repo). NUNCA
 *   proviene de payload, query ni header del cliente.
 * - Roles (matriz del dominio, política del proyecto):
 *   · READ (GET): owner/admin/manager.
 *   · WRITE (POST/PATCH/DELETE): owner/admin únicamente — manager consulta
 *     pero no modifica.
 *   · member: sin acceso al módulo avanzado 7.1.4.
 * - El estado del plan SOLO cambia por PATCH /:id/status; el de la actividad
 *   por PATCH /:id/activities/:activityId/status; el seguimiento del plan por
 *   POST /:id/monitoring (independiente de las actividades).
 * - DELETE limitado a DRAFT (los planes en curso se CANCELLED — evidencia
 *   histórica preservada).
 */
@Controller('improvement-plans')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class ImprovementPlansController {
  constructor(
    private readonly plansService: ImprovementPlansService,
    private readonly usersService: UsersService,
  ) {}

  // ── Plan ────────────────────────────────────────────────────────────────

  @Post()
  @Roles('owner', 'admin')
  async create(@Req() request: RequestWithUser, @Body() dto: CreateImprovementPlanDto) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.plansService.create(companyId, dto, actor);
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(
    @Req() request: RequestWithUser,
    @Query('status') status?: string,
    @Query('year') year?: string,
    @Query('responsibleUserId') responsibleUserId?: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.plansService.findAll(companyId, {
      ...(status ? { status } : {}),
      ...(year && !Number.isNaN(Number(year)) ? { year: Number(year) } : {}),
      ...(responsibleUserId ? { responsibleUserId } : {}),
    });
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  async findById(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.plansService.findById(companyId, id);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateImprovementPlanDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.plansService.update(companyId, id, dto, actor);
  }

  @Patch(':id/status')
  @Roles('owner', 'admin')
  async changeStatus(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateImprovementPlanStatusDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.plansService.changeStatus(companyId, id, dto, actor);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  async remove(@Req() request: RequestWithUser, @Param('id') id: string) {
    const { companyId, actor } = await this.resolveTenant(request);
    await this.plansService.remove(companyId, id, actor);
    return { deleted: true };
  }

  // ── Actividades ─────────────────────────────────────────────────────────

  @Post(':id/activities')
  @Roles('owner', 'admin')
  async createActivity(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: CreatePlanActivityDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.plansService.createActivity(companyId, id, dto, actor);
  }

  @Patch(':id/activities/:activityId')
  @Roles('owner', 'admin')
  async updateActivity(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @Body() dto: UpdatePlanActivityDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.plansService.updateActivity(companyId, id, activityId, dto, actor);
  }

  @Patch(':id/activities/:activityId/status')
  @Roles('owner', 'admin')
  async changeActivityStatus(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @Body() dto: UpdatePlanActivityStatusDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.plansService.changeActivityStatus(companyId, id, activityId, dto, actor);
  }

  // ── Evidencia y seguimiento de actividades ──────────────────────────────

  @Post(':id/activities/:activityId/evidence')
  @Roles('owner', 'admin')
  async addActivityEvidence(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @Body() dto: AddPlanActivityEvidenceDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.plansService.addActivityEvidence(companyId, id, activityId, dto, actor);
  }

  @Post(':id/activities/:activityId/follow-up')
  @Roles('owner', 'admin')
  async registerActivityFollowUp(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @Body() dto: RegisterPlanActivityFollowUpDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.plansService.registerActivityFollowUp(companyId, id, activityId, dto, actor);
  }

  // ── Seguimiento periódico del plan ──────────────────────────────────────

  @Post(':id/monitoring')
  @Roles('owner', 'admin')
  async addMonitoring(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: AddPlanMonitoringDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.plansService.addMonitoring(companyId, id, dto, actor);
  }

  // ── Historial ───────────────────────────────────────────────────────────

  @Get(':id/history')
  @Roles('owner', 'admin', 'manager')
  async getHistory(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.plansService.getHistory(companyId, id);
  }

  // ── Tenant server-side (única autoridad de companyId) ───────────────────

  private async resolveCompanyId(request: RequestWithUser): Promise<Types.ObjectId> {
    const firebaseUid = request.user?.uid;
    if (!firebaseUid) {
      throw new ForbiddenException('Missing authenticated user');
    }
    const user = await this.usersService.findByFirebaseUid(firebaseUid);
    if (!user) {
      throw new ForbiddenException('Authenticated user is not registered');
    }
    return user.companyId;
  }

  /** Tenant + actor para las mutaciones (actor server-side). */
  private async resolveTenant(
    request: RequestWithUser,
  ): Promise<{ companyId: Types.ObjectId; actor: { userId: Types.ObjectId; userEmail: string } }> {
    const firebaseUid = request.user?.uid;
    if (!firebaseUid) {
      throw new ForbiddenException('Missing authenticated user');
    }
    const user = await this.usersService.findByFirebaseUid(firebaseUid);
    if (!user) {
      throw new ForbiddenException('Authenticated user is not registered');
    }
    return {
      companyId: user.companyId,
      actor: {
        userId: user._id as Types.ObjectId,
        userEmail: (user as unknown as { email?: string }).email ?? '',
      },
    };
  }
}
