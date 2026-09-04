import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { RolesGuard } from '../questions/roles.guard';
import { Roles } from '../questions/roles.decorator';
import { UsersService } from '../users/users.service';
import { ProgramsService } from './services/programs.service';
import {
  CreateProgramDto,
  UpdateProgramDto,
  CreateProgramActivityDto,
  UpdateProgramActivityDto,
} from './dto/create-program.dto';

@Controller('programs')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class ProgramsController {
  constructor(
    private readonly programsService: ProgramsService,
    private readonly usersService: UsersService,
  ) {}

  // ==================== PROGRAM ENDPOINTS ====================

  @Get()
  @Roles('owner', 'admin', 'manager', 'member')
  async findAll(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.programsService.findAll(companyId);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager', 'member')
  async findOne(
    @Param('id') id: string,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.programsService.findById(new Types.ObjectId(id), companyId);
  }

  @Post()
  @Roles('owner', 'admin', 'manager')
  async create(
    @Req() request: RequestWithUser,
    @Body() dto: CreateProgramDto,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.programsService.create(companyId, dto, user);
  }

  @Patch(':id')
  @Roles('owner', 'admin', 'manager')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProgramDto,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.programsService.update(
      new Types.ObjectId(id),
      companyId,
      dto as unknown as Record<string, unknown>,
      user,
    );
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  async remove(
    @Param('id') id: string,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.programsService.remove(new Types.ObjectId(id), companyId, user);
  }

  // ==================== ACTIVITY ENDPOINTS ====================

  @Get(':programId/activities')
  @Roles('owner', 'admin', 'manager', 'member')
  async getActivities(
    @Param('programId') programId: string,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.programsService.getActivities(
      new Types.ObjectId(programId),
      companyId,
    );
  }

  @Get(':programId/activities/:activityId')
  @Roles('owner', 'admin', 'manager', 'member')
  async getActivity(
    @Param('activityId') activityId: string,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.programsService.findActivityById(
      new Types.ObjectId(activityId),
      companyId,
    );
  }

  @Post(':programId/activities')
  @Roles('owner', 'admin', 'manager')
  async createActivity(
    @Param('programId') programId: string,
    @Body() dto: CreateProgramActivityDto,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.programsService.createActivity(
      new Types.ObjectId(programId),
      companyId,
      dto,
      user,
    );
  }

  @Patch(':programId/activities/:activityId')
  @Roles('owner', 'admin', 'manager')
  async updateActivity(
    @Param('activityId') activityId: string,
    @Body() dto: UpdateProgramActivityDto,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.programsService.updateActivity(
      new Types.ObjectId(activityId),
      companyId,
      dto as unknown as Record<string, unknown>,
      user,
    );
  }

  // ==================== DASHBOARD ====================

  @Get(':id/dashboard')
  @Roles('owner', 'admin', 'manager', 'member')
  async getDashboard(
    @Param('id') id: string,
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.programsService.getDashboard(
      new Types.ObjectId(id),
      companyId,
    );
  }

  // ==================== HELPERS ====================

  private resolveCompanyId(request: RequestWithUser): Types.ObjectId {
    if (!request.companyId)
      throw new ForbiddenException('Missing active company context');
    return request.companyId;
  }

  private async resolveUserFromRequest(request: RequestWithUser) {
    const firebaseUid = request.user?.uid;
    if (!firebaseUid)
      throw new ForbiddenException('Missing authenticated user');

    const user = await this.usersService.findByFirebaseUid(firebaseUid);
    if (!user)
      throw new ForbiddenException('Authenticated user is not registered');
    return user;
  }
}
