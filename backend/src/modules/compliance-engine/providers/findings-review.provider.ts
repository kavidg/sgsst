import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccountabilityCommitment, AccountabilityCommitmentDocument } from '../../accountability/schemas/accountability-commitment.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 6.1.4
 * "Revisión de hallazgos".
 *
 * Evalúa si existen hallazgos/compromisos documentados y su
 * estado de seguimiento y cierre.
 *
 * Criterios (25/25/25/25):
 * - Existencia de hallazgos:        25%
 * - Hallazgos en progreso/cerrados: 25%
 * - Hallazgos sin vencimiento:      25%
 * - Hallazgos con responsable:      25%
 *
 * NOTA: Contribuye a phases.check (VERIFICAR).
 */
@Injectable()
export class FindingsReviewProvider implements ComplianceProvider {
  private static readonly MODULE = 'findings-review';
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(AccountabilityCommitment.name)
    private readonly commitmentModel: Model<AccountabilityCommitmentDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);
    const commitments = await this.commitmentModel.find({ companyId: companyObjectId }).exec();

    if (commitments.length === 0) {
      return {
        module: FindingsReviewProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [{
          id: 'findings-review-no-data',
          module: FindingsReviewProvider.MODULE,
          title: 'Sin hallazgos/compromisos registrados',
          description: 'No existen hallazgos o compromisos de seguimiento. El estándar 6.1.4 requiere revisión y seguimiento de hallazgos.',
          priority: FindingPriority.HIGH,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        }],
        pending: 0, completed: 0,
        phases: { check: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const total = commitments.length;
    const now = new Date();

    // Criterion 1: Existence (25%)
    const existenceScore = 1;

    // Criterion 2: In-progress or completed (25%)
    const activeOrCompleted = commitments.filter(
      (c) => (c as any).status === 'IN_PROGRESS' || (c as any).status === 'COMPLETED' || (c as any).status === 'CLOSED',
    ).length;
    const statusScore = activeOrCompleted / total;

    // Criterion 3: Not overdue (25%)
    const notOverdue = commitments.filter(
      (c) => !(c as any).dueDate || new Date((c as any).dueDate).getTime() >= now.getTime(),
    ).length;
    const overdueScore = notOverdue / total;

    // Criterion 4: Has responsible (25%)
    const withResponsible = commitments.filter(
      (c) => (c as any).responsibleUser && (c as any).responsibleUser.toString().length > 0,
    ).length;
    const responsibleScore = withResponsible / total;

    const percentage = Math.round(
      existenceScore * 25 +
      statusScore * 25 +
      overdueScore * 25 +
      responsibleScore * 25,
    );

    const findings: ProviderComplianceResult['findings'] = [];

    const overdue = total - notOverdue;
    if (overdue > 0) {
      findings.push({
        id: 'findings-review-overdue',
        module: FindingsReviewProvider.MODULE,
        title: `${overdue} hallazgo(s) vencido(s)`,
        description: `${overdue} hallazgos/compromisos han pasado su fecha límite.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const pending = commitments.filter(
      (c) => (c as any).status === 'OPEN',
    ).length;
    if (pending > 0) {
      findings.push({
        id: 'findings-review-pending',
        module: FindingsReviewProvider.MODULE,
        title: `${pending} hallazgo(s) pendiente(s)`,
        description: `${pending} hallazgos/compromisos están en estado abierto sin seguimiento.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const withoutResponsible = total - withResponsible;
    if (withoutResponsible > 0) {
      findings.push({
        id: 'findings-review-no-responsible',
        module: FindingsReviewProvider.MODULE,
        title: `${withoutResponsible} hallazgo(s) sin responsable`,
        description: `${withoutResponsible} hallazgos/compromisos no tienen responsable asignado.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    return {
      module: FindingsReviewProvider.MODULE,
      percentage,
      status: percentage >= FindingsReviewProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      pending: overdue + pending,
      completed: activeOrCompleted,
      phases: { check: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
