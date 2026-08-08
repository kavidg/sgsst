import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { RisksService } from '../../risks/risks.service';
import { FindingPriority } from '../enums/finding-priority.enum';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/** Umbral de nivel de riesgo alto (consistente con el dashboard). */
const HIGH_RISK_THRESHOLD = 12;

/**
 * Cumplimiento en gestión de riesgos: proporción de riesgos bajo control
 * (nivel de riesgo inferior al umbral alto).
 */
@Injectable()
export class RisksProvider implements ComplianceProvider {
  constructor(private readonly risksService: RisksService) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const risks = await this.risksService.findAll(new Types.ObjectId(companyId));
    const highRisks = risks.filter((risk) => risk.riskLevel >= HIGH_RISK_THRESHOLD);
    const controlled = risks.length - highRisks.length;
    const percentage = risks.length > 0 ? Math.round((controlled / risks.length) * 100) : 0;

    const findings = highRisks.map((risk, index) => ({
      id: `risk-${index}`,
      module: 'risks',
      title: `Riesgo alto: ${risk.risk}`,
      description: `Nivel de riesgo ${risk.riskLevel}. Actividad: ${risk.activity}. Medidas: ${risk.controlMeasures}`,
      priority: risk.riskLevel >= 20 ? FindingPriority.CRITICAL : FindingPriority.HIGH,
      status: 'OPEN',
      responsible: '',
      dueDate: '',
      createdAt: new Date().toISOString(),
    }));

    return {
      module: 'risks',
      percentage,
      status: classifyComplianceLevel(percentage),
      findings,
      pending: highRisks.length,
      completed: controlled,
    };
  }
}
