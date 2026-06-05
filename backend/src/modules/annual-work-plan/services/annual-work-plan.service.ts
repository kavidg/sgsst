import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AnnualWorkPlan,
  AnnualWorkPlanDocument,
  AnnualWorkPlanStatus,
} from '../schemas/annual-work-plan.schema';
import { PlanActivity, PlanActivityDocument, ActivityPriority } from '../schemas/plan-activity.schema';
import { PlanTask, PlanTaskDocument, TaskStatus } from '../schemas/plan-task.schema';
import { PlanSubtask, PlanSubtaskDocument } from '../schemas/plan-subtask.schema';
import { TaskEvidence, TaskEvidenceDocument } from '../schemas/task-evidence.schema';
import { TaskJustification, TaskJustificationDocument, JustificationApprovalStatus } from '../schemas/task-justification.schema';
import { PlanHistory, PlanHistoryDocument } from '../schemas/plan-history.schema';
import { ActivityService } from './activity.service';
import { TaskService } from './task.service';
import { PlanComplianceService } from './plan-compliance.service';
import { PlanHistoryService } from './plan-history.service';
import { TaskEvidenceService } from './task-evidence.service';
import { TaskJustificationService } from './task-justification.service';
import { AlertsService } from '../../alerts/alerts.service';
import { UserDocument } from '../../users/schemas/user.schema';

@Injectable()
export class AnnualWorkPlanService {
  constructor(
    @InjectModel(AnnualWorkPlan.name)
    private readonly planModel: Model<AnnualWorkPlanDocument>,
    @InjectModel(PlanActivity.name)
    private readonly activityModel: Model<PlanActivityDocument>,
    @InjectModel(PlanTask.name)
    private readonly taskModel: Model<PlanTaskDocument>,
    @InjectModel(PlanSubtask.name)
    private readonly subtaskModel: Model<PlanSubtaskDocument>,
    @InjectModel(TaskEvidence.name)
    private readonly evidenceModel: Model<TaskEvidenceDocument>,
    @InjectModel(TaskJustification.name)
    private readonly justificationModel: Model<TaskJustificationDocument>,
    @InjectModel(PlanHistory.name)
    private readonly historyModel: Model<PlanHistoryDocument>,
    private readonly activityService: ActivityService,
    private readonly taskService: TaskService,
    private readonly planComplianceService: PlanComplianceService,
    private readonly planHistoryService: PlanHistoryService,
    private readonly taskEvidenceService: TaskEvidenceService,
    private readonly taskJustificationService: TaskJustificationService,
    private readonly alertsService: AlertsService,
  ) {}

  // ==================== PLAN CRUD ====================

  async create(companyId: Types.ObjectId, year: number, user: UserDocument): Promise<AnnualWorkPlanDocument> {
    const existing = await this.planModel.findOne({ companyId, year }).exec();
    if (existing) {
      throw new BadRequestException(`An annual work plan for year ${year} already exists`);
    }

    const plan = await this.planModel.create({
      companyId,
      year,
      status: AnnualWorkPlanStatus.DRAFT,
      compliancePercentage: 0,
      createdBy: user._id,
    });

    await this.planHistoryService.record(
      'AnnualWorkPlan',
      plan._id.toString(),
      user._id,
      user.email,
      'CREATE',
      undefined,
      JSON.stringify({ year, status: AnnualWorkPlanStatus.DRAFT }),
    );

    return plan;
  }

  async findByCompany(companyId: Types.ObjectId): Promise<AnnualWorkPlan[]> {
    return this.planModel
      .find({ companyId })
      .sort({ year: -1 })
      .populate('createdBy', 'email')
      .populate('approval.approvedBy', 'email')
      .exec();
  }

  async findById(id: Types.ObjectId): Promise<AnnualWorkPlanDocument> {
    const plan = await this.planModel
      .findById(id)
      .populate('createdBy', 'email')
      .populate('approval.approvedBy', 'email')
      .exec();
    if (!plan) throw new NotFoundException('Annual work plan not found');
    return plan;
  }

  async findCurrent(companyId: Types.ObjectId): Promise<AnnualWorkPlanDocument> {
    const currentYear = new Date().getFullYear();
    const plan = await this.planModel
      .findOne({ companyId, year: currentYear })
      .populate('createdBy', 'email')
      .populate('approval.approvedBy', 'email')
      .exec();
    if (!plan) {
      throw new NotFoundException(`No annual work plan found for year ${currentYear}`);
    }
    return plan;
  }

