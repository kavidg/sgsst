import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ChangeRequest,
  ChangeRequestDocument,
  ChangeStatus,
  ImpactLevel,
} from '../../change-management/schema/change-request.schema';
import { ApprovalStatus } from '../../approval-workflow/enums/approval-status.enum';
import { FindingPriority } from '../enums/finding-priority.enum';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';

/**
 * Evaluación automática del estándar 2.11.1 "Gestión del cambio".
 *
 * Conecta el dominio de Gestión del Cambio con ComplianceEngine para evaluar:
 * - Existencia de solicitudes de cambio documentadas
 * - Evaluación de impacto SST en cambios de impacto MEDIUM/HIGH/CRITICAL
 * - Flujo de aprobación formal
 * - Implementación y seguimiento post-implementación
 *
 * Criterios y pesos:
 * - Cambios documentados:        30%
 * - Evaluación de impacto SST:   30%
 * - Aprobación:                  20%
 * - Implementación y seguimiento: 20%
 *
 * NO_DATA: sin solicitudes de cambio.
 * TARGET_MET: percentage >= 90.
 * TARGET_NOT_MET: percentage < 90.
 */
@Injectable()
export class ChangeManagementProvider implements ComplianceProvider {
  /** Meta de cumplimiento. */
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(ChangeRequest.name)
    private changeRequestModel: Model<ChangeRequestDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    // ── Query parallel: obtener métricas de cambios ──
    const [
      totalChanges,
      approvedChanges,
      implementedChanges,
      rejectedChanges,
      pendingApprovalChanges,
      draftChanges,
      changesNeedingImpact,
      changesWithRiskAnalysis,
      changesWithControlActions,
      implementedWithFollowUp,
    ] = await Promise.all([
      // Total de cambios (todos los estados)
      this.changeRequestModel
        .countDocuments({ companyId: companyObjectId })
        .exec(),
      // Cambios aprobados
      this.changeRequestModel
        .countDocuments({
          companyId: companyObjectId,
          status: ChangeStatus.APPROVED,
        })
        .exec(),
      // Cambios implementados
      this.changeRequestModel
        .countDocuments({
          companyId: companyObjectId,
          status: ChangeStatus.IMPLEMENTED,
        })
        .exec(),
      // Cambios rechazados
      this.changeRequestModel
        .countDocuments({
          companyId: companyObjectId,
          status: ChangeStatus.REJECTED,
        })
        .exec(),
      // Cambios pendientes de aprobación
      this.changeRequestModel
        .countDocuments({
          companyId: companyObjectId,
          status: ChangeStatus.PENDING_APPROVAL,
        })
        .exec(),
      // Cambios en borrador
      this.changeRequestModel
        .countDocuments({
          companyId: companyObjectId,
          status: ChangeStatus.DRAFT,
        })
        .exec(),
      // Cambios que requieren evaluación de impacto (MEDIUM/HIGH/CRITICAL)
      this.changeRequestModel
        .countDocuments({
          companyId: companyObjectId,
          impactLevel: { $in: [ImpactLevel.MEDIUM, ImpactLevel.HIGH, ImpactLevel.CRITICAL] },
        })
        .exec(),
      // Cambios con análisis de riesgos
      this.changeRequestModel
        .countDocuments({
          companyId: companyObjectId,
          impactLevel: { $in: [ImpactLevel.MEDIUM, ImpactLevel.HIGH, ImpactLevel.CRITICAL] },
          riskAnalysis: { $exists: true, $ne: '' },
        })
        .exec(),
      // Cambios con acciones de control
      this.changeRequestModel
        .countDocuments({
          companyId: companyObjectId,
          impactLevel: { $in: [ImpactLevel.MEDIUM, ImpactLevel.HIGH, ImpactLevel.CRITICAL] },
          controlActions: { $exists: true, $not: { $size: 0 } },
        })
        .exec(),
      // Cambios implementados con seguimiento
      this.changeRequestModel
        .countDocuments({
          companyId: companyObjectId,
          status: ChangeStatus.IMPLEMENTED,
          followUpDate: { $exists: true, $ne: null },
        })
        .exec(),
    ]);

