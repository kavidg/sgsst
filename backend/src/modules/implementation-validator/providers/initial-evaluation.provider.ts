import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { StepId } from '../../implementation-wizard/schemas/implementation-wizard.schema';
import { InitialEvaluationService } from '../../initial-evaluation/initial-evaluation.service';
import { deriveStepStatus } from '../implementation-calculator';
import {
  ProviderValidationResult,
  WizardValidationProvider,
} from '../interfaces/wizard-validation-provider.interface';

/**
 * Valida el paso `initial_evaluation` del Centro de Implementación usando el
 * porcentaje de cumplimiento real de la evaluación inicial SG-SST
 * (InitialEvaluationService.findCurrent → overallCompliance).
 */
@Injectable()
export class InitialEvaluationProvider implements WizardValidationProvider {
  readonly stepId: StepId = 'initial_evaluation';

  constructor(private readonly initialEvaluationService: InitialEvaluationService) {}

  async getValidation(companyId: string): Promise<ProviderValidationResult> {
    try {
      const evaluation = await this.initialEvaluationService.findCurrent(
        new Types.ObjectId(companyId),
      );

      const evaluated =
        evaluation.totalStandardsEvaluated ??
        evaluation.standards.filter((s) => s.status).length;
      const total = evaluation.standards.length;

      // Si no hay estándares evaluados, el avance real es 0 aunque el motor
      // pudiera devolver un 100% por ausencia de pesos aplicables.
      const percentage =
        evaluated > 0
          ? Math.max(0, Math.min(100, evaluation.overallCompliance ?? 0))
          : 0;

      return {
        stepId: this.stepId,
        percentage,
        status: deriveStepStatus(percentage),
        details: `Evaluación inicial: ${evaluated}/${total} estándares evaluados, ${percentage}% de cumplimiento`,
        criteria: [
          ...(evaluated > 0 ? [`${evaluated} de ${total} estándares evaluados`] : []),
          ...(percentage >= 80 ? ['Cumplimiento de la evaluación inicial alcanzado'] : []),
        ],
        pendingCriteria: [
          ...(evaluated > 0 ? [] : ['Evaluar los estándares de la evaluación inicial']),
          ...(evaluated > 0 && evaluated < total ? [`Faltan ${total - evaluated} estándares por evaluar`] : []),
          ...(evaluated > 0 && percentage < 80 ? ['Mejorar el porcentaje de cumplimiento de la evaluación inicial'] : []),
        ],
        data: { overallCompliance: percentage, evaluated, total },
      };
    } catch {
      return {
        stepId: this.stepId,
        percentage: 0,
        status: 'PENDING',
        details: 'Evaluación inicial no encontrada',
      };
    }
  }
}
