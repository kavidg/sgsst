import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StepId } from '../../implementation-wizard/schemas/implementation-wizard.schema';
import { TrainingsService } from '../../trainings/trainings.service';
import {
  TrainingManagement,
  TrainingManagementDocument,
} from '../../phva-advanced/schemas/phva-advanced-training-management.schema';
import { deriveStepStatus } from '../implementation-calculator';
import {
  ProviderValidationResult,
  WizardValidationProvider,
} from '../interfaces/wizard-validation-provider.interface';

/**
 * Valida el paso `training` del Centro de Implementación usando el programa de
 * capacitación real:
 *
 * - Capacitaciones registradas en el módulo de entrenamientos.
 * - Programa anual / sesiones en la gestión avanzada de capacitación (1.2.1).
 */
@Injectable()
export class TrainingProvider implements WizardValidationProvider {
  readonly stepId: StepId = 'training';

  constructor(
    private readonly trainingsService: TrainingsService,
    @InjectModel(TrainingManagement.name)
    private readonly trainingManagementModel: Model<TrainingManagementDocument>,
  ) {}

  async getValidation(companyId: string): Promise<ProviderValidationResult> {
    try {
      const objectId = new Types.ObjectId(companyId);
      const [trainings, management] = await Promise.all([
        this.trainingsService.findAll(objectId).catch(() => []),
        this.trainingManagementModel
          .findOne({ companyId: objectId, itemCode: '1.2.1' })
          .exec()
          .catch(() => null),
      ]);

      const registered = (trainings ?? []).length;
      const annualProgram = management?.annualProgram ?? [];
      const managementTrainings = management?.trainings ?? [];

      let percentage = 0;
      if (registered > 0) percentage += 50;
      if (annualProgram.length > 0 || managementTrainings.length > 0) {
        percentage += 50;
      }
      percentage = Math.max(0, Math.min(100, percentage));

      return {
        stepId: this.stepId,
        percentage,
        status: deriveStepStatus(percentage),
        details: `${registered} capacitación(es) registrada(s) · ${annualProgram.length} en programa anual`,
        criteria: ['Capacitaciones registradas', 'Programa anual definido'],
        pendingCriteria: [
          ...(registered > 0 ? [] : ['Registrar capacitaciones SST']),
          ...(annualProgram.length > 0 || managementTrainings.length > 0 ? [] : ['Definir el programa anual de capacitación']),
        ],
        data: { registered, annualProgram: annualProgram.length, managementTrainings: managementTrainings.length },
      };
    } catch {
      return {
        stepId: this.stepId,
        percentage: 0,
        status: 'PENDING',
        details: 'Programa de capacitación no disponible',
      };
    }
  }
}
