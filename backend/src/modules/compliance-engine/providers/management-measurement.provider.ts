import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IndicatorDefinition, IndicatorDefinitionDocument } from '../../indicators/schemas/indicator-definition.schema';
import { IndicatorMeasurement, IndicatorMeasurementDocument } from '../../indicators/schemas/indicator-measurement.schema';
import { IndicatorMeasurementStatus } from '../../indicators/enums/indicator-measurement-status.enum';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 6.1.1
 * "Medición de la gestión SST".
 *
 * Evalúa la existencia y calidad de los indicadores SST configurados
 * y sus mediciones.
 *
 * Criterios (25/25/25/25):
 * - Existencia de indicadores:     25%
 * - Indicadores activos:           25%
 * - Indicadores con mediciones:    25%
 * - Mediciones con meta alcanzada: 25%
 *
 * NOTA: Contribuye a phases.check (VERIFICAR).
 */
@Injectable()
export class ManagementMeasurementProvider implements ComplianceProvider {
  private static readonly MODULE = 'management-measurement';
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(IndicatorDefinition.name)
    private readonly indicatorDefModel: Model<IndicatorDefinitionDocument>,
    @InjectModel(IndicatorMeasurement.name)
    private readonly indicatorMeasModel: Model<IndicatorMeasurementDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    const [definitions, measurements] = await Promise.all([
      this.indicatorDefModel.find({ companyId: companyObjectId }).exec(),
      this.indicatorMeasModel.find({ companyId: companyObjectId }).exec(),
    ]);

    if (definitions.length === 0) {
      return {
        module: ManagementMeasurementProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [{
          id: 'management-measurement-no-data',
          module: ManagementMeasurementProvider.MODULE,
          title: 'Sin indicadores SST configurados',
          description: 'No existen indicadores de gestión SST definidos. El estándar 6.1.1 requiere medición de la gestión SST.',
          priority: FindingPriority.HIGH,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        }],
        pending: 0, completed: 0,
        phases: { check: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const total = definitions.length;
    const activeDefs = definitions.filter((d) => d.isActive);
    const activeCount = activeDefs.length;

    // Criterion 1: Existence (25%) — satisfied since total > 0
    const existenceScore = 1;

    // Criterion 2: Active indicators (25%)
    const activeScore = activeCount / total;

    // Criterion 3: Indicators with measurements (25%)
    const withMeasurements = activeDefs.filter((d) =>
      measurements.some((m) => m.indicatorId?.toString() === d._id.toString()),
    ).length;
    const measurementScore = activeCount > 0 ? withMeasurements / activeCount : 0;

    // Criterion 4: Measurements meeting target (25%)
    const targetMet = measurements.filter(
      (m) => m.status === IndicatorMeasurementStatus.TARGET_MET,
    ).length;
    const totalMeasurements = measurements.filter((m) => m.status !== 'NO_DATA').length;
    const targetScore = totalMeasurements > 0 ? targetMet / totalMeasurements : 0;

    const percentage = Math.round(
      existenceScore * 25 +
      activeScore * 25 +
      measurementScore * 25 +
      targetScore * 25,
    );

    const findings: ProviderComplianceResult['findings'] = [];

    const inactive = total - activeCount;
    if (inactive > 0) {
      findings.push({
        id: 'management-measurement-inactive',
        module: ManagementMeasurementProvider.MODULE,
        title: `${inactive} indicador(es) inactivo(s)`,
        description: `${inactive} de ${total} indicadores no están activos.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const withoutMeasurements = activeCount - withMeasurements;
    if (withoutMeasurements > 0) {
      findings.push({
        id: 'management-measurement-no-results',
        module: ManagementMeasurementProvider.MODULE,
        title: `${withoutMeasurements} indicador(es) sin mediciones`,
        description: `${withoutMeasurements} indicadores activos no tienen mediciones registradas.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    if (totalMeasurements > 0 && targetMet < totalMeasurements) {
      const notMet = totalMeasurements - targetMet;
      findings.push({
        id: 'management-measurement-outdated',
        module: ManagementMeasurementProvider.MODULE,
        title: `${notMet} medición(es) sin meta alcanzada`,
        description: `${notMet} de ${totalMeasurements} mediciones no alcanzan la meta establecida.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    return {
      module: ManagementMeasurementProvider.MODULE,
      percentage,
      status: percentage >= ManagementMeasurementProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      pending: withoutMeasurements,
      completed: withMeasurements,
      phases: { check: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
