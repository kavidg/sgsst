import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SstInduction, SstInductionDocument, InductionStatus } from '../../risks/schemas/sst-induction.schema';
import { Employee, EmployeeDocument } from '../../employees/schemas/employee.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 1.2.2
 * "Inducción y Reinducción SG-SST".
 *
 * Evalúa si la empresa cuenta con registros de inducción y reinducción
 * de trabajadores al SG-SST.
 *
 * Criterios (25/25/25/25):
 * - Existencia de registros:              25%
 * - Registros completados:                25%
 * - Cobertura de trabajadores activos:    25%
 * - Registros con contenido documentado:  25%
 *
 * NOTA: Contribuye a phases.plan (PLANEAR).
 */
@Injectable()
export class InductionReinductionProvider implements ComplianceProvider {
  private static readonly MODULE = 'induction-reinduction';
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(SstInduction.name)
    private readonly inductionModel: Model<SstInductionDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    const [inductions, employees] = await Promise.all([
      this.inductionModel.find({ companyId: companyObjectId }).exec(),
      this.employeeModel.find({ companyId: companyObjectId }).exec(),
    ]);

    if (inductions.length === 0) {
      return {
        module: InductionReinductionProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [{
          id: 'induction-no-data',
          module: InductionReinductionProvider.MODULE,
          title: 'Sin registros de inducción/reinducción',
          description: 'No existen registros de inducción o reinducción SG-SST. El estándar 1.2.2 requiere evidencia de inducción a todos los trabajadores.',
          priority: FindingPriority.HIGH,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        }],
        pending: 0, completed: 0,
        phases: { plan: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const totalInductions = inductions.length;
    const activeEmployees = employees.filter((e) => (e as any).isActive !== false).length;

    // Criterion 1: Existence (25%)
    const existenceScore = 1;

    // Criterion 2: Completed inductions (25%)
    const completed = inductions.filter(
      (i) => (i as any).status === InductionStatus.COMPLETED,
    ).length;
    const completedScore = completed / totalInductions;

    // Criterion 3: Worker coverage (25%)
    const uniqueWorkers = new Set(
      inductions.filter((i) => (i as any).status === InductionStatus.COMPLETED)
        .map((i) => (i as any).employee?.toString()),
    ).size;
    const coverageScore = activeEmployees > 0
      ? Math.min(uniqueWorkers / activeEmployees, 1)
      : (completed > 0 ? 1 : 0);

    // Criterion 4: Content documented (25%)
    const withContent = inductions.filter(
      (i) => (i as any).topics && (i as any).topics.trim().length > 0,
    ).length;
    const contentScore = withContent / totalInductions;

    const percentage = Math.round(
      existenceScore * 25 +
      completedScore * 25 +
      coverageScore * 25 +
      contentScore * 25,
    );

    const findings: ProviderComplianceResult['findings'] = [];

    const notCompleted = totalInductions - completed;
    if (notCompleted > 0) {
      findings.push({
        id: 'induction-no-completed',
        module: InductionReinductionProvider.MODULE,
        title: `${notCompleted} inducción(es) no completada(s)`,
        description: `${notCompleted} de ${totalInductions} inducciones no tienen estado COMPLETED.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    if (activeEmployees > 0 && uniqueWorkers < activeEmployees) {
      const missing = activeEmployees - uniqueWorkers;
      findings.push({
        id: 'induction-incomplete-coverage',
        module: InductionReinductionProvider.MODULE,
        title: `${missing} trabajador(es) sin inducción completada`,
        description: `${missing} de ${activeEmployees} trabajadores activos no tienen inducción/reinducción completada.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const withoutContent = totalInductions - withContent;
    if (withoutContent > 0) {
      findings.push({
        id: 'induction-no-content',
        module: InductionReinductionProvider.MODULE,
        title: `${withoutContent} inducción(es) sin contenido documentado`,
        description: `${withoutContent} inducciones no tienen temas/contenido registrados.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    return {
      module: InductionReinductionProvider.MODULE,
      percentage,
      status: percentage >= InductionReinductionProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      pending: notCompleted,
      completed,
      phases: { plan: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
