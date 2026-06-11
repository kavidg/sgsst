import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AccountabilityCommitment,
  AccountabilityCommitmentDocument,
  CommitmentStatus,
  CommitmentPriority,
} from '../schemas/accountability-commitment.schema';
import { AccountabilityHistoryService } from './accountability-history.service';
import { AccountabilityHistoryAction } from '../schemas/accountability-history.schema';
import { AlertsService } from '../../alerts/alerts.service';
import { AlertSeverity } from '../../alerts/schemas/alert.schema';
import { AnnualWorkPlanService } from '../../annual-work-plan/services/annual-work-plan.service';
import { ActivityPriority } from '../../annual-work-plan/schemas/plan-activity.schema';

@Injectable()
export class AccountabilityCommitmentService {
  constructor(
    @InjectModel(AccountabilityCommitment.name)
    private readonly commitmentModel: Model<AccountabilityCommitmentDocument>,
    private readonly historyService: AccountabilityHistoryService,
    private readonly alertsService: AlertsService,
    private readonly annualWorkPlanService: AnnualWorkPlanService,
  ) {}

  async create(
    companyId: Types.ObjectId,
    dto: {
      title: string;
      description?: string;
      responsibleUser: Types.ObjectId;
      dueDate: Date;
      priority?: CommitmentPriority;
      meetingId?: Types.ObjectId;
    },
    userId: Types.ObjectId,
    userEmail: string,
  ): Promise<AccountabilityCommitment> {
    const commitment = await this.commitmentModel.create({
      companyId,
      title: dto.title,
      description: dto.description,
      responsibleUser: dto.responsibleUser,
      dueDate: dto.dueDate,
      priority: dto.priority || CommitmentPriority.MEDIUM,
      meetingId: dto.meetingId,
      status: CommitmentStatus.OPEN,
      createdBy: userId,
    });

    // Create activity/task in Annual Work Plan
    try {
      const plan = await this.annualWorkPlanService.findOrCreateCurrent(companyId, {
        _id: userId,
        email: userEmail,
      } as any);

      if (plan && plan._id) {
        const activity = await this.annualWorkPlanService.createActivity(plan._id, {
          title: `[Accountability] ${dto.title}`,
          description: dto.description || `Commitment from accountability system`,
          startDate: new Date().toISOString(),
          endDate: dto.dueDate.toISOString(),
          responsibleUser: dto.responsibleUser.toString(),
          priority: dto.priority === CommitmentPriority.CRITICAL ? ActivityPriority.CRITICAL : dto.priority === CommitmentPriority.HIGH ? ActivityPriority.HIGH : ActivityPriority.MEDIUM,
          sourceModule: 'Accountability',
        }, { _id: userId, email: userEmail } as any);

        // Update commitment with AWP reference
        await this.commitmentModel.findByIdAndUpdate(commitment._id, {
          $set: { annualWorkPlanActivityId: (activity as any)._id },
        }).exec();
      }
    } catch {
      // AWP integration is optional - don't fail if it doesn't work
    }

    await this.historyService.record({
      companyId,
      userId,
      userEmail,
      action: AccountabilityHistoryAction.COMMITMENT_CREATED,
      entityType: 'AccountabilityCommitment',
      entityId: commitment._id,
      description: `Commitment "${dto.title}" created`,
      newValue: {
        title: dto.title,
        responsibleUser: dto.responsibleUser,
        dueDate: dto.dueDate,
      } as Record<string, unknown>,
    });

    return commitment;
  }

  async findAll(companyId: Types.ObjectId): Promise<AccountabilityCommitment[]> {
    return this.commitmentModel
      .find({ companyId })
      .sort({ createdAt: -1 })
      .populate('responsibleUser', 'name email')
      .populate('createdBy', 'name email')
      .populate('meetingId', 'title date')
      .populate('justificationApprovedBy', 'name email')
      .exec();
  }

  async findById(id: Types.ObjectId): Promise<AccountabilityCommitment> {
    const commitment = await this.commitmentModel
      .findById(id)
      .populate('responsibleUser', 'name email')
      .populate('createdBy', 'name email')
      .populate('meetingId', 'title date')
      .populate('justificationApprovedBy', 'name email')
      .exec();

    if (!commitment) {
      throw new NotFoundException(`Commitment with id ${id} not found`);
    }

    return commitment;
  }

