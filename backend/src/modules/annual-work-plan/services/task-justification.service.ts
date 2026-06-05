import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TaskJustification,
  TaskJustificationDocument,
  JustificationApprovalStatus,
} from '../schemas/task-justification.schema';
import { PlanTask, PlanTaskDocument, TaskStatus } from '../schemas/plan-task.schema';
import { AnnualWorkPlan, AnnualWorkPlanDocument } from '../schemas/annual-work-plan.schema';
import { PlanActivity, PlanActivityDocument } from '../schemas/plan-activity.schema';
import { AlertsService } from '../../alerts/alerts.service';

@Injectable()
export class TaskJustificationService {
  constructor(
    @InjectModel(TaskJustification.name)
    private readonly justificationModel: Model<TaskJustificationDocument>,
    @InjectModel(PlanTask.name)
    private readonly taskModel: Model<PlanTaskDocument>,
    @InjectModel(AnnualWorkPlan.name)
    private readonly planModel: Model<AnnualWorkPlanDocument>,
    @InjectModel(PlanActivity.name)
    private readonly activityModel: Model<PlanActivityDocument>,
    private readonly alertsService: AlertsService,
  ) {}

  async create(
    taskId: Types.ObjectId,
    reason: string,
    correctiveAction?: string,
    newDueDate?: Date,
  ): Promise<TaskJustification> {
    const task = await this.taskModel.findById(taskId).exec();
    if (!task) throw new NotFoundException('Task not found');
    if (task.status !== TaskStatus.DELAYED) {
      throw new BadRequestException('Justification is only allowed for delayed tasks');
    }

    return this.justificationModel.create({
      taskId,
      reason,
      correctiveAction,
      newDueDate,
      approvalStatus: JustificationApprovalStatus.PENDING,
    });
  }

  async findByTask(taskId: Types.ObjectId): Promise<TaskJustification[]> {
    return this.justificationModel.find({ taskId }).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: Types.ObjectId): Promise<TaskJustificationDocument> {
    const justification = await this.justificationModel.findById(id).exec();
    if (!justification) throw new NotFoundException('Justification not found');
    return justification;
  }

  async approve(
    id: Types.ObjectId,
    approvedBy: Types.ObjectId,
    approvedByEmail: string,
    approvalStatus: JustificationApprovalStatus,
    rejectionReason?: string,
  ): Promise<TaskJustification> {
    const justification = await this.findOne(id);
    if (justification.approvalStatus !== JustificationApprovalStatus.PENDING) {
      throw new BadRequestException('Justification has already been processed');
    }

    justification.approvalStatus = approvalStatus;
    justification.approvedBy = approvedBy;
    justification.approvedByEmail = approvedByEmail;

    if (approvalStatus === JustificationApprovalStatus.REJECTED) {
      justification.rejectionReason = rejectionReason;
    }

    await justification.save();

    // If approved and newDueDate is set, update the task
    if (
      approvalStatus === JustificationApprovalStatus.APPROVED &&
      justification.newDueDate
    ) {
      await this.taskModel.findByIdAndUpdate(justification.taskId, {
        dueDate: justification.newDueDate,
        status: TaskStatus.IN_PROGRESS,
      });
    }

    return justification;
  }
}
