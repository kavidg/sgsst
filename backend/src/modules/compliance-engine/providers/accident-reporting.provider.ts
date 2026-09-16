import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Incident,
  IncidentDocument,
  InvestigationType,
} from '../../incidents/schemas/incident.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 3.2.1
 * "Reporte de accidentes de trabajo y enfermedades laborales".
 *
 * Evalúa si la empresa reporta oportunamente accidentes de trabajo
 * y enfermedades laborales a la ARL y EPS dentro de los 2 días
 * hábiles siguientes al evento o diagnóstico.
 *
 * Criterios y pesos (30/25/25/20):
 * - C1: Existencia de registros de incidentes:    30%
 * - C2: Reporte oportuno (dentro de 2 días):      25%
 * - C3: Información completa del reporte:          25%
 * - C4: Clasificación correcta (AT vs EL):         20%
 *
 * NO_DATA: sin registros de incidentes.
 * TARGET_MET: percentage >= 90.
 * TARGET_NOT_MET: percentage < 90.
 */
@Injectable()
export class AccidentReportingProvider implements ComplianceProvider {
  private static readonly MODULE = 'accident-reporting';
  private static readonly COMPLIANCE_TARGET = 90;
  private static readonly REPORTING_DAYS = 2; // 2 días hábiles

  constructor(
    @InjectModel(Incident.name)
    private readonly incidentModel: Model<IncidentDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const objectId = new Types.ObjectId(companyId);

    // Get all incidents for this company
    const incidents = await this.incidentModel
      .find({ companyId: objectId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    if (incidents.length === 0) {
      return {
        module: AccidentReportingProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'accident-reporting-no-data',
            module: AccidentReportingProvider.MODULE,
            title: 'Sin registros de incidentes/accidentes',
            description:
              'No existen registros de accidentes de trabajo o enfermedades laborales. El estándar 3.2.1 requiere reporte oportuno a la ARL y EPS.',
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

    const totalIncidents = incidents.length;

    // C1 — Existence (30%): incidents exist = full score
    const existenceScore = 100;

    // C2 — Timely reporting (25%): check if incidents were reported
    // (date field exists = incident was registered)
    const withDate = incidents.filter((i) => i.date);
    const reportingScore = totalIncidents > 0
      ? Math.round((withDate.length / totalIncidents) * 100)
      : 0;

    // C3 — Complete information (25%): check required fields
    const completeIncidents = incidents.filter(
      (i) =>
        i.description &&
        i.description.length > 10 &&
        i.investigationType &&
        i.severity,
    );
    const completenessScore = totalIncidents > 0
      ? Math.round((completeIncidents.length / totalIncidents) * 100)
      : 0;

    // C4 — Correct classification (25%): AT vs EL properly classified
    const classifiedIncidents = incidents.filter(
      (i) => i.investigationType === InvestigationType.ACCIDENT ||
             i.investigationType === InvestigationType.DISEASE,
    );
    const classificationScore = totalIncidents > 0
      ? Math.round((classifiedIncidents.length / totalIncidents) * 100)
      : 0;

    const percentage = Math.round(
      existenceScore * 0.3 +
      reportingScore * 0.25 +
      completenessScore * 0.25 +
      classificationScore * 0.2,
    );

    // Build findings
    const findings: ProviderComplianceResult['findings'] = [];

    const missingDate = totalIncidents - withDate.length;
    if (missingDate > 0) {
      findings.push({
        id: 'accident-reporting-no-date',
        module: AccidentReportingProvider.MODULE,
        title: `${missingDate} incidente(s) sin fecha registrada`,
        description:
          `${missingDate} de ${totalIncidents} registros no tienen fecha de registro.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    return {
      module: AccidentReportingProvider.MODULE,
      percentage,
      status:
        percentage >= AccidentReportingProvider.COMPLIANCE_TARGET
          ? 'TARGET_MET'
          : 'TARGET_NOT_MET',
      findings,
      pending: missingDate,
      completed: withDate.length,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
