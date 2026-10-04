import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccountabilityCommitment, AccountabilityCommitmentDocument } from '../../accountability/schemas/accountability-commitment.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * E2 (7.1.1) — Provider legacy "Acciones preventivas y correctivas"
 * (AccountabilityCommitment — proxy degradado).
 *
 * PROXY_LEGACY retirado del scoring (E2): este provider ya NO puntúa 7.1.1 —
 * quedó excluido vía SCORING_INELIGIBLE_MODULES. La fuente OFICIAL de 7.1.1
 * es CorrectivePreventiveActionsProvider (dominio corrective-preventive-
 * actions, scoring dimensions:v1). Este provider se conserva SOLO como
 * compatibilidad en moduleCompliance (hallazgos de sus compromisos), con su
 * módulo propio sin estándar canónico asignado.
 */
@Injectable()
export class CorrectivePreventiveProvider implements ComplianceProvider {
  private static readonly MODULE = 'corrective-preventive';
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
        module: CorrectivePreventiveProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [{
          id: 'corrective-preventive-no-data',
          module: CorrectivePreventiveProvider.MODULE,
          title: 'Sin acciones preventivas/correctivas registradas',
          description: 'No existen compromisos de rendición de cuentas registrados. La gestión oficial de acciones preventivas y correctivas (7.1.1) vive en el módulo corrective-preventive-actions.',
          priority: FindingPriority.HIGH,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        }],
        pending: 0, completed: 0,
        phases: { act: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const total = commitments.length;
    const now = new Date();

    const existenceScore = 1;

    const closed = commitments.filter(
      (c) => (c as any).status === 'COMPLETED' || (c as any).status === 'CLOSED',
    ).length;
    const closedScore = closed / total;

    const notOverdue = commitments.filter(
      (c) => !(c as any).dueDate || new Date((c as any).dueDate).getTime() >= now.getTime(),
    ).length;
    const overdueScore = notOverdue / total;

    const withResponsible = commitments.filter(
      (c) => (c as any).responsibleUser && (c as any).responsibleUser.toString().length > 0,
    ).length;
    const responsibleScore = withResponsible / total;

    const percentage = Math.round(
      existenceScore * 25 + closedScore * 25 + overdueScore * 25 + responsibleScore * 25,
    );

    const findings: ProviderComplianceResult['findings'] = [];

    const overdue = total - notOverdue;
    if (overdue > 0) {
      findings.push({
        id: 'corrective-preventive-overdue',
        module: CorrectivePreventiveProvider.MODULE,
        title: `${overdue} acción(es) vencida(s)`,
        description: `${overdue} acciones preventivas/correctivas han pasado su fecha límite.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const pending = commitments.filter((c) => (c as any).status === 'OPEN').length;
    if (pending > 0) {
      findings.push({
        id: 'corrective-preventive-pending',
        module: CorrectivePreventiveProvider.MODULE,
        title: `${pending} acción(es) pendiente(s)`,
        description: `${pending} acciones están en estado abierto sin seguimiento.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const withoutResponsible = total - withResponsible;
    if (withoutResponsible > 0) {
      findings.push({
        id: 'corrective-preventive-no-responsible',
        module: CorrectivePreventiveProvider.MODULE,
        title: `${withoutResponsible} acción(es) sin responsable`,
        description: `${withoutResponsible} acciones no tienen responsable asignado.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    return {
      module: CorrectivePreventiveProvider.MODULE,
      percentage,
      status: percentage >= CorrectivePreventiveProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      pending: overdue + pending,
      completed: closed,
      phases: { act: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
