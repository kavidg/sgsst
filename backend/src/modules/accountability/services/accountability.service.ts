import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccountabilityMeetingService } from './accountability-meeting.service';
import { AccountabilityReportService } from './accountability-report.service';
import { AccountabilityCommitmentService } from './accountability-commitment.service';
import { AccountabilityHistoryService } from './accountability-history.service';
import { AccountabilityHistoryAction } from '../schemas/accountability-history.schema';
import { AccountabilityMeeting, MeetingStatus } from '../schemas/accountability-meeting.schema';
import { AccountabilityCommitment, CommitmentStatus } from '../schemas/accountability-commitment.schema';
import { AccountabilityReport, ReportStatus } from '../schemas/accountability-report.schema';
import { AlertsService } from '../../alerts/alerts.service';
import { AlertSeverity } from '../../alerts/schemas/alert.schema';

@Injectable()
export class AccountabilityService {
  constructor(
    private readonly meetingService: AccountabilityMeetingService,
    private readonly reportService: AccountabilityReportService,
    private readonly commitmentService: AccountabilityCommitmentService,
    private readonly historyService: AccountabilityHistoryService,
    private readonly alertsService: AlertsService,
  ) {}

  async getDashboardMetrics(companyId: Types.ObjectId): Promise<{
    totalMeetings: number;
    completedMeetings: number;
    scheduledMeetings: number;
    totalReports: number;
    signedReports: number;
    draftReports: number;
    totalCommitments: number;
    openCommitments: number;
    overdueCommitments: number;
    completedCommitments: number;
    compliancePercentage: number;
  }> {
    const [meetings, reports, commitmentStats] = await Promise.all([
      this.meetingService.findAll(companyId),
      this.reportService.findAll(companyId),
      this.commitmentService.getCommitmentStats(companyId),
    ]);

    const totalMeetings = meetings.length;
    const completedMeetings = meetings.filter((m) => m.status === MeetingStatus.COMPLETED).length;
    const scheduledMeetings = meetings.filter((m) => m.status === MeetingStatus.SCHEDULED).length;

    const totalReports = reports.length;
    const signedReports = reports.filter((r) => r.status === ReportStatus.SIGNED).length;
    const draftReports = reports.filter((r) => r.status === ReportStatus.DRAFT).length;

    // Compliance: meets + signed reports + completed commitments
    const hasMeetings = totalMeetings > 0;
    const hasReports = totalReports > 0;
    const hasCommitments = commitmentStats.total > 0;

    let complianceScore = 0;
    let complianceFactors = 0;

    if (hasMeetings) {
      complianceScore += (completedMeetings / totalMeetings) * 100;
      complianceFactors++;
    }
    if (hasReports) {
      complianceScore += (signedReports / totalReports) * 100;
      complianceFactors++;
    }
    if (hasCommitments) {
      complianceScore += (commitmentStats.completed / commitmentStats.total) * 100;
      complianceFactors++;
    }

    const compliancePercentage = complianceFactors > 0
      ? Math.round(complianceScore / complianceFactors)
      : 0;

    return {
      totalMeetings,
      completedMeetings,
      scheduledMeetings,
      totalReports,
      signedReports,
      draftReports,
      totalCommitments: commitmentStats.total,
      openCommitments: commitmentStats.open + commitmentStats.inProgress,
      overdueCommitments: commitmentStats.overdue,
      completedCommitments: commitmentStats.completed,
      compliancePercentage,
    };
  }

