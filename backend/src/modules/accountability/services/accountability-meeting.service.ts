import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AccountabilityMeeting,
  AccountabilityMeetingDocument,
  MeetingStatus,
  MeetingType,
} from '../schemas/accountability-meeting.schema';
import { AccountabilityHistoryService } from './accountability-history.service';
import { AccountabilityHistoryAction } from '../schemas/accountability-history.schema';
import { AlertsService } from '../../alerts/alerts.service';
import { AlertSeverity } from '../../alerts/schemas/alert.schema';

import { DocumentMasterService } from '../../document-management/services/document-master.service';

@Injectable()
export class AccountabilityMeetingService {
  constructor(
    @InjectModel(AccountabilityMeeting.name)
    private readonly meetingModel: Model<AccountabilityMeetingDocument>,
    private readonly historyService: AccountabilityHistoryService,
    private readonly alertsService: AlertsService,
    
    private readonly documentService: DocumentMasterService,
  ) {}

  async create(
    companyId: Types.ObjectId,
    dto: {
      title: string;
      date: Date;
      time?: string;
      location?: string;
      meetingType: MeetingType;
      participants?: Types.ObjectId[];
      topicsDiscussed?: string;
      decisions?: string;
    },
    userId: Types.ObjectId,
    userEmail: string,
  ): Promise<AccountabilityMeeting> {
    const meeting = await this.meetingModel.create({
      companyId,
      title: dto.title,
      date: dto.date,
      time: dto.time,
      location: dto.location,
      meetingType: dto.meetingType,
      participants: dto.participants || [],
      topicsDiscussed: dto.topicsDiscussed,
      decisions: dto.decisions,
      createdBy: userId,
    });

    await this.historyService.record({
      companyId,
      userId,
      userEmail,
      action: AccountabilityHistoryAction.MEETING_CREATED,
      entityType: 'AccountabilityMeeting',
      entityId: meeting._id,
      description: `Meeting "${dto.title}" created (${dto.meetingType})`,
      newValue: { title: dto.title, meetingType: dto.meetingType, date: dto.date } as Record<string, unknown>,
    });

    // Generate alerts for upcoming meetings
    const alertDates = [30, 15, 5, 1];
    for (const daysBefore of alertDates) {
      const alertDate = new Date(dto.date);
      alertDate.setDate(alertDate.getDate() - daysBefore);

      if (alertDate > new Date()) {
        await this.alertsService.createUnique({
          companyId,
          type: 'ACCOUNTABILITY_MEETING',
          message: `Accountability meeting "${dto.title}" in ${daysBefore} day(s) on ${dto.date.toLocaleDateString()}`,
          severity: daysBefore <= 5 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
        });
      }
    }

    return meeting;
  }

  async findAll(companyId: Types.ObjectId): Promise<AccountabilityMeeting[]> {
    return this.meetingModel
      .find({ companyId })
      .sort({ date: -1 })
      .populate('participants', 'name email')
      .populate('createdBy', 'name email')
      .exec();
  }

  async findById(id: Types.ObjectId): Promise<AccountabilityMeeting> {
    const meeting = await this.meetingModel
      .findById(id)
      .populate('participants', 'name email')
      .populate('createdBy', 'name email')
      .exec();

    if (!meeting) {
      throw new NotFoundException(`Meeting with id ${id} not found`);
    }

    return meeting;
  }

  async update(
    id: Types.ObjectId,
    companyId: Types.ObjectId,
    updates: Partial<{
      title: string;
      date: Date;
      time: string;
      location: string;
      meetingType: MeetingType;
      status: MeetingStatus;
      participants: Types.ObjectId[];
      topicsDiscussed: string;
      decisions: string;
      minutesContent: string;
    }>,
    userId: Types.ObjectId,
    userEmail: string,
  ): Promise<AccountabilityMeeting> {
    const meeting = await this.meetingModel.findById(id).exec();
    if (!meeting) {
      throw new NotFoundException(`Meeting with id ${id} not found`);
    }

    const previousValue = {
      status: meeting.status,
      title: meeting.title,
    };

    const updated = await this.meetingModel
      .findByIdAndUpdate(id, { $set: updates }, { new: true })
      .populate('participants', 'name email')
      .populate('createdBy', 'name email')
      .exec();

    if (!updated) {
      throw new NotFoundException(`Meeting with id ${id} not found`);
    }

    await this.historyService.record({
      companyId,
      userId,
      userEmail,
      action: AccountabilityHistoryAction.MEETING_COMPLETED,
      entityType: 'AccountabilityMeeting',
      entityId: id,
      description: `Meeting "${updated.title}" updated`,
      previousValue: previousValue as Record<string, unknown>,
      newValue: { status: updated.status } as Record<string, unknown>,
    });

    return updated;
  }

