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
import { CreateJobProfileDto } from './dto/create-job-profile.dto';
import { UpdateJobProfileDto } from './dto/update-job-profile.dto';
import { JobProfileService } from './job-profile.service';

@Controller('job-profiles')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class JobProfileController {
  constructor(
    private readonly jobProfileService: JobProfileService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  @Roles('owner', 'admin')
  async create(@Req() request: RequestWithUser, @Body() dto: CreateJobProfileDto) {
    const { companyId, actorUid } = await this.resolveContext(request);
    return this.jobProfileService.create(companyId, dto, actorUid);
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(
    @Req() request: RequestWithUser,
    @Query('active') active?: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    const activeFilter =
      active === 'true' ? true : active === 'false' ? false : undefined;
    return this.jobProfileService.findAll(companyId, { active: activeFilter });
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  async findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.jobProfileService.findOne(id, companyId);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateJobProfileDto,
  ) {
    const { companyId, actorUid } = await this.resolveContext(request);
    return this.jobProfileService.update(id, companyId, dto, actorUid);
  }

  @Patch(':id/deactivate')
  @Roles('owner', 'admin')
  async deactivate(@Req() request: RequestWithUser, @Param('id') id: string) {
    const { companyId, actorUid } = await this.resolveContext(request);
    return this.jobProfileService.deactivate(id, companyId, actorUid);
  }

  private async resolveContext(request: RequestWithUser): Promise<{
    companyId: Types.ObjectId;
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

    return { companyId: user.companyId, actorUid: firebaseUid };
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
