import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PlanTask, PlanTaskDocument, TaskStatus } from '../schemas/plan-task.schema';
import { PlanSubtask, PlanSubtaskDocument } from '../schemas/plan-subtask.schema';
import { PlanHistoryService } from './plan-history.service';
import { AlertsService } from '../../alerts/alerts.service';
import { AlertSeverity } from '../../alerts/schemas/alert.schema';
import { AnnualWorkPlan, AnnualWorkPlanDocument } from '../schemas/annual-work-plan.schema';
import { PlanActivity, PlanActivityDocument } from '../schemas/plan-activity.schema';

@Injectable()
export class TaskService {
  constructor(
    @InjectModel(PlanTask.name)
    private readonly taskModel: Model<PlanTaskDocument>,
    @InjectModel(PlanSubtask.name)
    private readonly subtaskModel: Model<PlanSubtaskDocument>,
    @InjectModel(AnnualWorkPlan.name)
    private readonly planModel: Model<AnnualWorkPlanDocument>,
    @InjectModel(PlanActivity.name)
    private readonly activityModel: Model<PlanActivityDocument>,
    private readonly planHistoryService: PlanHistoryService,
    private readonly alertsService: AlertsService,
  ) {}

  async create(dto: {
    activityId: Types.ObjectId;
    title: string;
    description?: string;
    assignedTo: Types.ObjectId;
    startDate: Date;
    dueDate: Date;
    progress?: number;
    userId: Types.ObjectId;
    userEmail: string;
  }): Promise<PlanTask> {
    const task = await this.taskModel.create({
      activityId: dto.activityId,
      title: dto.title,
      description: dto.description,
      assignedTo: dto.assignedTo,
      startDate: dto.startDate,
      dueDate: dto.dueDate,
      progress: dto.progress ?? 0,
      status: TaskStatus.PENDING,
    });

    await this.planHistoryService.record(
      'PlanTask',
      task._id.toString(),
      dto.userId,
      dto.userEmail,
      'CREATE',
      undefined,
      JSON.stringify({ title: dto.title, assignedTo: dto.assignedTo.toString() }),
    );

    return task;
  }

