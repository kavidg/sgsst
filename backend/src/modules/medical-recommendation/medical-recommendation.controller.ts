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
import { CreateMedicalRecommendationDto } from './dto/create-medical-recommendation.dto';
import { UpdateMedicalRecommendationDto } from './dto/update-medical-recommendation.dto';
import { MedicalRecommendationService } from './medical-recommendation.service';

@Controller('medical-recommendations')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class MedicalRecommendationController {
  constructor(
    private readonly recommendationService: MedicalRecommendationService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  @Roles('owner', 'admin', 'manager')
  async create(
    @Req() request: RequestWithUser,
    @Body() dto: CreateMedicalRecommendationDto,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.recommendationService.create(companyId, dto);
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(
    @Req() request: RequestWithUser,
    @Query('employeeId') employeeId?: string,
    @Query('examId') examId?: string,
    @Query('recommendationType') recommendationType?: string,
    @Query('status') status?: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.recommendationService.findAll(companyId, {
      employeeId,
      examId,
      recommendationType,
      status,
    });
  }

  @Get('stats')
  @Roles('owner', 'admin', 'manager')
  async getStats(@Req() request: RequestWithUser) {
    const companyId = await this.resolveCompanyId(request);
    return this.recommendationService.getStats(companyId);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  async findOne(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.recommendationService.findOne(id, companyId);
  }

  @Patch(':id')
  @Roles('owner', 'admin', 'manager')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateMedicalRecommendationDto,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.recommendationService.update(id, companyId, dto);
  }

  @Delete(':id')
  @Roles('owner')
  async remove(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
  ) {
    const companyId = await this.resolveCompanyId(request);
    return this.recommendationService.remove(id, companyId);
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
