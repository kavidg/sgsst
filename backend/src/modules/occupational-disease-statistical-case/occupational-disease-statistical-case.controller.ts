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
import { OccupationalDiseaseStatisticalCaseService } from './occupational-disease-statistical-case.service';
import { CreateOccupationalDiseaseStatisticalCaseDto } from './dto/create-occupational-disease-statistical-case.dto';
import { UpdateOccupationalDiseaseStatisticalCaseDto } from './dto/update-occupational-disease-statistical-case.dto';

/**
 * Controlador de casos estadísticos de enfermedad laboral (FASE 35B).
 *
 * Infraestructura base para la futura medición epidemiológica
 * (35C: 3.3.4 prevalencia; 35D: 3.3.5 incidencia). Esta fase NO implementa
 * scoring: estos endpoints NO exponen métricas de prevalencia/incidencia ni
 * cumplimiento normativo — solo administración estadística de casos.
 *
 * Endpoints:
 * - POST   /occupational-disease-statistical-cases              (owner, admin)
 * - GET    /occupational-disease-statistical-cases              (owner, admin, manager)
 * - GET    /occupational-disease-statistical-cases/:id          (owner, admin, manager)
 * - PATCH  /occupational-disease-statistical-cases/:id          (owner, admin)
 * - PATCH  /occupational-disease-statistical-cases/:id/close    (owner, admin)
 * - PATCH  /occupational-disease-statistical-cases/:id/reopen   (owner, admin)
 * - PATCH  /occupational-disease-statistical-cases/:id/deactivate (owner, admin)
 * - PATCH  /occupational-disease-statistical-cases/:id/reactivate (owner, admin)
 *
 * SEGURIDAD (patrón 3.1.6/3.1.8/3.1.9 — módulos hermanos):
 * - FirebaseAuthGuard: exige token Firebase válido.
 * - RolesGuard + @Roles(...): WRITE → owner, admin; READ → owner, admin, manager.
 * - companyId SIEMPRE se resuelve server-side vía UsersService.findByFirebaseUid:
 *   nunca se acepta un companyId del frontend (body/query/URL) como autoridad.
 *
 * METADATA-ONLY: no se registran datos clínicos (diagnóstico, CIE, historia
 * clínica, síntomas, tratamientos, medicamentos, resultados clínicos).
 */
