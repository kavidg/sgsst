import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { Evaluation, EvaluationDocument } from './schemas/evaluation.schema';

@Injectable()
export class EvaluationsService {
  constructor(
    @InjectModel(Evaluation.name)
    private readonly evaluationModel: Model<EvaluationDocument>,
  ) {}

  async saveAnswer(createEvaluationDto: CreateEvaluationDto): Promise<Evaluation> {
    const { companyId, code, ...rest } = createEvaluationDto;

    return this.evaluationModel
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
