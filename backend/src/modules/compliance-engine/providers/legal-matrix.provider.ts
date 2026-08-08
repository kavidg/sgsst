import { Injectable } from '@nestjs/common';
import { LegalMatrixService } from '../../legal-matrix/legal-matrix.service';
import { FindingPriority } from '../enums/finding-priority.enum';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Cumplimiento de la matriz legal. Reutiliza el cálculo existente
 * LegalMatrixService.getMatrixCompliance.
 */
@Injectable()
export class LegalMatrixProvider implements ComplianceProvider {
  constructor(private readonly legalMatrixService: LegalMatrixService) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    try {
      const compliance = await this.legalMatrixService.getMatrixCompliance(companyId);
      const findings =
        compliance.noCumplen > 0
          ? [
              {
                id: 'legal-matrix-non-compliant',
                module: 'legal-matrix',
                title: `${compliance.noCumplen} requisitos legales sin cumplir`,
                description: 'Existen requisitos de la matriz legal en estado NO_CUMPLE.',
                priority: FindingPriority.HIGH,
                status: 'OPEN',
                responsible: '',
                dueDate: '',
                createdAt: new Date().toISOString(),
              },
            ]
          : [];

      return {
        module: 'legal-matrix',
        percentage: compliance.compliancePercentage,
        status: classifyComplianceLevel(compliance.compliancePercentage),
        findings,
        pending: compliance.pendiente + compliance.noCumplen,
        completed: compliance.cumplen,
      };
    } catch {
      return {
        module: 'legal-matrix',
        percentage: 0,
        status: 'NO_DATA',
        findings: [],
        pending: 0,
        completed: 0,
      };
    }
  }
}
