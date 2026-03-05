import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { UpdateEvaluationDto } from './dto/update-evaluation.dto';
import { Evaluation, EvaluationDocument } from './schemas/evaluation.schema';

@Injectable()
export class EvaluationsService {
  constructor(
    @InjectModel(Evaluation.name)
    private readonly evaluationModel: Model<EvaluationDocument>,
  ) {}

  async create(createEvaluationDto: CreateEvaluationDto): Promise<Evaluation> {
    const created = new this.evaluationModel(createEvaluationDto);
    return created.save();
  }

  async findAllByCompany(companyId: string): Promise<Evaluation[]> {
    return this.evaluationModel.find({ companyId }).sort({ standard: 1 }).exec();
  }

  async update(id: string, updateEvaluationDto: UpdateEvaluationDto): Promise<Evaluation> {
    const evaluation = await this.evaluationModel
      .findByIdAndUpdate(id, updateEvaluationDto, {
        new: true,
        runValidators: true,
      })
      .exec();

    if (!evaluation) {
      throw new NotFoundException(`Evaluation with id ${id} not found`);
    }

    return evaluation;
  }

  async remove(id: string): Promise<void> {
    const result = await this.evaluationModel.findByIdAndDelete(id).exec();

    if (!result) {
      throw new NotFoundException(`Evaluation with id ${id} not found`);
    }
  }

  async getCompliancePercentage(companyId: string): Promise<{ total: number; complies: number; percentage: number }> {
    const [total, complies] = await Promise.all([
      this.evaluationModel.countDocuments({ companyId }).exec(),
      this.evaluationModel.countDocuments({ companyId, complies: true }).exec(),
    ]);

    const percentage = total === 0 ? 0 : Math.round((complies / total) * 100);

    return {
      total,
      complies,
      percentage,
    };
  }
}
