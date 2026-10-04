import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { IndicatorsService } from '../../indicators/indicators.service';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import {
  computeIndicatorsScore,
  INDICATORS_COMPLIANCE_TARGET,
  INDICATORS_FORMULA,
  INDICATORS_MODULE,
  INDICATORS_SCORE_WEIGHTS,
  INDICATORS_STANDARD_CODE,
  type IndicatorDefinitionLike,
  type IndicatorMeasurementLike,
  type IndicatorPeriodLike,
  type IndicatorsScoreBreakdown,
} from './indicators-scoring';

/**
 * Provider OFICIAL del estándar 6.1.1 — Indicadores SG-SST (VERIFICAR).
 *
 * ÚNICO contribuyente oficial al score de 6.1.1 (desde esta etapa,
 * management-measurement NO contribuye al scoring — ver
 * SCORING_INELIGIBLE_MODULES en utils/compliance-weights.ts).
 *
 * Provider DELGADO (patrón 5.1.1/5.1.2/4.2.5/4.2.6):
 *  - Una sola coordinación de consultas tenant-scoped, en Promise.all, vía
 *    IndicatorsService.getComplianceSnapshot (mismo dominio; sin N+1: las
 *    queries están scoped por companyId y usan $in, sin queries en loops).
 *  - Todo el cálculo vive en indicators-scoring.ts (función PURA, sin Mongo).
 *  - Devuelve metadata serializable `dimensions:v1` (semantic EXACT,
 *    standardCode 6.1.1) con dimensiones + counters para presentación/AI.
 *
 * NO_DATA (política del dominio):
 *  - Caso A: sin indicadores activos → status NO_DATA, percentage 0.
 *  - Caso B: indicadores activos pero ninguno con medición válida → NO_DATA
 *    (NO_DATA no se transforma en incumplimiento; decisión documentada en
 *    tests). Los indicadores sin medición del período SÍ son hallazgo.
 */
@Injectable()
export class IndicatorsProvider implements ComplianceProvider {
  private static readonly MODULE = INDICATORS_MODULE;
  private static readonly COMPLIANCE_TARGET = INDICATORS_COMPLIANCE_TARGET;

  constructor(private readonly indicatorsService: IndicatorsService) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const objectId = new Types.ObjectId(companyId);

    // 1. Snapshot tenant-scoped (UNA coordinación; sin N+1).
    const snapshot = await this.indicatorsService.getComplianceSnapshot(objectId);
    const definitions = snapshot.definitions as unknown as IndicatorDefinitionLike[];
    const measurements = snapshot.measurements as unknown as IndicatorMeasurementLike[];
    const periods = snapshot.periods as unknown as IndicatorPeriodLike[];

    // 2. Scoring puro (sin Mongo; el módulo ya evaluó las metas).
    const breakdown = computeIndicatorsScore({ definitions, measurements, periods });

    const findings: ProviderComplianceResult['findings'] = breakdown.findings.map((f) => ({
      id: f.id,
      module: IndicatorsProvider.MODULE,
      title: f.title,
      description: f.description,
      priority:
        f.priority === 'HIGH'
          ? FindingPriority.HIGH
          : f.priority === 'MEDIUM'
            ? FindingPriority.MEDIUM
            : FindingPriority.LOW,
      status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
    }));

    const percentage = breakdown.percentage;

    if (breakdown.noData) {
      return {
        module: IndicatorsProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings,
        pending: 0,
        completed: 0,
        phases: { check: 0 } as Partial<Record<CompliancePhaseKey, number>>,
        metadata: this.metadata(breakdown, { noDataReason: breakdown.noDataReason }),
      };
    }

    return {
      module: IndicatorsProvider.MODULE,
      percentage,
      status: percentage >= IndicatorsProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      // Semántica de brechas (patrón 5.1.2):
      // pending = indicadores sin medición válida + fuera de meta;
      // completed = indicadores con medición válida en meta.
      pending: breakdown.counters.indicatorsWithoutMeasurement + breakdown.counters.targetNotMet,
      completed: breakdown.counters.targetMet,
      overdue:
        breakdown.counters.closedPeriods === 0
          ? breakdown.counters.indicatorsWithoutMeasurement
          : 0,
      phases: { check: percentage } as Partial<Record<CompliancePhaseKey, number>>,
      metadata: this.metadata(breakdown, {}),
    };
  }

  /** Metadata serializable (sin documentos Mongo completos ni funciones). */
  private metadata(
    breakdown: IndicatorsScoreBreakdown,
    extra: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      semantic: 'EXACT',
      standardCode: INDICATORS_STANDARD_CODE,
      phase: 'check',
      formula: INDICATORS_FORMULA,
      evaluatedPeriod: breakdown.evaluatedPeriod,
      weights: { ...INDICATORS_SCORE_WEIGHTS },
      dimensions: {
        existence: { ...breakdown.dimensions.existence },
        definitionQuality: { ...breakdown.dimensions.definitionQuality },
        measurement: { ...breakdown.dimensions.measurement },
        targetCompliance: { ...breakdown.dimensions.targetCompliance },
        analysisEvidence: { ...breakdown.dimensions.analysisEvidence },
        history: { ...breakdown.dimensions.history },
      },
      counters: { ...breakdown.counters },
      ...extra,
    };
  }
}
