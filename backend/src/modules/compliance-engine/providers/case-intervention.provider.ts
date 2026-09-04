import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Incident,
  IncidentDocument,
} from '../../incidents/schemas/incident.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 3.3.3
 * "Intervención y seguimiento de casos".
 *
 * Evalúa la gestión integral de casos de salud laboral con trazabilidad
 * de acciones, responsables y verificación de cierre.
 *
 * Criterios y pesos (propuestos):
 * - Existencia de casos:                    15%
 * - Intervención sobre casos:               25%
 * - Acciones completadas:                   25%
 * - Acciones vencidas:                      15%
 * - Cierre de casos:                        10%
 * - Seguimiento documentado:                10%
 *
 * NO_DATA: sin casos de salud laboral registrados.
 */
@Injectable()
export class CaseInterventionProvider implements ComplianceProvider {
  private static readonly MODULE = 'incidents';
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(Incident.name)
    private readonly incidentModel: Model<IncidentDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    const cases = await this.incidentModel
      .find({ companyId: companyObjectId })
      .sort({ date: -1 })
      .exec();

    const now = new Date();

    // ── NO_DATA ──
    if (cases.length === 0) {
      return {
        module: CaseInterventionProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'case-intervention-no-data',
            module: CaseInterventionProvider.MODULE,
            title: 'No existen casos de salud laboral registrados',
            description:
              'No existen casos de salud laboral registrados para evaluar el cumplimiento del estándar 3.3.3. Registrar casos para evaluar la intervención y seguimiento.',
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

    const totalCases = cases.length;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 1 — Existencia de casos (15%)
    //
    // Si existen uno o más casos → 15 puntos.
    // ══════════════════════════════════════════════════════════
    const existenceScore = 1;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 2 — Intervención sobre casos (25%)
    //
    // Un caso se considera intervenido si tiene al menos una acción
    // correctiva O preventiva.
    // ══════════════════════════════════════════════════════════
    const casesWithIntervention = cases.filter(
      (c) =>
        (c.correctiveActions?.length ?? 0) > 0 ||
        (c.preventiveActions?.length ?? 0) > 0,
    ).length;
    const interventionScore = casesWithIntervention / totalCases;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 3 — Acciones completadas (25%)
    //
    // Evalúa proporción de acciones completadas sobre el total.
    // ══════════════════════════════════════════════════════════
    let totalActions = 0;
    let completedActions = 0;
    let overdueActions = 0;
    let openActions = 0;

    for (const c of cases) {
      const allActions = [
        ...(c.correctiveActions ?? []),
        ...(c.preventiveActions ?? []),
      ];
      totalActions += allActions.length;
      for (const action of allActions) {
        if (action.status === 'COMPLETED') {
          completedActions++;
        } else {
          openActions++;
          if (action.dueDate != null && action.dueDate.getTime() < now.getTime()) {
            overdueActions++;
          }
        }
      }
    }

    const actionsScore = totalActions > 0 ? completedActions / totalActions : 0;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 4 — Acciones vencidas (15%)
    //
    // Penalización proporcional por acciones vencidas.
    // Score = 1 - (overdueActions / totalActions) si totalActions > 0.
    // ══════════════════════════════════════════════════════════
    const overdueScore = totalActions > 0
      ? Math.max(0, 1 - (overdueActions / totalActions))
      : 1;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 5 — Cierre de casos (10%)
    //
    // Evalúa proporción de casos con closureDate.
    // ══════════════════════════════════════════════════════════
    const casesWithClosure = cases.filter(
      (c) => c.closureDate != null,
    ).length;
    const closureScore = casesWithClosure / totalCases;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 6 — Seguimiento documentado (10%)
    //
    // Un caso tiene seguimiento cuando tiene al menos una acción
    // completada con completedDate.
    // ══════════════════════════════════════════════════════════
    let casesWithFollowUp = 0;
    for (const c of cases) {
      const allActions = [
        ...(c.correctiveActions ?? []),
        ...(c.preventiveActions ?? []),
      ];
      const hasCompletedWithDate = allActions.some(
        (a) => a.status === 'COMPLETED' && a.completedDate != null,
      );
      if (hasCompletedWithDate) {
        casesWithFollowUp++;
      }
    }
    const followUpScore = casesWithFollowUp / totalCases;

    // ══════════════════════════════════════════════════════════
    // CÁLCULO FINAL (15/25/25/15/10/10)
    // ══════════════════════════════════════════════════════════
    const percentage = Math.round(
      existenceScore * 15 +
      interventionScore * 25 +
      actionsScore * 25 +
      overdueScore * 15 +
      closureScore * 10 +
      followUpScore * 10,
    );

    // ── Status ──
    const status =
      percentage >= CaseInterventionProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET';

    // ── Findings ──
    const findings: ProviderComplianceResult['findings'] = [];

    // Finding: casos sin intervención
    const casesWithoutIntervention = totalCases - casesWithIntervention;
    if (casesWithoutIntervention > 0) {
      findings.push({
        id: 'case-intervention-no-intervention',
        module: CaseInterventionProvider.MODULE,
        title: `${casesWithoutIntervention} caso(s) sin intervención`,
        description:
          `${casesWithoutIntervention} de ${totalCases} casos no tienen acciones correctivas ni preventivas registradas. Definir acciones de intervención para mejorar el seguimiento del estándar 3.3.3.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: acciones vencidas
    if (overdueActions > 0) {
      findings.push({
        id: 'case-intervention-overdue-actions',
        module: CaseInterventionProvider.MODULE,
        title: `${overdueActions} acción(es) vencida(s) sin completar`,
        description:
          `Existen ${overdueActions} acciones con fecha vencida que no han sido completadas. Revisar y priorizar las acciones pendientes para mejorar el seguimiento del estándar 3.3.3.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: casos sin cierre
    const casesWithoutClosure = totalCases - casesWithClosure;
    if (casesWithoutClosure > 0) {
      findings.push({
        id: 'case-intervention-no-closure',
        module: CaseInterventionProvider.MODULE,
        title: `${casesWithoutClosure} caso(s) sin fecha de cierre`,
        description:
          `${casesWithoutClosure} de ${totalCases} casos no tienen fecha de cierre formal. Revisar el estado de los casos y proceder al cierre cuando corresponda.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: seguimiento incompleto
    const casesWithoutFollowUp = totalCases - casesWithFollowUp;
    if (casesWithoutFollowUp > 0) {
      findings.push({
        id: 'case-intervention-no-follow-up',
        module: CaseInterventionProvider.MODULE,
        title: `${casesWithoutFollowUp} caso(s) sin seguimiento documentado`,
        description:
          `${casesWithoutFollowUp} de ${totalCases} casos no tienen acciones completadas con fecha de cierre. Documentar el seguimiento para mejorar la trazabilidad del estándar 3.3.3.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    return {
      module: CaseInterventionProvider.MODULE,
      percentage,
      status,
      findings,
      pending: openActions,
      completed: completedActions,
      overdue: overdueActions,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
