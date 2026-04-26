import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { Evaluation, EvaluationDocument, EvaluationStatus } from './schemas/evaluation.schema';
import { AlertsService } from '../modules/alerts/alerts.service';
import { AlertSeverity } from '../modules/alerts/schemas/alert.schema';

@Injectable()
export class EvaluationsService {
  constructor(
    @InjectModel(Evaluation.name)
    private readonly evaluationModel: Model<EvaluationDocument>,
    private readonly alertsService: AlertsService,
  ) {}

  async saveAnswer(createEvaluationDto: CreateEvaluationDto): Promise<Evaluation> {
    const { companyId, code, ...rest } = createEvaluationDto;

    const saved = await this.evaluationModel
      .findOneAndUpdate(
        { companyId, code },
        {
          companyId,
          code,
          ...rest,
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      )
      .exec();

    await this.ensureSgsstAlert(saved);
    return saved;
  }


  private async ensureSgsstAlert(evaluation: Evaluation): Promise<void> {
    if (evaluation.status !== EvaluationStatus.NO_CUMPLE) {
      return;
    }

    await this.alertsService.createUnique({
      companyId: evaluation.companyId,
      type: 'SG_SST',
      message: `El ítem SG-SST ${evaluation.code} está marcado como NO_CUMPLE.`,
      severity: AlertSeverity.HIGH,
    });
  }

  async findAllByCompany(companyId: string): Promise<Evaluation[]> {
    return this.evaluationModel.find({ companyId }).sort({ code: 1 }).exec();
  }

  async findOneByCode(companyId: string, code: string): Promise<Evaluation> {
    const evaluation = await this.evaluationModel.findOne({ companyId, code }).exec();
    if (!evaluation) {
      throw new NotFoundException(`Evaluation with code ${code} not found`);
    }
    return evaluation;
  }
}
