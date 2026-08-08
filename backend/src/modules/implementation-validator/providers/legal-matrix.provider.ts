import { Injectable } from '@nestjs/common';
import { StepId } from '../../implementation-wizard/schemas/implementation-wizard.schema';
import { LegalMatrixService } from '../../legal-matrix/legal-matrix.service';
import { deriveStepStatus } from '../implementation-calculator';
import {
  ProviderValidationResult,
  WizardValidationProvider,
} from '../interfaces/wizard-validation-provider.interface';

/**
 * Valida el paso `legal_matrix` del Centro de Implementación usando la matriz
 * legal real de la empresa:
 *
 * - Requisitos legales registrados (items).
 * - Evaluación realizada (algún item con status distinto de PENDIENTE).
 */
@Injectable()
export class LegalMatrixProvider implements WizardValidationProvider {
  readonly stepId: StepId = 'legal_matrix';

  constructor(private readonly legalMatrixService: LegalMatrixService) {}

  async getValidation(companyId: string): Promise<ProviderValidationResult> {
    try {
      const matrix = await this.legalMatrixService
        .getCompanyMatrix(companyId)
        .catch(() => null);

      const items = matrix?.items ?? [];
      const evaluated = items.filter(
        (item) => item.status && item.status !== 'PENDIENTE',
      );

      let percentage = 0;
      if (items.length > 0) percentage += 50;
      if (evaluated.length > 0) percentage += 50;
      percentage = Math.max(0, Math.min(100, percentage));

      return {
        stepId: this.stepId,
        percentage,
        status: deriveStepStatus(percentage),
        details: `${items.length} requisito(s) legal(es), ${evaluated.length} evaluado(s)`,
        criteria: ['Requisitos legales registrados', 'Evaluación realizada'],
        pendingCriteria: [
          ...(items.length > 0 ? [] : ['Registrar requisitos legales aplicables']),
          ...(evaluated.length > 0 ? [] : ['Evaluar los requisitos de la matriz legal']),
        ],
        data: { total: items.length, evaluated: evaluated.length },
      };
    } catch {
      return {
        stepId: this.stepId,
        percentage: 0,
        status: 'PENDING',
        details: 'Matriz legal no disponible',
      };
    }
  }
}
