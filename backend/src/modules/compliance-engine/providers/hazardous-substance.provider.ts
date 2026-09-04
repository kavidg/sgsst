import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  HazardousSubstance,
  HazardousSubstanceDocument,
  HazardousSubstanceStatus,
  SdsStatus,
} from '../../risks/schemas/hazardous-substance.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 4.1.3
 * "Sustancias peligrosas".
 *
 * Evalúa la existencia y calidad del inventario de sustancias
 * químicas peligrosas, incluyendo SDS/HDS y controles implementados.
 *
 * CRÍTICO: Este provider evalúa EXCLUSIVAMENTE HazardousSubstance.
 * NO evalúa Risk (4.1.1).
 * NO evalúa WorkerParticipation (4.1.2).
 * NO evalúa COPASST ni Convivencia.
 *
 * Fuentes de datos:
 * - HazardousSubstance.status (solo ACTIVE)
 * - HazardousSubstance.sdsStatus
 * - HazardousSubstance.controlsImplemented
 *
 * Criterios y pesos (PROPUESTOS — NO NORMATIVOS):
 * - Existencia de registros activos:  33%
 * - Estado de SDS/HDS:               34%
 * - Controles implementados:         33%
 *
 * NO_DATA: sin registros ACTIVE.
 * TARGET_MET: todos los registros activos con SDS CURRENT y controles.
 * TARGET_NOT_MET: sin registros, SDS incompleta o controles ausentes.
 */
@Injectable()
export class HazardousSubstanceProvider implements ComplianceProvider {
  private static readonly MODULE = 'hazardous-substance';
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(HazardousSubstance.name)
    private readonly substanceModel: Model<HazardousSubstanceDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    const allSubstances = await this.substanceModel
      .find({ companyId: companyObjectId })
      .sort({ createdAt: -1 })
      .exec();

    // Filter to ACTIVE only for compliance evaluation
    const activeSubstances = allSubstances.filter(
      (s) => s.status === HazardousSubstanceStatus.ACTIVE,
    );

    // ── NO_DATA ──
    if (activeSubstances.length === 0) {
      return {
        module: HazardousSubstanceProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'hazardous-substance-no-data',
            module: HazardousSubstanceProvider.MODULE,
            title: 'Sin registros activos de sustancias peligrosas',
            description:
              'No existen registros activos de sustancias químicas peligrosas en el inventario. El estándar 4.1.3 requiere un inventario documentado de sustancias peligrosas con SDS y controles.',
            priority: FindingPriority.HIGH,
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
        pending: 0,
        completed: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const totalActive = activeSubstances.length;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 1 — Existencia de registros activos (33%)
    //
    // Si existen registros ACTIVE → 1.0
    // ══════════════════════════════════════════════════════════
    const existenceScore = 1;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 2 — Estado de SDS/HDS (34%)
    //
    // Evalúa qué proporción de registros ACTIVE tienen SDS CURRENT.
    // CURRENT = SDS vigente y usable.
    // EXPIRED = SDS existente pero vencida.
    // PENDING = SDS en trámite.
    // NOT_AVAILABLE = sin SDS.
    // ══════════════════════════════════════════════════════════
    const withCurrentSds = activeSubstances.filter(
      (s) => s.sdsStatus === SdsStatus.CURRENT,
    ).length;
    const withExpiredSds = activeSubstances.filter(
      (s) => s.sdsStatus === SdsStatus.EXPIRED,
    ).length;
    const withPendingSds = activeSubstances.filter(
      (s) => s.sdsStatus === SdsStatus.PENDING,
    ).length;
    const withUsableSds = withCurrentSds; // Only CURRENT is "usable"
    const sdsScore = withCurrentSds / totalActive;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 3 — Controles implementados (33%)
    //
    // Un registro cuenta como "con controles" solamente cuando
    // controlsImplemented contiene contenido significativo
    // después de trim.
    // ══════════════════════════════════════════════════════════
    const withControls = activeSubstances.filter(
      (s) => s.controlsImplemented && s.controlsImplemented.trim().length > 0,
    ).length;
    const controlsScore = withControls / totalActive;

    // ══════════════════════════════════════════════════════════
    // CÁLCULO FINAL (33/34/33)
    //
    // PROPUESTO — NO NORMATIVO.
    // Los pesos son una propuesta funcional del proyecto,
    // NO pesos normativos explícitos de la Resolución 0312.
    // ══════════════════════════════════════════════════════════
    const percentage = Math.round(
      existenceScore * 33 +
      sdsScore * 34 +
      controlsScore * 33,
    );

    // ── Status ──
    const status =
      percentage >= HazardousSubstanceProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET';

    // ── Findings ──
    const findings: ProviderComplianceResult['findings'] = [];

    // Finding: no SDS CURRENT in any active record
    if (withCurrentSds === 0) {
      findings.push({
        id: 'hazardous-substance-no-sds',
        module: HazardousSubstanceProvider.MODULE,
        title: 'Sin Hojas de Datos de Seguridad vigentes',
        description:
          `Los ${totalActive} registros activos de sustancias peligrosas no tienen SDS/HDS en estado CURRENT. El estándar 4.1.3 requiere SDS vigentes para cada sustancia.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    } else if (withCurrentSds < totalActive) {
      // Partial SDS coverage
      const missing = totalActive - withCurrentSds;
      findings.push({
        id: 'hazardous-substance-partial-sds',
        module: HazardousSubstanceProvider.MODULE,
        title: `${missing} sustancias sin SDS vigente`,
        description:
          `${missing} de ${totalActive} sustancias activas no tienen SDS/HDS en estado CURRENT. ${withExpiredSds > 0 ? `${withExpiredSds} con SDS vencida. ` : ''}${withPendingSds > 0 ? `${withPendingSds} con SDS en trámite.` : ''}`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: expired SDS (only if there are expired and at least some CURRENT or total > 0)
    if (withExpiredSds > 0) {
      findings.push({
        id: 'hazardous-substance-expired-sds',
        module: HazardousSubstanceProvider.MODULE,
        title: `${withExpiredSds} sustancias con SDS vencida`,
        description:
          `${withExpiredSds} de ${totalActive} sustancias activas tienen SDS/HDS en estado EXPIRED. Actualizar las SDS vencidas para mantener la trazabilidad documental.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: no controls in any active record
    if (withControls === 0) {
      findings.push({
        id: 'hazardous-substance-no-controls',
        module: HazardousSubstanceProvider.MODULE,
        title: 'Sin controles implementados registrados',
        description:
          `Los ${totalActive} registros activos de sustancias peligrosas no tienen controles implementados documentados. El estándar 4.1.3 requiere evidencia de controles para manipulación, almacenamiento y disposición.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    } else if (withControls < totalActive) {
      // Partial controls coverage
      const missing = totalActive - withControls;
      findings.push({
        id: 'hazardous-substance-partial-controls',
        module: HazardousSubstanceProvider.MODULE,
        title: `${missing} sustancias sin controles documentados`,
        description:
          `${missing} de ${totalActive} sustancias activas no tienen controles implementados registrados. Completar la documentación de controles para manipulación, almacenamiento y disposición.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    return {
      module: HazardousSubstanceProvider.MODULE,
      percentage,
      status,
      findings,
      pending: totalActive - withCurrentSds,
      completed: withCurrentSds,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
