import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EvaluationFinding,
  FindingSeverity,
  InitialEvaluation,
  InitialEvaluationDocument,
  WorkStatus,
} from '../../initial-evaluation/schemas/initial-evaluation.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Cumplimiento de la evaluación inicial SG-SST.
 *
 * Lee el documento persistido (sin efectos secundarios) y reutiliza el
 * `overallCompliance` ya calculado por InitialEvaluationService.
 */
@Injectable()
export class InitialEvaluationProvider implements ComplianceProvider {
  constructor(
    @InjectModel(InitialEvaluation.name)
    private readonly evaluationModel: Model<InitialEvaluationDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const evaluation = await this.evaluationModel
      .findOne({ companyId: new Types.ObjectId(companyId), archived: false })
      .sort({ createdAt: -1 })
      .exec();

    if (!evaluation) {
      return {
        module: 'initial-evaluation',
        percentage: 0,
        status: 'NO_DATA',
        findings: [],
        pending: 0,
        completed: 0,
      };
    }

    const openFindings = evaluation.findings.filter(
      (finding) => finding.status !== WorkStatus.CLOSED && finding.severity !== FindingSeverity.LOW,
    );
    const pendingActions = evaluation.actionPlan.filter(
      (action) => action.status !== WorkStatus.CLOSED,
    ).length;

    const findings = openFindings.map((finding, index) => ({
      id: `initial-evaluation-${index}`,
      module: 'initial-evaluation',
      title: finding.title,
      description: finding.description,
      priority: this.severityPriority(finding),
      status: finding.status,
      responsible: finding.responsible,
      dueDate: finding.dueDate ? finding.dueDate.toISOString() : '',
      createdAt: finding.createdAt ? finding.createdAt.toISOString() : new Date().toISOString(),
    }));

    return {
      module: 'initial-evaluation',
      percentage: evaluation.overallCompliance,
      status: classifyComplianceLevel(evaluation.overallCompliance),
      findings,
      pending: pendingActions,
      completed: evaluation.actionPlan.length - pendingActions,
    };
  }

  private severityPriority(finding: EvaluationFinding): FindingPriority {
    if (finding.severity === FindingSeverity.CRITICAL) return FindingPriority.CRITICAL;
    if (finding.severity === FindingSeverity.HIGH) return FindingPriority.HIGH;
    return FindingPriority.MEDIUM;
  }
}
