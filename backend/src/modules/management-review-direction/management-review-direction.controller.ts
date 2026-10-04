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
  AttachMinutesEvidenceDto,
  CreateManagementReviewDirectionDto,
  CreateReviewDecisionDto,
  CreateReviewInputDto,
  ListManagementReviewDirectionQueryDto,
  UpdateManagementReviewDirectionDto,
  UpdateManagementReviewDirectionStatusDto,
  UpdateReviewDecisionDto,
  UpdateReviewInputDto,
} from './dto/management-review-direction.dto';
import { ManagementReviewDirectionService } from './management-review-direction.service';
import { ManagementReviewDirectionStatus } from './schemas/management-review-direction.schema';

/**
 * E1 (6.1.3) — Controller del dominio MANAGEMENT-REVIEW-DIRECTION (Revisión
 * por la dirección).
 *
 * Seguridad:
 * - companyId SIEMPRE server-side: resuelto del usuario autenticado vía
 *   UsersService.findByFirebaseUid (mecanismo estándar del repo). NUNCA
 *   proviene de payload, query ni header del cliente.
 * - Roles (matriz por endpoint):
 *   · READ (GET): owner/admin/manager/member.
 *   · WRITE (POST/PATCH): owner/admin únicamente — manager y member son
 *     lectura (RolesGuard aplica el mecanismo estándar de autorización).
 * - Sin DELETE: una revisión es evidencia histórica; no se elimina
 *   físicamente (usar estado CANCELLED con historial).
 */
@Controller('management-review-direction')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class ManagementReviewDirectionController {
  constructor(
    private readonly managementReviewDirectionService: ManagementReviewDirectionService,
    private readonly usersService: UsersService,
  ) {}

  // ── Revisiones ──────────────────────────────────────────────────────────

  @Post()
  @Roles('owner', 'admin')
  async create(@Req() request: RequestWithUser, @Body() dto: CreateManagementReviewDirectionDto) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.managementReviewDirectionService.create(companyId, dto, actor);
  }

  @Get()
  @Roles('owner', 'admin', 'manager', 'member')
  async findAll(@Req() request: RequestWithUser, @Query() filters: ListManagementReviewDirectionQueryDto) {
    const companyId = await this.resolveCompanyId(request);
    return this.managementReviewDirectionService.findAll(companyId, filters);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager', 'member')
  async findById(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.managementReviewDirectionService.findById(companyId, id);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  async update(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: UpdateManagementReviewDirectionDto) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.managementReviewDirectionService.update(companyId, id, dto, actor);
  }

  @Patch(':id/status')
  @Roles('owner', 'admin')
  async updateStatus(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateManagementReviewDirectionStatusDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.managementReviewDirectionService.updateStatus(companyId, id, dto, actor);
  }

  // ── Entradas de la revisión ─────────────────────────────────────────────

  @Post(':id/inputs')
  @Roles('owner', 'admin')
  async addInput(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: CreateReviewInputDto) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.managementReviewDirectionService.addInput(companyId, id, dto, actor);
  }

  @Patch(':id/inputs/:inputId')
  @Roles('owner', 'admin')
  async updateInput(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Param('inputId') inputId: string,
    @Body() dto: UpdateReviewInputDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.managementReviewDirectionService.updateInput(companyId, id, inputId, dto, actor);
  }

  // ── Decisiones de dirección (propias del dominio) ───────────────────────

  @Post(':id/decisions')
  @Roles('owner', 'admin')
  async addDecision(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: CreateReviewDecisionDto) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.managementReviewDirectionService.addDecision(companyId, id, dto, actor);
  }

  @Patch(':id/decisions/:decisionId')
  @Roles('owner', 'admin')
  async updateDecision(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Param('decisionId') decisionId: string,
    @Body() dto: UpdateReviewDecisionDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.managementReviewDirectionService.updateDecision(companyId, id, decisionId, dto, actor);
  }

  // ── Evidencia documental ────────────────────────────────────────────────

  @Patch(':id/evidence/minutes')
  @Roles('owner', 'admin')
  async attachMinutesEvidence(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: AttachMinutesEvidenceDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.managementReviewDirectionService.attachMinutesEvidence(companyId, id, dto, actor);
  }

  // ── Historial ───────────────────────────────────────────────────────────

  @Get(':id/history')
  @Roles('owner', 'admin', 'manager', 'member')
  async getHistory(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.managementReviewDirectionService.getHistory(companyId, id);
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
