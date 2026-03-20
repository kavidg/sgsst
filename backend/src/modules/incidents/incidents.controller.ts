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
import { RequestWithUser } from '../auth/auth.types';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { UsersService } from '../users/users.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { IncidentsService } from './incidents.service';

@Controller('incidents')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class IncidentsController {
  constructor(
    private readonly incidentsService: IncidentsService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  @Roles('owner', 'admin')
  async create(@Req() request: RequestWithUser, @Body() createIncidentDto: CreateIncidentDto) {
    const companyId = await this.resolveCompanyId(request);
    return this.incidentsService.create(companyId, createIncidentDto);
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(@Req() request: RequestWithUser) {
    const companyId = await this.resolveCompanyId(request);
    return this.incidentsService.findAll(companyId);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  async findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.incidentsService.findOne(id, companyId);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() updateIncidentDto: UpdateIncidentDto,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.incidentsService.update(id, companyId, updateIncidentDto);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  async remove(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.incidentsService.remove(id, companyId);
  }

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