  async findOrCreateCurrent(companyId: Types.ObjectId, user: UserDocument): Promise<AnnualWorkPlanDocument> {
    const currentYear = new Date().getFullYear();
    const existing = await this.planModel.findOne({ companyId, year: currentYear }).exec();
    if (existing) return existing;
    return this.create(companyId, currentYear, user);
  }

  async updateStatus(
    id: Types.ObjectId,
    status: AnnualWorkPlanStatus,
    user: UserDocument,
  ): Promise<AnnualWorkPlanDocument> {
    const plan = await this.findById(id);

    if (plan.status === AnnualWorkPlanStatus.ARCHIVED) {
      throw new BadRequestException('Cannot update an archived plan');
    }

    // Validate status transitions
    if (plan.status === AnnualWorkPlanStatus.DRAFT && status !== AnnualWorkPlanStatus.ACTIVE) {
      throw new BadRequestException('Draft plans can only be activated');
    }
    if (plan.status === AnnualWorkPlanStatus.ACTIVE && status !== AnnualWorkPlanStatus.COMPLETED && status !== AnnualWorkPlanStatus.ARCHIVED) {
      throw new BadRequestException('Active plans can only be completed or archived');
    }
    if (plan.status === AnnualWorkPlanStatus.COMPLETED && status !== AnnualWorkPlanStatus.ARCHIVED) {
      throw new BadRequestException('Completed plans can only be archived');
    }

    const before = plan.status;
    plan.status = status;
    await plan.save();

    await this.planHistoryService.record(
      'AnnualWorkPlan',
      plan._id.toString(),
      user._id,
      user.email,
      'UPDATE_STATUS',
      before,
      status,
    );

    return plan;
  }

  async approve(
    id: Types.ObjectId,
    approvedBy: Types.ObjectId,
    approvedByEmail: string,
    approvedByName: string,
    signatureHash?: string,
    signatureUrl?: string,
    comments?: string,
  ): Promise<AnnualWorkPlanDocument> {
    const plan = await this.findById(id);

    if (plan.status !== AnnualWorkPlanStatus.DRAFT) {
      throw new BadRequestException('Only draft plans can be approved');
    }

    plan.approval = {
      approvedBy,
      approvedByEmail,
      approvedByName,
      approvalDate: new Date(),
      signatureHash,
      signatureUrl,
      comments,
    };
    plan.status = AnnualWorkPlanStatus.ACTIVE;
    await plan.save();

    await this.planHistoryService.record(
      'AnnualWorkPlan',
      plan._id.toString(),
      approvedBy,
      approvedByEmail,
      'APPROVE',
      AnnualWorkPlanStatus.DRAFT,
      AnnualWorkPlanStatus.ACTIVE,
    );

    return plan;
  }

  async remove(id: Types.ObjectId, user: UserDocument): Promise<void> {
    const plan = await this.findById(id);

    // Cascade delete all related entities
    const activities = await this.activityModel
      .find({ annualPlanId: id })
      .select('_id')
      .exec();
    const activityIds = activities.map((a) => a._id);
    const tasks = await this.taskModel
      .find({ activityId: { $in: activityIds } })
      .select('_id')
      .exec();
    const taskIds = tasks.map((t) => t._id);

    if (taskIds.length > 0) {
      await this.subtaskModel.deleteMany({ taskId: { $in: taskIds } }).exec();
      await this.evidenceModel.deleteMany({ taskId: { $in: taskIds } }).exec();
      await this.justificationModel.deleteMany({ taskId: { $in: taskIds } }).exec();
    }
    if (activityIds.length > 0) {
      await this.taskModel.deleteMany({ activityId: { $in: activityIds } }).exec();
    }
    await this.activityModel.deleteMany({ annualPlanId: id }).exec();
    await this.historyModel.deleteMany({ entityId: id.toString() }).exec();
    await this.planModel.findByIdAndDelete(id).exec();

    await this.planHistoryService.record(
      'AnnualWorkPlan',
      id.toString(),
      user._id,
      user.email,
      'DELETE',
      JSON.stringify({ year: plan.year, status: plan.status }),
    );
  }

  // ==================== COMPLIANCE ENGINE ====================

  async recalculateCompliance(id: Types.ObjectId): Promise<number> {
    const plan = await this.findById(id);
    const result = await this.planComplianceService.calculate(id);

    plan.compliancePercentage = result.overallPercentage;

    // Auto-complete if 100%
    if (result.overallPercentage >= 100 && plan.status === AnnualWorkPlanStatus.ACTIVE) {
      plan.status = AnnualWorkPlanStatus.COMPLETED;
    }

    await plan.save();
    return result.overallPercentage;
  }