  async checkAutoCompliance(companyId: Types.ObjectId): Promise<{
    complies: boolean;
    reasons: string[];
    score: number;
  }> {
    const metrics = await this.getDashboardMetrics(companyId);
    const reasons: string[] = [];
    let score = 0;

    // Reports exist
    if (metrics.totalReports > 0) {
      score += 20;
      reasons.push('✅ Accountability reports exist');
    } else {
      reasons.push('❌ No accountability reports generated');
    }

    // Reports are generated periodically
    if (metrics.signedReports > 0) {
      score += 20;
      reasons.push('✅ Reports are periodically generated and signed');
    } else if (metrics.draftReports > 0) {
      score += 10;
      reasons.push('⚠ Reports exist but need signatures');
    } else {
      reasons.push('❌ No reports signed');
    }

    // Meeting minutes exist
    if (metrics.completedMeetings > 0) {
      score += 20;
      reasons.push('✅ Meeting minutes exist with documented decisions');
    } else {
      reasons.push('❌ No completed accountability meetings');
    }

    // Commitments are tracked
    if (metrics.totalCommitments > 0) {
      score += 20;
      reasons.push('✅ Commitments are tracked');
    } else {
      reasons.push('❌ No commitments registered');
    }

    // Reports are signed
    if (metrics.signedReports > 0) {
      score += 10;
      reasons.push('✅ Reports are signed');
    } else {
      reasons.push('❌ No signed reports');
    }

    // Documents are archived
    if (metrics.signedReports >= 2) {
      score += 10;
      reasons.push('✅ Multiple reports archived in Document Management System');
    } else if (metrics.signedReports >= 1) {
      score += 5;
      reasons.push('⚠ At least one report archived');
    } else {
      reasons.push('❌ No documents archived');
    }

    const complies = score >= 80;

    return {
      complies,
      reasons,
      score,
    };
  }

  async createIndividualReport(
    companyId: Types.ObjectId,
    dto: {
      userId: Types.ObjectId;
      userEmail: string;
      activitiesPerformed: string;
      activitiesPending: string;
      difficulties?: string;
      correctiveActions?: string;
      recommendations?: string;
      observations?: string;
    },
  ): Promise<AccountabilityReport> {
    const report = await this.reportService.create(
      companyId,
      {
        reportType: 'MONTHLY' as any,
        periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        periodEnd: new Date(),
        executiveSummary: dto.activitiesPerformed,
        achievements: dto.activitiesPerformed,
        pendingActions: dto.activitiesPending,
        riskAreas: dto.difficulties,
        criticalFindings: dto.correctiveActions,
        recommendations: dto.recommendations,
        nextActions: dto.observations,
      },
      dto.userId,
      dto.userEmail,
    );

    // Store metadata
    await this.reportService.update(
      (report as any)._id as Types.ObjectId,
      companyId,
      {
        metadata: {
          'reportType': 'INDIVIDUAL',
          'userId': dto.userId.toString(),
          'userEmail': dto.userEmail,
        } as any,
      } as any,
      dto.userId,
      dto.userEmail,
    );

    return report;
  }

  async checkAndGenerateAlerts(companyId: Types.ObjectId): Promise<string[]> {
    const alerts: string[] = [];
    const metrics = await this.getDashboardMetrics(companyId);

    // Check for overdue commitments
    if (metrics.overdueCommitments > 0) {
      const alert = await this.alertsService.createUnique({
        companyId,
        type: 'OVERDUE_COMMITMENTS',
        message: `${metrics.overdueCommitments} commitment(s) are overdue. Manager review required.`,
        severity: AlertSeverity.HIGH,
      });
      alerts.push(alert.message);
    }

    // Check if no meetings in current month
    const currentMonthMeetings = await this.meetingService.getUpcomingMeetings(companyId, 30);
    if (currentMonthMeetings.length === 0 && metrics.totalMeetings === 0) {
      const alert = await this.alertsService.createUnique({
        companyId,
        type: 'MISSING_ACCOUNTABILITY_MEETINGS',
        message: 'No accountability meetings scheduled. Schedule a meeting to maintain compliance.',
        severity: AlertSeverity.MEDIUM,
      });
      alerts.push(alert.message);
    }

    // Check for missing reports
    if (metrics.totalReports === 0) {
      const alert = await this.alertsService.createUnique({
        companyId,
        type: 'MISSING_ACCOUNTABILITY_REPORTS',
        message: 'No accountability reports have been generated. Generate a report to maintain compliance.',
        severity: AlertSeverity.MEDIUM,
      });
      alerts.push(alert.message);
    }

    return alerts;
  }
}
