import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EnvironmentalMeasurement,
  EnvironmentalMeasurementDocument,
  MeasurementStatus,
  ComplianceResult,
} from '../../risks/schemas/environmental-measurement.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 4.1.4
 * "Mediciones ambientales".
 *
 * Evalúa la existencia y completitud de registros de mediciones
 * ambientales ocupacionales conforme a la Resolución 0312 de 2019.
 *
 * CRÍTICO: Este provider evalúa EXCLUSIVAMENTE EnvironmentalMeasurement.
 * NO evalúa otros módulos.
 *
 * Fuentes de datos:
 * - EnvironmentalMeasurement.status (solo COMPLETED)
 * - EnvironmentalMeasurement.measurementType
 * - EnvironmentalMeasurement.resultValue / resultUnit
 * - EnvironmentalMeasurement.complianceResult
 * - EnvironmentalMeasurement.area
 * - EnvironmentalMeasurement.responsible
 *
 * Criterios y pesos (PROPUESTOS — NO NORMATIVOS):
 * - Existencia de mediciones completadas: 25%
 * - Cobertura de tipos de agente:         25%
 * - Resultados documentados:              25%
 * - Comparación con límites normativos:   25%
 *
 * NO_DATA: sin registros COMPLETED.
 * TARGET_MET: mediciones completas con resultados y comparación normativa.
 * TARGET_NOT_MET: sin mediciones, resultados faltantes o sin comparación.
 */
@Injectable()
export class EnvironmentalMeasurementProvider implements ComplianceProvider {
  private static readonly MODULE = 'environmental-measurement';
  private static readonly COMPLIANCE_TARGET = 90;

  /** Agentes comunes que una empresa SST debería evaluar */
  private static readonly EXPECTED_TYPES = [
    'NOISE',
    'ILLUMINATION',
    'TEMPERATURE',
    'AIR_QUALITY',
  ];

