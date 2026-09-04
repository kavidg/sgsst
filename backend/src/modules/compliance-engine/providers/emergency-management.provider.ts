import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SstEmergencies, SstEmergenciesDocument } from '../../phva-advanced/schemas/phva-advanced-emergencies.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 4.4.1
 * "Gestión de emergencias".
 *
 * Evalúa la gestión de emergencias: plan, brigadas, equipos,
 * simulacros, rutas de evacuación.
 *
 * Criterios (25/25/25/25):
 * - Plan de emergencias configurado y vigente:     25%
 * - Brigadas y responsables definidos:             25%
 * - Equipos de emergencia operativos:              25%
 * - Simulacros ejecutados:                         25%
 *
 * NOTA: Contribuye a phases.do (HACER).
 */
@Injectable()
export class EmergencyManagementProvider implements ComplianceProvider {
  private static readonly MODULE = 'emergency-management';
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(SstEmergencies.name)
    private readonly emergenciesModel: Model<SstEmergenciesDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);
    const records = await this.emergenciesModel.find({ companyId: companyObjectId }).exec();

    if (records.length === 0) {
      return {
        module: EmergencyManagementProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [{
          id: 'emergency-management-no-data',
          module: EmergencyManagementProvider.MODULE,
          title: 'Sin datos de gestión de emergencias',
          description: 'No existen registros de gestión de emergencias. El estándar 4.4.1 requiere plan de emergencias, brigadas, equipos y simulacros.',
          priority: FindingPriority.HIGH,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        }],
        pending: 0, completed: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const record = records[0] as any;
    const plan = record.plan ?? {};
    const brigades = record.brigades ?? [];
    const equipment = record.equipment ?? [];
    const drills = record.drills ?? [];
    const evacuationRoutes = record.evacuationRoutes ?? [];

    const findings: ProviderComplianceResult['findings'] = [];

    // ── Criterion 1: Plan exists and is current (25%) ──
    const hasPlan = Boolean(plan.planName && plan.planName.trim().length > 0);
    const planVigent = plan.expirationDate
      ? new Date(plan.expirationDate).getTime() > Date.now()
      : false;

    let planScore = 0;
    if (hasPlan && planVigent) {
      planScore = 1;
    } else if (hasPlan && !planVigent) {
      planScore = 0.4;
      findings.push({
        id: 'emergency-management-expired',
        module: EmergencyManagementProvider.MODULE,
        title: 'Plan de emergencias vencido',
        description: `El plan de emergencias venció el ${plan.expirationDate}. Actualizar la versión vigente.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN', responsible: plan.approvedBy ?? '', dueDate: '', createdAt: new Date().toISOString(),
      });
    } else {
      findings.push({
        id: 'emergency-management-no-plan',
        module: EmergencyManagementProvider.MODULE,
        title: 'Sin plan de emergencias',
        description: 'No se ha configurado el plan de emergencias de la empresa.',
        priority: FindingPriority.HIGH,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    // ── Criterion 2: Brigades defined (25%) ──
    const brigadeScore = brigades.length > 0 ? 1 : 0;
    if (brigades.length === 0) {
      findings.push({
        id: 'emergency-management-no-brigades',
        module: EmergencyManagementProvider.MODULE,
        title: 'Sin brigadas configuradas',
        description: 'No se han creado brigadas de emergencia.',
        priority: FindingPriority.HIGH,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    // ── Criterion 3: Equipment operational (25%) ──
    const now = new Date();
    const expiredEquipment = equipment.filter(
      (e: any) => e.nextInspectionDate && new Date(e.nextInspectionDate).getTime() < now.getTime(),
    );
    const operationalEquipment = equipment.filter(
      (e: any) => e.status === 'OPERATIVO' || e.status === 'Operativo',
    );
    let equipmentScore = 0;
    if (equipment.length > 0) {
      equipmentScore = operationalEquipment.length / equipment.length;
      if (expiredEquipment.length > 0) {
        equipmentScore *= 0.7; // Penalty for expired inspections
        findings.push({
          id: 'emergency-management-expired-equipment',
          module: EmergencyManagementProvider.MODULE,
          title: `${expiredEquipment.length} equipo(s) con inspección vencida`,
          description: `${expiredEquipment.length} equipos de emergencia tienen fecha de inspección vencida.`,
          priority: FindingPriority.MEDIUM,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        });
      }
    }

    // ── Criterion 4: Drills executed (25%) ──
    const executedDrills = drills.filter(
      (d: any) => d.status === 'Ejecutado' || d.status === 'Completado' || d.status === 'Completada',
    );
    let drillScore = 0;
    if (drills.length > 0) {
      drillScore = executedDrills.length / drills.length;
    }
    if (drills.length === 0) {
      findings.push({
        id: 'emergency-management-no-drills',
        module: EmergencyManagementProvider.MODULE,
        title: 'Sin simulacros registrados',
        description: 'No se han registrado simulacros de emergencia.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    } else if (executedDrills.length < drills.length) {
      const pending = drills.length - executedDrills.length;
      findings.push({
        id: 'emergency-management-pending-drills',
        module: EmergencyManagementProvider.MODULE,
        title: `${pending} simulacro(s) pendiente(s)`,
        description: `${pending} simulacros programados aún no han sido ejecutados.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const percentage = Math.round(
      planScore * 25 +
      brigadeScore * 25 +
      equipmentScore * 25 +
      drillScore * 25,
    );

    return {
      module: EmergencyManagementProvider.MODULE,
      percentage,
      status: percentage >= EmergencyManagementProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      pending: expiredEquipment.length + (drills.length - executedDrills.length),
      completed: executedDrills.length + (hasPlan ? 1 : 0) + operationalEquipment.length,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
