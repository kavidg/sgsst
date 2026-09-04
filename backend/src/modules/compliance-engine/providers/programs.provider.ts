import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ProgramsService } from '../../programs/services/programs.service';
import { FindingPriority } from '../enums/finding-priority.enum';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';

/**
 * ComplianceEngine provider para Programas SG-SST.
 *
 * Consume ProgramsService.getComplianceSummary() para calcular
 * el porcentaje de cumplimiento basado en actividades completadas
 * de todos los programas activos de la empresa.
 *
 * phvaPhase = "do" (fase operativa del PHVA).
 */
@Injectable()
export class ProgramsProvider implements ComplianceProvider {
  constructor(private readonly programsService: ProgramsService) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    try {
      const summary = await this.programsService.getComplianceSummary(
        new Types.ObjectId(companyId),
      );

      const findings =
        summary.overdueActivities > 0
          ? [
              {
                id: 'programs-overdue',
                module: 'programs',
                title: `${summary.overdueActivities} actividades vencidas en programas SG-SST`,
                description:
                  'Existen actividades de programas SG-SST vencidas sin completar.',
                priority: FindingPriority.HIGH,
                status: 'OPEN',
                responsible: '',
                dueDate: '',
                createdAt: new Date().toISOString(),
              },
            ]
          : [];

      return {
        module: 'programs',
        percentage: summary.overallPercentage,
        status: classifyComplianceLevel(summary.overallPercentage),
        findings,
        pending: summary.totalActivities - summary.completedActivities,
        completed: summary.completedActivities,
        overdue: summary.overdueActivities,
        phases: {
          do: summary.overallPercentage,
        } as Partial<Record<CompliancePhaseKey, number>>,
      };
    } catch {
      return {
        module: 'programs',
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
