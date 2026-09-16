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
 * Evaluación automática del estándar 3.3.3
 * "Medición de la mortalidad por accidentes de trabajo".
 *
 * Calcula la tasa de mortalidad:
 *   Mortalidad = (Número de muertes × 1,000,000) / Horas trabajadas
 *
 * Criterios y pesos (30/30/20/20):
 * - C1: Cálculo de mortalidad realizado:           30%
 * - C2: Registros de fatalidades disponibles:       30%
 * - C3: Datos de trabajadores expuestos:            20%
 * - C4: Investigación de fatalidades documentada:   20%
 *
 * NO_DATA: sin datos suficientes.
 * TARGET_MET: percentage >= 90 (fatalities = 0 is ideal).
 * TARGET_NOT_MET: percentage < 90.
 */
@Injectable()
export class AccidentMortalityProvider implements ComplianceProvider {
  private static readonly MODULE = 'accident-mortality';
  private static readonly COMPLIANCE_TARGET = 90;
  private static readonly BASE_HOURS = 1000000; // 1,000,000 hours for mortality rate

  constructor(
    @InjectModel(Incident.name)
    private readonly incidentModel: Model<IncidentDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const objectId = new Types.ObjectId(companyId);

    // Get fatal accidents (severity = FATAL or death-related)
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31);

    const allAccidents = await this.incidentModel
      .find({
        companyId: objectId,
        investigationType: InvestigationType.ACCIDENT,
        incidentDate: { $gte: startOfYear, $lte: endOfYear },
      })
      .lean()
      .exec();

    // Filter fatal accidents (severity contains 'FATAL' or 'MUERTE')
    const fatalAccidents = allAccidents.filter(
      (i) =>
        i.severity?.toString().toUpperCase().includes('FATAL') ||
        i.severity?.toString().toUpperCase().includes('MUERTE') ||
        i.severity?.toString().toUpperCase().includes('DEATH'),
    );

    const employeeCount = await this.employeeModel
      .countDocuments({ companyId: objectId })
      .exec();

    if (allAccidents.length === 0 && employeeCount === 0) {
      return {
        module: AccidentMortalityProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'accident-mortality-no-data',
            module: AccidentMortalityProvider.MODULE,
            title: 'Sin datos para calcular mortalidad',
            description:
              'No existen accidentes registrados ni empleados para calcular la mortalidad laboral.',
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

    const estimatedHours = employeeCount * 2000;

    // Calculate mortality rate
    const mortalityRate =
      estimatedHours > 0
        ? (fatalAccidents.length * AccidentMortalityProvider.BASE_HOURS) / estimatedHours
        : 0;

    // C1 — Calculation performed (30%)
    const calculationScore = estimatedHours > 0 ? 100 : 0;

    // C2 — Fatal accident records (30%): having records = good (even if 0 fatalities)
    const recordsScore = allAccidents.length > 0 ? 100 : 50;

    // C3 — Worker data available (20%)
    const workerScore = employeeCount > 0 ? 100 : 0;

    // C4 — Investigation documented (20%): fatal accidents should have investigation
    const investigatedFatal = fatalAccidents.filter(
      (i) => i.rootCauses || i.correctiveActions || i.investigationDate,
    );
    const investigationScore =
      fatalAccidents.length > 0
        ? Math.round((investigatedFatal.length / fatalAccidents.length) * 100)
        : 100; // No fatalities = full score

    const percentage = Math.round(
      calculationScore * 0.3 +
      recordsScore * 0.3 +
      workerScore * 0.2 +
      investigationScore * 0.2,
    );

    // Build findings
    const findings: ProviderComplianceResult['findings'] = [];

    if (fatalAccidents.length > 0) {
      findings.push({
        id: 'accident-mortality-fatal',
        module: AccidentMortalityProvider.MODULE,
        title: `${fatalAccidents.length} accidente(s) fatal(es) registrado(s)`,
        description:
          `Se han registrado ${fatalAccidents.length} accidentes fatales en el período. ` +
          `Tasa de mortalidad: ${mortalityRate.toFixed(4)} por 1,000,000 horas-trabajadas.`,
        priority: FindingPriority.CRITICAL,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    } else {
      findings.push({
        id: 'accident-mortality-zero',
        module: AccidentMortalityProvider.MODULE,
        title: 'Sin accidentes fatales en el período',
        description:
          'No se han registrado accidentes fatales en el período evaluado.',
        priority: FindingPriority.LOW,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    return {
      module: AccidentMortalityProvider.MODULE,
      percentage,
      status:
        percentage >= AccidentMortalityProvider.COMPLIANCE_TARGET
          ? 'TARGET_MET'
          : 'TARGET_NOT_MET',
      findings,
      pending: fatalAccidents.length,
      completed: allAccidents.length - fatalAccidents.length,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