  async complete(
    id: Types.ObjectId,
    companyId: Types.ObjectId,
    dto: {
      topicsDiscussed?: string;
      decisions?: string;
      minutesContent?: string;
    },
    userId: Types.ObjectId,
    userEmail: string,
  ): Promise<AccountabilityMeeting> {
    const meeting = await this.meetingModel.findById(id).exec();
    if (!meeting) {
      throw new NotFoundException(`Meeting with id ${id} not found`);
    }

    const minutesContent =
      dto.minutesContent ||
      this.generateMinutesContent(meeting, dto.topicsDiscussed, dto.decisions);

    const updated = await this.meetingModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: MeetingStatus.COMPLETED,
            completedAt: new Date(),
            topicsDiscussed: dto.topicsDiscussed || meeting.topicsDiscussed,
            decisions: dto.decisions || meeting.decisions,
            minutesContent,
          },
        },
        { new: true },
      )
      .populate('participants', 'name email')
      .populate('createdBy', 'name email')
      .exec();

    if (!updated) {
      throw new NotFoundException(`Meeting with id ${id} not found`);
    }

    // Register minutes in Document Management System
    const minutesDoc = await this.documentService.registerMeetingMinutes({
      companyId,
      code: `ACT-MIN-${meeting.meetingType}-${Date.now()}`,
      name: `Meeting Minutes - ${meeting.title} (${new Date().toLocaleDateString()})`,
      description: `Minutes for ${meeting.meetingType} accountability meeting: ${meeting.title}`,
      ownerUser: userId,
    });

    await this.historyService.record({
      companyId,
      userId,
      userEmail,
      action: AccountabilityHistoryAction.MINUTES_GENERATED,
      entityType: 'AccountabilityMeeting',
      entityId: id,
      description: `Meeting minutes generated for "${meeting.title}" and registered in Document Management System`,
      newValue: { minutesDocumentId: (minutesDoc as any)._id } as Record<string, unknown>,
    });

    // Update meeting with document reference
    await this.meetingModel
      .findByIdAndUpdate(id, { $set: { minutesDocumentId: (minutesDoc as any)._id } })
      .exec();

    // Notify participants
    for (const participantId of meeting.participants) {
      await this.alertsService.createUnique({
        companyId,
        type: 'MEETING_MINUTES_READY',
        message: `Minutes for meeting "${meeting.title}" are ready for review and signature.`,
        severity: AlertSeverity.MEDIUM,
      });
    }

    return updated;
  }

  async remove(
    id: Types.ObjectId,
    companyId: Types.ObjectId,
    userId: Types.ObjectId,
    userEmail: string,
  ): Promise<void> {
    const meeting = await this.meetingModel.findById(id).exec();
    if (!meeting) {
      throw new NotFoundException(`Meeting with id ${id} not found`);
    }

    await this.historyService.record({
      companyId,
      userId,
      userEmail,
      action: AccountabilityHistoryAction.MEETING_CANCELLED,
      entityType: 'AccountabilityMeeting',
      entityId: id,
      description: `Meeting "${meeting.title}" cancelled`,
    });

    await this.meetingModel.findByIdAndDelete(id).exec();
  }

  async getUpcomingMeetings(
    companyId: Types.ObjectId,
    days = 30,
  ): Promise<AccountabilityMeeting[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return this.meetingModel
      .find({
        companyId,
        date: { $gte: new Date(), $lte: futureDate },
        status: MeetingStatus.SCHEDULED,
      })
      .sort({ date: 1 })
      .populate('participants', 'name email')
      .exec();
  }

  private generateMinutesContent(
    meeting: AccountabilityMeeting,
    topicsDiscussed?: string,
    decisions?: string,
  ): string {
    const topics = topicsDiscussed || meeting.topicsDiscussed || '';
    const decisions_ = decisions || meeting.decisions || '';

    return [
      `# Meeting Minutes - ${meeting.title}`,
      '',
      `**Date:** ${meeting.date.toLocaleDateString()}`,
      `**Time:** ${meeting.time || 'N/A'}`,
      `**Location:** ${meeting.location || 'N/A'}`,
      `**Type:** ${meeting.meetingType}`,
      '',
      '## Attendees',
      '',
      meeting.participants?.length
        ? meeting.participants.map((p) => `- ${p}`).join('\n')
        : '- List not available',
      '',
      '## Topics Discussed',
      '',
      topics || '- No topics recorded',
      '',
      '## Decisions',
      '',
      decisions_ || '- No decisions recorded',
      '',
      '---',
      `Generated on ${new Date().toLocaleString()}`,
    ].join('\n');
  }
}
