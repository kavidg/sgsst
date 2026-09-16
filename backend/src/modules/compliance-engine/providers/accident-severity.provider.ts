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
 * Evaluación automática del estándar 3.3.2
 * "Medición de la severidad de la accidentalidad".
 *
 * Calcula la tasa de severidad:
 *   Severidad = (Días perdidos × 200,000) / Horas trabajadas
 *
 * donde 200,000 = 100 trabajadores × 2,000 horas/año
 *
 * Criterios y pesos (30/30/20/20):
 * - C1: Cálculo de severidad realizado:        30%
 * - C2: Datos de días perdidos disponibles:     30%
 * - C3: Datos de horas trabajadas disponibles:  20%
 * - C4: Tendencia documentada:                  20%
 *
 * NO_DATA: sin datos suficientes.
 * TARGET_MET: percentage >= 90.
 * TARGET_NOT_MET: percentage < 90.
 */
@Injectable()
export class AccidentSeverityProvider implements ComplianceProvider {
  private static readonly MODULE = 'accident-severity';
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

    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31);

    // Get all accidents with daysLost data
    const accidents = await this.incidentModel
      .find({
        companyId: objectId,
        investigationType: InvestigationType.ACCIDENT,
        incidentDate: { $gte: startOfYear, $lte: endOfYear },
      })
      .lean()
      .exec();

    const employeeCount = await this.employeeModel
      .countDocuments({ companyId: objectId })
      .exec();

    const totalDaysLost = accidents.reduce(
      (sum, i) => sum + (i.daysLost ?? 0),
      0,
    );

    if (accidents.length === 0 && employeeCount === 0) {
      return {
        module: AccidentSeverityProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'accident-severity-no-data',
            module: AccidentSeverityProvider.MODULE,
            title: 'Sin datos para calcular severidad',
            description:
              'No existen accidentes registrados ni empleados para calcular la severidad de la accidentalidad.',
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

    // Estimate hours worked
    const estimatedHours = employeeCount * 2000;

    // Calculate severity rate
    const severityRate =
      estimatedHours > 0
        ? (totalDaysLost * AccidentSeverityProvider.BASE_HOURS) / estimatedHours
        : 0;

    // C1 — Calculation performed (30%): severity can be calculated
    const calculationScore = estimatedHours > 0 ? 100 : 0;

    // C2 — Days lost data available (30%)
    const withDaysLost = accidents.filter(
      (i) => i.daysLost != null && i.daysLost > 0,
    ).length;
    const dataScore = accidents.length > 0
      ? Math.round((withDaysLost / accidents.length) * 100)
      : 0;

    // C3 — Hours data available (20%)
    const hoursScore = employeeCount > 0 ? 100 : 0;

    // C4 — Trend documented (20%): compare with previous year
    const prevYearStart = new Date(currentYear - 1, 0, 1);
    const prevYearEnd = new Date(currentYear - 1, 11, 31);
    const prevYearAccidents = await this.incidentModel
      .find({
        companyId: objectId,
        investigationType: InvestigationType.ACCIDENT,
        incidentDate: { $gte: prevYearStart, $lte: prevYearEnd },
      })
      .lean()
      .exec();
    const prevDaysLost = prevYearAccidents.reduce(
      (sum, i) => sum + (i.daysLost ?? 0),
      0,
    );
    const trendScore =
      prevDaysLost > 0 || totalDaysLost > 0 ? 100 : 0;

    const percentage = Math.round(
      calculationScore * 0.3 +
      dataScore * 0.3 +
      hoursScore * 0.2 +
      trendScore * 0.2,
    );

    // Build findings
    const findings: ProviderComplianceResult['findings'] = [];

    if (totalDaysLost > 0) {
      findings.push({
        id: 'accident-severity-rate',
        module: AccidentSeverityProvider.MODULE,
        title: `Severidad de accidentalidad: ${severityRate.toFixed(2)} días perdidos/200k hrs`,
        description:
          `Tasa de severidad calculada: ${severityRate.toFixed(2)} días perdidos por 200,000 horas-trabajadas. ` +
          `${totalDaysLost} días perdidos en ${accidents.length} accidente(s), ~${estimatedHours.toLocaleString()} horas estimadas.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    if (prevDaysLost > 0 || totalDaysLost > 0) {
      const change = totalDaysLost - prevDaysLost;
      const changePercent =
        prevDaysLost > 0
          ? ((change / prevDaysLost) * 100).toFixed(1)
          : 'N/A';
      findings.push({
        id: 'accident-severity-trend',
        module: AccidentSeverityProvider.MODULE,
        title: `Tendencia severidad: ${prevDaysLost} → ${totalDaysLost} días perdidos`,
        description:
          `Comparación con año anterior: ${prevDaysLost} → ${totalDaysLost} días perdidos ` +
          `(${change >= 0 ? '+' : ''}${changePercent}%).`,
        priority: change > 0 ? FindingPriority.HIGH : FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: accidents without daysLost data
    const withoutDaysLost = accidents.length - withDaysLost;
    if (withoutDaysLost > 0) {
      findings.push({
        id: 'accident-severity-missing-days',
        module: AccidentSeverityProvider.MODULE,
        title: `${withoutDaysLost} accidente(s) sin días perdidos registrados`,
        description:
          `${withoutDaysLost} de ${accidents.length} accidentes no tienen el campo días perdidos registrado. Esto afecta la precisión del cálculo de severidad.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    return {
      module: AccidentSeverityProvider.MODULE,
      percentage,
      status:
        percentage >= AccidentSeverityProvider.COMPLIANCE_TARGET
          ? 'TARGET_MET'
          : 'TARGET_NOT_MET',
      findings,
      pending: withoutDaysLost,
      completed: withDaysLost,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
