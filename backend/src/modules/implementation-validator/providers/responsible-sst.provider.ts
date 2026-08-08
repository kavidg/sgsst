import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { StepId } from '../../implementation-wizard/schemas/implementation-wizard.schema';
import { PhvaAdvancedService } from '../../phva-advanced/phva-advanced.service';
import {
  ResponsableSstApprovalStatus,
  ResponsableSstComplianceStatus,
} from '../../phva-advanced/schemas/phva-advanced-responsable-sst.schema';
import { deriveStepStatus } from '../implementation-calculator';
import {
  ProviderValidationResult,
  WizardValidationProvider,
} from '../interfaces/wizard-validation-provider.interface';

/**
 * Valida el paso `responsible_sst` del Centro de Implementación usando datos
 * reales del punto PHVA 1.1.1 (Responsable del SG-SST):
 *
 * - Responsable asignado (fullName + position).
 * - complianceStatus COMPLIES.
 * - Estado de aprobación APPROVED / APPROVED_AND_SIGNED.
 */
@Injectable()
export class ResponsibleSstProvider implements WizardValidationProvider {
  readonly stepId: StepId = 'responsible_sst';

  constructor(private readonly phvaAdvancedService: PhvaAdvancedService) {}

  async getValidation(companyId: string): Promise<ProviderValidationResult> {
    try {
      const record = await this.phvaAdvancedService.findResponsableSstByCompany(
        new Types.ObjectId(companyId),
      );

      let percentage = 0;
      const assigned = Boolean(
        String(record.fullName ?? '').trim() && String(record.position ?? '').trim(),
      );
      if (assigned) percentage += 40;

      const complies =
        record.complianceStatus === ResponsableSstComplianceStatus.COMPLIES;
      if (complies) percentage += 30;

      const approved =
        record.approvalStatus === ResponsableSstApprovalStatus.APPROVED ||
        record.approvalStatus === ResponsableSstApprovalStatus.APPROVED_AND_SIGNED;
      if (approved) percentage += 30;

      percentage = Math.max(0, Math.min(100, percentage));

      return {
        stepId: this.stepId,
        percentage,
        status: deriveStepStatus(percentage),
        details: `Responsable SG-SST ${record.fullName || 'sin asignar'}: ${record.complianceStatus} / ${record.approvalStatus}`,
        criteria: ['Responsable asignado', 'Cumplimiento COMPLIES', 'Aprobado/firmado'],
        pendingCriteria: [
          ...(assigned ? [] : ['Asignar responsable SST']),
          ...(complies ? [] : ['Completar datos y evidencias del responsable']),
          ...(approved ? [] : ['Enviar y aprobar el punto PHVA 1.1.1']),
        ],
        data: {
          assigned,
          complies,
          approved,
          complianceStatus: record.complianceStatus,
          approvalStatus: record.approvalStatus,
        },
      };
    } catch {
      return {
        stepId: this.stepId,
        percentage: 0,
        status: 'PENDING',
        details: 'Responsable SG-SST no encontrado',
      };
    }
  }
}
