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
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto';
import { UpdateMaintenanceStatusDto } from './dto/update-maintenance-status.dto';
import { MaintenanceService } from './maintenance.service';

/**
 * Controller del módulo Maintenance (4.2.5 — V1).
 *
 * Permisos (mismo modelo @Roles + RolesGuard del repo):
 * - Crear / editar / cambiar estado / eliminar: owner, admin
 * - Consultar (lista/una):                      owner, admin, manager
 * - member: sin acceso (RolesGuard rechaza con 403).
 *
 * El companyId SIEMPRE se resuelve server-side desde el usuario autenticado
 * (patrón resolveCompanyId de InspectionsController/ControlVerificationController)
 * — nunca desde el cliente.
 */
@Controller('maintenance')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class MaintenanceController {
  constructor(
    private readonly maintenanceService: MaintenanceService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  @Roles('owner', 'admin')
  async create(@Req() request: RequestWithUser, @Body() dto: CreateMaintenanceDto) {
    const { companyId, role, userUid } = await this.resolveCompanyContext(request);
    this.maintenanceService.assertCanWrite(role);
    return this.maintenanceService.create(companyId, dto, userUid);
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(
    @Req() request: RequestWithUser,
    @Query('status') status?: string,
    @Query('maintenanceType') maintenanceType?: string,
    @Query('itemType') itemType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { companyId } = await this.resolveCompanyContext(request);
    return this.maintenanceService.findAll(companyId, { status, maintenanceType, itemType, from, to });
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  async findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    const { companyId } = await this.resolveCompanyContext(request);
    return this.maintenanceService.findOne(id, companyId);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  async update(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: UpdateMaintenanceDto) {
    const { companyId, role, userUid } = await this.resolveCompanyContext(request);
    this.maintenanceService.assertCanWrite(role);
    return this.maintenanceService.update(id, companyId, dto, userUid);
  }

  /** Cambio de estado: iniciar, completar, cancelar (y reabrir un cancelado). */
  @Patch(':id/status')
  @Roles('owner', 'admin')
  async updateStatus(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateMaintenanceStatusDto,
  ) {
    const { companyId, role, userUid } = await this.resolveCompanyContext(request);
    this.maintenanceService.assertCanWrite(role);
    return this.maintenanceService.updateStatus(id, companyId, dto, userUid);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  async remove(@Req() request: RequestWithUser, @Param('id') id: string) {
    const { companyId, role } = await this.resolveCompanyContext(request);
    this.maintenanceService.assertCanWrite(role);
    return this.maintenanceService.remove(id, companyId);
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