  async getComplianceReport(id: Types.ObjectId) {
    return this.planComplianceService.calculate(id);
  }

  // ==================== ACTIVITY CRUD ====================

  async createActivity(
    planId: Types.ObjectId,
    dto: {
      title: string;
      description?: string;
      objectiveId?: string;
      sourceModule?: string;
      startDate: string;
      endDate: string;
      responsibleUser: string;
      priority?: ActivityPriority;
      estimatedCost?: number;
    },
    user: UserDocument,
  ): Promise<PlanActivity> {
    const plan = await this.findById(planId);
    if (plan.status === AnnualWorkPlanStatus.ARCHIVED || plan.status === AnnualWorkPlanStatus.COMPLETED) {
      throw new BadRequestException('Cannot add activities to a completed or archived plan');
    }

    return this.activityService.create({
      annualPlanId: planId,
      title: dto.title,
      description: dto.description,
      objectiveId: dto.objectiveId ? new Types.ObjectId(dto.objectiveId) : undefined,
      sourceModule: dto.sourceModule,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      responsibleUser: new Types.ObjectId(dto.responsibleUser),
      priority: dto.priority,
      estimatedCost: dto.estimatedCost,
      userId: user._id,
      userEmail: user.email,
    });
  }

  async getActivities(planId: Types.ObjectId): Promise<PlanActivity[]> {
    return this.activityService.findByPlan(planId);
  }

  async getActivity(id: Types.ObjectId): Promise<PlanActivity> {
    return this.activityService.findById(id);
  }

  async updateActivity(
    id: Types.ObjectId,
    dto: Record<string, unknown>,
    user: UserDocument,
  ): Promise<PlanActivity> {
    return this.activityService.update(id, dto as never, user._id, user.email);
  }

  async removeActivity(id: Types.ObjectId, user: UserDocument): Promise<void> {
    return this.activityService.remove(id, user._id, user.email);
  }

  // ==================== TASK CRUD ====================

  async createTask(
    activityId: Types.ObjectId,
    dto: {
      title: string;
      description?: string;
      assignedTo: string;
      startDate: string;
      dueDate: string;
      progress?: number;
    },
    user: UserDocument,
  ): Promise<PlanTask> {
    return this.taskService.create({
      activityId,
      title: dto.title,
      description: dto.description,
      assignedTo: new Types.ObjectId(dto.assignedTo),
      startDate: new Date(dto.startDate),
      dueDate: new Date(dto.dueDate),
      progress: dto.progress,
      userId: user._id,
      userEmail: user.email,
    });
  }

  async getTasks(activityId: Types.ObjectId): Promise<PlanTask[]> {
    return this.taskService.findByActivity(activityId);
  }

  async getTask(id: Types.ObjectId): Promise<PlanTask> {
    return this.taskService.findById(id);
  }

  async updateTask(
    id: Types.ObjectId,
    dto: Record<string, unknown>,
    user: UserDocument,
  ): Promise<PlanTask> {
    const update: Record<string, unknown> = {};
    if (dto.title !== undefined) update.title = dto.title as string;
    if (dto.description !== undefined) update.description = dto.description as string;
    if (dto.assignedTo !== undefined) update.assignedTo = new Types.ObjectId(dto.assignedTo as string);
    if (dto.startDate !== undefined) update.startDate = new Date(dto.startDate as string);
    if (dto.dueDate !== undefined) update.dueDate = new Date(dto.dueDate as string);
    if (dto.progress !== undefined) update.progress = dto.progress as number;
    if (dto.status !== undefined) update.status = dto.status as string;
    if (dto.comments !== undefined) update.comments = dto.comments as string[];

    return this.taskService.update(id, update as never, user._id, user.email);
  }

  async removeTask(id: Types.ObjectId, user: UserDocument): Promise<void> {
    return this.taskService.remove(id, user._id, user.email);
  }

  // ==================== SUBTASK CRUD ====================

  async createSubtask(
    taskId: Types.ObjectId,
    title: string,
    user: UserDocument,
  ): Promise<PlanSubtask> {
    const subtask = await this.subtaskModel.create({
      taskId,
      title,
      completed: false,
    });

    await this.planHistoryService.record(
      'PlanSubtask',
      subtask._id.toString(),
      user._id,
      user.email,
      'CREATE',
      undefined,
      JSON.stringify({ title, taskId: taskId.toString() }),
    );

    return subtask;
  }