  async findByMeeting(meetingId: Types.ObjectId): Promise<AccountabilityCommitment[]> {
    return this.commitmentModel
      .find({ meetingId })
      .sort({ createdAt: -1 })
      .populate('responsibleUser', 'name email')
      .populate('createdBy', 'name email')
      .exec();
  }

  async findByResponsibleUser(
    companyId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<AccountabilityCommitment[]> {
    return this.commitmentModel
      .find({ companyId, responsibleUser: userId })
      .sort({ dueDate: 1 })
      .populate('responsibleUser', 'name email')
      .populate('createdBy', 'name email')
      .exec();
  }

  async update(
    id: Types.ObjectId,
    companyId: Types.ObjectId,
    updates: Partial<{
      title: string;
      description: string;
      responsibleUser: Types.ObjectId;
      dueDate: Date;
      priority: CommitmentPriority;
      status: CommitmentStatus;
    }>,
    userId: Types.ObjectId,
    userEmail: string,
  ): Promise<AccountabilityCommitment> {
    const commitment = await this.commitmentModel.findById(id).exec();
    if (!commitment) {
      throw new NotFoundException(`Commitment with id ${id} not found`);
    }

    const previousValue = {
      status: commitment.status,
      title: commitment.title,
    };

    const updated = await this.commitmentModel
      .findByIdAndUpdate(id, { $set: updates }, { new: true })
      .populate('responsibleUser', 'name email')
      .exec();

    if (!updated) {
      throw new NotFoundException(`Commitment with id ${id} not found`);
    }

    const action =
      updates.status === CommitmentStatus.COMPLETED
        ? AccountabilityHistoryAction.COMMITMENT_COMPLETED
        : updates.status === CommitmentStatus.CANCELLED
          ? AccountabilityHistoryAction.COMMITMENT_CANCELLED
          : AccountabilityHistoryAction.COMMITMENT_UPDATED;

    await this.historyService.record({
      companyId,
      userId,
      userEmail,
      action,
      entityType: 'AccountabilityCommitment',
      entityId: id,
      description: `Commitment "${updated.title}" ${action.toLowerCase().replace(/_/g, ' ')}`,
      previousValue: previousValue as Record<string, unknown>,
      newValue: { status: updated.status, title: updated.title } as Record<string, unknown>,
    });

    return updated;
  }

  async complete(
    id: Types.ObjectId,
    companyId: Types.ObjectId,
    userId: Types.ObjectId,
    userEmail: string,
  ): Promise<AccountabilityCommitment> {
    return this.update(
      id,
      companyId,
      { status: CommitmentStatus.COMPLETED },
      userId,
      userEmail,
    );
  }

  async submitJustification(
    id: Types.ObjectId,
    companyId: Types.ObjectId,
    dto: {
      reason: string;
      correctiveAction?: string;
      newProposedDate?: Date;
    },
    userId: Types.ObjectId,
    userEmail: string,
  ): Promise<AccountabilityCommitment> {
    const commitment = await this.commitmentModel.findById(id).exec();
    if (!commitment) {
      throw new NotFoundException(`Commitment with id ${id} not found`);
    }

    // Mark as overdue and set justification
    const updated = await this.commitmentModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: CommitmentStatus.OVERDUE,
            justificationReason: dto.reason,
            justificationCorrectiveAction: dto.correctiveAction,
            justificationNewDate: dto.newProposedDate,
            justificationStatus: 'PENDING',
          },
        },
        { new: true },
      )
      .populate('responsibleUser', 'name email')
      .exec();

    if (!updated) {
      throw new NotFoundException(`Commitment with id ${id} not found`);
    }

    await this.historyService.record({
      companyId,
      userId,
      userEmail,
      action: AccountabilityHistoryAction.JUSTIFICATION_SUBMITTED,
      entityType: 'AccountabilityCommitment',
      entityId: id,
      description: `Justification submitted for commitment "${commitment.title}": ${dto.reason}`,
      newValue: { justificationReason: dto.reason, justificationStatus: 'PENDING' } as Record<string, unknown>,
    });

    // Notify managers
    await this.alertsService.createUnique({
      companyId,
      type: 'COMMITMENT_JUSTIFICATION',
      message: `Justification pending approval for commitment "${commitment.title}". Reason: ${dto.reason}`,
      severity: AlertSeverity.MEDIUM,
    });

    return updated;
  }

  async approveJustification(
    id: Types.ObjectId,
    companyId: Types.ObjectId,
    approved: boolean,
    userId: Types.ObjectId,
    userEmail: string,
    rejectionReason?: string,
  ): Promise<AccountabilityCommitment> {
    const commitment = await this.commitmentModel.findById(id).exec();
    if (!commitment) {
      throw new NotFoundException(`Commitment with id ${id} not found`);
    }

    if (commitment.justificationStatus !== 'PENDING') {
      throw new BadRequestException('No pending justification to approve');
    }

    const updates: Partial<{ justificationStatus: string; status: CommitmentStatus; justificationApprovedBy: Types.ObjectId; justificationApprovedAt: Date; dueDate: Date }> = {
      justificationStatus: approved ? 'APPROVED' : 'REJECTED',
      justificationApprovedBy: userId,
      justificationApprovedAt: new Date(),
    };

    if (approved && commitment.justificationNewDate) {
      updates.status = CommitmentStatus.IN_PROGRESS;
      updates.dueDate = commitment.justificationNewDate;
    } else if (!approved) {
      updates.status = CommitmentStatus.OVERDUE;
    }

    const updated = await this.commitmentModel
      .findByIdAndUpdate(id, { $set: updates }, { new: true })
      .populate('responsibleUser', 'name email')
      .populate('justificationApprovedBy', 'name email')
      .exec();

    if (!updated) {
      throw new NotFoundException(`Commitment with id ${id} not found`);
    }

    const action = approved
      ? AccountabilityHistoryAction.JUSTIFICATION_APPROVED
      : AccountabilityHistoryAction.JUSTIFICATION_REJECTED;

    await this.historyService.record({
      companyId,
      userId,
      userEmail,
      action,
      entityType: 'AccountabilityCommitment',
      entityId: id,
      description: `Justification ${approved ? 'approved' : 'rejected'} for commitment "${commitment.title}"`,
      newValue: { justificationStatus: approved ? 'APPROVED' : 'REJECTED' } as Record<string, unknown>,
    });

    return updated;
  }

  async checkOverdueCommitments(companyId: Types.ObjectId): Promise<number> {
    const overdue = await this.commitmentModel
      .find({
        companyId,
        status: { $in: [CommitmentStatus.OPEN, CommitmentStatus.IN_PROGRESS] },
        dueDate: { $lt: new Date() },
      })
      .populate('responsibleUser', 'name email')
      .exec();

    for (const commitment of overdue) {
      await this.commitmentModel
        .findByIdAndUpdate(commitment._id, { $set: { status: CommitmentStatus.OVERDUE } })
        .exec();

      await this.alertsService.createUnique({
        companyId,
        type: 'COMMITMENT_OVERDUE',
        message: `Commitment "${commitment.title}" is overdue. Responsible: ${(commitment.responsibleUser as any)?.name || 'Unknown'}. Due date was ${commitment.dueDate.toLocaleDateString()}.`,
        severity: AlertSeverity.HIGH,
      });
    }

    return overdue.length;
  }

  async getCommitmentStats(companyId: Types.ObjectId): Promise<{
    total: number;
    open: number;
    inProgress: number;
    completed: number;
    overdue: number;
    cancelled: number;
  }> {
    const [
      total,
      open,
      inProgress,
      completed,
      overdue,
      cancelled,
    ] = await Promise.all([
      this.commitmentModel.countDocuments({ companyId }).exec(),
      this.commitmentModel.countDocuments({ companyId, status: CommitmentStatus.OPEN }).exec(),
      this.commitmentModel.countDocuments({ companyId, status: CommitmentStatus.IN_PROGRESS }).exec(),
      this.commitmentModel.countDocuments({ companyId, status: CommitmentStatus.COMPLETED }).exec(),
      this.commitmentModel.countDocuments({ companyId, status: CommitmentStatus.OVERDUE }).exec(),
      this.commitmentModel.countDocuments({ companyId, status: CommitmentStatus.CANCELLED }).exec(),
    ]);

    return { total, open, inProgress, completed, overdue, cancelled };
  }
}
