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
import { ChangeManagementService } from './change-management.service';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { UpdateChangeRequestDto } from './dto/update-change-request.dto';
import { ApprovalWorkflowService } from '../approval-workflow/approval-workflow.service';
import { ApprovalEntity } from '../approval-workflow/enums/approval-entity.enum';
import { ApprovalActor } from '../approval-workflow/interfaces/approval-actor.interface';
import { buildApprovalActor } from '../approval-workflow/helpers/approval-actor.helper';
import { User, UserDocument } from '../users/schemas/user.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Controller('change-management')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class ChangeManagementController {
  constructor(
    private readonly changeManagementService: ChangeManagementService,
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
    @Query('changeType') changeType?: string,
    @Query('impactLevel') impactLevel?: string,
  ) {
    const companyId = this.resolveCompanyId(request);
    return this.changeManagementService.findAll(companyId, {
      status,
      changeType,
      impactLevel,
    });
  }

  @Get('stats')
  @Roles('owner', 'admin', 'manager', 'member')
  async getStats(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.changeManagementService.getStats(companyId);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager', 'member')
  async findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    return this.changeManagementService.findOne(companyId, id);
  }

  @Post()
  @Roles('owner', 'admin', 'manager')
  async create(
    @Req() request: RequestWithUser,
    @Body() dto: CreateChangeRequestDto,
  ) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.changeManagementService.create(
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
    @Body() dto: UpdateChangeRequestDto,
  ) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    return this.changeManagementService.update(companyId, id, dto);
  }

  @Delete(':id')
  @Roles('owner')
  async remove(@Req() request: RequestWithUser, @Param('id') id: string) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    return this.changeManagementService.remove(companyId, id);
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

    // Preparar (valida y actualiza status)
    const prepared = await this.changeManagementService.prepareForApproval(companyId, id);

    // Crear ApprovalRequest en el workflow core
    const actor = await this.buildActor(request);
    const approvalRequest = await this.approvalWorkflowService.createRequest(
      companyId.toString(),
      {
        module: ApprovalEntity.CHANGE_MANAGEMENT,
        entityType: 'ChangeRequest',
        entityId: prepared.requestId,
        assignedRoles: ['owner', 'admin'],
        comments: comments ?? `Aprobación de solicitud de cambio: ${prepared.title}`,
      },
      actor,
    );

    return {
      requestId: prepared.requestId,
      title: prepared.title,
      approvalRequestId: approvalRequest._id.toString(),
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
    return this.changeManagementService.getApprovalStatus(companyId, id);
  }

  @Get(':id/approval/history')
  @Roles('owner', 'admin', 'manager', 'member')
  async getApprovalHistory(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
  ) {
    this.assertValidObjectId(id);
    const companyId = this.resolveCompanyId(request);
    // Delegate to ApprovalWorkflowService to retrieve real approval events.
    // The change request _id doubles as the requestId in the Approval Workflow.
    const history = await this.approvalWorkflowService.getHistory(
      companyId.toString(),
      id,
    );
    return { requestId: id, history };
  }

  // ==================== HELPERS ====================

  private assertValidObjectId(id: string, label = 'id') {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${label}: ${id}`);
    }
  }

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
