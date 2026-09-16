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
import { WorkRestrictionService } from './work-restriction.service';
import { CreateWorkRestrictionDto } from './dto/create-work-restriction.dto';
import { UpdateWorkRestrictionDto } from './dto/update-work-restriction.dto';

/**
 * Controlador de restricciones y recomendaciones médico-laborales
 * (3.1.6 — FASE 33).
 *
 * Endpoints:
 * - POST   /work-restrictions          (owner, admin)
 * - GET    /work-restrictions          (owner, admin, manager)
 * - GET    /work-restrictions/:id      (owner, admin, manager)
 * - PATCH  /work-restrictions/:id      (owner, admin)
 * - PATCH  /work-restrictions/:id/deactivate (owner, admin)
 *
 * SEGURIDAD (patrón 3.1.5 — módulos hermanos):
 * - FirebaseAuthGuard: exige token Firebase válido (usuario autenticado).
 * - RolesGuard + @Roles(...): matriz de roles por endpoint.
 *   WRITE (create/update/deactivate) → owner, admin
 *   READ  (findAll/findOne)          → owner, admin, manager
 * - companyId SIEMPRE se resuelve server-side vía UsersService.findByFirebaseUid:
 *   nunca se acepta un companyId enviado por el frontend (body/query/URL).
 *
 * METADATA-ONLY: no se registran ni muestran diagnósticos, CIE, historias
 * clínicas, tratamientos, medicamentos ni resultados clínicos. Solo el hecho
 * administrativo/operacional de la restricción/recomendación laboral.
 */
@Controller('work-restrictions')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class WorkRestrictionController {
  constructor(
    private readonly workRestrictionService: WorkRestrictionService,
    private readonly usersService: UsersService,
  ) {}

  /** Crea una restricción/recomendación laboral. Requiere roles: owner, admin. */
  @Post()
  @Roles('owner', 'admin')
  async create(
    @Req() request: RequestWithUser,
    @Body() dto: CreateWorkRestrictionDto,
  ) {
    const { companyId, actorUid } = await this.resolveContext(request);
    const record = await this.workRestrictionService.create(companyId, dto, actorUid);
    return {
      success: true,
      data: record,
    };
  }

  /**
   * Lista restricciones/recomendaciones del tenant. Requiere roles: owner, admin, manager.
   *
   * Query params opcionales:
   * - active (boolean)
   * - employeeId (ObjectId)
   * - status (ACTIVE | FOLLOW_UP | CLOSED | CANCELLED)
   * - restrictionType (enum)
   * - limit (number, default 100)
   * - skip (number, default 0)
   */
  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(
    @Req() request: RequestWithUser,
    @Query('active') active?: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('restrictionType') restrictionType?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const companyId = await this.resolveCompanyId(request);

    const options: {
      active?: boolean;
      employeeId?: string;
      status?: string;
      restrictionType?: string;
      limit?: number;
      skip?: number;
    } = {};

    if (active !== undefined) {
      options.active = active === 'true';
    }
    if (employeeId) {
      if (!Types.ObjectId.isValid(employeeId)) {
        return { success: false, error: 'employeeId inválido' };
      }
      options.employeeId = employeeId;
    }
    if (status) {
      options.status = status;
    }
    if (restrictionType) {
      options.restrictionType = restrictionType;
    }
    if (limit) {
      options.limit = parseInt(limit, 10) || 100;
    }
    if (skip) {
      options.skip = parseInt(skip, 10) || 0;
    }

    const records = await this.workRestrictionService.findAll(companyId, options);
    return {
      success: true,
      data: records,
      count: records.length,
    };
  }

  /** Obtiene una restricción por ID. Requiere roles: owner, admin, manager. */
  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  async findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);

    if (!Types.ObjectId.isValid(id)) {
      return { success: false, error: 'ID inválido' };
    }

    const record = await this.workRestrictionService.findOne(companyId, id);

    if (!record) {
      return { success: false, error: 'Registro no encontrado' };
    }

    return {
      success: true,
      data: record,
    };
  }

  /** Actualiza parcialmente una restricción. Requiere roles: owner, admin. */
  @Patch(':id')
  @Roles('owner', 'admin')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkRestrictionDto,
  ) {
    const { companyId, actorUid } = await this.resolveContext(request);

    if (!Types.ObjectId.isValid(id)) {
      return { success: false, error: 'ID inválido' };
    }

    const record = await this.workRestrictionService.update(companyId, id, dto, actorUid);

    if (!record) {
      return { success: false, error: 'Registro no encontrado' };
    }

    return {
      success: true,
      data: record,
    };
  }

  /** Desactiva (borrado lógico) una restricción. Requiere roles: owner, admin. */
  @Patch(':id/deactivate')
  @Roles('owner', 'admin')
  async deactivate(@Req() request: RequestWithUser, @Param('id') id: string) {
    const { companyId, actorUid } = await this.resolveContext(request);

    if (!Types.ObjectId.isValid(id)) {
      return { success: false, error: 'ID inválido' };
    }

    const record = await this.workRestrictionService.deactivate(companyId, id, actorUid);

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
