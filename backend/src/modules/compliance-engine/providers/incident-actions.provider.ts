import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Incident, IncidentDocument } from '../../incidents/schemas/incident.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 7.1.3
 * "Acciones por accidentes".
 *
 * Evalúa si los accidentes e incidentes generan acciones de mejora
 * con análisis causal y cierre documentado.
 *
 * Criterios (25/25/25/25):
 * - Existencia de incidentes registrados:    25%
 * - Incidentes con investigación completada: 25%
 * - Incidentes con acciones definidas:       25%
 * - Incidentes con análisis causal:          25%
 *
 * NOTA: Contribuye a phases.act (ACTUAR).
 */
@Injectable()
export class IncidentActionsProvider implements ComplianceProvider {
  private static readonly MODULE = 'incident-actions';
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(Incident.name)
    private readonly incidentModel: Model<IncidentDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);
    const incidents = await this.incidentModel.find({ companyId: companyObjectId }).exec();

    if (incidents.length === 0) {
      return {
        module: IncidentActionsProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [{
          id: 'incident-actions-no-data',
          module: IncidentActionsProvider.MODULE,
          title: 'Sin incidentes registrados',
          description: 'No existen accidentes o incidentes registrados. El estándar 7.1.3 requiere análisis causal y acciones de mejora.',
          priority: FindingPriority.HIGH,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        }],
        pending: 0, completed: 0,
        phases: { act: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const total = incidents.length;

    const existenceScore = 1;

    const investigated = incidents.filter(
      (i) => (i as any).status === 'INVESTIGATED' || (i as any).status === 'CLOSED' || (i as any).status === 'Completado',
    ).length;
    const investigationScore = investigated / total;

    const withActions = incidents.filter(
      (i) => (i as any).correctiveActions && (i as any).correctiveActions.length > 0,
    ).length;
    const actionsScore = withActions / total;

    const withRootCause = incidents.filter(
      (i) => (i as any).rootCause && (i as any).rootCause.trim().length > 0,
    ).length;
    const rootCauseScore = withRootCause / total;

    const percentage = Math.round(
      existenceScore * 25 + investigationScore * 25 + actionsScore * 25 + rootCauseScore * 25,
    );

    const findings: ProviderComplianceResult['findings'] = [];

    const withoutInvestigation = total - investigated;
    if (withoutInvestigation > 0) {
      findings.push({
        id: 'incident-actions-not-investigated',
        module: IncidentActionsProvider.MODULE,
        title: `${withoutInvestigation} incidente(s) sin investigación`,
        description: `${withoutInvestigation} de ${total} incidentes no han sido investigados.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const withoutActions = total - withActions;
    if (withoutActions > 0) {
      findings.push({
        id: 'incident-actions-no-actions',
        module: IncidentActionsProvider.MODULE,
        title: `${withoutActions} incidente(s) sin acciones correctivas`,
        description: `${withoutActions} incidentes no tienen acciones correctivas definidas.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    return {
      module: IncidentActionsProvider.MODULE,
      percentage,
      status: percentage >= IncidentActionsProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      pending: withoutInvestigation + withoutActions,
      completed: investigated,
      phases: { act: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