  async getSubtasks(taskId: Types.ObjectId): Promise<PlanSubtask[]> {
    return this.subtaskModel.find({ taskId }).sort({ createdAt: 1 }).exec();
  }

  async updateSubtask(
    id: Types.ObjectId,
    dto: { title?: string; completed?: boolean },
    user: UserDocument,
  ): Promise<PlanSubtask> {
    const subtask = await this.subtaskModel.findById(id).exec();
    if (!subtask) throw new NotFoundException('Subtask not found');

    const before = JSON.stringify({ title: subtask.title, completed: subtask.completed });

    if (dto.title !== undefined) subtask.title = dto.title;
    if (dto.completed !== undefined) subtask.completed = dto.completed;

    await subtask.save();

    await this.planHistoryService.record(
      'PlanSubtask',
      subtask._id.toString(),
      user._id,
      user.email,
      'UPDATE',
      before,
      JSON.stringify({ title: subtask.title, completed: subtask.completed }),
    );

    return subtask;
  }

  async removeSubtask(id: Types.ObjectId, user: UserDocument): Promise<void> {
    const subtask = await this.subtaskModel.findByIdAndDelete(id).exec();
    if (!subtask) throw new NotFoundException('Subtask not found');

    await this.planHistoryService.record(
      'PlanSubtask',
      id.toString(),
      user._id,
      user.email,
      'DELETE',
      JSON.stringify({ title: subtask.title }),
    );
  }

  // ==================== EVIDENCE ====================

  async createEvidence(
    taskId: Types.ObjectId,
    fileUrl: string,
    fileType: string,
    user: UserDocument,
  ): Promise<TaskEvidence> {
    return this.taskEvidenceService.create(taskId, fileUrl, fileType, user._id);
  }

  async getEvidence(taskId: Types.ObjectId): Promise<TaskEvidence[]> {
    return this.taskEvidenceService.findByTask(taskId);
  }

  async removeEvidence(id: Types.ObjectId): Promise<void> {
    return this.taskEvidenceService.remove(id);
  }

  // ==================== JUSTIFICATION ====================

  async createJustification(
    taskId: Types.ObjectId,
    reason: string,
    correctiveAction?: string,
    newDueDate?: string,
  ): Promise<TaskJustification> {
    return this.taskJustificationService.create(
      taskId,
      reason,
      correctiveAction,
      newDueDate ? new Date(newDueDate) : undefined,
    );
  }

  async getJustifications(taskId: Types.ObjectId): Promise<TaskJustification[]> {
    return this.taskJustificationService.findByTask(taskId);
  }

  async approveJustification(
    justificationId: Types.ObjectId,
    user: UserDocument,
    approvalStatus: JustificationApprovalStatus,
    rejectionReason?: string,
  ): Promise<TaskJustification> {
    // Only MANAGER and ADMIN can approve justifications
    if (user.role !== 'owner' && user.role !== 'admin' && user.role !== 'manager') {
      throw new ForbiddenException('Only managers and admins can approve justifications');
    }

    return this.taskJustificationService.approve(
      justificationId,
      user._id,
      user.email,
      approvalStatus,
      rejectionReason,
    );
  }

  // ==================== AUTO STATUS PROCESSING ====================

  async processAutoStatusAndAlerts(companyId: Types.ObjectId): Promise<void> {
    await this.taskService.processAutoStatusAndAlerts(companyId);
  }

  // ==================== AUDIT TRAIL ====================

  async getHistory(entityType: string, entityId: string): Promise<PlanHistory[]> {
    return this.planHistoryService.findByEntity(entityType, entityId);
  }

  async getPlanHistory(planId: Types.ObjectId): Promise<PlanHistory[]> {
    return this.planHistoryService.findByEntity('AnnualWorkPlan', planId.toString());
  }

  // ==================== MODULE INTEGRATIONS ====================

  /**
   * Create an activity from an SST Objective.
   * This is a reusable API for the Objectives module to integrate.
   */
  async createActivityFromObjective(params: {
    companyId: Types.ObjectId;
    objectiveId: Types.ObjectId;
    title: string;
    description: string;
    startDate: Date;
    endDate: Date;
    responsibleUser: Types.ObjectId;
    estimatedCost?: number;
    user: UserDocument;
  }): Promise<PlanActivity> {
    const plan = await this.findOrCreateCurrent(params.companyId, params.user);

    return this.activityService.create({
      annualPlanId: plan._id,
      title: params.title,
      description: params.description,
      objectiveId: params.objectiveId,
      sourceModule: 'OBJECTIVE',
      startDate: params.startDate,
      endDate: params.endDate,
      responsibleUser: params.responsibleUser,
      priority: ActivityPriority.HIGH,
      estimatedCost: params.estimatedCost,
      userId: params.user._id,
      userEmail: params.user.email,
    });
  }

