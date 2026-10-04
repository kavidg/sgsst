import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RequestWithUser } from '../auth/auth.types';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { UsersService } from '../users/users.service';
import { ForbiddenException } from '@nestjs/common';
import { ControlVerificationService } from './control-verification.service';
import { CreateControlVerificationDto } from './dto/create-control-verification.dto';
import { UpdateControlVerificationFollowUpDto } from './dto/update-control-verification-follow-up.dto';

/**
 * ETAPA 3 (PHVA 4.2.2) — Rutas anidadas bajo Risk (patrón submit-approval del repo).
 *
 * Permisos (mismo modelo @Roles + RolesGuard de RisksController):
 * - Crear verificación:       owner, admin
 * - Consultar (lista/una):    owner, admin, manager
 * - Actualizar seguimiento:   owner, admin
 * - member: sin acceso (RolesGuard rechaza con 403).
 *
 * El companyId SIEMPRE se resuelve server-side desde el usuario autenticado
 * (patrón resolveCompanyId de RisksController) — nunca desde el cliente.
 */
@Controller('risks/:riskId/verifications')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class ControlVerificationController {
  constructor(
    private readonly controlVerificationService: ControlVerificationService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  @Roles('owner', 'admin')
  async create(
    @Req() request: RequestWithUser,
    @Param('riskId') riskId: string,
    @Body() dto: CreateControlVerificationDto,
  ) {
    const { companyId, role } = await this.resolveCompanyContext(request);
    this.controlVerificationService.assertCanWrite(role);
    return this.controlVerificationService.create(riskId, companyId, dto);
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(@Req() request: RequestWithUser, @Param('riskId') riskId: string) {
    const { companyId } = await this.resolveCompanyContext(request);
    return this.controlVerificationService.findAll(riskId, companyId);
  }

  @Get(':verificationId')
  @Roles('owner', 'admin', 'manager')
  async findOne(
    @Req() request: RequestWithUser,
    @Param('riskId') riskId: string,
    @Param('verificationId') verificationId: string,
  ) {
    const { companyId } = await this.resolveCompanyContext(request);
    return this.controlVerificationService.findOne(riskId, verificationId, companyId);
  }

  @Patch(':verificationId/follow-up')
  @Roles('owner', 'admin')
  async updateFollowUp(
    @Req() request: RequestWithUser,
    @Param('riskId') riskId: string,
    @Param('verificationId') verificationId: string,
    @Body() dto: UpdateControlVerificationFollowUpDto,
  ) {
    const { companyId, role } = await this.resolveCompanyContext(request);
    this.controlVerificationService.assertCanWrite(role);
    return this.controlVerificationService.updateFollowUp(riskId, verificationId, companyId, dto);
  }

  private async resolveCompanyContext(
    request: RequestWithUser,
  ): Promise<{ companyId: Types.ObjectId; role?: string }> {
    const firebaseUid = request.user?.uid;
    if (!firebaseUid) {
      throw new ForbiddenException('Missing authenticated user');
    }
    const user = await this.usersService.findByFirebaseUid(firebaseUid);
    if (!user) {
      throw new ForbiddenException('Authenticated user is not registered');
    }
    return { companyId: user.companyId, role: user.role };
  }
}
