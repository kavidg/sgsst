import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Maintenance, MaintenanceDocument } from '../../maintenance/schemas/maintenance.schema';
// NORMALIZACIÓN: lectura tolerante de status (variantes históricas del proxy
// legacy sobre InspectionActivity + variantes en español), escritura canónica.
import { isMaintenanceCancelled, isMaintenanceCompleted } from '../../maintenance/utils/maintenance-status.util';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import {
  MAINTENANCE_SCORE_WEIGHTS,
  closureEvidenceOf,
  computeMaintenanceScore,
} from './maintenance-scoring';

/**
 * Evaluación automática del estándar 4.2.5 — "Mantenimiento".
 *
 * Fuente EXCLUSIVA: colección propia `Maintenance` (módulo /maintenance).
 * NO consume InspectionActivity (4.2.4) — frontera anti-double-scoring.
 *
 * ETAPA 6C — Fórmula específica de mantenimiento (reemplaza la heredada
 * 25/30/25/20 auditada en la Etapa 6B), por dimensiones normativas:
 *
 *   PROGRAMA      25  — planificación preventiva (solo PREVENTIVE cuenta)
 *   EJECUCIÓN     35  — completados válidos (fecha + evidencia de cierre) / evaluables
 *   OPORTUNIDAD   25  — completados a tiempo (completedDate <= plannedDate) / completados
 *   TRAZABILIDAD  15  — completados con evidencia de cierre + información de cierre
 *
 * - CANCELLED queda fuera de los denominadores (no premia, no castiga).
 * - OVERDUE es dinámico: no recibe penalización adicional (ya resta por ejecución).
 * - Sin denominador en una dimensión → redistribución proporcional de pesos
 *   (ver maintenance-scoring.ts, función única y determinista).
 * - Gestión puramente correctiva → tope 60 (sin programa preventivo).
 * - Sin registros evaluables → NO_DATA (convención del ComplianceEngine).
 *
 * CONTRATO: { module, percentage, status, findings, pending, completed,
 * overdue, phases } + metadata (opcional en el contrato del provider).
 * COMPLIANCE_TARGET = 90 se conserva (decisión del Paso 15).
 */
/** Umbral mínimo del score para reportar el tope reactivo (evita ruido en scores bajos). */
const MAINTENANCE_REACTIVE_CAP_NOTE_MIN = 40;

@Injectable()
export class MaintenanceProvider implements ComplianceProvider {
  private static readonly MODULE = 'maintenance';
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(Maintenance.name)
    private readonly maintenanceModel: Model<MaintenanceDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);
    // PASO 20 — Performance: UNA consulta tenant-scoped + cálculo en memoria.
    const records = await this.maintenanceModel.find({ companyId: companyObjectId }).exec();

    // Evaluables = no CANCELLED. Si no queda ninguno (colección vacía o todo
    // cancelado) → NO_DATA: no hay evidencia evaluable (nunca un 100 artificial).
    const evaluated = records.filter((r) => !isMaintenanceCancelled(String(r.status)));
    if (evaluated.length === 0) {
      return {
        module: MaintenanceProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [{
          id: 'maintenance-no-data',
          module: MaintenanceProvider.MODULE,
          title: 'Sin actividades de mantenimiento registradas',
          description: 'No existen actividades de mantenimiento evaluables. El estándar 4.2.5 requiere un programa de mantenimiento preventivo y correctivo documentado.',
          priority: FindingPriority.HIGH,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        }],
        pending: 0, completed: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
        metadata: {
          semantic: 'EXACT',
          standardCode: '4.2.5',
          phase: 'do',
          formula: 'dimensions:v1',
          weights: { ...MAINTENANCE_SCORE_WEIGHTS },
        },
      };
    }

    const breakdown = computeMaintenanceScore(records as Maintenance[]);
    const percentage = breakdown.score;

    const findings: ProviderComplianceResult['findings'] = [];

    if (breakdown.counters.overdue > 0) {
      findings.push({
        id: 'maintenance-overdue',
        module: MaintenanceProvider.MODULE,
        title: `${breakdown.counters.overdue} actividad(es) de mantenimiento vencida(s)`,
        description: `${breakdown.counters.overdue} mantenimientos tienen fecha vencida sin completar.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    // Único finding adicional (Paso 18): explica el tope reactivo cuando el
    // score está limitado por ausencia total de programa preventivo.
    if (breakdown.cappedAt60 && percentage >= MAINTENANCE_REACTIVE_CAP_NOTE_MIN) {
      findings.push({
        id: 'maintenance-no-preventive-program',
        module: MaintenanceProvider.MODULE,
        title: 'Sin programa de mantenimiento preventivo',
        description: 'Todos los mantenimientos registrados son correctivos. La gestión reactiva demuestra actividad, pero no evidencia un programa preventivo: el cumplimiento de 4.2.5 queda limitado a 60.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    // Contadores coherentes con el nuevo modelo (Paso 18):
    // - completed: completados válidos (fecha + evidencia de cierre).
    // - pending: evaluables aún no completados (los CANCELLED no cuentan).
    const completed = breakdown.counters.completedValid;
    const pending = breakdown.counters.evaluated - completed;

    return {
      module: MaintenanceProvider.MODULE,
      percentage,
      status: percentage >= MaintenanceProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      pending,
      completed,
      overdue: breakdown.counters.overdue,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
      metadata: {
        semantic: 'EXACT',
        standardCode: '4.2.5',
        phase: 'do',
        formula: 'dimensions:v1',
        weights: { ...MAINTENANCE_SCORE_WEIGHTS },
        dimensions: {
          program: breakdown.dimensions.program.ratio,
          execution: breakdown.dimensions.execution.ratio,
          opportunity: breakdown.dimensions.opportunity.ratio,
          traceability: breakdown.dimensions.traceability.ratio,
        },
        hasPreventiveProgram: breakdown.hasPreventiveProgram,
        cappedAt60: breakdown.cappedAt60,
      },
    };
  }
}

/** Re-export para uso externo (tests de frontera, auditorías). */
export { closureEvidenceOf };
