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
import { CreateHazardousSubstanceDto } from './dto/create-hazardous-substance.dto';
import { UpdateHazardousSubstanceDto } from './dto/update-hazardous-substance.dto';
import { HazardousSubstanceService } from './hazardous-substance.service';

@Controller('risks/hazardous-substances')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class HazardousSubstanceController {
  constructor(
    private readonly substanceService: HazardousSubstanceService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  @Roles('owner', 'admin')
  async create(
    @Req() request: RequestWithUser,
    @Body() dto: CreateHazardousSubstanceDto,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.substanceService.create(companyId, dto);
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(@Req() request: RequestWithUser) {
    const companyId = await this.resolveCompanyId(request);
    return this.substanceService.findAll(companyId);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  async findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.substanceService.findOne(id, companyId);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateHazardousSubstanceDto,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.substanceService.update(id, companyId, dto);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  async remove(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.substanceService.remove(id, companyId);
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
