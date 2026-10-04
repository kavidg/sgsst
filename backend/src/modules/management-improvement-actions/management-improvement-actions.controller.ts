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
  AddImprovementActionEvidenceDto,
  CreateImprovementActionDto,
  RegisterImprovementActionFollowUpDto,
  UpdateImprovementActionDto,
  UpdateImprovementActionStatusDto,
} from './dto/management-improvement-action.dto';
import { ManagementImprovementActionsService } from './management-improvement-actions.service';

/**
 * E1 (7.1.2) — Controller del dominio MANAGEMENT-IMPROVEMENT-ACTIONS
 * (Acciones de mejora de la alta dirección).
 *
 * Seguridad:
 * - companyId SIEMPRE server-side: resuelto del usuario autenticado vía
 *   UsersService.findByFirebaseUid (mecanismo estándar del repo). NUNCA
 *   proviene de payload, query ni header del cliente.
 * - Roles (matriz por endpoint, política del proyecto):
 *   · READ (GET): owner/admin/manager.
 *   · WRITE (POST/PATCH): owner/admin únicamente — manager consulta pero no
 *     escribe (RolesGuard aplica el mecanismo estándar de autorización).
 *   · member: sin acceso al dominio administrativo de acciones de mejora.
 * - El estado SOLO cambia por PATCH /:id/status (máquina de estados
 *   server-side); el seguimiento SOLO por POST /:id/follow-up.
 * - Sin DELETE: la acción es evidencia histórica; se usa CANCELLED con
 *   historial append-only.
 * - Sin approve/reject ni verify-effectiveness (E1): la aprobación
 *   centralizada pertenece al futuro approval-workflow.
 */
@Controller('management-improvement-actions')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class ManagementImprovementActionsController {
  constructor(
    private readonly actionsService: ManagementImprovementActionsService,
    private readonly usersService: UsersService,
  ) {}

  // ── Acciones ────────────────────────────────────────────────────────────

  @Post()
  @Roles('owner', 'admin')
  async create(@Req() request: RequestWithUser, @Body() dto: CreateImprovementActionDto) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.actionsService.create(companyId, dto, actor);
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(
    @Req() request: RequestWithUser,
    @Query('status') status?: string,
    @Query('origin') origin?: string,
    @Query('priority') priority?: string,
    @Query('responsibleUserId') responsibleUserId?: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.actionsService.findAll(companyId, {
      ...(status ? { status: status as never } : {}),
      ...(origin ? { origin: origin as never } : {}),
      ...(priority ? { priority: priority as never } : {}),
      ...(responsibleUserId ? { responsibleUserId } : {}),
    });
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  async findById(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.actionsService.findById(companyId, id);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateImprovementActionDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.actionsService.update(companyId, id, dto, actor);
  }

  @Patch(':id/status')
  @Roles('owner', 'admin')
  async changeStatus(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateImprovementActionStatusDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.actionsService.changeStatus(companyId, id, dto, actor);
  }

  // ── Evidencia y seguimiento (endpoints especializados) ──────────────────

  @Post(':id/evidence')
  @Roles('owner', 'admin')
  async addEvidence(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: AddImprovementActionEvidenceDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.actionsService.addEvidence(companyId, id, dto, actor);
  }

  @Post(':id/follow-up')
  @Roles('owner', 'admin')
  async addFollowUp(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: RegisterImprovementActionFollowUpDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.actionsService.addFollowUp(companyId, id, dto, actor);
  }

  // ── Historial ───────────────────────────────────────────────────────────

  @Get(':id/history')
  @Roles('owner', 'admin', 'manager')
  async getHistory(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.actionsService.getHistory(companyId, id);
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
    actor: { userId: Types.ObjectId; userEmail: string };
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
        userEmail: (user as unknown as { email?: string }).email ?? '',
      },
    };
  }
}
