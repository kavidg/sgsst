import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PlanHistory, PlanHistoryDocument } from '../schemas/plan-history.schema';

@Injectable()
export class PlanHistoryService {
  constructor(
    @InjectModel(PlanHistory.name)
    private readonly planHistoryModel: Model<PlanHistoryDocument>,
  ) {}

  async record(
    entityType: string,
    entityId: string,
    userId: Types.ObjectId,
    userEmail: string,
    action: string,
    previousValue?: string,
    newValue?: string,
  ): Promise<PlanHistory> {
    return this.planHistoryModel.create({
      entityType,
      entityId,
      userId,
      userEmail,
      action,
      previousValue,
      newValue,
      timestamp: new Date(),
    });
  }

  async findByEntity(entityType: string, entityId: string): Promise<PlanHistory[]> {
    return this.planHistoryModel
      .find({ entityType, entityId })
      .sort({ timestamp: -1 })
      .exec();
  }

}
