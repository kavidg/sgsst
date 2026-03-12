import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Evaluation, EvaluationDocument } from '../../evaluations/schemas/evaluation.schema';
import { Question, QuestionDocument } from '../questions/schemas/question.schema';
import { CreateEvaluationAnswerDto } from './dto/create-evaluation-answer.dto';
import { UpdateEvaluationAnswerDto } from './dto/update-evaluation-answer.dto';
import { EvaluationAnswer, EvaluationAnswerDocument } from './schemas/evaluation-answer.schema';

@Injectable()
export class EvaluationAnswersService {
  constructor(
    @InjectModel(EvaluationAnswer.name)
    private readonly evaluationAnswerModel: Model<EvaluationAnswerDocument>,
    @InjectModel(Question.name)
    private readonly questionModel: Model<QuestionDocument>,
    @InjectModel(Evaluation.name)
    private readonly evaluationModel: Model<EvaluationDocument>,
  ) {}

  async create(createEvaluationAnswerDto: CreateEvaluationAnswerDto): Promise<EvaluationAnswer> {
    await this.ensureEvaluationExists(createEvaluationAnswerDto.evaluationId);

    const question = await this.findQuestionOrFail(createEvaluationAnswerDto.questionId);
    const score = createEvaluationAnswerDto.answer ? question.maxScore : 0;

    const created = new this.evaluationAnswerModel({
      ...createEvaluationAnswerDto,
      score,
      observation: createEvaluationAnswerDto.observation ?? '',
    });

    await created.save();

    return this.findOne(created.id);
  }

  async findAll(): Promise<EvaluationAnswer[]> {
    return this.findWithQuestionData({});
  }

  async findOne(id: string): Promise<EvaluationAnswer> {
    const answer = await this.evaluationAnswerModel
      .findById(id)
      .populate({
        path: 'questionId',
        select: 'question maxScore order',
      })
      .exec();

    if (!answer) {
      throw new NotFoundException(`Evaluation answer with id ${id} not found`);
    }

    return answer;
  }

  async update(id: string, updateEvaluationAnswerDto: UpdateEvaluationAnswerDto): Promise<EvaluationAnswer> {
    const existing = await this.evaluationAnswerModel.findById(id).exec();

    if (!existing) {
      throw new NotFoundException(`Evaluation answer with id ${id} not found`);
    }

    const merged = {
      evaluationId: updateEvaluationAnswerDto.evaluationId ?? existing.evaluationId.toString(),
      questionId: updateEvaluationAnswerDto.questionId ?? existing.questionId.toString(),
      answer: updateEvaluationAnswerDto.answer ?? existing.answer,
      observation: updateEvaluationAnswerDto.observation ?? existing.observation,
    };

    await this.ensureEvaluationExists(merged.evaluationId);
    const question = await this.findQuestionOrFail(merged.questionId);

    const updated = await this.evaluationAnswerModel
      .findByIdAndUpdate(
        id,
        {
          ...merged,
          score: merged.answer ? question.maxScore : 0,
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .populate({
        path: 'questionId',
        select: 'question maxScore order',
      })
      .exec();

    if (!updated) {
      throw new NotFoundException(`Evaluation answer with id ${id} not found`);
    }

    return updated;
  }

  async remove(id: string): Promise<void> {
    const result = await this.evaluationAnswerModel.findByIdAndDelete(id).exec();

    if (!result) {
      throw new NotFoundException(`Evaluation answer with id ${id} not found`);
    }
  }

  async findByEvaluation(evaluationId: string): Promise<EvaluationAnswer[]> {
    await this.ensureEvaluationExists(evaluationId);
    return this.findWithQuestionData({ evaluationId: new Types.ObjectId(evaluationId) });
  }

  async calculateEvaluationScore(evaluationId: string): Promise<{
    totalScore: number;
    maxPossibleScore: number;
    percentage: number;
  }> {
    await this.ensureEvaluationExists(evaluationId);

    const [answersResult, questionsResult] = await Promise.all([
      this.evaluationAnswerModel
        .aggregate<{ totalScore: number }>([
          { $match: { evaluationId: new Types.ObjectId(evaluationId) } },
          { $group: { _id: null, totalScore: { $sum: '$score' } } },
        ])
        .exec(),
      this.questionModel
        .aggregate<{ maxPossibleScore: number }>([
          { $group: { _id: null, maxPossibleScore: { $sum: '$maxScore' } } },
        ])
        .exec(),
    ]);

    const totalScore = answersResult[0]?.totalScore ?? 0;
    const maxPossibleScore = questionsResult[0]?.maxPossibleScore ?? 0;
    const percentage = maxPossibleScore === 0 ? 0 : Number(((totalScore / maxPossibleScore) * 100).toFixed(2));

    return {
      totalScore,
      maxPossibleScore,
      percentage,
    };
  }

  private async findWithQuestionData(filter: Record<string, unknown>): Promise<EvaluationAnswer[]> {
    const answers = await this.evaluationAnswerModel
      .find(filter)
      .populate({
        path: 'questionId',
        select: 'question maxScore order',
      })
      .exec();

    return answers.sort((a, b) => {
      const left = this.getQuestionOrder(a.questionId);
      const right = this.getQuestionOrder(b.questionId);
      return left - right;
    });
  }

  private getQuestionOrder(questionRef: unknown): number {
    if (questionRef && typeof questionRef === 'object' && 'order' in questionRef) {
      const order = (questionRef as { order?: unknown }).order;
      if (typeof order === 'number') {
        return order;
      }
    }

    return Number.MAX_SAFE_INTEGER;
  }

  private async findQuestionOrFail(questionId: string) {
    const question = await this.questionModel.findById(questionId).exec();

    if (!question) {
      throw new NotFoundException(`Question with id ${questionId} not found`);
    }

    return question;
  }

  private async ensureEvaluationExists(evaluationId: string): Promise<void> {
    const evaluation = await this.evaluationModel.exists({ _id: evaluationId }).exec();

    if (!evaluation) {
      throw new NotFoundException(`Evaluation with id ${evaluationId} not found`);
    }
  }
}
