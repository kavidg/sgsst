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
import { CreateTrainingAttendanceDto } from './dto/create-training-attendance.dto';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';
import { TrainingsService } from './trainings.service';

@Controller('trainings')
@UseGuards(FirebaseAuthGuard)
export class TrainingsController {
  constructor(
    private readonly trainingsService: TrainingsService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  async create(@Req() request: RequestWithUser, @Body() createTrainingDto: CreateTrainingDto) {
    const companyId = await this.resolveCompanyId(request);
    return this.trainingsService.create(companyId, createTrainingDto);
  }

  @Get()
  async findAll(@Req() request: RequestWithUser) {
    const companyId = await this.resolveCompanyId(request);
    return this.trainingsService.findAll(companyId);
  }

  @Get(':id')
  async findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.trainingsService.findOne(id, companyId);
  }

  @Patch(':id')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() updateTrainingDto: UpdateTrainingDto,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.trainingsService.update(id, companyId, updateTrainingDto);
  }

  @Delete(':id')
  async remove(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.trainingsService.remove(id, companyId);
  }

  @Post(':id/attendance')
  async createAttendance(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() createTrainingAttendanceDto: CreateTrainingAttendanceDto,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.trainingsService.createAttendance(id, companyId, createTrainingAttendanceDto);
  }

  @Get(':id/attendance')
  async findAttendance(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.trainingsService.findAttendance(id, companyId);
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
