import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  COMPANY_PROFILE_REQUIRED_FIELDS,
  CompanyProfileService,
} from '../../company-profile/company-profile.service';
import { StepId } from '../../implementation-wizard/schemas/implementation-wizard.schema';
import { deriveStepStatus } from '../implementation-calculator';
import {
  ProviderValidationResult,
  WizardValidationProvider,
} from '../interfaces/wizard-validation-provider.interface';

/**
 * Valida el paso `company_info` del Centro de Implementación usando el
 * porcentaje de completitud real del perfil de empresa
 * (CompanyProfileService.calculateCompletion).
 */
@Injectable()
export class CompanyInfoProvider implements WizardValidationProvider {
  readonly stepId: StepId = 'company_info';

  constructor(private readonly companyProfileService: CompanyProfileService) {}

  async getValidation(companyId: string): Promise<ProviderValidationResult> {
    try {
      const profile = await this.companyProfileService.getProfile(
        new Types.ObjectId(companyId),
      );
      const percentage = Math.max(
        0,
        Math.min(100, profile.completionPercentage ?? 0),
      );

      // Fuente única: la misma lista de CompanyProfileService.calculateCompletion.
      const requiredFields = COMPANY_PROFILE_REQUIRED_FIELDS;
      const filled = requiredFields.filter((field) => {
        const value = profile[field];
        return value !== undefined && value !== null && value !== '' && value !== 0;
      }).length;

      const hasWorkCenters = (profile.workCenters?.length ?? 0) > 0;
      const hasContacts = (profile.contacts?.length ?? 0) > 0;
      const hasDocuments = (profile.companyDocuments?.length ?? 0) > 0;
      const hasSstResponsible = Boolean(profile.responsibleSstUserId);

      return {
        stepId: this.stepId,
        percentage,
        status: deriveStepStatus(percentage),
        details: `Perfil de empresa completado al ${percentage}%`,
        criteria: [
          ...(filled > 0 ? [`${filled} de ${requiredFields.length} campos obligatorios completados`] : []),
          ...(hasWorkCenters ? ['Centros de trabajo registrados'] : []),
          ...(hasContacts ? ['Contactos registrados'] : []),
          ...(hasDocuments ? ['Documentos de empresa adjuntos'] : []),
          ...(hasSstResponsible ? ['Responsable SST asignado'] : []),
        ],
        pendingCriteria: [
          ...(filled >= requiredFields.length ? [] : ['Completar los campos obligatorios de la empresa']),
          ...(hasWorkCenters ? [] : ['Registrar centros de trabajo']),
          ...(hasContacts ? [] : ['Registrar contactos']),
          ...(hasDocuments ? [] : ['Adjuntar documentos de empresa']),
          ...(hasSstResponsible ? [] : ['Asignar responsable SST']),
        ],
        data: { completionPercentage: percentage, filled, requiredFields: requiredFields.length },
      };
    } catch {
      return {
        stepId: this.stepId,
        percentage: 0,
        status: 'PENDING',
        details: 'Perfil de empresa no disponible',
      };
    }
  }
}
