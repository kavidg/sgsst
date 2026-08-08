import { Injectable } from '@nestjs/common';
import { StepId } from '../../implementation-wizard/schemas/implementation-wizard.schema';
import { CommunicationService } from '../../communication/communication.service';
import { deriveStepStatus } from '../implementation-calculator';
import {
  ProviderValidationResult,
  WizardValidationProvider,
} from '../interfaces/wizard-validation-provider.interface';

/**
 * Valida el paso `communication` del Centro de Implementación usando las
 * comunicaciones internas reales:
 *
 * - Existe comunicación SST publicada (status PUBLISHED).
 * - Campañas o socializaciones registradas.
 */
@Injectable()
export class CommunicationProvider implements WizardValidationProvider {
  readonly stepId: StepId = 'communication';

  constructor(private readonly communicationService: CommunicationService) {}

  async getValidation(companyId: string): Promise<ProviderValidationResult> {
    try {
      const [comms, campaigns, surveys] = await Promise.all([
        this.communicationService.findAllComms(companyId).catch(() => []),
        this.communicationService.findAllCampaigns(companyId).catch(() => []),
        this.communicationService.findAllSurveys(companyId).catch(() => []),
      ]);

      const published = (comms ?? []).filter(
        (comm) => String(comm.status ?? '') === 'PUBLISHED',
      );

      let percentage = 0;
      if (published.length > 0) percentage += 60;
      if ((campaigns ?? []).length > 0 || (surveys ?? []).length > 0) {
        percentage += 40;
      }
      percentage = Math.max(0, Math.min(100, percentage));

      return {
        stepId: this.stepId,
        percentage,
        status: deriveStepStatus(percentage),
        details: `${published.length} comunicación(es) publicada(s) · ${(campaigns ?? []).length} campaña(s) · ${(surveys ?? []).length} encuesta(s)`,
        criteria: ['Comunicación SST publicada', 'Campañas o socializaciones registradas'],
        pendingCriteria: [
          ...(published.length > 0 ? [] : ['Publicar una comunicación SST']),
          ...((campaigns ?? []).length > 0 || (surveys ?? []).length > 0 ? [] : ['Registrar una campaña o encuesta']),
        ],
        data: { published: published.length, campaigns: (campaigns ?? []).length, surveys: (surveys ?? []).length },
      };
    } catch {
      return {
        stepId: this.stepId,
        percentage: 0,
        status: 'PENDING',
        details: 'Comunicaciones SST no disponibles',
      };
    }
  }
}
