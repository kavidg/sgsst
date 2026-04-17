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
import { CreateInspectionActivityDto } from './dto/create-inspection-activity.dto';
import { UpdateInspectionActivityDto } from './dto/update-inspection-activity.dto';
import { InspectionsService } from './inspections.service';

@Controller('inspections')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class InspectionsController {
  constructor(
    private readonly inspectionsService: InspectionsService,
    private readonly usersService: UsersService,
  ) {}

  @Post('activities')
  @Roles('owner', 'admin')
  async create(@Req() request: RequestWithUser, @Body() createDto: CreateInspectionActivityDto) {
    const companyId = await this.resolveCompanyId(request);
    return this.inspectionsService.create(companyId, createDto);
  }

  @Get('activities')
  @Roles('owner', 'admin', 'manager')
  async findAll(@Req() request: RequestWithUser) {
    const companyId = await this.resolveCompanyId(request);
    return this.inspectionsService.findAll(companyId);
  }

  @Get('activities/:id')
  @Roles('owner', 'admin', 'manager')
  async findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.inspectionsService.findOne(id, companyId);
  }

  @Patch('activities/:id')
  @Roles('owner', 'admin')
  async update(@Req() request: RequestWithUser, @Param('id') id: string, @Body() updateDto: UpdateInspectionActivityDto) {
    const companyId = await this.resolveCompanyId(request);
    return this.inspectionsService.update(id, companyId, updateDto);
  }

  @Delete('activities/:id')
  @Roles('owner', 'admin')
  async remove(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.inspectionsService.remove(id, companyId);
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
