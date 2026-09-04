import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SstEpp, SstEppDocument } from '../../phva-advanced/schemas/phva-advanced-epp.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 4.2.6
 * "EPP".
 *
 * Evalúa la gestión de Elementos de Protección Personal:
 * catálogo, asignaciones, condiciones y cumplimiento.
 *
 * Criterios (25/25/25/25):
 * - Existencia de catálogo EPP:              25%
 * - Asignaciones activas:                    25%
 * - Condición de EPP asignado:               25%
 * - Cumplimiento general:                    25%
 */
@Injectable()
export class EppComplianceProvider implements ComplianceProvider {
  private static readonly MODULE = 'epp-compliance';
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(SstEpp.name)
    private readonly eppModel: Model<SstEppDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);
    const eppRecords = await this.eppModel.find({ companyId: companyObjectId }).exec();

    if (eppRecords.length === 0) {
      return {
        module: EppComplianceProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [{
          id: 'epp-no-data',
          module: EppComplianceProvider.MODULE,
          title: 'Sin registros de EPP',
          description: 'No existen registros de EPP. El estándar 4.2.6 requiere una matriz de EPP por cargo o tarea.',
          priority: FindingPriority.HIGH,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        }],
        pending: 0, completed: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const firstRecord = eppRecords[0] as any;
    const catalog = firstRecord?.catalog ?? [];
    const assignments = firstRecord?.assignments ?? [];

    const totalCatalog = catalog.length;
    const totalAssignments = assignments.length;
    const activeAssignments = assignments.filter((a: any) => a.status === 'ACTIVE').length;
    const goodCondition = assignments.filter((a: any) => a.condition === 'GOOD' || a.condition === 'FAIR').length;

    const catalogScore = totalCatalog > 0 ? 1 : 0;
    const assignmentScore = totalAssignments > 0 ? Math.min(activeAssignments / Math.max(totalCatalog, 1), 1) : 0;
    const conditionScore = totalAssignments > 0 ? goodCondition / totalAssignments : 0;
    const complianceScore = firstRecord?.complianceStatus === 'COMPLIES' ? 1 :
      firstRecord?.complianceStatus === 'PENDING' ? 0.5 : 0;

    const percentage = Math.round(
      catalogScore * 25 + assignmentScore * 25 + conditionScore * 25 + complianceScore * 25,
    );

    const findings: ProviderComplianceResult['findings'] = [];

    if (totalCatalog === 0) {
      findings.push({
        id: 'epp-no-catalog',
        module: EppComplianceProvider.MODULE,
        title: 'Sin catálogo de EPP definido',
        description: 'No existe catálogo de EPP registrado. Definir los elementos de protección personal requeridos.',
        priority: FindingPriority.HIGH,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const damagedOrExpired = assignments.filter(
      (a: any) => a.condition === 'DAMAGED' || a.status === 'EXPIRED' || a.status === 'DAMAGED',
    ).length;
    if (damagedOrExpired > 0) {
      findings.push({
        id: 'epp-damaged',
        module: EppComplianceProvider.MODULE,
        title: `${damagedOrExpired} asignación(es) con EPP dañado/vencido`,
        description: `${damagedOrExpired} asignaciones tienen EPP en condición dañada o vencida. Reemplazar o renovar.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    return {
      module: EppComplianceProvider.MODULE,
      percentage,
      status: percentage >= EppComplianceProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      pending: totalAssignments - activeAssignments,
      completed: activeAssignments,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
