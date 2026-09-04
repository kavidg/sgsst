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
import { CreateOccupationalExamDto } from './dto/create-occupational-exam.dto';
import { UpdateOccupationalExamDto } from './dto/update-occupational-exam.dto';
import { OccupationalExamService } from './occupational-exam.service';

@Controller('occupational-exams')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class OccupationalExamController {
  constructor(
    private readonly examService: OccupationalExamService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  @Roles('owner', 'admin', 'manager')
  async create(@Req() request: RequestWithUser, @Body() dto: CreateOccupationalExamDto) {
    const companyId = await this.resolveCompanyId(request);
    return this.examService.create(companyId, dto);
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(
    @Req() request: RequestWithUser,
    @Query('employeeId') employeeId?: string,
    @Query('examType') examType?: string,
    @Query('status') status?: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.examService.findAll(companyId, { employeeId, examType, status });
  }

  @Get('stats')
  @Roles('owner', 'admin', 'manager')
  async getStats(@Req() request: RequestWithUser) {
    const companyId = await this.resolveCompanyId(request);
    return this.examService.getStats(companyId);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  async findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.examService.findOne(id, companyId);
  }

  @Patch(':id')
  @Roles('owner', 'admin', 'manager')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateOccupationalExamDto,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.examService.update(id, companyId, dto);
  }

  @Delete(':id')
  @Roles('owner')
  async remove(@Req() request: RequestWithUser, @Param('id') id: string) {
    const companyId = await this.resolveCompanyId(request);
    return this.examService.remove(id, companyId);
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
