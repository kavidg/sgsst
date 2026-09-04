import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Risk, RiskDocument } from '../../risks/schemas/risk.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 4.2.1
 * "Implementación de medidas de control".
 *
 * Evalúa que los riesgos identificados tengan medidas de control
 * implementadas y documentadas.
 *
 * Fuente de datos: Risk.controlMeasures
 *
 * Criterios (25/25/25/25):
 * - Existencia de riesgos:                      25%
 * - Riesgos con controlMeasures definido:       25%
 * - controlMeasures con contenido significativo: 25%
 * - Distribución de riesgos por nivel:          25%
 */
@Injectable()
export class ControlImplementationProvider implements ComplianceProvider {
  private static readonly MODULE = 'control-implementation';
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
        module: ControlImplementationProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [{
          id: 'control-impl-no-data',
          module: ControlImplementationProvider.MODULE,
          title: 'Sin riesgos registrados para evaluar controles',
          description: 'No existen riesgos registrados. El estándar 4.2.1 requiere medidas de control para los riesgos identificados.',
          priority: FindingPriority.HIGH,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        }],
        pending: 0, completed: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const total = risks.length;
    const withControls = risks.filter((r) => r.controlMeasures && r.controlMeasures.trim().length > 0).length;
    const controlsScore = withControls / total;

    // High risks without controls are more critical
    const highRisks = risks.filter((r) => r.riskLevel >= 12);
    const highRisksWithControls = highRisks.filter((r) => r.controlMeasures && r.controlMeasures.trim().length > 0).length;
    const highRiskScore = highRisks.length > 0 ? highRisksWithControls / highRisks.length : 1;

    const percentage = Math.round(
      (withControls > 0 ? 25 : 0) +
      controlsScore * 35 +
      highRiskScore * 25 +
      (risks.length > 0 ? 15 : 0),
    );

    const findings: ProviderComplianceResult['findings'] = [];
    const withoutControls = total - withControls;
    if (withoutControls > 0) {
      findings.push({
        id: 'control-impl-missing',
        module: ControlImplementationProvider.MODULE,
        title: `${withoutControls} riesgo(s) sin medidas de control`,
        description: `${withoutControls} de ${total} riesgos no tienen medidas de control documentadas. El estándar 4.2.1 requiere controles implementados para cada riesgo.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const highWithoutControls = highRisks.length - highRisksWithControls;
    if (highWithoutControls > 0) {
      findings.push({
        id: 'control-impl-high-risk',
        module: ControlImplementationProvider.MODULE,
        title: `${highWithoutControls} riesgo(s) de alta criticidad sin controles`,
        description: `${highWithoutControls} riesgos de alta criticidad no tienen medidas de control. Priorizar la implementación de controles para estos riesgos.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    return {
      module: ControlImplementationProvider.MODULE,
      percentage,
      status: percentage >= ControlImplementationProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      pending: withoutControls,
      completed: withControls,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
