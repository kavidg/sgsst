import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { RolesGuard } from '../questions/roles.guard';
import { Roles } from '../questions/roles.decorator';
import { UsersService } from '../users/users.service';
import { ContractingService } from './contracting.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { CreateContractInductionDto } from './dto/create-contract-induction.dto';
import { UpdateContractInductionDto } from './dto/update-contract-induction.dto';
import { CreateContractEvaluationDto } from './dto/create-contract-evaluation.dto';
import { UpdateContractEvaluationDto } from './dto/update-contract-evaluation.dto';
import { ApprovalWorkflowService } from '../approval-workflow/approval-workflow.service';
import { ApprovalEntity } from '../approval-workflow/enums/approval-entity.enum';
import { ApprovalDecision } from '../approval-workflow/enums/approval-decision.enum';
import { ApprovalActor } from '../approval-workflow/interfaces/approval-actor.interface';
import { buildApprovalActor } from '../approval-workflow/helpers/approval-actor.helper';
import { User, UserDocument } from '../users/schemas/user.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Controller('contracting')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class ContractingController {
  constructor(
    private readonly contractingService: ContractingService,
    private readonly usersService: UsersService,
    private readonly approvalWorkflowService: ApprovalWorkflowService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  // ==================== CRUD ====================

  @Get()
  @Roles('owner', 'admin', 'manager', 'member')
  async findAll(
    @Req() request: RequestWithUser,
    @Query('status') status?: string,
    @Query('contractorId') contractorId?: string,
    @Query('search') search?: string,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.contractingService.findAll(companyId, { status, contractorId, search });
  }

  @Get('stats')
  @Roles('owner', 'admin', 'manager', 'member')
  async getStats(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.contractingService.getStats(companyId);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager', 'member')
  async findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    return this.contractingService.findOne(companyId, id);
  }

  @Post()
  @Roles('owner', 'admin', 'manager')
  async create(@Req() request: RequestWithUser, @Body() dto: CreateContractDto) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.contractingService.create(
      companyId,
      dto,
      user._id,
      `${user.firstName} ${user.lastName}`.trim(),
    );
  }

  @Patch(':id')
  @Roles('owner', 'admin', 'manager')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateContractDto,
  ) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    return this.contractingService.update(companyId, id, dto);
  }

  @Delete(':id')
  @Roles('owner')
  async remove(@Req() request: RequestWithUser, @Param('id') id: string) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    return this.contractingService.remove(companyId, id);
  }

  // ==================== INDUCTIONS CRUD ====================

  @Get('inductions')
  @Roles('owner', 'admin', 'manager', 'member')
  async findAllInductions(
    @Req() request: RequestWithUser,
    @Query('contractId') contractId?: string,
    @Query('contractorId') contractorId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.contractingService.findAllInductions(companyId, { contractId, contractorId, status, search });
  }

  @Get('inductions/stats')
  @Roles('owner', 'admin', 'manager', 'member')
  async getInductionStats(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.contractingService.getInductionStats(companyId);
  }

  @Get('inductions/:id')
  @Roles('owner', 'admin', 'manager', 'member')
  async findOneInduction(@Req() request: RequestWithUser, @Param('id') id: string) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    return this.contractingService.findOneInduction(companyId, id);
  }

  @Post('inductions')
  @Roles('owner', 'admin', 'manager')
  async createInduction(
    @Req() request: RequestWithUser,
    @Body() dto: CreateContractInductionDto,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.contractingService.createInduction(companyId, dto, user._id);
  }

  @Patch('inductions/:id')
  @Roles('owner', 'admin', 'manager')
  async updateInduction(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateContractInductionDto,
  ) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    return this.contractingService.updateInduction(companyId, id, dto);
  }

  @Delete('inductions/:id')
  @Roles('owner')
  async removeInduction(@Req() request: RequestWithUser, @Param('id') id: string) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    return this.contractingService.removeInduction(companyId, id);
  }

  // ==================== EVALUATIONS CRUD ====================

  @Get('evaluations')
  @Roles('owner', 'admin', 'manager', 'member')
  async findAllEvaluations(
    @Req() request: RequestWithUser,
    @Query('contractId') contractId?: string,
    @Query('contractorId') contractorId?: string,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.contractingService.findAllEvaluations(companyId, { contractId, contractorId });
  }

  @Get('evaluations/stats')
  @Roles('owner', 'admin', 'manager', 'member')
  async getEvaluationStats(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.contractingService.getEvaluationStats(companyId);
  }

  @Get('evaluations/:id')
  @Roles('owner', 'admin', 'manager', 'member')
  async findOneEvaluation(@Req() request: RequestWithUser, @Param('id') id: string) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    return this.contractingService.findOneEvaluation(companyId, id);
  }

  @Post('evaluations')
  @Roles('owner', 'admin', 'manager')
  async createEvaluation(
    @Req() request: RequestWithUser,
    @Body() dto: CreateContractEvaluationDto,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.contractingService.createEvaluation(companyId, dto, user._id);
  }

  @Patch('evaluations/:id')
  @Roles('owner', 'admin', 'manager')
  async updateEvaluation(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateContractEvaluationDto,
  ) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    return this.contractingService.updateEvaluation(companyId, id, dto);
  }

  @Delete('evaluations/:id')
  @Roles('owner')
  async removeEvaluation(@Req() request: RequestWithUser, @Param('id') id: string) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    return this.contractingService.removeEvaluation(companyId, id);
  }

  // ==================== APPROVAL WORKFLOW ====================

  @Post(':id/submit-approval')
  @Roles('owner', 'admin', 'manager')
  async submitForApproval(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body('comments') comments?: string,
  ) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);

    // Preparar (valida y actualiza approvalStatus)
    const prepared = await this.contractingService.prepareForApproval(companyId, id);

    // Crear ApprovalRequest en el workflow core
    const actor = await this.buildActor(request);
    const approvalRequest = await this.approvalWorkflowService.createRequest(
      companyId.toString(),
      {
        module: ApprovalEntity.CONTRACTING,
        entityType: 'Contract',
        entityId: prepared.contractId,
        assignedRoles: ['owner', 'manager'],
        comments: comments ?? `Aprobación de contrato ${prepared.contractNumber}`,
      },
      actor,
    );

    return {
      contractId: prepared.contractId,
      contractNumber: prepared.contractNumber,
      title: prepared.title,
      requestId: approvalRequest._id.toString(),
      status: approvalRequest.status,
    };
  }

  @Get(':id/approval')
  @Roles('owner', 'admin', 'manager', 'member')
  async getApprovalStatus(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
  ) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    return this.contractingService.getApprovalStatus(companyId, id);
  }

  @Get(':id/approval/history')
  @Roles('owner', 'admin', 'manager', 'member')
  async getApprovalHistory(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
  ) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);

    const request_ = await this.approvalWorkflowService.findRequestByEntity(
      companyId.toString(),
      ApprovalEntity.CONTRACTING,
      id,
    );

    if (!request_) {
      return { history: [], requestId: null };
    }

    const history = await this.approvalWorkflowService.getHistory(
      companyId.toString(),
      request_._id.toString(),
    );

    return {
      requestId: request_._id.toString(),
      status: request_.status,
      history,
    };
  }

  @Post(':id/approve')
  @Roles('owner', 'manager')
  async approve(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body('comments') comments?: string,
  ) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    const actor = await this.buildActor(request);

    const result = await this.approvalWorkflowService.decideAndApply(
      companyId.toString(),
      ApprovalEntity.CONTRACTING,
      id,
      { decision: ApprovalDecision.APPROVED, comments },
      actor,
    );

    return {
      contractId: id,
      requestId: result.request?._id?.toString(),
      status: result.request?.status,
    };
  }

  @Post(':id/reject')
  @Roles('owner', 'manager')
  async reject(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body('reason') reason?: string,
    @Body('comments') comments?: string,
  ) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    const actor = await this.buildActor(request);

    const result = await this.approvalWorkflowService.decideAndApply(
      companyId.toString(),
      ApprovalEntity.CONTRACTING,
      id,
      { decision: ApprovalDecision.REJECTED, reason, comments },
      actor,
    );

    return {
      contractId: id,
      requestId: result.request?._id?.toString(),
      status: result.request?.status,
    };
  }

  @Post(':id/request-adjustments')
  @Roles('owner', 'manager')
  async requestAdjustments(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body('reason') reason?: string,
    @Body('comments') comments?: string,
  ) {
    this.assertValidObjectId(id);
    if (!reason || !reason.trim()) {
      throw new BadRequestException('Reason is required to request adjustments');
    }
    const companyId = this.resolveCompanyId(request);
    const actor = await this.buildActor(request);

    const result = await this.approvalWorkflowService.decideAndApply(
      companyId.toString(),
      ApprovalEntity.CONTRACTING,
      id,
      { decision: ApprovalDecision.ADJUSTMENTS_REQUESTED, reason: reason.trim(), comments },
      actor,
    );

    return {
      contractId: id,
      requestId: result.request?._id?.toString(),
      status: result.request?.status,
    };
  }

  // ==================== HELPERS ====================

  private assertValidObjectId(id: string, label = 'id') {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${label}: ${id}`);
    }
  }

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

  private async buildActor(request: RequestWithUser): Promise<ApprovalActor> {
    const uid = request.user?.uid ?? 'unknown';
    const user = await this.userModel
      .findOne({ firebaseUid: uid }, { _id: 1, email: 1, role: 1, firstName: 1, lastName: 1 })
      .lean()
      .exec();
    return buildApprovalActor({
      userId: user?._id?.toString(),
      firebaseUid: uid,
      email: user?.email,
      name: user ? `${user.firstName} ${user.lastName}`.trim() : undefined,
      role: user?.role,
    });
  }
}
