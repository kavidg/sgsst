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
  AttachAuditEvidenceDto,
  CreateAnnualAuditDto,
  CreateAuditActionDto,
  CreateAuditFindingDto,
  UpdateAnnualAuditDto,
  UpdateAnnualAuditStatusDto,
  UpdateAuditActionDto,
  UpdateAuditFindingDto,
} from './dto/annual-audit.dto';
import { AnnualAuditService } from './annual-audit.service';
import { AnnualAuditStatus } from './schemas/annual-audit.schema';

/**
 * E1 (6.1.2) — Controller del dominio ANNUAL-AUDIT (Auditoría anual SG-SST).
 *
 * Seguridad:
 * - companyId SIEMPRE server-side: resuelto del usuario autenticado vía
 *   UsersService.findByFirebaseUid (mecanismo estándar del repo). NUNCA
 *   proviene de payload, query ni header del cliente.
 * - Roles (matriz por endpoint):
 *   · READ (GET): owner/admin/manager/member.
 *   · WRITE (POST/PATCH): owner/admin únicamente — manager y member son
 *     lectura (RolesGuard aplica el mecanismo estándar de autorización).
 * - Sin DELETE: una auditoría es evidencia histórica; no se elimina
 *   físicamente (usar estado CANCELLED con historial).
 */
@Controller('annual-audit')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class AnnualAuditController {
  constructor(
    private readonly annualAuditService: AnnualAuditService,
    private readonly usersService: UsersService,
  ) {}

  // ── Auditorías ──────────────────────────────────────────────────────────

  @Post()
  @Roles('owner', 'admin')
  async create(@Req() request: RequestWithUser, @Body() dto: CreateAnnualAuditDto) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.annualAuditService.create(companyId, dto, actor);
  }

  @Get()
  @Roles('owner', 'admin', 'manager', 'member')
  async findAll(@Req() request: RequestWithUser, @Query('status') status?: AnnualAuditStatus) {
    const companyId = await this.resolveCompanyId(request);
    return this.annualAuditService.findAll(companyId, status);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager', 'member')
  async findById(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.annualAuditService.findById(companyId, id);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  async update(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: UpdateAnnualAuditDto) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.annualAuditService.update(companyId, id, dto, actor);
  }

  @Patch(':id/status')
  @Roles('owner', 'admin')
  async updateStatus(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateAnnualAuditStatusDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.annualAuditService.updateStatus(companyId, id, dto, actor);
  }

  // ── Hallazgos ───────────────────────────────────────────────────────────

  @Post(':id/findings')
  @Roles('owner', 'admin')
  async addFinding(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: CreateAuditFindingDto) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.annualAuditService.addFinding(companyId, id, dto, actor);
  }

  @Patch(':id/findings/:findingId')
  @Roles('owner', 'admin')
  async updateFinding(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Param('findingId') findingId: string,
    @Body() dto: UpdateAuditFindingDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.annualAuditService.updateFinding(companyId, id, findingId, dto, actor);
  }

  // ── Acciones de seguimiento ─────────────────────────────────────────────

  @Post(':id/findings/:findingId/actions')
  @Roles('owner', 'admin')
  async addAction(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Param('findingId') findingId: string,
    @Body() dto: CreateAuditActionDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.annualAuditService.addAction(companyId, id, findingId, dto, actor);
  }

  @Patch(':id/findings/:findingId/actions/:actionId')
  @Roles('owner', 'admin')
  async updateAction(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Param('findingId') findingId: string,
    @Param('actionId') actionId: string,
    @Body() dto: UpdateAuditActionDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.annualAuditService.updateAction(companyId, id, findingId, actionId, dto, actor);
  }

  // ── Evidencia documental ────────────────────────────────────────────────

  @Patch(':id/evidence/report')
  @Roles('owner', 'admin')
  async attachReportEvidence(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: AttachAuditEvidenceDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.annualAuditService.attachReportEvidence(companyId, id, dto, actor);
  }

  @Patch(':id/evidence/competence')
  @Roles('owner', 'admin')
  async attachCompetenceEvidence(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: AttachAuditEvidenceDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.annualAuditService.attachCompetenceEvidence(companyId, id, dto, actor);
  }

  // ── Historial ───────────────────────────────────────────────────────────

  @Get(':id/history')
  @Roles('owner', 'admin', 'manager', 'member')
  async getHistory(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.annualAuditService.getHistory(companyId, id);
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
