import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Employee, EmployeeDocument } from '../employees/schemas/employee.schema';
import { EvaluationAnswer, EvaluationAnswerDocument } from '../evaluation-answers/schemas/evaluation-answer.schema';
import { Incident, IncidentDocument } from '../incidents/schemas/incident.schema';
import { Question, QuestionDocument } from '../questions/schemas/question.schema';
import { Risk, RiskDocument } from '../risks/schemas/risk.schema';
import { Training, TrainingDocument } from '../trainings/schemas/training.schema';

export interface DashboardStats {
  employees: number;
  incidents: number;
  trainings: number;
  compliance: number;
  highRisks: number;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(Incident.name)
    private readonly incidentModel: Model<IncidentDocument>,
    @InjectModel(Training.name)
    private readonly trainingModel: Model<TrainingDocument>,
    @InjectModel(Risk.name)
    private readonly riskModel: Model<RiskDocument>,
    @InjectModel(EvaluationAnswer.name)
    private readonly evaluationAnswerModel: Model<EvaluationAnswerDocument>,
    @InjectModel(Question.name)
    private readonly questionModel: Model<QuestionDocument>,
  ) {}

  async getCompanyStats(companyId: Types.ObjectId): Promise<DashboardStats> {
    const [employees, incidents, trainings, highRisks, scoreSummary, maxSummary] = await Promise.all([
      this.employeeModel.countDocuments({ companyId }).exec(),
      this.incidentModel.countDocuments({ companyId }).exec(),
      this.trainingModel.countDocuments({ companyId }).exec(),
      this.riskModel.countDocuments({ companyId, riskLevel: { $gte: 12 } }).exec(),
      this.evaluationAnswerModel
        .aggregate<{ totalScore: number }>([
          {
            $lookup: {
              from: 'evaluations',
              localField: 'evaluationId',
              foreignField: '_id',
              as: 'evaluation',
            },
          },
          { $unwind: '$evaluation' },
          { $match: { 'evaluation.companyId': companyId } },
          { $group: { _id: null, totalScore: { $sum: '$score' } } },
        ])
        .exec(),
      this.evaluationAnswerModel
        .aggregate<{ totalMaxScore: number }>([
          {
            $lookup: {
              from: 'evaluations',
              localField: 'evaluationId',
              foreignField: '_id',
              as: 'evaluation',
            },
          },
          { $unwind: '$evaluation' },
          { $match: { 'evaluation.companyId': companyId } },
          {
            $lookup: {
              from: this.questionModel.collection.name,
              localField: 'questionId',
              foreignField: '_id',
              as: 'question',
            },
          },
          { $unwind: '$question' },
          { $group: { _id: null, totalMaxScore: { $sum: '$question.maxScore' } } },
        ])
        .exec(),
    ]);

    const totalScore = scoreSummary[0]?.totalScore ?? 0;
    const totalMaxScore = maxSummary[0]?.totalMaxScore ?? 0;
    const compliance = totalMaxScore === 0 ? 0 : Math.round((totalScore / totalMaxScore) * 100);

    return {
      employees,
      incidents,
      trainings,
      compliance,
      highRisks,
    };
  }
}
