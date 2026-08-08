import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { AnnualWorkPlanService } from '../../annual-work-plan/services/annual-work-plan.service';
import { FindingPriority } from '../enums/finding-priority.enum';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Cumplimiento del plan anual de trabajo vigente.
 * Reutiliza PlanComplianceService a través de AnnualWorkPlanService.
 */
@Injectable()
export class AnnualWorkPlanProvider implements ComplianceProvider {
  constructor(private readonly annualWorkPlanService: AnnualWorkPlanService) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    try {
      const plan = await this.annualWorkPlanService.findCurrent(new Types.ObjectId(companyId));
      const report = await this.annualWorkPlanService.getComplianceReport(plan._id);

      const findings =
        report.overdueTasks > 0
          ? [
              {
                id: 'awp-overdue',
                module: 'annual-work-plan',
                title: `${report.overdueTasks} tareas vencidas en el plan anual`,
                description: 'Existen tareas del plan anual de trabajo vencidas sin completar.',
                priority: FindingPriority.HIGH,
                status: 'OPEN',
                responsible: '',
                dueDate: '',
                createdAt: new Date().toISOString(),
              },
            ]
          : [];

      return {
        module: 'annual-work-plan',
        percentage: report.overallPercentage,
        status: classifyComplianceLevel(report.overallPercentage),
        findings,
        pending: report.totalTasks - report.completedTasks,
        completed: report.completedTasks,
        overdue: report.overdueTasks,
      };
    } catch {
      return {
        module: 'annual-work-plan',
        percentage: 0,
        status: 'NO_DATA',
        findings: [],
        pending: 0,
        completed: 0,
        overdue: 0,
      };
    }
  }
}
