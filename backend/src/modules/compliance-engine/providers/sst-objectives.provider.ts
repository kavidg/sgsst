import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { PhvaAdvancedService } from '../../phva-advanced/phva-advanced.service';
import { FindingPriority } from '../enums/finding-priority.enum';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';

/**
 * Cumplimiento de Objetivos SST (2.2.1) a partir del módulo PHVA Advanced.
 *
 * Calcula el porcentaje de avance global sumando el `currentProgress` de cada
 * objetivo y comparándolo con su `targetProgress`.  Objetivos sin medición
 * manual ni automática se consideran pendientes.
 */
@Injectable()
export class SstObjectivesProvider implements ComplianceProvider {
  constructor(private readonly phvaAdvancedService: PhvaAdvancedService) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);
    const record = await this.phvaAdvancedService.findSstObjectives(companyObjectId);

    if (!record) {
      return {
        module: 'sst-objectives',
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'sst-obj-0',
            module: 'sst-objectives',
            title: 'Sin objetivos SST configurados',
            description:
              'No se han definido objetivos SST para la empresa. Crear al menos un objetivo asociado a un estándar del SG-SST.',
            priority: FindingPriority.HIGH,
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
        pending: 0,
        completed: 0,
        phases: { plan: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const objectives = record.objectives ?? [];
    const totalObjectives = objectives.length;

    if (totalObjectives === 0) {
      return {
        module: 'sst-objectives',
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'sst-obj-0',
            module: 'sst-objectives',
            title: 'Sin objetivos SST configurados',
            description:
              'No se han definido objetivos SST para la empresa. Crear al menos un objetivo asociado a un estándar del SG-SST.',
            priority: FindingPriority.HIGH,
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
        pending: 0,
        completed: 0,
        phases: { plan: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    let totalProgress = 0;
    const overdueObjectives: typeof objectives = [];
    const lowProgressObjectives: typeof objectives = [];

    for (const obj of objectives) {
      const target = obj.targetProgress ?? 100;
      const current = obj.currentProgress ?? 0;
      totalProgress += target > 0 ? (current / target) * 100 : 0;

      if (current === 0 && target > 0) {
        overdueObjectives.push(obj);
      } else if (target > 0 && (current / target) * 100 < 50) {
        lowProgressObjectives.push(obj);
      }
    }

    const percentage = Math.round(totalProgress / totalObjectives);

    const findings = [
      ...overdueObjectives.map((obj, index) => ({
        id: `sst-obj-overdue-${index}`,
        module: 'sst-objectives',
        title: `Objetivo SST sin avance: ${obj.name ?? obj.objectiveId ?? 'Sin nombre'}`,
        description:
          `El objetivo "${obj.name ?? obj.objectiveId}" no tiene progreso registrado (0/${obj.targetProgress ?? 100}).`,
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: obj.responsible ?? '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      })),
      ...lowProgressObjectives.map((obj, index) => ({
        id: `sst-obj-low-${index}`,
        module: 'sst-objectives',
        title: `Objetivo SST con bajo avance: ${obj.name ?? obj.objectiveId ?? 'Sin nombre'}`,
        description:
          `El objetivo "${obj.name ?? obj.objectiveId}" tiene avance del ${Math.round(((obj.currentProgress ?? 0) / (obj.targetProgress ?? 100)) * 100)}%.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: obj.responsible ?? '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      })),
    ];

    return {
      module: 'sst-objectives',
      percentage,
      status: classifyComplianceLevel(percentage),
      findings,
      pending: overdueObjectives.length + lowProgressObjectives.length,
      completed: totalObjectives - overdueObjectives.length - lowProgressObjectives.length,
      phases: { plan: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
