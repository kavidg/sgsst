import {
  Body,
  Controller,
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
import {
  CreateCopasstAuditPlanningDto,
  CreatePlannedAuditDto,
  UpdateCopasstAuditPlanningDto,
  UpdateCopasstAuditPlanningStatusDto,
  UpdatePlannedAuditDto,
  UpdatePlannedAuditStatusDto,
} from './dto/copasst-audit-planning.dto';
import { CopasstAuditPlanningService } from './copasst-audit-planning.service';

/**
 * E1 (6.1.4) — Controller del dominio COPASST-AUDIT-PLANNING (Planificación
 * de auditorías COPASST).
 *
 * Seguridad:
 * - companyId SIEMPRE server-side: resuelto del usuario autenticado vía
 *   UsersService.findByFirebaseUid (mecanismo estándar del repo). NUNCA
 *   proviene de payload, query ni header del cliente.
 * - Roles (matriz por endpoint, política del proyecto):
 *   · READ (GET): owner/admin/manager.
 *   · WRITE (POST/PATCH): owner/admin únicamente — manager consulta pero no
 *     escribe (RolesGuard aplica el mecanismo estándar de autorización).
 *   · member: sin acceso al dominio administrativo de planificación.
 * - Sin DELETE: la planificación es evidencia histórica; no se elimina
 *   físicamente (usar estado CANCELLED con historial).
 */
@Controller('copasst-audit-planning')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class CopasstAuditPlanningController {
  constructor(
    private readonly copasstAuditPlanningService: CopasstAuditPlanningService,
    private readonly usersService: UsersService,
  ) {}

  // ── Planificación ───────────────────────────────────────────────────────

  @Post()
  @Roles('owner', 'admin')
  async create(@Req() request: RequestWithUser, @Body() dto: CreateCopasstAuditPlanningDto) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.copasstAuditPlanningService.create(companyId, dto, actor);
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(
    @Req() request: RequestWithUser,
    @Query('status') status?: string,
    @Query('responsibleUserId') responsibleUserId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.copasstAuditPlanningService.findAll(companyId, {
      ...(status ? { status: status as never } : {}),
      ...(responsibleUserId ? { responsibleUserId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  async findById(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.copasstAuditPlanningService.findById(companyId, id);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateCopasstAuditPlanningDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.copasstAuditPlanningService.update(companyId, id, dto, actor);
  }

  @Patch(':id/status')
  @Roles('owner', 'admin')
  async updateStatus(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateCopasstAuditPlanningStatusDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.copasstAuditPlanningService.updateStatus(companyId, id, dto, actor);
  }

  // ── Items planificados ──────────────────────────────────────────────────

  @Post(':id/items')
  @Roles('owner', 'admin')
  async addItem(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: CreatePlannedAuditDto) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.copasstAuditPlanningService.addItem(companyId, id, dto, actor);
  }

  @Patch(':id/items/:itemId')
  @Roles('owner', 'admin')
  async updateItem(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdatePlannedAuditDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.copasstAuditPlanningService.updateItem(companyId, id, itemId, dto, actor);
  }

  @Patch(':id/items/:itemId/status')
  @Roles('owner', 'admin')
  async updateItemStatus(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdatePlannedAuditStatusDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.copasstAuditPlanningService.updateItemStatus(companyId, id, itemId, dto, actor);
  }

  // ── Historial ───────────────────────────────────────────────────────────

  @Get(':id/history')
  @Roles('owner', 'admin', 'manager')
  async getHistory(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.copasstAuditPlanningService.getHistory(companyId, id);
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

  private async resolveTenant(request: RequestWithUser): Promise<{
    companyId: Types.ObjectId;
    actor: { userId?: Types.ObjectId; userEmail: string };
  }> {
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
        userEmail: user.email,
      },
    };
  }
}
