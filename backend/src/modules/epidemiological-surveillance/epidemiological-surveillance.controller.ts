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
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RequestWithUser } from '../auth/auth.types';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { UsersService } from '../users/users.service';
import {
  CreateEpidemiologicalSurveillanceProgramDto,
  UpdateEpidemiologicalSurveillanceProgramDto,
} from './dto/create-epidemiological-surveillance.dto';
import { EpidemiologicalSurveillanceService } from './epidemiological-surveillance.service';

@Controller('epidemiological-surveillance')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class EpidemiologicalSurveillanceController {
  constructor(
    private readonly surveillanceService: EpidemiologicalSurveillanceService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  @Roles('owner', 'admin', 'manager')
  async create(
    @Req() request: RequestWithUser,
    @Body() dto: CreateEpidemiologicalSurveillanceProgramDto,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.surveillanceService.create(companyId, dto);
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(
    @Req() request: RequestWithUser,
    @Query('status') status?: string,
    @Query('surveillanceType') surveillanceType?: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.surveillanceService.findAll(companyId, {
      status,
      surveillanceType,
    });
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  async findOne(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.surveillanceService.findOne(id, companyId);
  }

  @Patch(':id')
  @Roles('owner', 'admin', 'manager')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateEpidemiologicalSurveillanceProgramDto,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.surveillanceService.update(id, companyId, dto);
  }

  @Delete(':id')
  @Roles('owner')
  async remove(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.surveillanceService.remove(id, companyId);
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
      throw new ForbiddenException(
        'Authenticated user is not registered',
      );
    }

    return user.companyId;
  }
}
