import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Incident,
  IncidentDocument,
  InvestigationType,
} from '../../incidents/schemas/incident.schema';
import { Employee, EmployeeDocument } from '../../employees/schemas/employee.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 3.3.1
 * "Medición de la frecuencia de la accidentalidad".
 *
 * Calcula la frecuencia de accidentalidad:
 *   Frecuencia = (Número de accidentes × 200,000) / Horas trabajadas
 *
 * donde 200,000 = 100 trabajadores × 2,000 horas/año
 *
 * Criterios y pesos (30/30/20/20):
 * - C1: Cálculo de frecuencia realizado:            30%
 * - C2: Datos de accidentes disponibles:             30%
 * - C3: Datos de horas trabajadas disponibles:       20%
 * - C4: Tendencia documentada:                       20%
 *
 * NO_DATA: sin datos suficientes.
 * TARGET_MET: percentage >= 90.
 * TARGET_NOT_MET: percentage < 90.
 */
@Injectable()
export class AccidentFrequencyProvider implements ComplianceProvider {
  private static readonly MODULE = 'accident-frequency';
  private static readonly COMPLIANCE_TARGET = 90;
  private static readonly BASE_HOURS = 200000; // 100 workers × 2,000 hours/year

  constructor(
    @InjectModel(Incident.name)
    private readonly incidentModel: Model<IncidentDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const objectId = new Types.ObjectId(companyId);

    // Get accident count (current year)
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31);

    const accidents = await this.incidentModel
      .find({
        companyId: objectId,
        investigationType: InvestigationType.ACCIDENT,
        incidentDate: { $gte: startOfYear, $lte: endOfYear },
      })
      .lean()
      .exec();

    const accidentCount = accidents.length;

    // Get employee count for hours estimation
    const employeeCount = await this.employeeModel
      .countDocuments({ companyId: objectId })
      .exec();

    if (accidentCount === 0 && employeeCount === 0) {
      return {
        module: AccidentFrequencyProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'accident-frequency-no-data',
            module: AccidentFrequencyProvider.MODULE,
            title: 'Sin datos para calcular frecuencia',
            description:
              'No existen accidentes registrados ni empleados para calcular la frecuencia de accidentalidad.',
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

    // Estimate hours worked (employees × 2,000 hours/year)
    const estimatedHours = employeeCount * 2000;

    // Calculate frequency rate
    const frequencyRate =
      estimatedHours > 0
        ? (accidentCount * AccidentFrequencyProvider.BASE_HOURS) / estimatedHours
        : 0;

    // C1 — Calculation performed (30%): frequency can be calculated
    const calculationScore = estimatedHours > 0 ? 100 : 0;

    // C2 — Accident data available (30%)
    const dataScore = accidentCount > 0 ? 100 : employeeCount > 0 ? 50 : 0;

    // C3 — Hours data available (20%)
    const hoursScore = employeeCount > 0 ? 100 : 0;

    // C4 — Trend documented (20%): check if previous year data exists
    const prevYearStart = new Date(currentYear - 1, 0, 1);
    const prevYearEnd = new Date(currentYear - 1, 11, 31);
    const prevYearAccidents = await this.incidentModel
      .countDocuments({
        companyId: objectId,
        investigationType: InvestigationType.ACCIDENT,
        incidentDate: { $gte: prevYearStart, $lte: prevYearEnd },
      })
      .exec();
    const trendScore = prevYearAccidents > 0 || accidentCount > 0 ? 100 : 0;

    const percentage = Math.round(
      calculationScore * 0.3 +
      dataScore * 0.3 +
      hoursScore * 0.2 +
      trendScore * 0.2,
    );

    // Build findings
    const findings: ProviderComplianceResult['findings'] = [];

    if (frequencyRate > 0) {
      findings.push({
        id: 'accident-frequency-rate',
        module: AccidentFrequencyProvider.MODULE,
        title: `Frecuencia de accidentalidad: ${frequencyRate.toFixed(2)}`,
        description:
          `Tasa de frecuencia calculada: ${frequencyRate.toFixed(2)} accidentes por 200,000 horas-trabajadas. ` +
          `Basado en ${accidentCount} accidentes y ~${estimatedHours.toLocaleString()} horas estimadas.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    if (prevYearAccidents > 0) {
      const change = accidentCount - prevYearAccidents;
      const changePercent = ((change / prevYearAccidents) * 100).toFixed(1);
      findings.push({
        id: 'accident-frequency-trend',
        module: AccidentFrequencyProvider.MODULE,
        title: `Tendencia: ${change >= 0 ? 'incremento' : 'disminución'} del ${Math.abs(parseFloat(changePercent))}%`,
        description:
          `Comparación con año anterior: ${prevYearAccidents} → ${accidentCount} accidentes (${change >= 0 ? '+' : ''}${changePercent}%).`,
        priority: change > 0 ? FindingPriority.HIGH : FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    return {
      module: AccidentFrequencyProvider.MODULE,
      percentage,
      status:
        percentage >= AccidentFrequencyProvider.COMPLIANCE_TARGET
          ? 'TARGET_MET'
          : 'TARGET_NOT_MET',
      findings,
      pending: 0,
      completed: accidentCount,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
