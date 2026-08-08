import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { InspectionsService } from '../../inspections/inspections.service';
import { InspectionActivity } from '../../inspections/schemas/inspection-activity.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

const COMPLETED_STATUSES = ['ejecutada', 'completada', 'finalizada', 'closed'];

/**
 * Cumplimiento de inspecciones: proporción de actividades ejecutadas y
 * detección de inspecciones vencidas pendientes.
 */
@Injectable()
export class InspectionsProvider implements ComplianceProvider {
  constructor(private readonly inspectionsService: InspectionsService) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const activities = await this.inspectionsService.findAll(new Types.ObjectId(companyId));
    const completed = activities.filter((activity) => this.isCompleted(activity)).length;
    const pending = activities.filter((activity) => !this.isCompleted(activity));
    const percentage = activities.length > 0 ? Math.round((completed / activities.length) * 100) : 0;

    const now = new Date();
    const overdue = pending.filter((activity) => new Date(activity.plannedDate) < now);

    const findings = overdue.map((activity, index) => ({
      id: `inspection-${index}`,
      module: 'inspections',
      title: `Inspección vencida: ${activity.title}`,
      description: `Fecha planificada: ${new Date(activity.plannedDate).toISOString()}. La inspección sigue pendiente.`,
      priority: FindingPriority.HIGH,
      status: 'OPEN',
      responsible: activity.responsible ?? '',
      dueDate: new Date(activity.plannedDate).toISOString(),
      createdAt: new Date().toISOString(),
    }));

    return {
      module: 'inspections',
      percentage,
      status: classifyComplianceLevel(percentage),
      findings,
      pending: pending.length,
      completed,
      overdue: overdue.length,
    };
  }

  private isCompleted(activity: InspectionActivity): boolean {
    if (activity.completedDate) return true;
    const status = String(activity.status ?? '').toLowerCase();
    return COMPLETED_STATUSES.includes(status);
  }
}
