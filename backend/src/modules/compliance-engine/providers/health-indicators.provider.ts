import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { IndicatorsService } from '../../indicators/indicators.service';
import { IndicatorSubcategory } from '../../indicators/enums/indicator-subcategory.enum';
import { IndicatorMeasurementStatus } from '../../indicators/enums/indicator-measurement-status.enum';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 3.3.2
 * "Medición y análisis de indicadores de salud".
 *
 * Evalúa si la empresa configura y mide indicadores de SALUD
 * (subcategory === HEALTH) con periodicidad adecuada y metas alcanzadas.
 *
 * Diferencia con IndicatorsProvider (6.1.1):
 * - 6.1.1 mide el desempeño GENERAL del SG-SST (TODOS los indicadores) → check
 * - 3.3.2 mide específicamente los indicadores de SALUD → do
 *
 * Criterios (25/25/25/25):
 * - C1: Existencia de indicadores de salud:        25%
 * - C2: Mediciones registradas:                    25%
 * - C3: Periodicidad / mediciones recientes:       25%
 * - C4: Metas alcanzadas respecto a mediciones:   25%
 *
 * CONTRIBUYE A: phases.do (HACER)
 */
@Injectable()
export class HealthIndicatorsProvider implements ComplianceProvider {
  private static readonly MODULE = 'health-indicators';
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(private readonly indicatorsService: IndicatorsService) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const objectId = new Types.ObjectId(companyId);

    // 1. Get all active indicators and filter HEALTH subcategory
    const allDefs = await this.indicatorsService.findAllDefinitions(objectId);
    const healthDefs = allDefs.filter(
      (d) => d.subcategory === IndicatorSubcategory.HEALTH,
    );

    if (healthDefs.length === 0) {
      return {
        module: HealthIndicatorsProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [{
          id: 'health-indicators-no-data',
          module: HealthIndicatorsProvider.MODULE,
          title: 'Sin indicadores de salud configurados',
          description:
            'No existen indicadores de salud (subcategory HEALTH) configurados. ' +
            'El estándar 3.3.2 requiere que la empresa defina y mida indicadores de salud ocupacional.',
          priority: FindingPriority.HIGH,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        }],
        pending: 0,
        completed: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const totalHealth = healthDefs.length;

    // 2. Get measurements for all health indicators
    const allMeasurements: Array<{
      indicatorId: string;
      status: IndicatorMeasurementStatus;
      period: string;
      measuredAt: Date;
      calculatedValue: number;
    }> = [];

    for (const def of healthDefs) {
      try {
        const measurements = await this.indicatorsService.findMeasurements(
          objectId,
          (def as any)._id.toString(),
        );
        for (const m of measurements) {
          allMeasurements.push({
            indicatorId: (def as any)._id.toString(),
            status: m.status,
            period: m.period,
            measuredAt: m.measuredAt,
            calculatedValue: m.calculatedValue,
          });
        }
      } catch {
        // Indicator without measurements — skip
      }
    }

    // 3. Evaluate criteria

    // C1 — Existence (25%): all health indicators exist = full score
    const existenceScore = 100;

    // C2 — Measurements registered (25%): proportion of indicators with at least one measurement
    const indicatorsWithMeasurements = new Set(
      allMeasurements.map((m) => m.indicatorId),
    ).size;
    const measurementsScore = totalHealth > 0
      ? Math.round((indicatorsWithMeasurements / totalHealth) * 100)
      : 0;

    // C3 — Periodicity / recent measurements (25%):
    // Check that measurements exist within last 3 months
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const recentMeasurements = allMeasurements.filter(
      (m) => m.measuredAt >= threeMonthsAgo,
    );
    const recentIndicators = new Set(
      recentMeasurements.map((m) => m.indicatorId),
    ).size;
    const periodicityScore = totalHealth > 0
      ? Math.round((recentIndicators / totalHealth) * 100)
      : 0;

    // C4 — Target achievement (25%): among indicators with measurements, what proportion met target
    const totalMeasured = allMeasurements.length;
    const targetMet = allMeasurements.filter(
      (m) => m.status === IndicatorMeasurementStatus.TARGET_MET,
    ).length;
    const targetScore = totalMeasured > 0
      ? Math.round((targetMet / totalMeasured) * 100)
      : 0;

    const percentage = Math.round(
      existenceScore * 0.25 +
      measurementsScore * 0.25 +
      periodicityScore * 0.25 +
      targetScore * 0.25,
    );

    // 4. Build findings
    const findings: ProviderComplianceResult['findings'] = [];

    const noMeasurementIndicators = totalHealth - indicatorsWithMeasurements;
    if (noMeasurementIndicators > 0) {
      findings.push({
        id: 'health-indicators-no-measurements',
        module: HealthIndicatorsProvider.MODULE,
        title: `${noMeasurementIndicators} indicador(es) de salud sin mediciones`,
        description:
          `${noMeasurementIndicators} de ${totalHealth} indicadores de salud no tienen mediciones registradas.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const staleIndicators = totalHealth - recentIndicators;
    if (staleIndicators > 0) {
      findings.push({
        id: 'health-indicators-outdated',
        module: HealthIndicatorsProvider.MODULE,
        title: `${staleIndicators} indicador(es) de salud sin mediciones recientes`,
        description:
          `${staleIndicators} indicadores de salud no tienen mediciones en los últimos 3 meses.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const notMet = totalMeasured - targetMet;
    if (notMet > 0 && totalMeasured > 0) {
      findings.push({
        id: 'health-indicators-below-target',
        module: HealthIndicatorsProvider.MODULE,
        title: `${notMet} medición(es) de salud fuera de meta`,
        description:
          `${notMet} de ${totalMeasured} mediciones de indicadores de salud no alcanzan la meta establecida.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    return {
      module: HealthIndicatorsProvider.MODULE,
      percentage,
      status: percentage >= HealthIndicatorsProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET',
      findings,
      pending: notMet,
      completed: targetMet,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
