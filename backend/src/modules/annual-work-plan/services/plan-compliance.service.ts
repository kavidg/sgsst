import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PlanActivity, PlanActivityDocument } from '../schemas/plan-activity.schema';
import { PlanTask, PlanTaskDocument, TaskStatus } from '../schemas/plan-task.schema';
import { TaskJustification, TaskJustificationDocument, JustificationApprovalStatus } from '../schemas/task-justification.schema';
import { TaskEvidence, TaskEvidenceDocument } from '../schemas/task-evidence.schema';

export interface ComplianceResult {
  overallPercentage: number;
  completedActivities: number;
  totalActivities: number;
  completedTasks: number;
  totalTasks: number;
  overdueTasks: number;
  justifiedOverdueTasks: number;
  tasksWithEvidence: number;
  weights: {
    activityCompletion: number;
    taskCompletion: number;
    evidenceCoverage: number;
    overdueJustification: number;
  };
}

@Injectable()
export class PlanComplianceService {
  constructor(
    @InjectModel(PlanActivity.name)
    private readonly activityModel: Model<PlanActivityDocument>,
    @InjectModel(PlanTask.name)
    private readonly taskModel: Model<PlanTaskDocument>,
    @InjectModel(TaskJustification.name)
    private readonly justificationModel: Model<TaskJustificationDocument>,
    @InjectModel(TaskEvidence.name)
    private readonly evidenceModel: Model<TaskEvidenceDocument>,
  ) {}

  async calculate(annualPlanId: Types.ObjectId): Promise<ComplianceResult> {
    const activities = await this.activityModel.find({ annualPlanId }).exec();
    const activityIds = activities.map((a) => a._id);
    const tasks = await this.taskModel.find({ activityId: { $in: activityIds } }).exec();
    const taskIds = tasks.map((t) => t._id);

    const totalActivities = activities.length;
    const completedActivities = activities.filter(
      (a) => a.status === 'Completed',
    ).length;

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(
      (t) => t.status === TaskStatus.COMPLETED || t.progress >= 100,
    ).length;

    const now = new Date();
    const overdueTasks = tasks.filter(
      (t) =>
        t.dueDate < now &&
        t.status !== TaskStatus.COMPLETED &&
        t.status !== TaskStatus.CANCELLED,
    ).length;

    const justifications = await this.justificationModel
      .find({
        taskId: { $in: taskIds },
        approvalStatus: JustificationApprovalStatus.APPROVED,
      })
      .exec();
    const justifiedTaskIds = new Set(
      justifications.map((j) => j.taskId.toString()),
    );

    const evidenceDocs = await this.evidenceModel
      .find({ taskId: { $in: taskIds } })
      .exec();
    const taskIdsWithEvidence = new Set(
      evidenceDocs.map((e) => e.taskId.toString()),
    );

    const overdueTaskIds = tasks
      .filter(
        (t) =>
          t.dueDate < now &&
          t.status !== TaskStatus.COMPLETED &&
          t.status !== TaskStatus.CANCELLED,
      )
      .map((t) => t._id.toString());
    const justifiedOverdueTasks = overdueTaskIds.filter((id) =>
      justifiedTaskIds.has(id),
    ).length;

    const tasksWithEvidence = tasks.filter((t) =>
      taskIdsWithEvidence.has(t._id.toString()),
    ).length;

    const activityCompletionWeight = 0.25;
    const taskCompletionWeight = 0.45;
    const evidenceCoverageWeight = 0.2;
    const overdueJustificationWeight = 0.1;

    const activityCompletionScore =
      totalActivities > 0 ? completedActivities / totalActivities : 0;
    const taskCompletionScore =
      totalTasks > 0 ? completedTasks / totalTasks : 0;
    const evidenceCoverageScore =
      totalTasks > 0 ? tasksWithEvidence / totalTasks : 0;
    const overdueJustificationScore =
      overdueTasks > 0 ? justifiedOverdueTasks / overdueTasks : 1;

    const overallPercentage = Math.round(
      (activityCompletionScore * activityCompletionWeight +
        taskCompletionScore * taskCompletionWeight +
        evidenceCoverageScore * evidenceCoverageWeight +
        overdueJustificationScore * overdueJustificationWeight) *
        100,
    );

    return {
      overallPercentage: Math.min(100, Math.max(0, overallPercentage)),
      completedActivities,
      totalActivities,
      completedTasks,
      totalTasks,
      overdueTasks,
      justifiedOverdueTasks,
      tasksWithEvidence,
      weights: {
        activityCompletion: activityCompletionWeight,
        taskCompletion: taskCompletionWeight,
        evidenceCoverage: evidenceCoverageWeight,
        overdueJustification: overdueJustificationWeight,
      },
    };
  }
}
