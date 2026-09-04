import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Employee, EmployeeDocument } from '../../employees/schemas/employee.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';

/**
 * Evaluación automática del estándar 3.1.1 "Perfil sociodemográfico".
 *
 * Conecta el dominio de Empleados con ComplianceEngine para evaluar:
 * - Completitud de perfiles sociodemográficos de la población trabajadora
 * - 4 criterios principales: birthDate, gender, maritalStatus, educationLevel
 *
 * Criterios y pesos (25/25/25/25):
 * - Fecha de nacimiento registrada:  25%
 * - Género registrado:              25%
 * - Nivel educativo registrado:     25%
 * - Estado civil registrado:        25%
 *
 * NO_DATA: sin empleados registrados.
 * TARGET_MET: percentage >= 90.
 * TARGET_NOT_MET: percentage < 90.
 */
@Injectable()
export class SociodemographicProvider implements ComplianceProvider {
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    const employees = await this.employeeModel
      .find({ companyId: companyObjectId })
      .exec();

    const totalWorkers = employees.length;

    // ── NO_DATA ──
    if (totalWorkers === 0) {
      return {
        module: 'sociodemographic',
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'socio-no-data',
            module: 'sociodemographic',
            title: 'Sin datos de perfil sociodemográfico',
            description:
              'No hay empleados registrados para construir el perfil sociodemográfico. Registrar empleados para evaluar el cumplimiento de 3.1.1.',
            priority: FindingPriority.HIGH,
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
        pending: 0,
        completed: 0,
        overdue: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    // ══════════════════════════════════════════════════════════
    // Cálculo de criterios (25/25/25/25)
    // ══════════════════════════════════════════════════════════

    let withBirthDate = 0;
    let withGender = 0;
    let withEducationLevel = 0;
    let withMaritalStatus = 0;
    let completeProfiles = 0;

    for (const emp of employees) {
      if (emp.birthDate) withBirthDate++;
      if (emp.gender) withGender++;
      if (emp.educationLevel) withEducationLevel++;
      if (emp.maritalStatus) withMaritalStatus++;
      if (emp.birthDate && emp.gender && emp.maritalStatus && emp.educationLevel) {
        completeProfiles++;
      }
    }

    // Cálculo sin redondeo intermedio para evitar errores acumulativos.
    // Cada criterio aporta 25% al resultado final.
    const percentage = Math.round(
      ((withBirthDate / totalWorkers) * 25) +
      ((withGender / totalWorkers) * 25) +
      ((withEducationLevel / totalWorkers) * 25) +
      ((withMaritalStatus / totalWorkers) * 25),
    );

    // ── Status ──
    const status =
      percentage >= SociodemographicProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET';

    // ── Findings ──
    const findings: ProviderComplianceResult['findings'] = [];

    const missingBirthDate = totalWorkers - withBirthDate;
    if (missingBirthDate > 0) {
      findings.push({
        id: 'socio-missing-age',
        module: 'sociodemographic',
        title: `${missingBirthDate} empleado(s) sin fecha de nacimiento`,
        description:
          `${missingBirthDate} de ${totalWorkers} empleados no tienen fecha de nacimiento registrada. El estándar 3.1.1 requiere la caracterización sociodemográfica de la población trabajadora.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const missingGender = totalWorkers - withGender;
    if (missingGender > 0) {
      findings.push({
        id: 'socio-missing-gender',
        module: 'sociodemographic',
        title: `${missingGender} empleado(s) sin género registrado`,
        description:
          `${missingGender} de ${totalWorkers} empleados no tienen género registrado. Completar la información de género para cumplir con 3.1.1.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const missingEducation = totalWorkers - withEducationLevel;
    if (missingEducation > 0) {
      findings.push({
        id: 'socio-missing-education',
        module: 'sociodemographic',
        title: `${missingEducation} empleado(s) sin nivel educativo`,
        description:
          `${missingEducation} de ${totalWorkers} empleados no tienen nivel educativo registrado. El perfil sociodemográfico requiere esta información.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const missingMarital = totalWorkers - withMaritalStatus;
    if (missingMarital > 0) {
      findings.push({
        id: 'socio-missing-marital',
        module: 'sociodemographic',
        title: `${missingMarital} empleado(s) sin estado civil`,
        description:
          `${missingMarital} de ${totalWorkers} empleados no tienen estado civil registrado. Completar esta información para mejorar el perfil sociodemográfico.`,
        priority: FindingPriority.LOW,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // ── Pending / Completed ──
    const pending = totalWorkers - completeProfiles;
    const completed = completeProfiles;

    return {
      module: 'sociodemographic',
      percentage,
      status,
      findings,
      pending,
      completed,
      overdue: 0,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
