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
  AddActionEvidenceDto,
  CreateCorrectivePreventiveActionDto,
  UpdateActionStatusDto,
  UpdateCorrectivePreventiveActionDto,
  VerifyEffectivenessDto,
} from './dto/corrective-preventive-action.dto';
import { CorrectivePreventiveActionsService } from './corrective-preventive-actions.service';

/**
 * E1 (7.1.1) — Controller del dominio CORRECTIVE-PREVENTIVE-ACTIONS
 * (Acciones preventivas y correctivas).
 *
 * Seguridad:
 * - companyId SIEMPRE server-side: resuelto del usuario autenticado vía
 *   UsersService.findByFirebaseUid (mecanismo estándar del repo). NUNCA
 *   proviene de payload, query ni header del cliente.
 * - Roles (matriz por endpoint, política del proyecto):
 *   · READ (GET): owner/admin/manager.
 *   · WRITE (POST/PATCH): owner/admin únicamente — manager consulta pero no
 *     escribe (RolesGuard aplica el mecanismo estándar de autorización).
 *   · member: sin acceso al dominio administrativo de acciones.
 * - El estado SOLO cambia por PATCH /:id/status (máquina de estados
 *   server-side); la eficacia SOLO por POST /:id/effectiveness.
 * - Sin DELETE: la acción es evidencia histórica; se usa CANCELLED con
 *   historial append-only.
 */
@Controller('corrective-preventive-actions')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class CorrectivePreventiveActionsController {
  constructor(
    private readonly actionsService: CorrectivePreventiveActionsService,
    private readonly usersService: UsersService,
  ) {}

  // ── Acciones ────────────────────────────────────────────────────────────

  @Post()
  @Roles('owner', 'admin')
  async create(@Req() request: RequestWithUser, @Body() dto: CreateCorrectivePreventiveActionDto) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.actionsService.create(companyId, dto, actor);
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(
    @Req() request: RequestWithUser,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('priority') priority?: string,
    @Query('origin') origin?: string,
    @Query('responsibleUserId') responsibleUserId?: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.actionsService.findAll(companyId, {
      ...(status ? { status: status as never } : {}),
      ...(type ? { type: type as never } : {}),
      ...(priority ? { priority: priority as never } : {}),
      ...(origin ? { origin: origin as never } : {}),
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
    @Body() dto: UpdateCorrectivePreventiveActionDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.actionsService.update(companyId, id, dto, actor);
  }

  @Patch(':id/status')
  @Roles('owner', 'admin')
  async changeStatus(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateActionStatusDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.actionsService.changeStatus(companyId, id, dto, actor);
  }

  // ── Evidencia y eficacia (endpoints especializados) ─────────────────────

  @Post(':id/evidence')
  @Roles('owner', 'admin')
  async addEvidence(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: AddActionEvidenceDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.actionsService.addEvidence(companyId, id, dto, actor);
  }

  @Post(':id/effectiveness')
  @Roles('owner', 'admin')
  async verifyEffectiveness(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: VerifyEffectivenessDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.actionsService.verifyEffectiveness(companyId, id, dto, actor);
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
