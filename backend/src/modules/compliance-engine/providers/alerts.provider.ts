import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { AlertsService } from '../../alerts/alerts.service';
import { Alert, AlertSeverity } from '../../alerts/schemas/alert.schema';
import { ComplianceAlertDto } from '../dto/compliance-overview.dto';
import { FindingPriority } from '../enums/finding-priority.enum';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/** Alerta con el identificador de documento incluido por Mongoose. */
type AlertWithId = Alert & { _id: Types.ObjectId };

/**
 * Alertas operativas: expone las alertas reales del módulo de alertas y
 * convierte las alertas de severidad alta en hallazgos críticos.
 */
@Injectable()
export class AlertsProvider implements ComplianceProvider {
  constructor(private readonly alertsService: AlertsService) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const alerts = (await this.alertsService.findByCompany(companyId)) as AlertWithId[];
    const critical = alerts.filter((alert) => alert.severity === AlertSeverity.HIGH);
    const nonCritical = alerts.length - critical.length;
    const percentage = alerts.length > 0 ? Math.round((nonCritical / alerts.length) * 100) : 100;

    const findings = critical.map((alert, index) => ({
      id: `alert-${index}`,
      module: 'alerts',
      title: alert.type,
      description: alert.message,
      priority: FindingPriority.CRITICAL,
      status: alert.isRead ? 'CLOSED' : 'OPEN',
      responsible: '',
      dueDate: '',
      createdAt: alert.createdAt ? alert.createdAt.toISOString() : new Date().toISOString(),
    }));

    return {
      module: 'alerts',
      percentage,
      status: classifyComplianceLevel(percentage),
      findings,
      pending: alerts.filter((alert) => !alert.isRead).length,
      completed: alerts.filter((alert) => alert.isRead).length,
      alerts: alerts.map((alert) => this.toAlertDto(alert)),
    };
  }

  private toAlertDto(alert: AlertWithId): ComplianceAlertDto {
    return {
      id: alert._id.toString(),
      severity: this.toFindingPriority(alert.severity),
      title: alert.type,
      message: alert.message,
      createdAt: alert.createdAt ? alert.createdAt.toISOString() : new Date().toISOString(),
    };
  }

  private toFindingPriority(severity: AlertSeverity): FindingPriority {
    if (severity === AlertSeverity.HIGH) return FindingPriority.HIGH;
    if (severity === AlertSeverity.MEDIUM) return FindingPriority.MEDIUM;
    return FindingPriority.LOW;
  }
}
