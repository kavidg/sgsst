import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { IncidentsService } from '../../incidents/incidents.service';
import { FindingPriority } from '../enums/finding-priority.enum';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

const CLOSED_STATUS = 'Cerrado';

/**
 * Cumplimiento operativo de incidentes: proporción de incidentes cerrados.
 */
@Injectable()
export class IncidentsProvider implements ComplianceProvider {
  constructor(private readonly incidentsService: IncidentsService) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const incidents = await this.incidentsService.findAll(new Types.ObjectId(companyId));
    const completed = incidents.filter((incident) => incident.status === CLOSED_STATUS).length;
    const open = incidents.filter((incident) => incident.status !== CLOSED_STATUS);
    const percentage = incidents.length > 0 ? Math.round((completed / incidents.length) * 100) : 0;

    const findings = open.map((incident, index) => ({
      id: `incident-${index}`,
      module: 'incidents',
      title: `Incidente abierto: ${incident.type}`,
      description: incident.description,
      priority: this.severityPriority(incident.severity),
      status: incident.status,
      responsible: '',
      dueDate: '',
      createdAt: new Date().toISOString(),
    }));

    return {
      module: 'incidents',
      percentage,
      status: classifyComplianceLevel(percentage),
      findings,
      pending: open.length,
      completed,
    };
  }

  private severityPriority(severity: string | undefined): FindingPriority {
    // Tolerancia a datos históricos incompletos: `severity` puede llegar
    // undefined/null en incidentes previos. Se normaliza a string vacío.
    const normalized = (severity ?? '').toLowerCase();
    if (normalized.includes('alta') || normalized.includes('critic') || normalized.includes('grave')) {
      return FindingPriority.HIGH;
    }
    return FindingPriority.MEDIUM;
  }
}
