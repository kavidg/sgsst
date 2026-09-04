import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Risk, RiskDocument } from '../../risks/schemas/risk.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 4.2.3
 * "Procedimientos e instructivos".
 *
 * Evalúa que existan procedimientos e instructivos de trabajo seguro
 * para las tareas críticas identificadas en la matriz de riesgos.
 *
 * Utiliza Risk como proxy: riesgos con controlMeasures definidas
 * indican que existen procedimientos/instructivos asociados.
 *
 * Criterios (25/25/25/25):
 * - Existencia de riesgos:                    25%
 * - Riesgos con controles documentados:       25%
 * - Calidad de la documentación (longitud):   25%
 * - Distribución por process/area:            25%
 */
@Injectable()
export class ProceduresProvider implements ComplianceProvider {
  private static readonly MODULE = 'procedures';
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(Risk.name)
    private readonly riskModel: Model<RiskDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);
    const risks = await this.riskModel.find({ companyId: companyObjectId }).exec();

    if (risks.length === 0) {
      return {
        module: ProceduresProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [{
          id: 'procedures-no-data',
          module: ProceduresProvider.MODULE,
          title: 'Sin riesgos para evaluar procedimientos',
          description: 'No existen riesgos registrados. El estándar 4.2.3 requiere procedimientos e instructivos para tareas críticas.',
          priority: FindingPriority.HIGH,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        }],
        pending: 0, completed: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const total = risks.length;
    const withControls = risks.filter((r) => r.controlMeasures && r.controlMeasures.trim().length > 0);
    const withSignificantDocs = withControls.filter((r) => (r.controlMeasures?.length ?? 0) >= 20);

    const docScore = withControls.length / total;
    const qualityScore = withSignificantDocs.length / Math.max(withControls.length, 1);

    // Coverage by area
    const areas = new Set(risks.map((r) => r.process));
    const areasWithDocs = new Set(withControls.map((r) => r.process));
    const areaScore = areas.size > 0 ? areasWithDocs.size / areas.size : 0;

    const percentage = Math.round(
      25 + docScore * 30 + qualityScore * 25 + areaScore * 20,
    );

    const findings: ProviderComplianceResult['findings'] = [];
    const withoutDocs = total - withControls.length;
    if (withoutDocs > 0) {
      findings.push({
        id: 'procedures-missing',
        module: ProceduresProvider.MODULE,
        title: `${withoutDocs} riesgo(s) sin procedimientos documentados`,
        description: `${withoutDocs} de ${total} riesgos no tienen procedimientos o instructivos asociados.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    return {
      module: ProceduresProvider.MODULE,
      percentage,
      status: percentage >= ProceduresProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      pending: withoutDocs,
      completed: withControls.length,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
