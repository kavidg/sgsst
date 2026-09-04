import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InspectionActivity, InspectionActivityDocument } from '../../inspections/schemas/inspection-activity.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 4.2.2
 * "Verificación de aplicación de medidas".
 *
 * Evalúa que las inspecciones de seguridad estén siendo ejecutadas
 * y que los hallazgos tengan seguimiento.
 *
 * Fuente de datos: InspectionActivity
 *
 * Criterios (25/25/25/25):
 * - Existencia de inspecciones:           25%
 * - Inspecciones completadas:             25%
 * - Inspecciones a tiempo:                25%
 * - Responsables asignados:               25%
 *
 * NOTA: Contribuye a phases.check (VERIFICAR).
 */
@Injectable()
export class ControlVerificationProvider implements ComplianceProvider {
  private static readonly MODULE = 'control-verification';
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(InspectionActivity.name)
    private readonly inspectionModel: Model<InspectionActivityDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);
    const inspections = await this.inspectionModel.find({ companyId: companyObjectId }).exec();

    if (inspections.length === 0) {
      return {
        module: ControlVerificationProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [{
          id: 'control-verify-no-data',
          module: ControlVerificationProvider.MODULE,
          title: 'Sin inspecciones de verificación registradas',
          description: 'No existen inspecciones registradas. El estándar 4.2.2 requiere verificación periódica de la aplicación de controles.',
          priority: FindingPriority.HIGH,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        }],
        pending: 0, completed: 0,
        phases: { check: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const total = inspections.length;
    const completed = inspections.filter((i) => i.status === 'completada' || i.status === 'Completada').length;
    const withResponsible = inspections.filter((i) => i.responsible && i.responsible.trim().length > 0).length;

    const now = new Date();
    const onTime = inspections.filter((i) => {
      if (i.status === 'completada' || i.status === 'Completada') return true;
      return new Date(i.plannedDate).getTime() >= now.getTime();
    }).length;

    const completionScore = completed / total;
    const timeScore = onTime / total;
    const responsibleScore = withResponsible / total;

    const percentage = Math.round(
      25 + completionScore * 30 + timeScore * 25 + responsibleScore * 20,
    );

    const findings: ProviderComplianceResult['findings'] = [];

    const overdue = inspections.filter(
      (i) => i.status !== 'completada' && i.status !== 'Completada' && new Date(i.plannedDate).getTime() < now.getTime(),
    ).length;
    if (overdue > 0) {
      findings.push({
        id: 'control-verify-overdue',
        module: ControlVerificationProvider.MODULE,
        title: `${overdue} inspección(es) vencida(s)`,
        description: `${overdue} inspecciones tienen fecha programada vencida y no han sido completadas.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const withoutResponsible = total - withResponsible;
    if (withoutResponsible > 0) {
      findings.push({
        id: 'control-verify-no-responsible',
        module: ControlVerificationProvider.MODULE,
        title: `${withoutResponsible} inspección(es) sin responsable`,
        description: `${withoutResponsible} inspecciones no tienen responsable asignado.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    return {
      module: ControlVerificationProvider.MODULE,
      percentage,
      status: percentage >= ControlVerificationProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      pending: total - completed,
      completed,
      phases: { check: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
