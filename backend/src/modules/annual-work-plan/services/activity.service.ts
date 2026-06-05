import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PlanActivity,
  PlanActivityDocument,
  ActivityStatus,
  ActivityPriority,
} from '../schemas/plan-activity.schema';
import { PlanTask, PlanTaskDocument } from '../schemas/plan-task.schema';
import { PlanSubtask, PlanSubtaskDocument } from '../schemas/plan-subtask.schema';
import { TaskEvidence, TaskEvidenceDocument } from '../schemas/task-evidence.schema';
import { TaskJustification, TaskJustificationDocument } from '../schemas/task-justification.schema';
import { PlanHistoryService } from './plan-history.service';

@Injectable()
export class ActivityService {
  constructor(
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
    private readonly planHistoryService: PlanHistoryService,
  ) {}

  async create(dto: {
    annualPlanId: Types.ObjectId;
    title: string;
    description?: string;
    objectiveId?: Types.ObjectId;
    sourceModule?: string;
    startDate: Date;
    endDate: Date;
    responsibleUser: Types.ObjectId;
    priority?: ActivityPriority;
    estimatedCost?: number;
    userId: Types.ObjectId;
    userEmail: string;
  }): Promise<PlanActivity> {
    const activity = await this.activityModel.create({
      annualPlanId: dto.annualPlanId,
      title: dto.title,
      description: dto.description,
      objectiveId: dto.objectiveId,
      sourceModule: dto.sourceModule,
      startDate: dto.startDate,
      endDate: dto.endDate,
      responsibleUser: dto.responsibleUser,
      priority: dto.priority ?? ActivityPriority.MEDIUM,
      estimatedCost: dto.estimatedCost ?? 0,
      actualCost: 0,
      progress: 0,
      status: ActivityStatus.PENDING,
      createdBy: dto.userId,
    });

    await this.planHistoryService.record(
      'PlanActivity',
      activity._id.toString(),
      dto.userId,
      dto.userEmail,
      'CREATE',
      undefined,
      JSON.stringify({
        title: dto.title,
        sourceModule: dto.sourceModule,
        responsibleUser: dto.responsibleUser.toString(),
      }),
    );

    return activity;
  }

  async findById(id: Types.ObjectId): Promise<PlanActivityDocument> {
    const activity = await this.activityModel.findById(id).exec();
    if (!activity) throw new NotFoundException('Activity not found');
    return activity;
  }

  async findByPlan(annualPlanId: Types.ObjectId): Promise<PlanActivity[]> {
    return this.activityModel
      .find({ annualPlanId })
      .sort({ startDate: 1 })
      .exec();
  }

  async update(
    id: Types.ObjectId,
    dto: Partial<{
      title: string;
      description: string;
      startDate: Date;
      endDate: Date;
      responsibleUser: Types.ObjectId;
      priority: ActivityPriority;
      estimatedCost: number;
      actualCost: number;
      progress: number;
      status: string;
    }>,
    userId: Types.ObjectId,
    userEmail: string,
  ): Promise<PlanActivity> {
    const activity = await this.findById(id);
    const before = JSON.stringify({
      title: activity.title,
      priority: activity.priority,
      status: activity.status,
      progress: activity.progress,
    });

    if (dto.title !== undefined) activity.title = dto.title;
    if (dto.description !== undefined) activity.description = dto.description;
    if (dto.startDate !== undefined) activity.startDate = dto.startDate;
    if (dto.endDate !== undefined) activity.endDate = dto.endDate;
    if (dto.responsibleUser !== undefined)
      activity.responsibleUser = dto.responsibleUser;
    if (dto.priority !== undefined) activity.priority = dto.priority;
    if (dto.estimatedCost !== undefined)
      activity.estimatedCost = dto.estimatedCost;
    if (dto.actualCost !== undefined) activity.actualCost = dto.actualCost;
    if (dto.progress !== undefined) activity.progress = dto.progress;
    if (dto.status !== undefined) {
      activity.status = dto.status as ActivityStatus;
    }

    // Auto-set status based on progress
    if (dto.progress !== undefined) {
      if (dto.progress >= 100) activity.status = ActivityStatus.COMPLETED;
      else if (dto.progress > 0) activity.status = ActivityStatus.IN_PROGRESS;
    }

    await activity.save();

    await this.planHistoryService.record(
      'PlanActivity',
      activity._id.toString(),
      userId,
      userEmail,
      'UPDATE',
      before,
      JSON.stringify({
        title: activity.title,
        priority: activity.priority,
        status: activity.status,
        progress: activity.progress,
      }),
    );

    return activity;
  }

  async remove(
    id: Types.ObjectId,
    userId: Types.ObjectId,
    userEmail: string,
  ): Promise<void> {
    const activity = await this.findById(id);

    // Cascade delete all related entities
    const tasks = await this.taskModel
      .find({ activityId: id })
      .select('_id')
      .exec();
    const taskIds = tasks.map((t) => t._id);

    if (taskIds.length > 0) {
      await this.subtaskModel.deleteMany({ taskId: { $in: taskIds } }).exec();
      await this.evidenceModel.deleteMany({ taskId: { $in: taskIds } }).exec();
      await this.justificationModel.deleteMany({ taskId: { $in: taskIds } }).exec();
      await this.taskModel.deleteMany({ activityId: id }).exec();
    }

    await this.activityModel.findByIdAndDelete(id).exec();

    await this.planHistoryService.record(
      'PlanActivity',
      id.toString(),
      userId,
      userEmail,
      'DELETE',
      JSON.stringify({ title: activity.title }),
    );
  }
}
