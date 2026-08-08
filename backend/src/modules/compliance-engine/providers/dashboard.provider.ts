import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { DashboardService } from '../../dashboard/dashboard.service';
import { FindingPriority } from '../enums/finding-priority.enum';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Cumplimiento agregado del dashboard. Reutiliza el cálculo existente
 * DashboardService.getCompanyStats (cumplimiento por respuestas de evaluación).
 */
@Injectable()
export class DashboardProvider implements ComplianceProvider {
  constructor(private readonly dashboardService: DashboardService) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const stats = await this.dashboardService.getCompanyStats(new Types.ObjectId(companyId));

    const findings =
      stats.highRisks > 0
        ? [
            {
              id: 'dashboard-high-risks',
              module: 'dashboard',
              title: `${stats.highRisks} riesgos con nivel alto`,
              description: 'Existen riesgos con nivel de riesgo alto según el panel de control.',
              priority: FindingPriority.HIGH,
              status: 'OPEN',
              responsible: '',
              dueDate: '',
              createdAt: new Date().toISOString(),
            },
          ]
        : [];

    return {
      module: 'dashboard',
      percentage: stats.compliance,
      status: classifyComplianceLevel(stats.compliance),
      findings,
      pending: stats.highRisks,
      completed: stats.employees,
    };
  }
}
