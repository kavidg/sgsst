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
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RequestWithUser } from '../auth/auth.types';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { UsersService } from '../users/users.service';
import { WasteManagementService } from './waste-management.service';
import { CreateWasteManagementRecordDto } from './dto/create-waste-management-record.dto';
import { UpdateWasteManagementRecordDto } from './dto/update-waste-management-record.dto';
import { DeclareWasteTypesDto } from './dto/declare-waste-types.dto';

/**
 * Controlador de gestión de residuos (3.1.9 — FASE 34C).
 *
 * Endpoints:
 * - POST   /waste-management               (owner, admin)
 * - GET    /waste-management               (owner, admin, manager)
 * - GET    /waste-management/:id           (owner, admin, manager)
 * - PATCH  /waste-management/:id           (owner, admin)
 * - PATCH  /waste-management/:id/deactivate (owner, admin)
 *
 * SEGURIDAD (patrón 3.1.5/3.1.6/3.1.8 — módulos hermanos):
 * - FirebaseAuthGuard: exige token Firebase válido (usuario autenticado).
 * - RolesGuard + @Roles(...): matriz de roles por endpoint.
 *   WRITE (create/update/deactivate) → owner, admin
 *   READ  (findAll/findOne)          → owner, admin, manager
 * - companyId SIEMPRE se resuelve server-side vía UsersService.findByFirebaseUid:
 *   nunca se acepta un companyId enviado por el frontend (body/query/URL).
 *
 * METADATA-ONLY: no se registran datos clínicos ni información personal
 * innecesaria. Solo la gestión operativa de residuos generados por la
 * operación.
 */
@Controller('waste-management')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class WasteManagementController {
  constructor(
    private readonly wasteManagementService: WasteManagementService,
    private readonly usersService: UsersService,
  ) {}

  /** Crea un registro de residuo. Requiere roles: owner, admin. */
  @Post()
  @Roles('owner', 'admin')
  async create(
    @Req() request: RequestWithUser,
    @Body() dto: CreateWasteManagementRecordDto,
  ) {
    const { companyId, actorUid } = await this.resolveContext(request);
    const record = await this.wasteManagementService.create(companyId, dto, actorUid);
    return {
      success: true,
      data: record,
    };
  }

  /**
   * Declara los tipos de residuo que la empresa realmente genera (C1 de 3.1.9).
   * Requiere roles: owner, admin.
   */
  @Post('declared-types')
  @Roles('owner', 'admin')
  async declareWasteTypes(
    @Req() request: RequestWithUser,
    @Body() dto: DeclareWasteTypesDto,
  ) {
    const { companyId, actorUid } = await this.resolveContext(request);
    const declaration = await this.wasteManagementService.declareWasteTypes(
      companyId,
      dto,
      actorUid,
    );
    return {
      success: true,
      data: declaration,
    };
  }

  /** Obtiene la declaración de tipos generados. Requiere roles: owner, admin, manager. */
  @Get('declared-types')
  @Roles('owner', 'admin', 'manager')
  async getDeclaredWasteTypes(@Req() request: RequestWithUser) {
    const companyId = await this.resolveCompanyId(request);
    const declaration = await this.wasteManagementService.getWasteTypeDeclaration(companyId);
    return {
      success: true,
      data: declaration,
    };
  }

  /**
   * Lista registros de residuos del tenant. Requiere roles: owner, admin, manager.
   *
   * Query params opcionales:
   * - active (boolean)
   * - wasteType (SOLID | LIQUID | GASEOUS)
   * - hazardous (boolean)
   * - status (PLANNED | ACTIVE | SUSPENDED)
   * - limit (number, default 100)
   * - skip (number, default 0)
   */
  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(
    @Req() request: RequestWithUser,
    @Query('active') active?: string,
    @Query('wasteType') wasteType?: string,
    @Query('hazardous') hazardous?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const companyId = await this.resolveCompanyId(request);

    const options: {
      active?: boolean;
      wasteType?: string;
      hazardous?: boolean;
      status?: string;
      limit?: number;
      skip?: number;
    } = {};

    if (active !== undefined) {
      options.active = active === 'true';
    }
    if (wasteType) {
      options.wasteType = wasteType;
    }
    if (hazardous !== undefined) {
      options.hazardous = hazardous === 'true';
    }
    if (status) {
      options.status = status;
    }
    if (limit) {
      options.limit = parseInt(limit, 10) || 100;
    }
    if (skip) {
      options.skip = parseInt(skip, 10) || 0;
    }

    const records = await this.wasteManagementService.findAll(companyId, options);
    return {
      success: true,
      data: records,
      count: records.length,
    };
  }

  /** Obtiene un registro por ID. Requiere roles: owner, admin, manager. */
  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  async findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);

    if (!Types.ObjectId.isValid(id)) {
      return { success: false, error: 'ID inválido' };
    }

    const record = await this.wasteManagementService.findOne(companyId, id);

    if (!record) {
      return { success: false, error: 'Registro no encontrado' };
    }

    return {
      success: true,
      data: record,
    };
  }

  /** Actualiza parcialmente un registro. Requiere roles: owner, admin. */
  @Patch(':id')
  @Roles('owner', 'admin')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateWasteManagementRecordDto,
  ) {
    const { companyId, actorUid } = await this.resolveContext(request);

    if (!Types.ObjectId.isValid(id)) {
      return { success: false, error: 'ID inválido' };
    }

    const record = await this.wasteManagementService.update(companyId, id, dto, actorUid);

    if (!record) {
      return { success: false, error: 'Registro no encontrado' };
    }

    return {
      success: true,
      data: record,
    };
  }

  /** Desactiva (borrado lógico) un registro. Requiere roles: owner, admin. */
  @Patch(':id/deactivate')
  @Roles('owner', 'admin')
  async deactivate(@Req() request: RequestWithUser, @Param('id') id: string) {
    const { companyId, actorUid } = await this.resolveContext(request);

    if (!Types.ObjectId.isValid(id)) {
      return { success: false, error: 'ID inválido' };
    }

    const record = await this.wasteManagementService.deactivate(companyId, id, actorUid);

    if (!record) {
      return { success: false, error: 'Registro no encontrado' };
    }

    return {
      success: true,
      data: record,
      message: 'Registro desactivado correctamente',
    };
  }

  /**
   * Resuelve companyId + actorUid desde la sesión autenticada.
   * companyId proviene del registro de usuario (server-side), NUNCA del body
   * ni de un header controlable por el cliente. Se normaliza a hex string,
   * que es el contrato del service (new Types.ObjectId(companyId)).
   */
  private async resolveContext(request: RequestWithUser): Promise<{
    companyId: string;
    actorUid: string;
  }> {
    const firebaseUid = request.user?.uid;

    if (!firebaseUid) {
      throw new ForbiddenException('Missing authenticated user');
    }

    const user = await this.usersService.findByFirebaseUid(firebaseUid);

    if (!user) {
      throw new ForbiddenException('Authenticated user is not registered');
    }

    return { companyId: user.companyId.toHexString(), actorUid: firebaseUid };
  }

  /** Resuelve companyId desde la sesión autenticada (para endpoints de lectura). */
  private async resolveCompanyId(request: RequestWithUser): Promise<string> {
    const firebaseUid = request.user?.uid;

    if (!firebaseUid) {
      throw new ForbiddenException('Missing authenticated user');
    }

    const user = await this.usersService.findByFirebaseUid(firebaseUid);

    if (!user) {
      throw new ForbiddenException('Authenticated user is not registered');
    }

    return user.companyId.toHexString();
  }
}
