import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { StepId } from '../../implementation-wizard/schemas/implementation-wizard.schema';
import { PhvaAdvancedService } from '../../phva-advanced/phva-advanced.service';
import { PolicySignatureStatus, SstPolicyStatus } from '../../phva-advanced/schemas/phva-advanced-sst-policy.schema';
import { deriveStepStatus } from '../implementation-calculator';
import {
  ProviderValidationResult,
  WizardValidationProvider,
} from '../interfaces/wizard-validation-provider.interface';

/**
 * Valida el paso `sst_policy` del Centro de Implementación usando la política
 * de Seguridad y Salud en el Trabajo real (PHVA 2.1.1):
 *
 * - Política creada (documentCode / contenido presente).
 * - Estado APPROVED (SstPolicyStatus.APPROVED = 'Aprobado').
 * - Firmas requeridas completas (PolicySignatureStatus.SIGNED).
 */
@Injectable()
export class SstPolicyProvider implements WizardValidationProvider {
  readonly stepId: StepId = 'sst_policy';

  constructor(private readonly phvaAdvancedService: PhvaAdvancedService) {}

  async getValidation(companyId: string): Promise<ProviderValidationResult> {
    try {
      const policy = await this.phvaAdvancedService.findSstPolicyByCompany(
        new Types.ObjectId(companyId),
      );

      let percentage = 0;
      const created = Boolean(
        String(policy.documentCode ?? '').trim() ||
          String(policy.content ?? '').trim(),
      );
      if (created) percentage += 40;

      const approved = policy.status === SstPolicyStatus.APPROVED;
      if (approved) percentage += 30;

      const signatures = policy.signatures ?? [];
      const requiredSignatures = signatures.filter((signature) => signature.required);
      const allRequiredSigned =
        requiredSignatures.length > 0 &&
        requiredSignatures.every(
          (signature) => signature.status === PolicySignatureStatus.SIGNED,
        );
      if (allRequiredSigned) percentage += 30;

      percentage = Math.max(0, Math.min(100, percentage));

      return {
        stepId: this.stepId,
        percentage,
        status: deriveStepStatus(percentage),
        details: `Política SST: ${policy.status} · ${signatures.length} firma(s), ${requiredSignatures.length} requerida(s) firmada(s)`,
        criteria: ['Política creada', 'Estado Aprobado', 'Firmas requeridas completas'],
        pendingCriteria: [
          ...(created ? [] : ['Crear el contenido de la política SST']),
          ...(approved ? [] : ['Aprobar la política SST']),
          ...(allRequiredSigned ? [] : ['Completar firmas requeridas']),
        ],
        data: {
          created,
          approved,
          allRequiredSigned,
          status: policy.status,
          requiredSignatures: requiredSignatures.length,
          signedRequired: requiredSignatures.filter(
            (signature) => signature.status === PolicySignatureStatus.SIGNED,
          ).length,
        },
      };
    } catch {
      return {
        stepId: this.stepId,
        percentage: 0,
        status: 'PENDING',
        details: 'Política SST no encontrada',
      };
    }
  }
}
