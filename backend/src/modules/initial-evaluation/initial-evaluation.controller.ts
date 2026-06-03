import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { UsersService } from '../users/users.service';
import { SignApprovalDto, SubmitApprovalDto, UpdateStandardDto, UpsertActionDto, UpsertFindingDto } from './dto/initial-evaluation.dto';
import { InitialEvaluationService } from './initial-evaluation.service';

@Controller('advanced-management/initial-evaluation')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class InitialEvaluationController {
  constructor(
    private readonly initialEvaluationService: InitialEvaluationService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  @Roles('owner', 'admin', 'manager', 'member')
  async getCurrent(@Req() request: RequestWithUser) {
    return this.initialEvaluationService.findOrCreate(this.resolveCompanyId(request));
  }

  @Post('auto-diagnostic')
  @Roles('owner', 'admin', 'manager')
  async autoDiagnostic(@Req() request: RequestWithUser) {
    return this.initialEvaluationService.runAutoDiagnostic(this.resolveCompanyId(request), await this.resolveUser(request));
  }

  @Patch('standards/:code')
  @Roles('owner', 'admin')
  async updateStandard(@Req() request: RequestWithUser, @Param('code') code: string, @Body() dto: UpdateStandardDto) {
    return this.initialEvaluationService.updateStandard(this.resolveCompanyId(request), code, dto, await this.resolveUser(request));
  }

  @Post('findings')
  @Roles('owner', 'admin')
  async upsertFinding(@Req() request: RequestWithUser, @Body() dto: UpsertFindingDto) {
    return this.initialEvaluationService.upsertFinding(this.resolveCompanyId(request), dto, await this.resolveUser(request));
  }

  @Post('actions')
  @Roles('owner', 'admin')
  async upsertAction(@Req() request: RequestWithUser, @Body() dto: UpsertActionDto) {
    return this.initialEvaluationService.upsertAction(this.resolveCompanyId(request), dto, await this.resolveUser(request));
  }

  @Post('actions/generate')
  @Roles('owner', 'admin')
  async generateActions(@Req() request: RequestWithUser) {
    return this.initialEvaluationService.generateActionPlan(this.resolveCompanyId(request), await this.resolveUser(request));
  }

  @Post('submit-approval')
  @Roles('owner', 'admin')
  async submitApproval(@Req() request: RequestWithUser, @Body() dto: SubmitApprovalDto) {
    return this.initialEvaluationService.submitForApproval(this.resolveCompanyId(request), dto, await this.resolveUser(request));
  }

  @Post('manager-sign')
  @Roles('owner', 'manager')
  async managerSign(@Req() request: RequestWithUser, @Body() dto: SignApprovalDto) {
    return this.initialEvaluationService.managerSign(this.resolveCompanyId(request), dto, await this.resolveUser(request));
  }

  @Get('executive-dashboard')
  @Roles('owner', 'admin', 'manager')
  async executiveDashboard(@Req() request: RequestWithUser) {
    return this.initialEvaluationService.executiveDashboard(this.resolveCompanyId(request));
  }

  private resolveCompanyId(request: RequestWithUser) {
    if (!request.companyId || !Types.ObjectId.isValid(request.companyId)) throw new ForbiddenException('Missing company context');
    return request.companyId;
  }

  private async resolveUser(request: RequestWithUser) {
    const firebaseUid = request.user?.uid;
    if (!firebaseUid) throw new ForbiddenException('Missing authenticated user');
    const user = await this.usersService.findByFirebaseUid(firebaseUid);
    if (!user) throw new ForbiddenException('Authenticated user is not registered');
    return user;
  }
}
