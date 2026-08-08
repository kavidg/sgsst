import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { TrainingsService } from '../../trainings/trainings.service';
import { FindingPriority } from '../enums/finding-priority.enum';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/** Umbral de ejecución aceptable del programa de capacitación. */
const TRAINING_THRESHOLD = 70;

/**
 * Cumplimiento del programa de capacitación a partir de los indicadores
 * registrados en el módulo de capacitaciones.
 */
@Injectable()
export class TrainingsProvider implements ComplianceProvider {
  constructor(private readonly trainingsService: TrainingsService) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const trainings = await this.trainingsService.findAll(new Types.ObjectId(companyId));
    const withCompletion = trainings.filter(
      (training) => typeof training.indicators?.completionPercentage === 'number',
    );
    const averageCompletion =
      withCompletion.length > 0
        ? withCompletion.reduce(
            (sum, training) => sum + (training.indicators?.completionPercentage ?? 0),
            0,
          ) / withCompletion.length
        : 0;
    const percentage = Math.round(averageCompletion);

    const lowCompletion = trainings.filter(
      (training) => (training.indicators?.completionPercentage ?? 0) < TRAINING_THRESHOLD,
    );

    const findings = lowCompletion.map((training, index) => ({
      id: `training-${index}`,
      module: 'trainings',
      title: `Programa de capacitación con baja ejecución: ${training.topic}`,
      description: `Ejecución registrada del ${training.indicators?.completionPercentage ?? 0}%. Reforzar el programa anual de capacitación.`,
      priority: FindingPriority.MEDIUM,
      status: 'OPEN',
      responsible: training.instructor,
      dueDate: new Date(training.date).toISOString(),
      createdAt: new Date().toISOString(),
    }));

    return {
      module: 'trainings',
      percentage,
      status: classifyComplianceLevel(percentage),
      findings,
      pending: lowCompletion.length,
      completed: trainings.length - lowCompletion.length,
    };
  }
}
