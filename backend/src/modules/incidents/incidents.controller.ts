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
import { UsersService } from '../users/users.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { IncidentsService } from './incidents.service';

@Controller('incidents')
@UseGuards(FirebaseAuthGuard)
export class IncidentsController {
  constructor(
    private readonly incidentsService: IncidentsService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  async create(@Req() request: RequestWithUser, @Body() createIncidentDto: CreateIncidentDto) {
    const companyId = await this.resolveCompanyId(request);
    return this.incidentsService.create(companyId, createIncidentDto);
  }

  @Get()
  async findAll(@Req() request: RequestWithUser) {
    const companyId = await this.resolveCompanyId(request);
    return this.incidentsService.findAll(companyId);
  }

  @Get(':id')
  async findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.incidentsService.findOne(id, companyId);
  }

  @Patch(':id')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() updateIncidentDto: UpdateIncidentDto,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.incidentsService.update(id, companyId, updateIncidentDto);
  }

  @Delete(':id')
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
