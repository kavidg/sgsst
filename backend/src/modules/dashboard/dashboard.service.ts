import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, Document } from 'mongoose';
import { Employee, EmployeeDocument } from '../employees/schemas/employee.schema';
import { EvaluationAnswer, EvaluationAnswerDocument } from '../evaluation-answers/schemas/evaluation-answer.schema';
import { Incident, IncidentDocument } from '../incidents/schemas/incident.schema';
import { Question, QuestionDocument } from '../questions/schemas/question.schema';
import { Risk, RiskDocument } from '../risks/schemas/risk.schema';
import { Training, TrainingDocument } from '../trainings/schemas/training.schema';
import { SstObjectives } from '../phva-advanced/schemas/phva-advanced-sst-objective.schema';

export interface DashboardStats {
  employees: number;
  incidents: number;
  trainings: number;
  compliance: number;
  highRisks: number;
}

export interface SstObjectivesSummary {
  total: number;
  active: number;
  completed: number;
  delayed: number;
  expired: number;
  compliance: number; // percentage
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
    @InjectModel(SstObjectives.name)
    private readonly sstObjectivesModel: Model<Document & SstObjectives>,
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

  async getSstObjectivesSummary(companyId: Types.ObjectId): Promise<{ summary: SstObjectivesSummary; objectives: any[] }> {
    const record = await this.sstObjectivesModel.findOne({ companyId }).lean().exec();
    const objectives = (record?.objectives ?? []) as any[];
    const total = objectives.length;
    const active = objectives.filter((o) => o.active).length;
    const completed = objectives.filter((o) => o.status === 'Completed').length;
    const delayed = objectives.filter((o) => o.status === 'Delayed').length;
    const now = new Date();
    const expired = objectives.filter((o) => o.dueDate && new Date(o.dueDate) < now && o.status !== 'Completed').length;
    const compliance = total === 0 ? 0 : Math.round((completed / total) * 100);

    const summary: SstObjectivesSummary = { total, active, completed, delayed, expired, compliance };

    return { summary, objectives };
  }
}
