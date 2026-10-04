import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Put,
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
import { UpsertCompanyPeriodWorkDataDto } from './dto/upsert-company-period-work-data.dto';
import { CompanyPeriodWorkDataService } from '../incidents/company-period-work-data.service';

/**
 * E3-B (6.1.1) — Administración del denominador oficial de horas trabajadas.
 *
 * Endpoints bajo /indicators/work-data (el dato es consumido por los
 * indicadores ind-01/02/03 de este módulo; el schema/service permanecen en
 * incidents/ para no mover contratos existentes).
 *
 * Seguridad:
 * - companyId SIEMPRE server-side: resuelto del usuario autenticado vía
 *   UsersService (mismo mecanismo de IndicatorsController). El companyId
 *   NUNCA proviene de payload ni query.
 * - READ: owner/admin/manager/member (coherente con Indicators).
 * - WRITE: owner/admin únicamente. Manager y member NO pueden modificar
 *   horas (RolesGuard aplica el mecanismo estándar de autorización).
 * - Períodos CLOSED: la escritura es rechazada por el service
 *   (BadRequestException, mismo patrón que verifyPeriodOpen). Los GET
 *   de períodos cerrados permanecen permitidos.
 */
@Controller('indicators/work-data')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class CompanyPeriodWorkDataController {
  constructor(
    private readonly workDataService: CompanyPeriodWorkDataService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Lista los registros de la compañía autenticada.
   * Filtros opcionales: from=YYYY-MM, to=YYYY-MM (inclusivos).
   */
  @Get()
  @Roles('owner', 'admin', 'manager', 'member')
  async findAll(
    @Req() request: RequestWithUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.workDataService.findByCompanyAndRange(companyId, from, to);
  }

  /** Obtiene el registro YYYY-MM de la compañía autenticada (permitido en CLOSED). */
  @Get(':period')
  @Roles('owner', 'admin', 'manager', 'member')
  async findByPeriod(
    @Req() request: RequestWithUser,
    @Param('period') period: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.workDataService.findByCompanyAndPeriod(companyId, period);
  }

  /**
   * Crea o actualiza el registro del período. Idempotente sobre el índice
   * único { companyId, period }. Rechazado si el IndicatorPeriod está CLOSED.
   * El `period` de la URL debe coincidir con el del cuerpo.
   */
  @Put(':period')
  @Roles('owner', 'admin')
  async upsert(
    @Req() request: RequestWithUser,
    @Param('period') period: string,
    @Body() dto: UpsertCompanyPeriodWorkDataDto,
  ) {
    if (dto.period !== period) {
      throw new BadRequestException(
        'period del cuerpo debe coincidir con el period de la URL',
      );
    }
    const companyId = await this.resolveCompanyId(request);
    return this.workDataService.upsertForCompany(companyId, period, dto.hoursWorked);
  }

  /** Tenant resuelto server-side (única autoridad de companyId). */
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
}
