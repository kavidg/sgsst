import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AccountabilityHistory,
  AccountabilityHistoryDocument,
  AccountabilityHistoryAction,
} from '../schemas/accountability-history.schema';

@Injectable()
export class AccountabilityHistoryService {
  constructor(
    @InjectModel(AccountabilityHistory.name)
    private readonly historyModel: Model<AccountabilityHistoryDocument>,
  ) {}

  async record(params: {
    companyId: Types.ObjectId;
    userId: Types.ObjectId;
    userEmail: string;
    action: AccountabilityHistoryAction;
    entityType: string;
    entityId: Types.ObjectId;
    description: string;
    previousValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
  }): Promise<AccountabilityHistory> {
    return this.historyModel.create(params);
  }

  async findByCompany(
    companyId: Types.ObjectId,
    limit = 100,
    skip = 0,
  ): Promise<AccountabilityHistory[]> {
    return this.historyModel
      .find({ companyId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async findByEntity(
    entityType: string,
    entityId: Types.ObjectId,
  ): Promise<AccountabilityHistory[]> {
    return this.historyModel
      .find({ entityType, entityId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByCompanyAndAction(
    companyId: Types.ObjectId,
    action: AccountabilityHistoryAction,
    limit = 50,
  ): Promise<AccountabilityHistory[]> {
    return this.historyModel
      .find({ companyId, action })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async countByCompany(companyId: Types.ObjectId): Promise<number> {
    return this.historyModel.countDocuments({ companyId }).exec();
  }
}
