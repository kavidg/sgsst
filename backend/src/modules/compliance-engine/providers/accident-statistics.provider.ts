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
 * Evaluación automática del estándar 3.2.3
 * "Registro y análisis estadístico de accidentes de trabajo y enfermedades laborales".
 *
 * Evalúa si la empresa mantiene registros históricos y análisis estadístico
 * de accidentalidad y enfermedades laborales conforme a la Resolución 0312.
 *
 * Criterios y pesos (25/25/25/25):
 * - C1: Existencia de registros estadísticos:   25%
 * - C2: Clasificación de eventos (AT/EL/INCIDENTE): 25%
 * - C3: Análisis temporal documentado:            25%
 * - C4: Datos de trabajadores para referencia:   25%
 *
 * NO_DATA: sin registros de incidentes.
 * TARGET_MET: percentage >= 90.
 * TARGET_NOT_MET: percentage < 90.
 */
@Injectable()
export class AccidentStatisticsProvider implements ComplianceProvider {
  private static readonly MODULE = 'accident-statistics';
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(Incident.name)
    private readonly incidentModel: Model<IncidentDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const objectId = new Types.ObjectId(companyId);

    // Get all incidents for this company
    const incidents = await this.incidentModel
      .find({ companyId: objectId })
      .sort({ date: -1 })
      .lean()
      .exec();

    if (incidents.length === 0) {
      return {
        module: AccidentStatisticsProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'accident-statistics-no-data',
            module: AccidentStatisticsProvider.MODULE,
            title: 'Sin registros de accidentalidad para análisis estadístico',
            description:
              'No existen registros de accidentes de trabajo o enfermedades laborales. El estándar 3.2.3 requiere registro y análisis estadístico.',
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

    const total = incidents.length;

    // ── C1 — Existencia de registros estadísticos (25%) ──
    // Having records is the baseline; completeness improves the score.
    const withDate = incidents.filter((i) => i.date != null).length;
    const withDescription = incidents.filter(
      (i) => i.description && i.description.length > 5,
    ).length;
    const existenceScore = Math.round(
      ((withDate / total) * 50 + (withDescription / total) * 50),
    );

    // ── C2 — Clasificación de eventos AT/EL (25%) ──
    // Events should be classified as ACCIDENT or DISEASE.
    const classifiedEvents = incidents.filter(
      (i) =>
        i.investigationType === InvestigationType.ACCIDENT ||
        i.investigationType === InvestigationType.DISEASE,
    );
    const classificationScore = Math.round((classifiedEvents.length / total) * 100);

    // ── C3 — Análisis temporal documentado (25%) ──
    // Events should span multiple periods or have date-based analysis.
    const uniqueMonths = new Set(
      incidents
        .filter((i) => i.date != null)
        .map((i) => {
          const d = new Date(i.date);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }),
    );
    // Score increases with more distinct months of data.
    const temporalScore = Math.min(100, uniqueMonths.size * 15);

    // ── C4 — Datos de trabajadores para referencia (25%) ──
    const employeeCount = await this.employeeModel
      .countDocuments({ companyId: objectId })
      .exec();
    const workerScore = employeeCount > 0 ? 100 : 0;

    const percentage = Math.round(
      existenceScore * 0.25 +
      classificationScore * 0.25 +
      temporalScore * 0.25 +
      workerScore * 0.25,
    );

    // ── Build summary statistics for findings ──
    const accidentCount = incidents.filter(
      (i) => i.investigationType === InvestigationType.ACCIDENT,
    ).length;
    const diseaseCount = incidents.filter(
      (i) => i.investigationType === InvestigationType.DISEASE,
    ).length;
    const totalDaysLost = incidents.reduce(
      (sum, i) => sum + (i.daysLost ?? 0),
      0,
    );

    const findings: ProviderComplianceResult['findings'] = [];

    findings.push({
      id: 'accident-statistics-summary',
      module: AccidentStatisticsProvider.MODULE,
      title: `Resumen estadístico: ${total} eventos (${accidentCount} AT, ${diseaseCount} EL)`,
      description:
        `Registro y análisis estadístico: ${total} eventos totales, ` +
        `${accidentCount} accidentes de trabajo, ${diseaseCount} enfermedades laborales, ` +
        `${totalDaysLost} días perdidos acumulados en ${uniqueMonths.size} período(s).`,
      priority: FindingPriority.MEDIUM,
      status: 'OPEN',
      responsible: '',
      dueDate: '',
      createdAt: new Date().toISOString(),
    });

    // Finding: unclassified events
    const unclassified = total - classifiedEvents.length;
    if (unclassified > 0) {
      findings.push({
        id: 'accident-statistics-unclassified',
        module: AccidentStatisticsProvider.MODULE,
        title: `${unclassified} evento(s) sin clasificación AT/EL`,
        description:
          `${unclassified} de ${total} registros no están clasificados como Accidente de Trabajo o Enfermedad Laboral.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: employee data missing for rate calculation
    if (employeeCount === 0) {
      findings.push({
        id: 'accident-statistics-no-workers',
        module: AccidentStatisticsProvider.MODULE,
        title: 'Sin datos de trabajadores para cálculo de tasas',
        description:
          'No existen trabajadores registrados. Se requiere la nómina para calcular tasas de frecuencia y severidad.',
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    return {
      module: AccidentStatisticsProvider.MODULE,
      percentage,
      status:
        percentage >= AccidentStatisticsProvider.COMPLIANCE_TARGET
          ? 'TARGET_MET'
          : 'TARGET_NOT_MET',
      findings,
      pending: unclassified,
      completed: classifiedEvents.length,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