@Controller('occupational-disease-statistical-cases')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class OccupationalDiseaseStatisticalCaseController {
  constructor(
    private readonly caseService: OccupationalDiseaseStatisticalCaseService,
    private readonly usersService: UsersService,
  ) {}

  /** Crea un caso estadístico. Requiere roles: owner, admin. */
  @Post()
  @Roles('owner', 'admin')
  async create(
    @Req() request: RequestWithUser,
    @Body() dto: CreateOccupationalDiseaseStatisticalCaseDto,
  ) {
    const { companyId, actorUid } = await this.resolveContext(request);
    const created = await this.caseService.create(companyId, dto, actorUid);
    return { success: true, data: created };
  }

  /**
   * Lista casos del tenant. Requiere roles: owner, admin, manager.
   *
   * Query params opcionales: active, caseStatus, occupationalQualification,
   * period ('YYYY-MM'), year, statisticalCaseId, limit, skip.
   */
  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(
    @Req() request: RequestWithUser,
    @Query('active') active?: string,
    @Query('caseStatus') caseStatus?: string,
    @Query('occupationalQualification') occupationalQualification?: string,
    @Query('period') period?: string,
    @Query('year') year?: string,
    @Query('statisticalCaseId') statisticalCaseId?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const companyId = await this.resolveCompanyId(request);

    const options: {
      active?: boolean;
      caseStatus?: string;
      occupationalQualification?: string;
      period?: string;
      year?: string;
      statisticalCaseId?: string;
      limit?: number;
      skip?: number;
    } = {};

    if (active !== undefined) {
      options.active = active === 'true';
    }
    if (caseStatus) {
      options.caseStatus = caseStatus;
    }
    if (occupationalQualification) {
      options.occupationalQualification = occupationalQualification;
    }
    if (period) {
      options.period = period;
    }
    if (year) {
      options.year = year;
    }
    if (statisticalCaseId) {
      options.statisticalCaseId = statisticalCaseId;
    }
    if (limit) {
      options.limit = parseInt(limit, 10) || 100;
    }
    if (skip) {
      options.skip = parseInt(skip, 10) || 0;
    }

    const cases = await this.caseService.findAll(companyId, options);
    return { success: true, data: cases, count: cases.length };
  }

  /** Obtiene un caso por ID. Requiere roles: owner, admin, manager. */
  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  async findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);

    if (!Types.ObjectId.isValid(id)) {
      return { success: false, error: 'ID inválido' };
    }

    const record = await this.caseService.findOne(companyId, id);
    if (!record) {
      return { success: false, error: 'Caso no encontrado' };
    }

    return { success: true, data: record };
  }

  /** Actualiza parcialmente un caso. Requiere roles: owner, admin. */
  @Patch(':id')
  @Roles('owner', 'admin')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateOccupationalDiseaseStatisticalCaseDto,
  ) {
    const { companyId, actorUid } = await this.resolveContext(request);

    if (!Types.ObjectId.isValid(id)) {
      return { success: false, error: 'ID inválido' };
    }

    const record = await this.caseService.update(companyId, id, dto, actorUid);
    if (!record) {
      return { success: false, error: 'Caso no encontrado' };
    }

    return { success: true, data: record };
  }

  /**
   * Transición explícita OPEN → CLOSED. Requiere roles: owner, admin.
   * Cerrar NO convierte el caso en nuevo caso ni libera su statisticalCaseId.
   */
  @Patch(':id/close')
  @Roles('owner', 'admin')
  async close(@Req() request: RequestWithUser, @Param('id') id: string) {
    const { companyId, actorUid } = await this.resolveContext(request);

    if (!Types.ObjectId.isValid(id)) {
      return { success: false, error: 'ID inválido' };
    }

    const record = await this.caseService.close(companyId, id, actorUid);
    if (!record) {
      return { success: false, error: 'Caso no encontrado' };
    }

    return { success: true, data: record, message: 'Caso cerrado correctamente' };
  }

  /**
   * Transición explícita CLOSED → OPEN. Requiere roles: owner, admin.
   * Reabrir NO convierte el caso en un caso nuevo (firstOccurrence inmutable).
   */
  @Patch(':id/reopen')
  @Roles('owner', 'admin')
  async reopen(@Req() request: RequestWithUser, @Param('id') id: string) {
    const { companyId, actorUid } = await this.resolveContext(request);

    if (!Types.ObjectId.isValid(id)) {
      return { success: false, error: 'ID inválido' };
    }

    const record = await this.caseService.reopen(companyId, id, actorUid);
    if (!record) {
      return { success: false, error: 'Caso no encontrado' };
    }

    return { success: true, data: record, message: 'Caso reabierto correctamente' };
  }

  /** Desactiva (borrado lógico). Requiere roles: owner, admin. */
  @Patch(':id/deactivate')
  @Roles('owner', 'admin')
  async deactivate(@Req() request: RequestWithUser, @Param('id') id: string) {
    const { companyId, actorUid } = await this.resolveContext(request);

    if (!Types.ObjectId.isValid(id)) {
      return { success: false, error: 'ID inválido' };
    }

    const record = await this.caseService.deactivate(companyId, id, actorUid);
    if (!record) {
      return { success: false, error: 'Caso no encontrado' };
    }

    return { success: true, data: record, message: 'Caso desactivado correctamente' };
  }

  /** Reactiva un caso desactivado. Requiere roles: owner, admin. */
  @Patch(':id/reactivate')
  @Roles('owner', 'admin')
  async reactivate(@Req() request: RequestWithUser, @Param('id') id: string) {
    const { companyId, actorUid } = await this.resolveContext(request);

    if (!Types.ObjectId.isValid(id)) {
      return { success: false, error: 'ID inválido' };
    }

    const record = await this.caseService.reactivate(companyId, id, actorUid);
    if (!record) {
      return { success: false, error: 'Caso no encontrado' };
    }

    return { success: true, data: record, message: 'Caso reactivado correctamente' };
  }

  /**
   * Resuelve companyId + actorUid desde la sesión autenticada.
   * companyId proviene del registro de usuario (server-side), NUNCA del body
   * ni de un header controlable por el cliente.
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

  /** Resuelve companyId desde la sesión autenticada (endpoints de lectura). */
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
