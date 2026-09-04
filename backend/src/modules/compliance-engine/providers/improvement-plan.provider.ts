import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SgstProgram, SgstProgramDocument } from '../../programs/schemas/program.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 7.1.4
 * "Plan de mejoramiento".
 *
 * Evalúa si existe un plan de mejoramiento del SG-SST implementado
 * y monitoreado periódicamente.
 *
 * Criterios (25/25/25/25):
 * - Existencia de programas/planes:     25%
 * - Programas activos/en progreso:      25%
 * - Programas con avance significativo: 25%
 * - Programas con responsable:          25%
 *
 * NOTA: Contribuye a phases.act (ACTUAR).
 */
@Injectable()
export class ImprovementPlanProvider implements ComplianceProvider {
  private static readonly MODULE = 'improvement-plan';
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(SgstProgram.name)
    private readonly programModel: Model<SgstProgramDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);
    const programs = await this.programModel.find({ companyId: companyObjectId }).exec();

    if (programs.length === 0) {
      return {
        module: ImprovementPlanProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [{
          id: 'improvement-plan-no-data',
          module: ImprovementPlanProvider.MODULE,
          title: 'Sin planes de mejoramiento',
          description: 'No existen programas o planes de mejoramiento del SG-SST. El estándar 7.1.4 requiere plan de mejoramiento implementado y monitoreado.',
          priority: FindingPriority.HIGH,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        }],
        pending: 0, completed: 0,
        phases: { act: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const total = programs.length;

    const existenceScore = 1;

    const active = programs.filter(
      (p) => (p as any).status === 'ACTIVE' || (p as any).status === 'IN_PROGRESS' || (p as any).status === 'En Progreso',
    ).length;
    const activeScore = active / total;

    const withProgress = programs.filter(
      (p) => (p as any).progress && (p as any).progress > 0,
    ).length;
    const progressScore = withProgress / total;

    const withResponsible = programs.filter(
      (p) => (p as any).responsibleUser && (p as any).responsibleUser.toString().length > 0,
    ).length;
    const responsibleScore = withResponsible / total;

    const percentage = Math.round(
      existenceScore * 25 + activeScore * 25 + progressScore * 25 + responsibleScore * 25,
    );

    const findings: ProviderComplianceResult['findings'] = [];

    const inactive = total - active;
    if (inactive > 0) {
      findings.push({
        id: 'improvement-plan-inactive',
        module: ImprovementPlanProvider.MODULE,
        title: `${inactive} programa(s) inactivo(s)`,
        description: `${inactive} de ${total} programas no están activos/en progreso.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const withoutProgress = total - withProgress;
    if (withoutProgress > 0) {
      findings.push({
        id: 'improvement-plan-no-progress',
        module: ImprovementPlanProvider.MODULE,
        title: `${withoutProgress} programa(s) sin avance`,
        description: `${withoutProgress} programas no tienen progreso registrado.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    return {
      module: ImprovementPlanProvider.MODULE,
      percentage,
      status: percentage >= ImprovementPlanProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      pending: inactive,
      completed: active,
      phases: { act: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
