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
import { WorkplaceSanitaryConditionsService } from './workplace-sanitary-conditions.service';
import { CreateWorkplaceSanitaryConditionDto } from './dto/create-workplace-sanitary-condition.dto';
import { UpdateWorkplaceSanitaryConditionDto } from './dto/update-workplace-sanitary-condition.dto';

/**
 * Controlador de condiciones sanitarias del lugar de trabajo
 * (3.1.8 — FASE 34B).
 *
 * Endpoints:
 * - POST   /workplace-sanitary-conditions               (owner, admin)
 * - GET    /workplace-sanitary-conditions               (owner, admin, manager)
 * - GET    /workplace-sanitary-conditions/:id           (owner, admin, manager)
 * - PATCH  /workplace-sanitary-conditions/:id           (owner, admin)
 * - PATCH  /workplace-sanitary-conditions/:id/deactivate (owner, admin)
 *
 * SEGURIDAD (patrón 3.1.5/3.1.6 — módulos hermanos):
 * - FirebaseAuthGuard: exige token Firebase válido (usuario autenticado).
 * - RolesGuard + @Roles(...): matriz de roles por endpoint.
 *   WRITE (create/update/deactivate) → owner, admin
 *   READ  (findAll/findOne)          → owner, admin, manager
 * - companyId SIEMPRE se resuelve server-side vía UsersService.findByFirebaseUid:
 *   nunca se acepta un companyId enviado por el frontend (body/query/URL).
 *
 * METADATA-ONLY: no se registran datos clínicos ni información sensible de
 * trabajadores. Solo la condición sanitaria verificada del lugar de trabajo.
 */
@Controller('workplace-sanitary-conditions')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class WorkplaceSanitaryConditionsController {
  constructor(
    private readonly workplaceSanitaryConditionsService: WorkplaceSanitaryConditionsService,
    private readonly usersService: UsersService,
  ) {}

  /** Crea una condición sanitaria. Requiere roles: owner, admin. */
  @Post()
  @Roles('owner', 'admin')
  async create(
    @Req() request: RequestWithUser,
    @Body() dto: CreateWorkplaceSanitaryConditionDto,
  ) {
    const { companyId, actorUid } = await this.resolveContext(request);
    const record = await this.workplaceSanitaryConditionsService.create(
      companyId,
      dto,
      actorUid,
    );
    return {
      success: true,
      data: record,
    };
  }

  /**
   * Lista condiciones sanitarias del tenant. Requiere roles: owner, admin, manager.
   *
   * Query params opcionales:
   * - active (boolean)
   * - conditionType (POTABLE_WATER | SANITARY_SERVICE | GARBAGE_MANAGEMENT)
   * - status (OPERATIONAL | DEFICIENT | OUT_OF_SERVICE)
   * - conditionResult (APT | NOT_APT | INCONCLUSIVE)
   * - limit (number, default 100)
   * - skip (number, default 0)
   */
  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(
    @Req() request: RequestWithUser,
    @Query('active') active?: string,
    @Query('conditionType') conditionType?: string,
    @Query('status') status?: string,
    @Query('conditionResult') conditionResult?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const companyId = await this.resolveCompanyId(request);

    const options: {
      active?: boolean;
      conditionType?: string;
      status?: string;
      conditionResult?: string;
      limit?: number;
      skip?: number;
    } = {};

    if (active !== undefined) {
      options.active = active === 'true';
    }
    if (conditionType) {
      options.conditionType = conditionType;
    }
    if (status) {
      options.status = status;
    }
    if (conditionResult) {
      options.conditionResult = conditionResult;
    }
    if (limit) {
      options.limit = parseInt(limit, 10) || 100;
    }
    if (skip) {
      options.skip = parseInt(skip, 10) || 0;
    }

    const records = await this.workplaceSanitaryConditionsService.findAll(
      companyId,
      options,
    );
    return {
      success: true,
      data: records,
      count: records.length,
    };
  }

  /** Obtiene una condición por ID. Requiere roles: owner, admin, manager. */
  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  async findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);

    if (!Types.ObjectId.isValid(id)) {
      return { success: false, error: 'ID inválido' };
    }

    const record = await this.workplaceSanitaryConditionsService.findOne(
      companyId,
      id,
    );

    if (!record) {
      return { success: false, error: 'Registro no encontrado' };
    }

    return {
      success: true,
      data: record,
    };
  }

  /** Actualiza parcialmente una condición. Requiere roles: owner, admin. */
  @Patch(':id')
  @Roles('owner', 'admin')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkplaceSanitaryConditionDto,
  ) {
    const { companyId, actorUid } = await this.resolveContext(request);

    if (!Types.ObjectId.isValid(id)) {
      return { success: false, error: 'ID inválido' };
    }

    const record = await this.workplaceSanitaryConditionsService.update(
      companyId,
      id,
      dto,
      actorUid,
    );

    if (!record) {
      return { success: false, error: 'Registro no encontrado' };
    }

    return {
      success: true,
      data: record,
    };
  }

  /** Desactiva (borrado lógico) una condición. Requiere roles: owner, admin. */
  @Patch(':id/deactivate')
  @Roles('owner', 'admin')
  async deactivate(@Req() request: RequestWithUser, @Param('id') id: string) {
    const { companyId, actorUid } = await this.resolveContext(request);

    if (!Types.ObjectId.isValid(id)) {
      return { success: false, error: 'ID inválido' };
    }

    const record = await this.workplaceSanitaryConditionsService.deactivate(
      companyId,
      id,
      actorUid,
    );

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
