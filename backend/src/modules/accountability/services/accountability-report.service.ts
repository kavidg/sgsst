import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AccountabilityReport,
  AccountabilityReportDocument,
  ReportStatus,
  ReportType,
} from '../schemas/accountability-report.schema';
import { AccountabilityHistoryService } from './accountability-history.service';
import { AccountabilityHistoryAction } from '../schemas/accountability-history.schema';
import { DocumentMasterService } from '../../document-management/services/document-master.service';
import { AlertsService } from '../../alerts/alerts.service';
import { AlertSeverity } from '../../alerts/schemas/alert.schema';

@Injectable()
export class AccountabilityReportService {
  constructor(
    @InjectModel(AccountabilityReport.name)
    private readonly reportModel: Model<AccountabilityReportDocument>,
    private readonly historyService: AccountabilityHistoryService,
    private readonly documentService: DocumentMasterService,
    private readonly alertsService: AlertsService,
  ) {}

  async create(
    companyId: Types.ObjectId,
    dto: {
      reportType: ReportType;
      periodStart: Date;
      periodEnd: Date;
      executiveSummary?: string;
      achievements?: string;
      pendingActions?: string;
      riskAreas?: string;
      compliancePercentage?: number;
      criticalFindings?: string;
      recommendations?: string;
      nextActions?: string;
    },
    userId: Types.ObjectId,
    userEmail: string,
  ): Promise<AccountabilityReport> {
    const reportCount = await this.reportModel.countDocuments({ companyId }).exec();
    const reportNumber = `ACT-${dto.reportType}-${new Date().getFullYear()}-${(reportCount + 1).toString().padStart(3, '0')}`;

    const report = await this.reportModel.create({
      companyId,
      reportNumber,
      reportType: dto.reportType,
      periodStart: dto.periodStart,
      periodEnd: dto.periodEnd,
      status: ReportStatus.DRAFT,
      generatedBy: userId,
      executiveSummary: dto.executiveSummary || '',
      achievements: dto.achievements || '',
      pendingActions: dto.pendingActions || '',
      riskAreas: dto.riskAreas || '',
      compliancePercentage: dto.compliancePercentage || 0,
      criticalFindings: dto.criticalFindings || '',
      recommendations: dto.recommendations || '',
      nextActions: dto.nextActions || '',
    });

    await this.historyService.record({
      companyId,
      userId,
      userEmail,
      action: AccountabilityHistoryAction.REPORT_GENERATED,
      entityType: 'AccountabilityReport',
      entityId: report._id,
      description: `Report ${reportNumber} generated (${dto.reportType})`,
      newValue: {
        reportNumber,
        reportType: dto.reportType,
        periodStart: dto.periodStart,
        periodEnd: dto.periodEnd,
      } as Record<string, unknown>,
    });

    // Register report in Document Management System
    const reportDoc = await this.documentService.registerDocument({
      companyId,
      code: reportNumber,
      name: `Accountability Report - ${dto.reportType} (${dto.periodStart.toLocaleDateString()} to ${dto.periodEnd.toLocaleDateString()})`,
      description: dto.executiveSummary?.substring(0, 200),
      documentType: 'RECORD' as any,
      process: 'Accountability Management',
      ownerUser: userId,
    });

    // Update report with document reference
    await this.reportModel
      .findByIdAndUpdate(report._id, { $set: { documentId: (reportDoc as any)._id } })
      .exec();

    return { ...report.toObject(), documentId: (reportDoc as any)._id };
  }

  async findAll(companyId: Types.ObjectId): Promise<AccountabilityReport[]> {
    return this.reportModel
      .find({ companyId })
      .sort({ periodStart: -1 })
      .populate('generatedBy', 'name email')
      .populate('signedBy', 'name email')
      .exec();
  }

  async findById(id: Types.ObjectId): Promise<AccountabilityReport> {
    const report = await this.reportModel
      .findById(id)
      .populate('generatedBy', 'name email')
      .populate('signedBy', 'name email')
      .exec();

    if (!report) {
      throw new NotFoundException(`Report with id ${id} not found`);
    }

    return report;
  }

  async findByType(
    companyId: Types.ObjectId,
    reportType: ReportType,
  ): Promise<AccountabilityReport[]> {
    return this.reportModel
      .find({ companyId, reportType })
      .sort({ periodStart: -1 })
      .populate('generatedBy', 'name email')
      .exec();
  }

