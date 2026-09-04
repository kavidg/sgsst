import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { CreateRiskMethodologyDto } from './dto/create-risk-methodology.dto';
import { UpdateRiskMethodologyDto } from './dto/update-risk-methodology.dto';
import { RiskMethodologyService } from './risk-methodology.service';

/**
 * Controller para metodologías de identificación de peligros.
 *
 * Rutas anidadas bajo /risks/methodologies para coexistir
 * con el RisksController existente en /risks.
 */
@Controller('risks/methodologies')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class RiskMethodologyController {
  constructor(
    private readonly methodologyService: RiskMethodologyService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  @Roles('owner', 'admin')
  async create(
    @Req() request: RequestWithUser,
    @Body() createDto: CreateRiskMethodologyDto,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.methodologyService.create(companyId, createDto);
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(@Req() request: RequestWithUser) {
    const companyId = await this.resolveCompanyId(request);
    return this.methodologyService.findAll(companyId);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  async findOne(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.methodologyService.findOne(id, companyId);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() updateDto: UpdateRiskMethodologyDto,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.methodologyService.update(id, companyId, updateDto);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  async remove(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.methodologyService.remove(id, companyId);
  }

  private async resolveCompanyId(
    request: RequestWithUser,
  ): Promise<Types.ObjectId> {
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
