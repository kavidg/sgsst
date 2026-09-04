import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccountabilityMeeting, AccountabilityMeetingDocument } from '../../accountability/schemas/accountability-meeting.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 7.1.2
 * "Acciones mejora alta dirección".
 *
 * Evalúa si existen acciones de mejora aprobadas por la alta dirección
 * con seguimiento a su implementación.
 *
 * Criterios (25/25/25/25):
 * - Existencia de reuniones de dirección:  25%
 * - Reuniones completadas:                25%
 * - Reuniones recientes:                  25%
 * - Reuniones con participantes:          25%
 *
 * NOTA: Contribuye a phases.act (ACTUAR).
 */
@Injectable()
export class ManagementImprovementProvider implements ComplianceProvider {
  private static readonly MODULE = 'management-improvement';
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
        module: ManagementImprovementProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [{
          id: 'management-improvement-no-data',
          module: ManagementImprovementProvider.MODULE,
          title: 'Sin acciones de mejora de alta dirección',
          description: 'No existen reuniones/acciones de mejora aprobadas por la alta dirección. El estándar 7.1.2 requiere acciones de mejora con seguimiento.',
          priority: FindingPriority.HIGH,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        }],
        pending: 0, completed: 0,
        phases: { act: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const total = meetings.length;
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    const existenceScore = 1;

    const completed = meetings.filter(
      (m) => (m as any).status === 'COMPLETED' || (m as any).status === 'Completada',
    ).length;
    const completedScore = completed / total;

    const recent = meetings.filter(
      (m) => new Date((m as any).date).getTime() >= sixMonthsAgo.getTime(),
    ).length;
    const recentScore = recent / total;

    const withParticipants = meetings.filter(
      (m) => (m as any).participants && (m as any).participants.length > 0,
    ).length;
    const participantScore = withParticipants / total;

    const percentage = Math.round(
      existenceScore * 25 + completedScore * 25 + recentScore * 25 + participantScore * 25,
    );

    const findings: ProviderComplianceResult['findings'] = [];

    const inactive = total - completed;
    if (inactive > 0) {
      findings.push({
        id: 'management-improvement-inactive',
        module: ManagementImprovementProvider.MODULE,
        title: `${inactive} reunión(es) no completada(s)`,
        description: `${inactive} de ${total} reuniones de mejora no tienen estado completado.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    if (recent === 0) {
      findings.push({
        id: 'management-improvement-outdated',
        module: ManagementImprovementProvider.MODULE,
        title: 'Sin reuniones recientes',
        description: 'No existen reuniones de mejora en los últimos 6 meses.',
        priority: FindingPriority.HIGH,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    return {
      module: ManagementImprovementProvider.MODULE,
      percentage,
      status: percentage >= ManagementImprovementProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      pending: inactive,
      completed,
      phases: { act: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
