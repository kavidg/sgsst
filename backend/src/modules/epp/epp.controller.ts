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
import { CreateEppDeliveryDto } from './dto/create-epp-delivery.dto';
import { UpdateEppDeliveryDto } from './dto/update-epp-delivery.dto';
import { UpdateEppDeliveryStatusDto } from './dto/update-epp-delivery-status.dto';
import { CreateEppApplicabilityDto } from './dto/create-epp-applicability.dto';
import { UpdateEppApplicabilityDto } from './dto/update-epp-applicability.dto';
import { EppService } from './epp.service';

/**
 * Controller del módulo de entregas de EPP (4.2.6 — Alternativa B).
 *
 * Permisos (mismo modelo @Roles + RolesGuard del repo):
 * - Crear / editar / cambiar estado: owner, admin
 * - Consultar (lista/detalle/historial): owner, admin, manager
 * - member: sin acceso (RolesGuard rechaza con 403).
 *
 * SEGURIDAD: el companyId SIEMPRE se resuelve server-side desde el usuario
 * autenticado (patrón MaintenanceController) — nunca desde el body/query.
 */
@Controller('epp')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class EppController {
  constructor(
    private readonly eppService: EppService,
    private readonly usersService: UsersService,
  ) {}

  @Post('deliveries')
  @Roles('owner', 'admin')
  async create(@Req() request: RequestWithUser, @Body() dto: CreateEppDeliveryDto) {
    const { companyId, role, userUid } = await this.resolveCompanyContext(request);
    this.eppService.assertCanWrite(role);
    return this.eppService.create(companyId, dto, userUid);
  }

  /** Filtros: employeeId, eppItemId, status, from, to y overdue=true (dinámico). */
  @Get('deliveries')
  @Roles('owner', 'admin', 'manager')
  async findAll(
    @Req() request: RequestWithUser,
    @Query('employeeId') employeeId?: string,
    @Query('eppItemId') eppItemId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('overdue') overdue?: string,
  ) {
    const { companyId } = await this.resolveCompanyContext(request);
    return this.eppService.findAll(companyId, { employeeId, eppItemId, status, from, to, overdue });
  }

  @Get('deliveries/:id')
  @Roles('owner', 'admin', 'manager')
  async findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    const { companyId } = await this.resolveCompanyContext(request);
    return this.eppService.findOne(id, companyId);
  }

  /** Historial inmutable (solo lectura; server-side desde la creación). */
  @Get('deliveries/:id/history')
  @Roles('owner', 'admin', 'manager')
  async getHistory(@Req() request: RequestWithUser, @Param('id') id: string) {
    const { companyId } = await this.resolveCompanyContext(request);
    const delivery = await this.eppService.findOne(id, companyId);
    return { deliveryId: delivery._id, history: delivery.history };
  }

  @Patch('deliveries/:id')
  @Roles('owner', 'admin')
  async update(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: UpdateEppDeliveryDto) {
    const { companyId, role, userUid } = await this.resolveCompanyContext(request);
    this.eppService.assertCanWrite(role);
    return this.eppService.update(id, companyId, dto, userUid);
  }

  /** Cambio de estado (REPLACED/RETURNED/DAMAGED) con transición validada. */
  @Patch('deliveries/:id/status')
  @Roles('owner', 'admin')
  async updateStatus(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateEppDeliveryStatusDto,
  ) {
    const { companyId, role, userUid } = await this.resolveCompanyContext(request);
    this.eppService.assertCanWrite(role);
    return this.eppService.updateStatus(id, companyId, dto, userUid);
  }

  // ═════════════════════════════════════════════════════════════════════
  // Matriz de aplicabilidad Cargo → EPP (4.2.6): estructura de REQUISITOS.
  // Escritura: owner/admin. Lectura: owner/admin/manager/member.
  // companyId SIEMPRE server-side (resolveCompanyContext); sin DELETE físico
  // (baja lógica con active=false vía PATCH).
  // ═════════════════════════════════════════════════════════════════════

  /** Crea una relación Cargo → EPP (409 si ya existe; 404 cross-tenant). */
  @Post('applicability')
  @Roles('owner', 'admin')
  async createApplicability(@Req() request: RequestWithUser, @Body() dto: CreateEppApplicabilityDto) {
    const { companyId, userUid } = await this.resolveCompanyContext(request);
    return this.eppService.createApplicability(companyId, dto, userUid);
  }

  /** Matriz enriquecida para la UI (JobProfiles + EPP activos + relaciones). */
  @Get('applicability/matrix')
  @Roles('owner', 'admin', 'manager', 'member')
  async getApplicabilityMatrix(@Req() request: RequestWithUser) {
    const { companyId } = await this.resolveCompanyContext(request);
    return this.eppService.getEppApplicabilityMatrix(companyId);
  }

  /** Toda la matriz del tenant. */
  @Get('applicability')
  @Roles('owner', 'admin', 'manager', 'member')
  async findApplicabilities(@Req() request: RequestWithUser) {
    const { companyId } = await this.resolveCompanyContext(request);
    return this.eppService.findApplicabilities(companyId);
  }

  /** Relaciones de un cargo (valida que el cargo sea del tenant). */
  @Get('applicability/job-profile/:jobProfileId')
  @Roles('owner', 'admin', 'manager', 'member')
  async findApplicabilitiesByJobProfile(
    @Req() request: RequestWithUser,
    @Param('jobProfileId') jobProfileId: string,
  ) {
    const { companyId } = await this.resolveCompanyContext(request);
    return this.eppService.findApplicabilitiesByJobProfile(companyId, jobProfileId);
  }

  /** Relaciones de un elemento EPP (valida que el ítem exista en el catálogo). */
  @Get('applicability/epp/:eppItemId')
  @Roles('owner', 'admin', 'manager', 'member')
  async findApplicabilitiesByEppItem(
    @Req() request: RequestWithUser,
    @Param('eppItemId') eppItemId: string,
  ) {
    const { companyId } = await this.resolveCompanyContext(request);
    return this.eppService.findApplicabilitiesByEppItem(companyId, eppItemId);
  }

  /** Una relación (404 único cross-tenant). */
  @Get('applicability/:id')
  @Roles('owner', 'admin', 'manager', 'member')
  async findApplicability(@Req() request: RequestWithUser, @Param('id') id: string) {
    const { companyId } = await this.resolveCompanyContext(request);
    return this.eppService.findApplicability(id, companyId);
  }

  /** Actualiza contenido (required/reason/scope/active); identidad inmutable. */
  @Patch('applicability/:id')
  @Roles('owner', 'admin')
  async updateApplicability(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateEppApplicabilityDto,
  ) {
    const { companyId, role, userUid } = await this.resolveCompanyContext(request);
    this.eppService.assertCanWrite(role);
    return this.eppService.updateApplicability(id, companyId, dto, userUid);
  }

  private async resolveCompanyContext(
    request: RequestWithUser,
  ): Promise<{ companyId: Types.ObjectId; role?: string; userUid: string }> {
    const firebaseUid = request.user?.uid;

    if (!firebaseUid) {
      throw new ForbiddenException('Missing authenticated user');
    }

    const user = await this.usersService.findByFirebaseUid(firebaseUid);

    if (!user) {
      throw new ForbiddenException('Authenticated user is not registered');
    }

    return { companyId: user.companyId, role: user.role, userUid: firebaseUid };
  }
}
