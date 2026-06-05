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
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { RolesGuard } from '../questions/roles.guard';
import { Roles } from '../questions/roles.decorator';
import { UsersService } from '../users/users.service';
import { AnnualWorkPlanService } from './services/annual-work-plan.service';
import { CreateAnnualWorkPlanDto, ApproveAnnualWorkPlanDto } from './dto/create-annual-work-plan.dto';
import { CreatePlanActivityDto, UpdatePlanActivityDto } from './dto/create-plan-activity.dto';
import { CreatePlanTaskDto, UpdatePlanTaskDto } from './dto/create-plan-task.dto';
import { CreatePlanSubtaskDto, UpdatePlanSubtaskDto } from './dto/create-plan-subtask.dto';
import { CreateTaskEvidenceDto } from './dto/create-task-evidence.dto';
import { CreateTaskJustificationDto, ApproveJustificationDto } from './dto/create-task-justification.dto';
import { AnnualWorkPlanStatus } from './schemas/annual-work-plan.schema';
import { ActivityPriority } from './schemas/plan-activity.schema';
import { JustificationApprovalStatus } from './schemas/task-justification.schema';

@Controller('annual-work-plan')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class AnnualWorkPlanController {
  constructor(
    private readonly annualWorkPlanService: AnnualWorkPlanService,
    private readonly usersService: UsersService,
  ) {}

  // ==================== PLAN ENDPOINTS ====================

  @Get()
  @Roles('owner', 'admin', 'manager', 'member')
  async findAll(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.annualWorkPlanService.findByCompany(companyId);
  }

  @Get('current')
  @Roles('owner', 'admin', 'manager', 'member')
  async findCurrent(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    try {
      return await this.annualWorkPlanService.findCurrent(companyId);
    } catch {
      return null;
    }
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager', 'member')
  async findOne(@Param('id') id: string) {
    return this.annualWorkPlanService.findById(new Types.ObjectId(id));
  }

  @Post()
  @Roles('owner', 'admin', 'manager')
  async create(@Req() request: RequestWithUser, @Body() dto: CreateAnnualWorkPlanDto) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.annualWorkPlanService.create(companyId, dto.year, user);
  }

  @Post('ensure-current')
  @Roles('owner', 'admin', 'manager')
  async ensureCurrent(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.annualWorkPlanService.findOrCreateCurrent(companyId, user);
  }

  @Patch(':id/status')
  @Roles('owner', 'admin', 'manager')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: { status: AnnualWorkPlanStatus },
    @Req() request: RequestWithUser,
  ) {
    const user = await this.resolveUserFromRequest(request);
    return this.annualWorkPlanService.updateStatus(
      new Types.ObjectId(id),
      dto.status,
      user,
    );
  }

  @Post(':id/approve')
  @Roles('owner', 'manager')
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveAnnualWorkPlanDto,
    @Req() request: RequestWithUser,
  ) {
    const user = await this.resolveUserFromRequest(request);
    return this.annualWorkPlanService.approve(
      new Types.ObjectId(id),
      user._id,
      dto.approvedByEmail,
      dto.approvedByName,
      dto.signatureHash,
      dto.signatureUrl,
      dto.comments,
    );
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  async remove(@Param('id') id: string, @Req() request: RequestWithUser) {
    const user = await this.resolveUserFromRequest(request);
    return this.annualWorkPlanService.remove(new Types.ObjectId(id), user);
  }

  // ==================== COMPLIANCE ====================

  @Post(':id/recalculate')
  @Roles('owner', 'admin', 'manager')
  async recalculateCompliance(@Param('id') id: string) {
    return this.annualWorkPlanService.recalculateCompliance(new Types.ObjectId(id));
  }

  @Get(':id/compliance-report')
  @Roles('owner', 'admin', 'manager', 'member')
  async getComplianceReport(@Param('id') id: string) {
    return this.annualWorkPlanService.getComplianceReport(new Types.ObjectId(id));
  }

  // ==================== ACTIVITY ENDPOINTS ====================

  @Get(':planId/activities')
  @Roles('owner', 'admin', 'manager', 'member')
  async getActivities(@Param('planId') planId: string) {
    return this.annualWorkPlanService.getActivities(new Types.ObjectId(planId));
  }

  @Get(':planId/activities/:activityId')
  @Roles('owner', 'admin', 'manager', 'member')
  async getActivity(@Param('activityId') activityId: string) {
    return this.annualWorkPlanService.getActivity(new Types.ObjectId(activityId));
  }

  @Post(':planId/activities')
  @Roles('owner', 'admin', 'manager')
  async createActivity(
    @Param('planId') planId: string,
    @Body() dto: CreatePlanActivityDto,
    @Req() request: RequestWithUser,
  ) {
    const user = await this.resolveUserFromRequest(request);
    return this.annualWorkPlanService.createActivity(new Types.ObjectId(planId), dto, user);
  }

  @Patch(':planId/activities/:activityId')
  @Roles('owner', 'admin', 'manager')
  async updateActivity(
    @Param('activityId') activityId: string,
    @Body() dto: UpdatePlanActivityDto,
    @Req() request: RequestWithUser,
  ) {
    const user = await this.resolveUserFromRequest(request);
    return this.annualWorkPlanService.updateActivity(
      new Types.ObjectId(activityId),
      dto as unknown as Record<string, unknown>,
      user,
    );
  }

  @Delete(':planId/activities/:activityId')
  @Roles('owner', 'admin')
  async removeActivity(
    @Param('activityId') activityId: string,
    @Req() request: RequestWithUser,
  ) {
    const user = await this.resolveUserFromRequest(request);
    return this.annualWorkPlanService.removeActivity(new Types.ObjectId(activityId), user);
  }

  // ==================== TASK ENDPOINTS ====================

  @Get(':planId/activities/:activityId/tasks')
  @Roles('owner', 'admin', 'manager', 'member')
  async getTasks(@Param('activityId') activityId: string) {
    return this.annualWorkPlanService.getTasks(new Types.ObjectId(activityId));
  }

  @Get(':planId/activities/:activityId/tasks/:taskId')
  @Roles('owner', 'admin', 'manager', 'member')
  async getTask(@Param('taskId') taskId: string) {
    return this.annualWorkPlanService.getTask(new Types.ObjectId(taskId));
  }

  @Post(':planId/activities/:activityId/tasks')
  @Roles('owner', 'admin', 'manager')
  async createTask(
    @Param('activityId') activityId: string,
    @Body() dto: CreatePlanTaskDto,
    @Req() request: RequestWithUser,
  ) {
    const user = await this.resolveUserFromRequest(request);
    return this.annualWorkPlanService.createTask(new Types.ObjectId(activityId), dto, user);
  }

  @Patch(':planId/activities/:activityId/tasks/:taskId')
  @Roles('owner', 'admin', 'manager')
  async updateTask(
    @Param('taskId') taskId: string,
    @Body() dto: UpdatePlanTaskDto,
    @Req() request: RequestWithUser,
  ) {
    const user = await this.resolveUserFromRequest(request);
    return this.annualWorkPlanService.updateTask(
      new Types.ObjectId(taskId),
      dto as unknown as Record<string, unknown>,
      user,
    );
  }

  @Delete(':planId/activities/:activityId/tasks/:taskId')
  @Roles('owner', 'admin')
  async removeTask(
    @Param('taskId') taskId: string,
    @Req() request: RequestWithUser,
  ) {
    const user = await this.resolveUserFromRequest(request);
    return this.annualWorkPlanService.removeTask(new Types.ObjectId(taskId), user);
  }

  // ==================== SUBTASK ENDPOINTS ====================

  @Get(':planId/activities/:activityId/tasks/:taskId/subtasks')
  @Roles('owner', 'admin', 'manager', 'member')
  async getSubtasks(@Param('taskId') taskId: string) {
    return this.annualWorkPlanService.getSubtasks(new Types.ObjectId(taskId));
  }

  @Post(':planId/activities/:activityId/tasks/:taskId/subtasks')
  @Roles('owner', 'admin', 'manager')
  async createSubtask(
    @Param('taskId') taskId: string,
    @Body() dto: CreatePlanSubtaskDto,
    @Req() request: RequestWithUser,
  ) {
    const user = await this.resolveUserFromRequest(request);
    return this.annualWorkPlanService.createSubtask(new Types.ObjectId(taskId), dto.title, user);
  }

  @Patch(':planId/activities/:activityId/tasks/:taskId/subtasks/:subtaskId')
  @Roles('owner', 'admin', 'manager')
  async updateSubtask(
    @Param('subtaskId') subtaskId: string,
    @Body() dto: UpdatePlanSubtaskDto,
    @Req() request: RequestWithUser,
  ) {
    const user = await this.resolveUserFromRequest(request);
    return this.annualWorkPlanService.updateSubtask(
      new Types.ObjectId(subtaskId),
      dto,
      user,
    );
  }

  @Delete(':planId/activities/:activityId/tasks/:taskId/subtasks/:subtaskId')
  @Roles('owner', 'admin')
  async removeSubtask(
    @Param('subtaskId') subtaskId: string,
    @Req() request: RequestWithUser,
  ) {
    const user = await this.resolveUserFromRequest(request);
    return this.annualWorkPlanService.removeSubtask(new Types.ObjectId(subtaskId), user);
  }

  // ==================== EVIDENCE ENDPOINTS ====================

  @Get(':planId/activities/:activityId/tasks/:taskId/evidence')
  @Roles('owner', 'admin', 'manager', 'member')
  async getEvidence(@Param('taskId') taskId: string) {
    return this.annualWorkPlanService.getEvidence(new Types.ObjectId(taskId));
  }

  @Post(':planId/activities/:activityId/tasks/:taskId/evidence')
  @Roles('owner', 'admin', 'manager')
  async createEvidence(
    @Param('taskId') taskId: string,
    @Body() dto: CreateTaskEvidenceDto,
    @Req() request: RequestWithUser,
  ) {
    const user = await this.resolveUserFromRequest(request);
    return this.annualWorkPlanService.createEvidence(
      new Types.ObjectId(taskId),
      dto.fileUrl,
      dto.fileType,
      user,
    );
  }

  @Delete(':planId/activities/:activityId/tasks/:taskId/evidence/:evidenceId')
  @Roles('owner', 'admin')
  async removeEvidence(@Param('evidenceId') evidenceId: string) {
    return this.annualWorkPlanService.removeEvidence(new Types.ObjectId(evidenceId));
  }

  // ==================== JUSTIFICATION ENDPOINTS ====================

  @Get(':planId/activities/:activityId/tasks/:taskId/justifications')
  @Roles('owner', 'admin', 'manager', 'member')
  async getJustifications(@Param('taskId') taskId: string) {
    return this.annualWorkPlanService.getJustifications(new Types.ObjectId(taskId));
  }

  @Post(':planId/activities/:activityId/tasks/:taskId/justifications')
  @Roles('owner', 'admin', 'manager', 'member')
  async createJustification(
    @Param('taskId') taskId: string,
    @Body() dto: CreateTaskJustificationDto,
  ) {
    return this.annualWorkPlanService.createJustification(
      new Types.ObjectId(taskId),
      dto.reason,
      dto.correctiveAction,
      dto.newDueDate,
    );
  }

  @Patch('justifications/:justificationId/approve')
  @Roles('owner', 'admin', 'manager')
  async approveJustification(
    @Param('justificationId') justificationId: string,
    @Body() dto: ApproveJustificationDto,
    @Req() request: RequestWithUser,
  ) {
    const user = await this.resolveUserFromRequest(request);
    return this.annualWorkPlanService.approveJustification(
      new Types.ObjectId(justificationId),
      user,
      dto.approvalStatus,
      dto.rejectionReason,
    );
  }

  // ==================== AUDIT TRAIL ====================

  @Get(':id/history')
  @Roles('owner', 'admin', 'manager', 'member')
  async getPlanHistory(@Param('id') id: string) {
    return this.annualWorkPlanService.getPlanHistory(new Types.ObjectId(id));
  }

  // ==================== AUTO PROCESSING ====================

  @Post('process-auto-status')
  @Roles('owner', 'admin', 'manager')
  async processAutoStatus(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    await this.annualWorkPlanService.processAutoStatusAndAlerts(companyId);
    return { message: 'Auto-status and alerts processed successfully' };
  }

  // ==================== MODULE INTEGRATION ENDPOINTS ====================

  @Post('from-module/activity')
  @Roles('owner', 'admin', 'manager')
  async createActivityFromModule(
    @Body() dto: {
      sourceModule: string;
      externalId: string;
      title: string;
      description: string;
      startDate: string;
      endDate: string;
      responsibleUser: string;
      priority?: ActivityPriority;
      estimatedCost?: number;
    },
    @Req() request: RequestWithUser,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.annualWorkPlanService.createActivityFromModule({
      companyId,
      sourceModule: dto.sourceModule,
      externalId: new Types.ObjectId(dto.externalId),
      title: dto.title,
      description: dto.description,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      responsibleUser: new Types.ObjectId(dto.responsibleUser),
      priority: dto.priority,
      estimatedCost: dto.estimatedCost,
      user,
    });
  }

  @Post('from-module/task')
  @Roles('owner', 'admin', 'manager')
  async createTaskFromModule(
    @Body() dto: {
      activityId: string;
      title: string;
      description?: string;
      assignedTo: string;
      startDate: string;
      dueDate: string;
    },
    @Req() request: RequestWithUser,
  ) {
    const user = await this.resolveUserFromRequest(request);
    return this.annualWorkPlanService.createTaskFromModule({
      activityId: new Types.ObjectId(dto.activityId),
      title: dto.title,
      description: dto.description,
      assignedTo: new Types.ObjectId(dto.assignedTo),
      startDate: new Date(dto.startDate),
      dueDate: new Date(dto.dueDate),
      user,
    });
  }

  // ==================== HELPERS ====================

  private resolveCompanyId(request: RequestWithUser): Types.ObjectId {
    if (!request.companyId) throw new ForbiddenException('Missing active company context');
    return request.companyId;
  }

  private async resolveUserFromRequest(request: RequestWithUser) {
    const firebaseUid = request.user?.uid;
    if (!firebaseUid) throw new ForbiddenException('Missing authenticated user');

    const user = await this.usersService.findByFirebaseUid(firebaseUid);
    if (!user) throw new ForbiddenException('Authenticated user is not registered');
    return user;
  }
}
