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
import { OccupationalMedicalRecordCustodyService } from './occupational-medical-record-custody.service';
import { CreateOccupationalMedicalRecordCustodyDto } from './dto/create-occupational-medical-record-custody.dto';
import { UpdateOccupationalMedicalRecordCustodyDto } from './dto/update-occupational-medical-record-custody.dto';

/**
 * Controlador de custodia de historias clínicas ocupacionales (3.1.5 — FASE 30F/30G).
 *
 * Endpoints:
 * - POST   /occupational-medical-record-custody          (owner, admin)
 * - GET    /occupational-medical-record-custody          (owner, admin, manager)
 * - GET    /occupational-medical-record-custody/:id      (owner, admin, manager)
 * - PATCH  /occupational-medical-record-custody/:id      (owner, admin)
 * - PATCH  /occupational-medical-record-custody/:id/deactivate (owner, admin)
 *
 * SEGURIDAD (patrón de módulos hermanos: health-promotion, occupational-exam):
 * - FirebaseAuthGuard: exige token Firebase válido (usuario autenticado).
 * - RolesGuard + @Roles(...): aplica la matriz de roles por endpoint.
 * - companyId SIEMPRE se resuelve server-side vía UsersService.findByFirebaseUid:
 *   nunca se acepta un companyId arbitrario enviado por el frontend.
 *
 * Todos los endpoints son tenant-aware: companyId se deriva de la sesión
 * autenticada, nunca del body.
 */
@Controller('occupational-medical-record-custody')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class OccupationalMedicalRecordCustodyController {
  constructor(
    private readonly custodyService: OccupationalMedicalRecordCustodyService,
    private readonly usersService: UsersService,
  ) {}

  /** Crea un nuevo registro de custodia. Requiere roles: owner, admin. */
  @Post()
  @Roles('owner', 'admin')
  async create(
    @Req() request: RequestWithUser,
    @Body() dto: CreateOccupationalMedicalRecordCustodyDto,
  ) {
    const { companyId, actorUid } = await this.resolveContext(request);
    const record = await this.custodyService.create(companyId, dto, actorUid);
    return {
      success: true,
      data: record,
    };
  }

  /**
   * Lista registros de custodia del tenant. Requiere roles: owner, admin, manager.
   *
   * Query params opcionales:
   * - active (boolean)
   * - employeeId (ObjectId)
   * - custodyStatus (string)
   * - recordType (string)
   * - limit (number, default 100)
   * - skip (number, default 0)
   */
  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(
    @Req() request: RequestWithUser,
    @Query('active') active?: string,
    @Query('employeeId') employeeId?: string,
    @Query('custodyStatus') custodyStatus?: string,
    @Query('recordType') recordType?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const companyId = await this.resolveCompanyId(request);

    const options: {
      active?: boolean;
      employeeId?: string;
      custodyStatus?: string;
      recordType?: string;
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

    if (custodyStatus) {
      options.custodyStatus = custodyStatus;
    }

    if (recordType) {
      options.recordType = recordType;
    }

    if (limit) {
      options.limit = parseInt(limit, 10) || 100;
    }

    if (skip) {
      options.skip = parseInt(skip, 10) || 0;
    }

    const records = await this.custodyService.findAll(companyId, options);
    return {
      success: true,
      data: records,
      count: records.length,
    };
  }

  /** Obtiene un registro de custodia por ID. Requiere roles: owner, admin, manager. */
  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  async findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);

    if (!Types.ObjectId.isValid(id)) {
      return { success: false, error: 'ID inválido' };
    }

    const record = await this.custodyService.findOne(companyId, id);

    if (!record) {
      return { success: false, error: 'Registro no encontrado' };
    }

    return {
      success: true,
      data: record,
    };
  }

  /** Actualiza parcialmente un registro de custodia. Requiere roles: owner, admin. */
  @Patch(':id')
  @Roles('owner', 'admin')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateOccupationalMedicalRecordCustodyDto,
  ) {
    const { companyId, actorUid } = await this.resolveContext(request);

    if (!Types.ObjectId.isValid(id)) {
      return { success: false, error: 'ID inválido' };
    }

    const record = await this.custodyService.update(companyId, id, dto, actorUid);

    if (!record) {
      return { success: false, error: 'Registro no encontrado' };
    }

    return {
      success: true,
      data: record,
    };
  }

  /** Desactiva (borrado lógico) un registro de custodia. Requiere roles: owner, admin. */
  @Patch(':id/deactivate')
  @Roles('owner', 'admin')
  async deactivate(@Req() request: RequestWithUser, @Param('id') id: string) {
    const { companyId, actorUid } = await this.resolveContext(request);

    if (!Types.ObjectId.isValid(id)) {
      return { success: false, error: 'ID inválido' };
    }

    const record = await this.custodyService.deactivate(companyId, id, actorUid);

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
