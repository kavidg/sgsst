import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { PhvaAdvancedService } from '../../phva-advanced/phva-advanced.service';
import { FindingPriority } from '../enums/finding-priority.enum';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';

/**
 * Cumplimiento de Emergencias (1.1.10) a partir del módulo PHVA Advanced.
 *
 * Evalúa:
 * - Plan de emergencias vigente
 * - Brigadas configuradas
 * - Equipos operativos
 * - Simulacros ejecutados
 * - Rutas de evacuación
 */
@Injectable()
export class EmergenciesProvider implements ComplianceProvider {
  constructor(private readonly phvaAdvancedService: PhvaAdvancedService) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);
    const record = await this.phvaAdvancedService.findOrCreateEmergencies(companyObjectId);

    const plan = record.plan ?? {};
    const brigades = record.brigades ?? [];
    const equipment = record.equipment ?? [];
    const drills = record.drills ?? [];
    const evacuationRoutes = record.evacuationRoutes ?? [];

    const findings: ProviderComplianceResult['findings'] = [];

    // Check plan
    const hasPlan = Boolean(plan.planName);
    const planVigent = plan.expirationDate ? new Date(plan.expirationDate).getTime() > Date.now() : false;

    if (!hasPlan) {
      findings.push({
        id: 'emer-plan-0',
        module: 'emergencies',
        title: 'Sin plan de emergencias configurado',
        description: 'No se ha configurado el plan de emergencias de la empresa.',
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    } else if (!planVigent) {
      findings.push({
        id: 'emer-plan-expired',
        module: 'emergencies',
        title: 'Plan de emergencias vencido',
        description: `El plan de emergencias venció el ${plan.expirationDate}. Actualizar la versión vigente.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: plan.approvedBy ?? '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Check brigades
    if (brigades.length === 0) {
      findings.push({
        id: 'emer-brigade-0',
        module: 'emergencies',
        title: 'Sin brigadas configuradas',
        description: 'No se han creado brigadas de emergencia.',
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Check equipment
    const expiredEquipment = equipment.filter(
      (e) => e.nextInspectionDate && new Date(e.nextInspectionDate).getTime() < Date.now(),
    );
    if (expiredEquipment.length > 0) {
      findings.push({
        id: 'emer-equipment-expired',
        module: 'emergencies',
        title: `${expiredEquipment.length} equipo(s) con inspección vencida`,
        description: 'Equipos de emergencia con fecha de inspección vencida.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Check drills
    const executedDrills = drills.filter((d) => d.status === 'Ejecutado' || d.status === 'Completado');
    const pendingDrills = drills.filter((d) => d.status !== 'Ejecutado' && d.status !== 'Completado');

    // Calculate score
    let score = 0;
    const total = 5;
    if (hasPlan && planVigent) score++;
    if (brigades.length > 0) score++;
    if (equipment.length > 0 && expiredEquipment.length === 0) score++;
    if (evacuationRoutes.length > 0) score++;
    if (drills.length > 0 && pendingDrills.length === 0) score++;

    const percentage = Math.round((score / total) * 100);

    return {
      module: 'emergencies',
      percentage,
      status: classifyComplianceLevel(percentage),
      findings,
      pending: expiredEquipment.length + pendingDrills.length,
      completed: executedDrills.length + (hasPlan ? 1 : 0),
      // Preparación ante emergencias: brigadas, equipos, simulacros, rutas.
      // El porcentaje representa preparación/ejecución real → HACER.
      // Fuente independiente: datos de PHVA Advanced.
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
