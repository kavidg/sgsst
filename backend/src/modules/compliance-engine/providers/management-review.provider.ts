import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccountabilityMeeting, AccountabilityMeetingDocument } from '../../accountability/schemas/accountability-meeting.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 6.1.2
 * "Revisión por la dirección".
 *
 * Evalúa si existen reuniones/revisiones de dirección documentadas
 * y completadas.
 *
 * Criterios (25/25/25/25):
 * - Existencia de reuniones:              25%
 * - Reuniones completadas:                25%
 * - Reuniones a tiempo/recientes:         25%
 * - Reuniones con participantes:          25%
 *
 * NOTA: Contribuye a phases.check (VERIFICAR).
 */
@Injectable()
export class ManagementReviewProvider implements ComplianceProvider {
  private static readonly MODULE = 'management-review';
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(AccountabilityMeeting.name)
    private readonly meetingModel: Model<AccountabilityMeetingDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);
    const meetings = await this.meetingModel.find({ companyId: companyObjectId }).exec();

    if (meetings.length === 0) {
      return {
        module: ManagementReviewProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [{
          id: 'management-review-no-data',
          module: ManagementReviewProvider.MODULE,
          title: 'Sin reuniones de dirección registradas',
          description: 'No existen reuniones/revisiones de dirección. El estándar 6.1.2 requiere revisión periódica por la dirección.',
          priority: FindingPriority.HIGH,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        }],
        pending: 0, completed: 0,
        phases: { check: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const total = meetings.length;
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    // Criterion 1: Existence (25%)
    const existenceScore = 1;

    // Criterion 2: Completed meetings (25%)
    const completed = meetings.filter(
      (m) => (m as any).status === 'COMPLETED' || (m as any).status === 'Completada',
    ).length;
    const completedScore = completed / total;

    // Criterion 3: Recent meetings within 6 months (25%)
    const recent = meetings.filter(
      (m) => new Date((m as any).date).getTime() >= sixMonthsAgo.getTime(),
    ).length;
    const recentScore = recent / total;

    // Criterion 4: Meetings with participants (25%)
    const withParticipants = meetings.filter(
      (m) => (m as any).participants && (m as any).participants.length > 0,
    ).length;
    const participantScore = withParticipants / total;

    const percentage = Math.round(
      existenceScore * 25 +
      completedScore * 25 +
      recentScore * 25 +
      participantScore * 25,
    );

    const findings: ProviderComplianceResult['findings'] = [];

    const inactive = total - completed;
    if (inactive > 0) {
      findings.push({
        id: 'management-review-inactive',
        module: ManagementReviewProvider.MODULE,
        title: `${inactive} reunión(es) no completada(s)`,
        description: `${inactive} de ${total} reuniones de dirección no tienen estado completado.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    if (recent === 0) {
      findings.push({
        id: 'management-review-outdated',
        module: ManagementReviewProvider.MODULE,
        title: 'Sin reuniones recientes',
        description: 'No existen reuniones de dirección en los últimos 6 meses.',
        priority: FindingPriority.HIGH,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const withoutParticipants = total - withParticipants;
    if (withoutParticipants > 0) {
      findings.push({
        id: 'management-review-no-participants',
        module: ManagementReviewProvider.MODULE,
        title: `${withoutParticipants} reunión(es) sin participantes`,
        description: `${withoutParticipants} reuniones no tienen participantes registrados.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    return {
      module: ManagementReviewProvider.MODULE,
      percentage,
      status: percentage >= ManagementReviewProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      pending: inactive,
      completed,
      phases: { check: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