  async update(
    id: Types.ObjectId,
    companyId: Types.ObjectId,
    updates: Partial<{
      executiveSummary: string;
      achievements: string;
      pendingActions: string;
      riskAreas: string;
      compliancePercentage: number;
      criticalFindings: string;
      recommendations: string;
      nextActions: string;
      status: ReportStatus;
    }>,
    userId: Types.ObjectId,
    userEmail: string,
  ): Promise<AccountabilityReport> {
    const report = await this.reportModel.findById(id).exec();
    if (!report) {
      throw new NotFoundException(`Report with id ${id} not found`);
    }

    const previousValue = {
      status: report.status,
      compliancePercentage: report.compliancePercentage,
    };

    const updated = await this.reportModel
      .findByIdAndUpdate(id, { $set: updates }, { new: true })
      .populate('generatedBy', 'name email')
      .populate('signedBy', 'name email')
      .exec();

    if (!updated) {
      throw new NotFoundException(`Report with id ${id} not found`);
    }

    await this.historyService.record({
      companyId,
      userId,
      userEmail,
      action: AccountabilityHistoryAction.REPORT_GENERATED,
      entityType: 'AccountabilityReport',
      entityId: id,
      description: `Report ${report.reportNumber} updated`,
      previousValue: previousValue as Record<string, unknown>,
      newValue: { status: updated.status } as Record<string, unknown>,
    });

    return updated;
  }

  async sign(
    id: Types.ObjectId,
    companyId: Types.ObjectId,
    signedBy: Types.ObjectId,
    userEmail: string,
    signatureHash?: string,
    signatureUrl?: string,
  ): Promise<AccountabilityReport> {
    const report = await this.reportModel.findById(id).exec();
    if (!report) {
      throw new NotFoundException(`Report with id ${id} not found`);
    }

    const updated = await this.reportModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: ReportStatus.SIGNED,
            signedBy,
            signedAt: new Date(),
            signatureHash,
            signatureUrl,
          },
        },
        { new: true },
      )
      .populate('generatedBy', 'name email')
      .populate('signedBy', 'name email')
      .exec();

    if (!updated) {
      throw new NotFoundException(`Report with id ${id} not found`);
    }

    // Add digital signature via Document Management System
    await this.documentService.addSignature({
      companyId,
      documentId: report.documentId || new Types.ObjectId(),
      userId: signedBy,
      signerName: 'Accountability Report Signer',
      signerEmail: userEmail,
      signatureHash,
      signatureUrl,
      isExecutiveSignature: true,
    });

    await this.historyService.record({
      companyId,
      userId: signedBy,
      userEmail,
      action: AccountabilityHistoryAction.REPORT_SIGNED,
      entityType: 'AccountabilityReport',
      entityId: id,
      description: `Report ${report.reportNumber} signed`,
      newValue: { signedBy, signedAt: new Date() } as Record<string, unknown>,
    });

    return updated;
  }

  async archive(
    id: Types.ObjectId,
    companyId: Types.ObjectId,
    userId: Types.ObjectId,
    userEmail: string,
  ): Promise<AccountabilityReport> {
    const report = await this.reportModel.findByIdAndUpdate(
      id,
      { $set: { status: ReportStatus.ARCHIVED } },
      { new: true },
    ).exec();

    if (!report) {
      throw new NotFoundException(`Report with id ${id} not found`);
    }

    await this.historyService.record({
      companyId,
      userId,
      userEmail,
      action: AccountabilityHistoryAction.REPORT_ARCHIVED,
      entityType: 'AccountabilityReport',
      entityId: id,
      description: `Report ${report.reportNumber} archived`,
    });

    return report;
  }

  async getCurrentPeriodReport(
    companyId: Types.ObjectId,
  ): Promise<AccountabilityReport | null> {
    const currentYear = new Date().getFullYear();
    return this.reportModel
      .findOne({
        companyId,
        periodStart: { $gte: new Date(`${currentYear}-01-01`) },
        periodEnd: { $lte: new Date(`${currentYear + 1}-01-01`) },
        status: { $in: [ReportStatus.GENERATED, ReportStatus.SIGNED] },
      })
      .sort({ periodStart: -1 })
      .populate('generatedBy', 'name email')
      .populate('signedBy', 'name email')
      .exec();
  }

  async getReportStats(companyId: Types.ObjectId): Promise<{
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    signed: number;
    draft: number;
  }> {
    const reports = await this.reportModel.find({ companyId }).exec();
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const report of reports) {
      byType[report.reportType] = (byType[report.reportType] || 0) + 1;
      byStatus[report.status] = (byStatus[report.status] || 0) + 1;
    }

    return {
      total: reports.length,
      byType,
      byStatus,
      signed: byStatus[ReportStatus.SIGNED] || 0,
      draft: byStatus[ReportStatus.DRAFT] || 0,
    };
  }
}