  async findById(id: Types.ObjectId): Promise<PlanTaskDocument> {
    const task = await this.taskModel.findById(id).exec();
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async findByActivity(activityId: Types.ObjectId): Promise<PlanTask[]> {
    return this.taskModel.find({ activityId }).sort({ dueDate: 1 }).exec();
  }

  async update(
    id: Types.ObjectId,
    dto: Partial<{
      title: string;
      description: string;
      assignedTo: Types.ObjectId;
      startDate: Date;
      dueDate: Date;
      progress: number;
      status: string;
      comments: string[];
    }>,
    userId: Types.ObjectId,
    userEmail: string,
  ): Promise<PlanTask> {
    const task = await this.findById(id);
    const before = JSON.stringify({
      title: task.title,
      assignedTo: task.assignedTo.toString(),
      dueDate: task.dueDate.toISOString(),
      progress: task.progress,
      status: task.status,
    });

    if (dto.title !== undefined) task.title = dto.title;
    if (dto.description !== undefined) task.description = dto.description;
    if (dto.assignedTo !== undefined) task.assignedTo = dto.assignedTo;
    if (dto.startDate !== undefined) task.startDate = dto.startDate;
    if (dto.dueDate !== undefined) task.dueDate = dto.dueDate;
    if (dto.progress !== undefined) task.progress = dto.progress;
    if (dto.comments !== undefined) task.comments = dto.comments;

    if (dto.progress !== undefined) {
      if (dto.progress >= 100) task.status = TaskStatus.COMPLETED;
      else if (dto.progress > 0) task.status = TaskStatus.IN_PROGRESS;
    }

    if (dto.status !== undefined) {
      task.status = dto.status as TaskStatus;
    }

    await task.save();

    await this.planHistoryService.record(
      'PlanTask',
      task._id.toString(),
      userId,
      userEmail,
      'UPDATE',
      before,
      JSON.stringify({
        title: task.title,
        assignedTo: task.assignedTo.toString(),
        dueDate: task.dueDate.toISOString(),
        progress: task.progress,
        status: task.status,
      }),
    );

    return task;
  }

  async remove(id: Types.ObjectId, userId: Types.ObjectId, userEmail: string): Promise<void> {
    const task = await this.findById(id);
    await this.subtaskModel.deleteMany({ taskId: id }).exec();
    await this.taskModel.findByIdAndDelete(id).exec();

    await this.planHistoryService.record(
      'PlanTask',
      id.toString(),
      userId,
      userEmail,
      'DELETE',
      JSON.stringify({ title: task.title }),
    );
  }

  /**
   * Automatically marks tasks as Delayed if due date has passed.
   * Generates alerts at 30, 15, 5, and 1 day before due date.
   * Generates manager escalation alerts for overdue tasks.
   * Only processes tasks belonging to the given company.
   */
  async processAutoStatusAndAlerts(companyId: Types.ObjectId): Promise<void> {
    const now = new Date();

    // Get all plans for this company to scope tasks
    const plans = await this.planModel.find({ companyId }).select('_id').exec();
    const planIds = plans.map((p) => p._id);
    if (planIds.length === 0) return;

    // Get all activities for these plans
    const activities = await this.activityModel
      .find({ annualPlanId: { $in: planIds } })
      .select('_id')
      .exec();
    const activityIds = activities.map((a) => a._id);
    if (activityIds.length === 0) return;

    // Get all non-completed/cancelled tasks for these activities
    const tasks = await this.taskModel
      .find({
        activityId: { $in: activityIds },
        status: { $nin: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
      })
      .exec();

    for (const task of tasks) {
      const daysUntilDue = Math.ceil(
        (task.dueDate.getTime() - now.getTime()) / 86_400_000,
      );

      // Automatic status: Delayed if past due
      if (task.dueDate < now && task.status !== TaskStatus.DELAYED) {
        task.status = TaskStatus.DELAYED;
        await task.save();

        // Manager escalation alert for overdue tasks
        await this.alertsService.createUnique({
          companyId,
          type: `TASK_OVERDUE_${task._id.toString()}`,
          message: `ESCALACIÓN MANAGER: La tarea "${task.title}" (ID: ${task._id.toString()}) está vencida. Responsable: ${task.assignedTo.toString()}. Días vencida: ${Math.abs(daysUntilDue)}.`,
          severity: AlertSeverity.HIGH,
        });
      }

      // Proactive alerts before due date
      if (daysUntilDue > 0) {
        if (daysUntilDue === 30) {
          await this.alertsService.createUnique({
            companyId,
            type: `TASK_DUE_30_${task._id.toString()}`,
            message: `La tarea "${task.title}" vence en 30 días. Responsable: ${task.assignedTo.toString()}.`,
            severity: AlertSeverity.MEDIUM,
          });
        } else if (daysUntilDue === 15) {
          await this.alertsService.createUnique({
            companyId,
            type: `TASK_DUE_15_${task._id.toString()}`,
            message: `La tarea "${task.title}" vence en 15 días. Responsable: ${task.assignedTo.toString()}.`,
            severity: AlertSeverity.MEDIUM,
          });
        } else if (daysUntilDue === 5) {
          await this.alertsService.createUnique({
            companyId,
            type: `TASK_DUE_5_${task._id.toString()}`,
            message: `La tarea "${task.title}" vence en 5 días. Responsable: ${task.assignedTo.toString()}.`,
            severity: AlertSeverity.HIGH,
          });
        } else if (daysUntilDue === 1) {
          await this.alertsService.createUnique({
            companyId,
            type: `TASK_DUE_1_${task._id.toString()}`,
            message: `La tarea "${task.title}" vence mañana. Responsable: ${task.assignedTo.toString()}.`,
            severity: AlertSeverity.HIGH,
          });
        }
      }
    }
  }
}