    // ── NO_DATA ──
    if (totalChanges === 0) {
      return {
        module: 'change-management',
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'change-no-data',
            module: 'change-management',
            title: 'Sin datos de gestión del cambio',
            description:
              'No existen solicitudes de gestión del cambio registradas. Registrar al menos una solicitud para evaluar el cumplimiento de 2.11.1.',
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
    // Cálculo de criterios
    // ══════════════════════════════════════════════════════════

    const findings: ProviderComplianceResult['findings'] = [];
    let pending = 0;
    let completed = 0;

    // ── Criterio 1: Cambios documentados (30%) ──
    // Evalúa si la empresa tiene un proceso formal documentado de gestión del cambio.
    // Si existen cambios registrados, el criterio alcanza 100%.
    const docsWeight = 30;
    const docsScore = totalChanges > 0 ? 100 : 0;

    // ── Criterio 2: Evaluación de impacto SST (30%) ──
    // Para cambios MEDIUM/HIGH/CRITICAL, evalúa si tienen riskAnalysis y controlActions.
    const impactWeight = 30;
    let impactScore = 0;
    if (changesNeedingImpact > 0) {
      const riskRatio = changesWithRiskAnalysis / changesNeedingImpact;
      const controlRatio = changesWithControlActions / changesNeedingImpact;
      impactScore = Math.round(((riskRatio + controlRatio) / 2) * 100);
    } else {
      // No hay cambios de impacto MEDIUM+, el criterio se considera cumplido
      // (no hay nada que evaluar).
      impactScore = 100;
    }

    // Findings de impacto
    if (changesNeedingImpact > 0) {
      const missingRisk = changesNeedingImpact - changesWithRiskAnalysis;
      if (missingRisk > 0) {
        findings.push({
          id: 'change-missing-impact-analysis',
          module: 'change-management',
          title: `${missingRisk} cambio(s) sin análisis de riesgos SST`,
          description:
            'Existen cambios de impacto MEDIUM/HIGH/CRITICAL sin análisis de riesgos SST documentado. El estándar 2.11.1 requiere evaluación de impactos para cambios significativos.',
          priority: FindingPriority.HIGH,
          status: 'OPEN',
          responsible: '',
          dueDate: '',
          createdAt: new Date().toISOString(),
        });
      }

      const missingControls = changesNeedingImpact - changesWithControlActions;
      if (missingControls > 0) {
        findings.push({
          id: 'change-missing-control-actions',
          module: 'change-management',
          title: `${missingControls} cambio(s) sin acciones de control`,
          description:
            'Existen cambios de impacto MEDIUM/HIGH/CRITICAL sin acciones de control definidas. Implementar acciones de control antes, durante y después del cambio.',
          priority: FindingPriority.HIGH,
          status: 'OPEN',
          responsible: '',
          dueDate: '',
          createdAt: new Date().toISOString(),
        });
      }
    }

    // ── Criterio 3: Aprobación (20%) ──
    // Evalúa el flujo de aprobación formal.
    const approvalWeight = 20;
    let approvalScore = 0;
    const nonDraftChanges = totalChanges - draftChanges;
    if (nonDraftChanges > 0) {
      const positivelyProcessed = approvedChanges + implementedChanges;
      approvalScore = Math.round((positivelyProcessed / nonDraftChanges) * 100);
    } else {
      // Solo borradores: sin procesar aún
      approvalScore = 0;
    }

    // Findings de aprobación
    if (pendingApprovalChanges > 0) {
      findings.push({
        id: 'change-pending-approval',
        module: 'change-management',
        title: `${pendingApprovalChanges} cambio(s) pendiente(s) de aprobación`,
        description:
          'Existen solicitudes de cambio pendientes de revisión por parte de los aprobadores. Revisar y decidir sobre cada solicitud.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
      pending += pendingApprovalChanges;
    }

    if (rejectedChanges > 0) {
      findings.push({
        id: 'change-rejected',
        module: 'change-management',
        title: `${rejectedChanges} cambio(s) rechazado(s)`,
        description:
          'Existen solicitudes de cambio rechazadas. Revisar las razones de rechazo y presentar una nueva versión corregida si es necesario.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // ── Criterio 4: Implementación y seguimiento (20%) ──
    // Evalúa cambios implementados con seguimiento post-implementación.
    const implementationWeight = 20;
    let implementationScore = 0;
    if (implementedChanges > 0) {
      implementationScore = Math.round((implementedWithFollowUp / implementedChanges) * 100);
    } else {
      // No hay cambios implementados: criterio no aplica, se considera cumplido
      implementationScore = 100;
    }

    // Finding de seguimiento
    if (implementedChanges > 0) {
      const missingFollowUp = implementedChanges - implementedWithFollowUp;
      if (missingFollowUp > 0) {
        findings.push({
          id: 'change-missing-follow-up',
          module: 'change-management',
          title: `${missingFollowUp} cambio(s) implementado(s) sin seguimiento`,
          description:
            'Existen cambios implementados sin fecha de seguimiento post-implementación programada. El estándar 2.11.1 requiere verificar la efectividad del cambio.',
          priority: FindingPriority.MEDIUM,
          status: 'OPEN',
          responsible: '',
          dueDate: '',
          createdAt: new Date().toISOString(),
        });
        pending += missingFollowUp;
      } else {
        completed += implementedChanges;
      }
    }

    // ══════════════════════════════════════════════════════════
    // Cálculo del porcentaje total
    // ══════════════════════════════════════════════════════════

    const rawScore =
      (docsScore * docsWeight) / 100 +
      (impactScore * impactWeight) / 100 +
      (approvalScore * approvalWeight) / 100 +
      (implementationScore * implementationWeight) / 100;

    const percentage = Math.round(rawScore);

    // ── Status ──
    const status =
      totalChanges === 0
        ? 'NO_DATA'
        : percentage >= ChangeManagementProvider.COMPLIANCE_TARGET
          ? 'TARGET_MET'
          : 'TARGET_NOT_MET';

    // Completed = cambios aprobados + implementados
    completed += approvedChanges + implementedChanges;

    return {
      module: 'change-management',
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
