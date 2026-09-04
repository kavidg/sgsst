import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { IndicatorsService } from '../../indicators/indicators.service';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Cumplimiento de indicadores SG-SST (estándar 6.1.1).
 *
 * Mide el desempeño real del SG-SST mediante indicadores configurados:
 * - Indicadores activos con meta alcanzada / indicadores con medición válida.
 * - NO_DATA no se transforma en incumplimiento.
 *
 * Contribuye a phases.check como fuente independiente de EvaluationsProvider.
 */
@Injectable()
export class IndicatorsProvider implements ComplianceProvider {
  constructor(private readonly indicatorsService: IndicatorsService) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const objectId = new Types.ObjectId(companyId);

    // 1. Obtener resumen del dashboard de indicadores
    const summary = await this.indicatorsService.getDashboardSummary(objectId);

    const { totalActive, withMeasurements, targetMet, targetNotMet, noData } = summary;

    // 2. Calcular porcentaje: eligible = indicadores con medición válida
    //    NO se cuenta noData como incumplimiento
    const eligible = withMeasurements;
    const percentage = eligible > 0
      ? Math.round((targetMet / eligible) * 100)
      : 0;

    // 3. Status: si no hay indicadores o no hay datos → NO_DATA
    const status = totalActive === 0 || eligible === 0
      ? 'NO_DATA'
      : classifyComplianceLevel(percentage);

    // 4. Construir findings
    const findings = this.buildFindings(summary);

    return {
      module: 'indicators',
      percentage,
      status,
      findings,
      pending: targetNotMet + noData,
      completed: targetMet,
      phases: {
        check: percentage,
      } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }

  private buildFindings(summary: {
    totalActive: number;
    withMeasurements: number;
    withoutMeasurements: number;
    targetMet: number;
    targetNotMet: number;
    noData: number;
  }): Array<{
    id: string;
    module: string;
    title: string;
    description: string;
    priority: FindingPriority;
    status: string;
    responsible: string;
    dueDate: string;
    createdAt: string;
  }> {
    const findings: Array<{
      id: string;
      module: string;
      title: string;
      description: string;
      priority: FindingPriority;
      status: string;
      responsible: string;
      dueDate: string;
      createdAt: string;
    }> = [];

    // Finding: sin indicadores configurados
    if (summary.totalActive === 0) {
      findings.push({
        id: 'indicators-no-active',
        module: 'indicators',
        title: 'No hay indicadores SG-SST configurados',
        description: 'No existen indicadores activos configurados para medir el desempeño del SG-SST.',
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
      return findings;
    }

    // Finding: indicadores sin medición
    if (summary.withoutMeasurements > 0) {
      findings.push({
        id: 'indicators-no-data',
        module: 'indicators',
        title: `${summary.withoutMeasurements} indicador(es) sin medición`,
        description: `${summary.withoutMeasurements} de ${summary.totalActive} indicadores activos no tienen medición registrada para el período actual.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: indicadores con meta no alcanzada
    if (summary.targetNotMet > 0) {
      findings.push({
        id: 'indicators-target-not-met',
        module: 'indicators',
        title: `${summary.targetNotMet} indicador(es) no alcanzan la meta`,
        description: `${summary.targetNotMet} indicadores tienen mediciones pero no alcanzan la meta establecida.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    return findings;
  }
}
