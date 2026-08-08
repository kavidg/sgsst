import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StepId } from '../../implementation-wizard/schemas/implementation-wizard.schema';
import {
  SstObjectives,
  SstObjectivesDocument,
} from '../../phva-advanced/schemas/phva-advanced-sst-objective.schema';
import { deriveStepStatus } from '../implementation-calculator';
import {
  ProviderValidationResult,
  WizardValidationProvider,
} from '../interfaces/wizard-validation-provider.interface';

/**
 * Valida el paso `sst_objectives` del Centro de Implementación usando los
 * objetivos SST reales (PHVA 2.2.1):
 *
 * - Objetivos SST existentes y activos.
 * - Al menos un objetivo con indicador asociado.
 */
@Injectable()
export class SstObjectivesProvider implements WizardValidationProvider {
  readonly stepId: StepId = 'sst_objectives';

  constructor(
    @InjectModel(SstObjectives.name)
    private readonly objectivesModel: Model<SstObjectivesDocument>,
  ) {}

  async getValidation(companyId: string): Promise<ProviderValidationResult> {
    try {
      const record = await this.objectivesModel
        .findOne({ companyId: new Types.ObjectId(companyId), itemCode: '2.2.1' })
        .exec();

      const objectives = record?.objectives ?? [];
      const activeObjectives = objectives.filter(
        (objective) => objective.active !== false,
      );
      const withIndicator = activeObjectives.filter(
        (objective) => Boolean(String(objective.indicator ?? '').trim()),
      );

      let percentage = 0;
      if (activeObjectives.length > 0) percentage += 50;
      if (withIndicator.length > 0) percentage += 50;
      percentage = Math.max(0, Math.min(100, percentage));

      return {
        stepId: this.stepId,
        percentage,
        status: deriveStepStatus(percentage),
        details: `${activeObjectives.length} objetivo(s) activo(s), ${withIndicator.length} con indicador`,
        criteria: ['Al menos 1 objetivo SST activo', 'Al menos 1 objetivo con indicador'],
        pendingCriteria: [
          ...(activeObjectives.length > 0 ? [] : ['Crear un objetivo SST activo']),
          ...(withIndicator.length > 0 ? [] : ['Asociar un indicador a un objetivo']),
        ],
        data: {
          total: objectives.length,
          active: activeObjectives.length,
          withIndicator: withIndicator.length,
        },
      };
    } catch {
      return {
        stepId: this.stepId,
        percentage: 0,
        status: 'PENDING',
        details: 'Objetivos SST no disponibles',
      };
    }
  }
}