  constructor(
    @InjectModel(EnvironmentalMeasurement.name)
    private readonly measurementModel: Model<EnvironmentalMeasurementDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    const allMeasurements = await this.measurementModel
      .find({ companyId: companyObjectId })
      .sort({ measurementDate: -1 })
      .exec();

    // Filter to COMPLETED only for compliance evaluation
    const completedMeasurements = allMeasurements.filter(
      (m) => m.status === MeasurementStatus.COMPLETED,
    );

    // ── NO_DATA ──
    if (completedMeasurements.length === 0) {
      return {
        module: EnvironmentalMeasurementProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'env-measurement-no-data',
            module: EnvironmentalMeasurementProvider.MODULE,
            title: 'Sin mediciones ambientales registradas',
            description:
              'No existen mediciones ambientales ocupacionales completadas. El estándar 4.1.4 requiere mediciones de agentes físicos, químicos y otros factores de riesgo ambiental.',
            priority: FindingPriority.HIGH,
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
        pending: 0,
        completed: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const totalCompleted = completedMeasurements.length;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 1 — Existencia de mediciones completadas (25%)
    //
    // Si existen registros COMPLETED → 1.0
    // ══════════════════════════════════════════════════════════
    const existenceScore = 1;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 2 — Cobertura de tipos de agente (25%)
    //
    // Evalúa cuántos de los 4 tipos esperados tienen al menos
    // una medición completada.
    // ══════════════════════════════════════════════════════════
    const coveredTypes = new Set<string>();
    for (const m of completedMeasurements) {
      coveredTypes.add(m.measurementType);
    }
    let coveredExpected = 0;
    for (const expectedType of EnvironmentalMeasurementProvider.EXPECTED_TYPES) {
      if (coveredTypes.has(expectedType)) {
        coveredExpected++;
      }
    }
    const typeCoverageScore = coveredExpected / EnvironmentalMeasurementProvider.EXPECTED_TYPES.length;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 3 — Resultados documentados (25%)
    //
    // Un registro cuenta como "con resultado" cuando tiene
    // resultValue definido Y resultUnit no vacío.
    // ══════════════════════════════════════════════════════════
    const withResult = completedMeasurements.filter(
      (m) => typeof m.resultValue === 'number' && m.resultUnit && m.resultUnit.trim().length > 0,
    ).length;
    const resultScore = withResult / totalCompleted;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 4 — Comparación con límites normativos (25%)
    //
    // Un registro cuenta como "con comparación" cuando tiene
    // complianceResult definido (WITHIN_LIMITS, EXCEEDS_LIMITS, o INCONCLUSIVE).
    // ══════════════════════════════════════════════════════════
    const withComparison = completedMeasurements.filter(
      (m) => m.complianceResult !== undefined && m.complianceResult !== null,
    ).length;
    const comparisonScore = withComparison / totalCompleted;

    // ══════════════════════════════════════════════════════════
    // CÁLCULO FINAL (25/25/25/25)
    //
    // PROPUESTO — NO NORMATIVO.
    // ══════════════════════════════════════════════════════════
    const percentage = Math.round(
      existenceScore * 25 +
      typeCoverageScore * 25 +
      resultScore * 25 +
      comparisonScore * 25,
    );

    // ── Status ──
    const status =
      percentage >= EnvironmentalMeasurementProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET';

    // ── Findings ──
    const findings: ProviderComplianceResult['findings'] = [];

    // Finding: missing expected types
    const missingTypes = EnvironmentalMeasurementProvider.EXPECTED_TYPES.filter(
      (t) => !coveredTypes.has(t),
    );
    if (missingTypes.length > 0) {
      const typeLabels: Record<string, string> = {
        NOISE: 'ruido',
        ILLUMINATION: 'iluminación',
        TEMPERATURE: 'temperatura',
        AIR_QUALITY: 'calidad del aire',
      };
      const missingNames = missingTypes.map((t) => typeLabels[t] ?? t);
      findings.push({
        id: 'env-measurement-missing-types',
        module: EnvironmentalMeasurementProvider.MODULE,
        title: `Faltan ${missingTypes.length} tipos de medición ambiental`,
        description:
          `No existen mediciones de: ${missingNames.join(', ')}. ` +
          'El estándar 4.1.4 requiere evaluar los principales agentes ambientales presentes en los puestos de trabajo.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: measurements without results
    const withoutResult = totalCompleted - withResult;
    if (withoutResult > 0) {
      findings.push({
        id: 'env-measurement-no-results',
        module: EnvironmentalMeasurementProvider.MODULE,
        title: `${withoutResult} medición(es) sin resultado registrado`,
        description:
          `${withoutResult} de ${totalCompleted} mediciones completadas no tienen valor numérico y unidad de resultado. ` +
          'Registrar el resultado cuantitativo de cada medición para demostrar cumplimiento.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: measurements without compliance comparison
    const withoutComparison = totalCompleted - withComparison;
    if (withoutComparison > 0) {
      findings.push({
        id: 'env-measurement-no-comparison',
        module: EnvironmentalMeasurementProvider.MODULE,
        title: `${withoutComparison} medición(es) sin comparación normativa`,
        description:
          `${withoutComparison} de ${totalCompleted} mediciones completadas no tienen resultado de comparación contra el límite normativo. ` +
          'Comparar cada resultado con el límite aplicable para determinar conformidad.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: measurements exceeding limits
    const exceedingLimits = completedMeasurements.filter(
      (m) => m.complianceResult === ComplianceResult.EXCEEDS_LIMITS,
    ).length;
    if (exceedingLimits > 0) {
      findings.push({
        id: 'env-measurement-exceeds-limits',
        module: EnvironmentalMeasurementProvider.MODULE,
        title: `${exceedingLimits} medición(es) exceden el límite normativo`,
        description:
          `${exceedingLimits} de ${totalCompleted} mediciones muestran valores que exceden el límite normativo aplicable. ` +
          'Evaluar e implementar medidas de control para reducir la exposición.',
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    return {
      module: EnvironmentalMeasurementProvider.MODULE,
      percentage,
      status,
      findings,
      pending: totalCompleted - withComparison,
      completed: totalCompleted,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
