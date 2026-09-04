import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SgstProgram,
  SgstProgramDocument,
  ProgramStatus,
  ProgramActivity,
  ProgramActivityDocument,
  ProgramActivityStatus,
} from '../schemas/program.schema';
import { UserDocument } from '../../users/schemas/user.schema';
import { PlanHistoryService } from '../../annual-work-plan/services/plan-history.service';

@Injectable()
export class ProgramsService {
  constructor(
    @InjectModel(SgstProgram.name)
    private readonly programModel: Model<SgstProgramDocument>,
    @InjectModel(ProgramActivity.name)
    private readonly activityModel: Model<ProgramActivityDocument>,
    private readonly planHistoryService: PlanHistoryService,
  ) {}

  // ==================== PROGRAM CRUD ====================

  async create(
    companyId: Types.ObjectId,
    dto: {
      name: string;
      description?: string;
      objective?: string;
      standardNumber?: string;
      responsibleUser?: string;
      startDate: string;
      endDate: string;
    },
    user: UserDocument,
  ): Promise<SgstProgram> {
    // Check unique name per company
    const existing = await this.programModel
      .findOne({ companyId, name: dto.name.trim() })
      .exec();
    if (existing) {
      throw new BadRequestException(
        `Program with name "${dto.name}" already exists`,
      );
    }

    const program = await this.programModel.create({
      companyId,
      name: dto.name.trim(),
      description: dto.description ?? '',
      objective: dto.objective ?? '',
      standardNumber: dto.standardNumber,
      responsibleUser: dto.responsibleUser
        ? new Types.ObjectId(dto.responsibleUser)
        : undefined,
      status: ProgramStatus.DRAFT,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      completionPercentage: 0,
      phvaPhase: 'do',
      createdBy: user._id,
    });

    await this.planHistoryService.record(
      'SgstProgram',
      program._id.toString(),
      user._id,
      user.email,
      'CREATE',
      undefined,
      JSON.stringify({ name: dto.name, status: ProgramStatus.DRAFT }),
    );

    return program;
  }

