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
import { CreateIncidentDto } from './dto/create-incident.dto';
import { QueryIncidentDto } from './dto/query-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import {
  AddActionEvidenceDto,
  AddInvestigationEvidenceDto,
  CreateInvestigationActionDto,
  RegisterActionFollowUpDto,
  UpdateIncidentLifecycleDto,
  UpdateInvestigationActionDto,
  UpdateInvestigationActionStatusDto,
  UpdateInvestigationDto,
} from './dto/investigation-management.dto';
import { IncidentsService } from './incidents.service';

/**
 * E1 (7.1.3) — Controller del dominio incidents (Accidentalidad 3.2.1 +
 * gestión avanzada de Acciones por accidentes 7.1.3).
 *
 * Seguridad:
 * - companyId SIEMPRE server-side: resuelto del usuario autenticado vía
 *   UsersService.findByFirebaseUid (mecanismo estándar del repo). NUNCA
 *   proviene de payload, query ni header del cliente.
 * - Roles de la GESTIÓN AVANZADA 7.1.3 (endpoints nuevos):
 *   · READ (GET): owner/admin/manager.
 *   · WRITE (POST/PATCH): owner/admin únicamente.
 *   · member: sin acceso a la gestión avanzada.
 *   El CRUD básico 3.2.1 conserva sus roles y comportamiento originales
 *   (compatibilidad; la visibilidad de registro básico se decide en E3).
 * - Cross-tenant: 404 (indistinguible de inexistente) — patrón del service.
 */
@Controller('incidents')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class IncidentsController {
  constructor(
    private readonly incidentsService: IncidentsService,
    private readonly usersService: UsersService,
  ) {}

  // ── CRUD 3.2.1 (INTACTO — compatibilidad) ───────────────────────────────

  @Post()
  @Roles('owner', 'admin')
  async create(@Req() request: RequestWithUser, @Body() createIncidentDto: CreateIncidentDto) {
    const companyId = await this.resolveCompanyId(request);
    return this.incidentsService.create(companyId, createIncidentDto);
  }

  @Get('stats')
  @Roles('owner', 'admin', 'manager')
  async getStats(@Req() request: RequestWithUser) {
    const companyId = await this.resolveCompanyId(request);
    return this.incidentsService.getDiseaseInvestigationStats(companyId);
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(@Req() request: RequestWithUser, @Query() query: QueryIncidentDto) {
    const companyId = await this.resolveCompanyId(request);
    return this.incidentsService.findAll(companyId, query.investigationType);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  async findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.incidentsService.findOne(id, companyId);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() updateIncidentDto: UpdateIncidentDto,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.incidentsService.update(id, companyId, updateIncidentDto);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  async remove(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.incidentsService.remove(id, companyId);
  }

  // ── E1 (7.1.3): GESTIÓN AVANZADA (endpoints especializados) ────────────

  /** Inicia/actualiza la investigación del caso (equipo/causas 1 query $in). */
  @Patch(':id/investigation')
  @Roles('owner', 'admin')
  async updateInvestigation(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateInvestigationDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.incidentsService.updateInvestigation(companyId, id, dto, actor);
  }

  /** Evidencia estructurada de la investigación (DocumentMaster tenant-safe). */
  @Post(':id/investigation/evidence')
  @Roles('owner', 'admin')
  async addInvestigationEvidence(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: AddInvestigationEvidenceDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.incidentsService.addInvestigationEvidence(companyId, id, dto, actor);
  }

  /** Crea una acción derivada de la investigación. */
  @Post(':id/actions')
  @Roles('owner', 'admin')
  async createAction(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: CreateInvestigationActionDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.incidentsService.createInvestigationAction(companyId, id, dto, actor);
  }

  /** Actualiza contenido de una acción no terminal (estado va por /status). */
  @Patch(':id/actions/:actionId')
  @Roles('owner', 'admin')
  async updateAction(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Param('actionId') actionId: string,
    @Body() dto: UpdateInvestigationActionDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.incidentsService.updateInvestigationAction(companyId, id, actionId, dto, actor);
  }

  /** Cambia el estado de la acción (máquina de estados server-side). */
  @Patch(':id/actions/:actionId/status')
  @Roles('owner', 'admin')
  async updateActionStatus(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Param('actionId') actionId: string,
    @Body() dto: UpdateInvestigationActionStatusDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.incidentsService.updateInvestigationActionStatus(companyId, id, actionId, dto, actor);
  }

  /** Evidencia declarativa de la acción (documentId tenant-safe / URL). */
  @Post(':id/actions/:actionId/evidence')
  @Roles('owner', 'admin')
  async addActionEvidence(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Param('actionId') actionId: string,
    @Body() dto: AddActionEvidenceDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.incidentsService.addActionEvidence(companyId, id, actionId, dto, actor);
  }

  /** Registra seguimiento de la acción (percepción de efectividad). */
  @Post(':id/actions/:actionId/follow-up')
  @Roles('owner', 'admin')
  async registerActionFollowUp(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Param('actionId') actionId: string,
    @Body() dto: RegisterActionFollowUpDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.incidentsService.registerActionFollowUp(companyId, id, actionId, dto, actor);
  }

  /** Cambia la etapa canónica del caso (COMPLETED/CLOSED con reglas de cierre). */
  @Patch(':id/lifecycle')
  @Roles('owner', 'admin')
  async updateLifecycle(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateIncidentLifecycleDto,
  ) {
    const { companyId, actor } = await this.resolveTenant(request);
    return this.incidentsService.updateLifecycle(companyId, id, dto, actor);
  }

  /** Historial append-only del caso (solo lectura; tenant-scoped). */
  @Get(':id/history')
  @Roles('owner', 'admin', 'manager')
  async getHistory(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.incidentsService.getIncidentHistory(companyId, id);
  }

  // ── Tenant server-side (única autoridad de companyId) ──────────────────

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

  /** Tenant + actor para las mutaciones 7.1.3 (actor server-side). */
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
