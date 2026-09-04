import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InspectionActivity, InspectionActivityDocument } from '../../inspections/schemas/inspection-activity.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 4.2.5
 * "Mantenimiento".
 *
 * Evalúa el programa de mantenimiento preventivo y correctivo
 * utilizando inspecciones como proxy de actividades de mantenimiento.
 *
 * Criterios (25/25/25/25):
 * - Existencia de actividades:        25%
 * - Actividades completadas:          25%
 * - Actividades a tiempo:             25%
 * - Responsables asignados:           25%
 */
@Injectable()
export class MaintenanceProvider implements ComplianceProvider {
  private static readonly MODULE = 'maintenance';
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(InspectionActivity.name)
    private readonly inspectionModel: Model<InspectionActivityDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);
    const activities = await this.inspectionModel.find({ companyId: companyObjectId }).exec();

    if (activities.length === 0) {
      return {
        module: MaintenanceProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [{
          id: 'maintenance-no-data',
          module: MaintenanceProvider.MODULE,
          title: 'Sin actividades de mantenimiento registradas',
          description: 'No existen actividades de mantenimiento registradas. El estándar 4.2.5 requiere un programa de mantenimiento documentado.',
          priority: FindingPriority.HIGH,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        }],
        pending: 0, completed: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const total = activities.length;
    const completed = activities.filter((a) => a.status === 'completada' || a.status === 'Completada').length;
    const withResponsible = activities.filter((a) => a.responsible && a.responsible.trim().length > 0).length;

    const now = new Date();
    const onTime = activities.filter((a) => {
      if (a.status === 'completada' || a.status === 'Completada') return true;
      return new Date(a.plannedDate).getTime() >= now.getTime();
    }).length;

    const completionScore = completed / total;
    const timeScore = onTime / total;
    const responsibleScore = withResponsible / total;

    const percentage = Math.round(
      25 + completionScore * 30 + timeScore * 25 + responsibleScore * 20,
    );

    const findings: ProviderComplianceResult['findings'] = [];

    const overdue = activities.filter(
      (a) => a.status !== 'completada' && a.status !== 'Completada' && new Date(a.plannedDate).getTime() < now.getTime(),
    ).length;
    if (overdue > 0) {
      findings.push({
        id: 'maintenance-overdue',
        module: MaintenanceProvider.MODULE,
        title: `${overdue} actividad(es) de mantenimiento vencida(s)`,
        description: `${overdue} actividades de mantenimiento tienen fecha vencida sin completar.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    return {
      module: MaintenanceProvider.MODULE,
      percentage,
      status: percentage >= MaintenanceProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      pending: total - completed,
      completed,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