  async findAll(companyId: Types.ObjectId): Promise<SgstProgram[]> {
    return this.programModel
      .find({ companyId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(
    id: Types.ObjectId,
    companyId?: Types.ObjectId,
  ): Promise<SgstProgramDocument> {
    const query: Record<string, unknown> = { _id: id };
    if (companyId) query.companyId = companyId;

    const program = await this.programModel.findOne(query).exec();
    if (!program) throw new NotFoundException('Program not found');
    return program;
  }

  async update(
    id: Types.ObjectId,
    companyId: Types.ObjectId,
    dto: Record<string, unknown>,
    user: UserDocument,
  ): Promise<SgstProgram> {
    const program = await this.findById(id, companyId);
    const before = JSON.stringify({
      name: program.name,
      status: program.status,
    });

    if (dto.name !== undefined) program.name = dto.name as string;
    if (dto.description !== undefined)
      program.description = dto.description as string;
    if (dto.objective !== undefined) program.objective = dto.objective as string;
    if (dto.standardNumber !== undefined)
      program.standardNumber = dto.standardNumber as string;
    if (dto.responsibleUser !== undefined)
      program.responsibleUser = new Types.ObjectId(dto.responsibleUser as string);
    if (dto.startDate !== undefined)
      program.startDate = new Date(dto.startDate as string);
    if (dto.endDate !== undefined)
      program.endDate = new Date(dto.endDate as string);
    if (dto.status !== undefined) {
      program.status = dto.status as ProgramStatus;
    }

    await program.save();

    await this.planHistoryService.record(
      'SgstProgram',
      program._id.toString(),
      user._id,
      user.email,
      'UPDATE',
      before,
      JSON.stringify({ name: program.name, status: program.status }),
    );

    return program;
  }

  async remove(
    id: Types.ObjectId,
    companyId: Types.ObjectId,
    user: UserDocument,
  ): Promise<void> {
    const program = await this.findById(id, companyId);

    // Cascade delete activities
    await this.activityModel.deleteMany({ programId: id }).exec();
    await this.programModel.findByIdAndDelete(id).exec();

    await this.planHistoryService.record(
      'SgstProgram',
      id.toString(),
      user._id,
      user.email,
      'DELETE',
      JSON.stringify({ name: program.name }),
    );
  }

  // ==================== ACTIVITY CRUD ====================

  async createActivity(
    programId: Types.ObjectId,
    companyId: Types.ObjectId,
    dto: {
      title: string;
      description?: string;
      standardNumber?: string;
      responsibleUser?: string;
      startDate: string;
      endDate: string;
      priority?: string;
    },
    user: UserDocument,
  ): Promise<ProgramActivity> {
    const program = await this.findById(programId, companyId);

    if (
      program.status === ProgramStatus.ARCHIVED ||
      program.status === ProgramStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'Cannot add activities to a completed or archived program',
      );
    }

    const activity = await this.activityModel.create({
      programId,
      title: dto.title.trim(),
      description: dto.description ?? '',
      standardNumber: dto.standardNumber,
      responsibleUser: dto.responsibleUser
        ? new Types.ObjectId(dto.responsibleUser)
        : undefined,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      priority: dto.priority ?? 'Medium',
      status: ProgramActivityStatus.PENDING,
      progress: 0,
      observations: '',
      createdBy: user._id,
    });

    await this.planHistoryService.record(
      'ProgramActivity',
      activity._id.toString(),
      user._id,
      user.email,
      'CREATE',
      undefined,
      JSON.stringify({
        title: dto.title,
        programId: programId.toString(),
      }),
    );

    return activity;
  }

  async getActivities(
    programId: Types.ObjectId,
    companyId?: Types.ObjectId,
  ): Promise<ProgramActivity[]> {
    // Tenant isolation
    if (companyId) {
      await this.findById(programId, companyId);
    }
    return this.activityModel
      .find({ programId })
      .sort({ startDate: 1 })
      .exec();
  }

  async findActivityById(
    id: Types.ObjectId,
    companyId?: Types.ObjectId,
  ): Promise<ProgramActivityDocument> {
    const activity = await this.activityModel.findById(id).exec();
    if (!activity) throw new NotFoundException('Activity not found');

    // Tenant isolation: verify the program belongs to the company
    if (companyId) {
      await this.findById(activity.programId, companyId);
    }

    return activity;
  }

  async updateActivity(
    id: Types.ObjectId,
    companyId: Types.ObjectId,
    dto: Record<string, unknown>,
    user: UserDocument,
  ): Promise<ProgramActivity> {
    const activity = await this.findActivityById(id, companyId);
    const before = JSON.stringify({
      title: activity.title,
      status: activity.status,
      progress: activity.progress,
    });

    if (dto.title !== undefined) activity.title = dto.title as string;
    if (dto.description !== undefined)
      activity.description = dto.description as string;
    if (dto.standardNumber !== undefined)
      activity.standardNumber = dto.standardNumber as string;
    if (dto.responsibleUser !== undefined)
      activity.responsibleUser = new Types.ObjectId(dto.responsibleUser as string);
    if (dto.startDate !== undefined)
      activity.startDate = new Date(dto.startDate as string);
    if (dto.endDate !== undefined)
      activity.endDate = new Date(dto.endDate as string);
    if (dto.priority !== undefined)
      activity.priority = dto.priority as never;
    if (dto.observations !== undefined)
      activity.observations = dto.observations as string;
    if (dto.progress !== undefined) {
      activity.progress = dto.progress as number;
      // Auto-set status based on progress
      if ((dto.progress as number) >= 100)
        activity.status = ProgramActivityStatus.COMPLETED;
      else if ((dto.progress as number) > 0)
        activity.status = ProgramActivityStatus.IN_PROGRESS;
    }
    if (dto.status !== undefined) {
      activity.status = dto.status as ProgramActivityStatus;
    }

    await activity.save();

    await this.planHistoryService.record(
      'ProgramActivity',
      activity._id.toString(),
      user._id,
      user.email,
      'UPDATE',
      before,
      JSON.stringify({
        title: activity.title,
        status: activity.status,
        progress: activity.progress,
      }),
    );

    // Recalculate program completion
    await this.recalculateCompletion(activity.programId);

    return activity;
  }

  // ==================== DASHBOARD ====================

  async getDashboard(
    programId: Types.ObjectId,
    companyId?: Types.ObjectId,
  ): Promise<{
    totalActivities: number;
    pending: number;
    inProgress: number;
    completed: number;
    delayed: number;
    cancelled: number;
    completionPercentage: number;
    overdue: number;
  }> {
    const program = await this.findById(programId, companyId);

    const activities = await this.activityModel
      .find({ programId: program._id })
      .exec();

    const now = new Date();
    let pending = 0;
    let inProgress = 0;
    let completed = 0;
    let delayed = 0;
    let cancelled = 0;
    let overdue = 0;

    for (const act of activities) {
      switch (act.status) {
        case ProgramActivityStatus.PENDING:
          pending++;
          break;
        case ProgramActivityStatus.IN_PROGRESS:
          inProgress++;
          break;
        case ProgramActivityStatus.COMPLETED:
          completed++;
          break;
        case ProgramActivityStatus.DELAYED:
          delayed++;
          break;
        case ProgramActivityStatus.CANCELLED:
          cancelled++;
          break;
      }

      // Overdue: endDate < now AND status NOT IN [COMPLETED, CANCELLED]
      if (
        act.endDate < now &&
        act.status !== ProgramActivityStatus.COMPLETED &&
        act.status !== ProgramActivityStatus.CANCELLED
      ) {
        overdue++;
      }
    }

    const totalActivities = activities.length;
    const completionPercentage =
      totalActivities > 0
        ? Math.round((completed / totalActivities) * 100)
        : 0;

    return {
      totalActivities,
      pending,
      inProgress,
      completed,
      delayed,
      cancelled,
      completionPercentage,
      overdue,
    };
  }

  // ==================== COMPLIANCE ====================

  /**
   * Recalculate program completion percentage based on activities.
   * completionPercentage = completed / total * 100 (0 if total = 0).
   */
  private async recalculateCompletion(
    programId: Types.ObjectId,
  ): Promise<void> {
    const activities = await this.activityModel
      .find({ programId })
      .exec();

    const total = activities.length;
    const completed = activities.filter(
      (a) => a.status === ProgramActivityStatus.COMPLETED,
    ).length;

    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    await this.programModel
      .findByIdAndUpdate(programId, { completionPercentage: percentage })
      .exec();
  }

  /**
   * Get compliance summary across all programs for a company.
   * Used by ComplianceEngine provider.
   */
  async getComplianceSummary(companyId: Types.ObjectId): Promise<{
    totalPrograms: number;
    activePrograms: number;
    completedPrograms: number;
    totalActivities: number;
    completedActivities: number;
    overdueActivities: number;
    overallPercentage: number;
  }> {
    const programs = await this.programModel
      .find({ companyId })
      .exec();

    const programIds = programs.map((p) => p._id);
    const activities = programIds.length > 0
      ? await this.activityModel.find({ programId: { $in: programIds } }).exec()
      : [];

    const now = new Date();
    const totalPrograms = programs.length;
    const activePrograms = programs.filter(
      (p) => p.status === ProgramStatus.ACTIVE,
    ).length;
    const completedPrograms = programs.filter(
      (p) => p.status === ProgramStatus.COMPLETED,
    ).length;

    const totalActivities = activities.length;
    const completedActivities = activities.filter(
      (a) => a.status === ProgramActivityStatus.COMPLETED,
    ).length;
    const overdueActivities = activities.filter(
      (a) =>
        a.endDate < now &&
        a.status !== ProgramActivityStatus.COMPLETED &&
        a.status !== ProgramActivityStatus.CANCELLED,
    ).length;

    const overallPercentage =
      totalActivities > 0
        ? Math.round((completedActivities / totalActivities) * 100)
        : 0;

    return {
      totalPrograms,
      activePrograms,
      completedPrograms,
      totalActivities,
      completedActivities,
      overdueActivities,
      overallPercentage,
    };
  }
}