  /**
   * Create an activity from an Initial Evaluation result.
   */
  async createActivityFromEvaluation(params: {
    companyId: Types.ObjectId;
    evaluationId: Types.ObjectId;
    title: string;
    description: string;
    startDate: Date;
    endDate: Date;
    responsibleUser: Types.ObjectId;
    user: UserDocument;
  }): Promise<PlanActivity> {
    const plan = await this.findOrCreateCurrent(params.companyId, params.user);

    return this.activityService.create({
      annualPlanId: plan._id,
      title: params.title,
      description: params.description,
      objectiveId: params.evaluationId,
      sourceModule: 'INITIAL_EVALUATION',
      startDate: params.startDate,
      endDate: params.endDate,
      responsibleUser: params.responsibleUser,
      priority: ActivityPriority.CRITICAL,
      userId: params.user._id,
      userEmail: params.user.email,
    });
  }

  /**
   * Create an activity from a Training module.
   */
  async createActivityFromTraining(params: {
    companyId: Types.ObjectId;
    trainingId: Types.ObjectId;
    title: string;
    description: string;
    startDate: Date;
    endDate: Date;
    responsibleUser: Types.ObjectId;
    estimatedCost?: number;
    user: UserDocument;
  }): Promise<PlanActivity> {
    const plan = await this.findOrCreateCurrent(params.companyId, params.user);

    return this.activityService.create({
      annualPlanId: plan._id,
      title: params.title,
      description: params.description,
      objectiveId: params.trainingId,
      sourceModule: 'TRAINING',
      startDate: params.startDate,
      endDate: params.endDate,
      responsibleUser: params.responsibleUser,
      priority: ActivityPriority.MEDIUM,
      estimatedCost: params.estimatedCost,
      userId: params.user._id,
      userEmail: params.user.email,
    });
  }

  /**
   * Create an activity from COPASST module.
   */
  async createActivityFromCopasst(params: {
    companyId: Types.ObjectId;
    copasstId: Types.ObjectId;
    title: string;
    description: string;
    startDate: Date;
    endDate: Date;
    responsibleUser: Types.ObjectId;
    user: UserDocument;
  }): Promise<PlanActivity> {
    const plan = await this.findOrCreateCurrent(params.companyId, params.user);

    return this.activityService.create({
      annualPlanId: plan._id,
      title: params.title,
      description: params.description,
      objectiveId: params.copasstId,
      sourceModule: 'COPASST',
      startDate: params.startDate,
      endDate: params.endDate,
      responsibleUser: params.responsibleUser,
      priority: ActivityPriority.HIGH,
      userId: params.user._id,
      userEmail: params.user.email,
    });
  }

  /**
   * Generic method for external modules to create activities programmatically.
   */
  async createActivityFromModule(params: {
    companyId: Types.ObjectId;
    sourceModule: string;
    externalId: Types.ObjectId;
    title: string;
    description: string;
    startDate: Date;
    endDate: Date;
    responsibleUser: Types.ObjectId;
    priority?: ActivityPriority;
    estimatedCost?: number;
    user: UserDocument;
  }): Promise<PlanActivity> {
    const plan = await this.findOrCreateCurrent(params.companyId, params.user);

    return this.activityService.create({
      annualPlanId: plan._id,
      title: params.title,
      description: params.description,
      objectiveId: params.externalId,
      sourceModule: params.sourceModule,
      startDate: params.startDate,
      endDate: params.endDate,
      responsibleUser: params.responsibleUser,
      priority: params.priority ?? ActivityPriority.MEDIUM,
      estimatedCost: params.estimatedCost,
      userId: params.user._id,
      userEmail: params.user.email,
    });
  }

  /**
   * Generic method for external modules to create tasks programmatically.
   */
  async createTaskFromModule(params: {
    activityId: Types.ObjectId;
    title: string;
    description?: string;
    assignedTo: Types.ObjectId;
    startDate: Date;
    dueDate: Date;
    user: UserDocument;
  }): Promise<PlanTask> {
    return this.taskService.create({
      activityId: params.activityId,
      title: params.title,
      description: params.description,
      assignedTo: params.assignedTo,
      startDate: params.startDate,
      dueDate: params.dueDate,
      userId: params.user._id,
      userEmail: params.user.email,
    });
  }
}
