import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DocumentHistory, DocumentHistoryDocument, DocumentHistoryAction } from '../schemas/document-history.schema';

@Injectable()
export class DocumentHistoryService {
  constructor(
    @InjectModel(DocumentHistory.name)
    private readonly historyModel: Model<DocumentHistoryDocument>,
  ) {}

  async record(params: {
    companyId: Types.ObjectId;
    documentId: Types.ObjectId;
    userId: Types.ObjectId;
    action: DocumentHistoryAction;
    previousValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
    description?: string;
  }): Promise<DocumentHistory> {
    return this.historyModel.create({
      companyId: params.companyId,
      documentId: params.documentId,
      userId: params.userId,
      action: params.action,
      previousValue: params.previousValue,
      newValue: params.newValue,
      description: params.description,
    });
  }

  async findByDocument(
    documentId: Types.ObjectId,
    companyId: Types.ObjectId,
  ): Promise<DocumentHistory[]> {
    return this.historyModel
      .find({ documentId, companyId })
      .sort({ createdAt: -1 })
      .populate('userId', 'name email')
      .exec();
  }

  async findByCompany(
    companyId: Types.ObjectId,
    limit = 100,
  ): Promise<DocumentHistory[]> {
    return this.historyModel
      .find({ companyId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('userId', 'name email')
      .exec();
  }

  async findByAction(
    companyId: Types.ObjectId,
    action: DocumentHistoryAction,
    limit = 50,
  ): Promise<DocumentHistory[]> {
    return this.historyModel
      .find({ companyId, action })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('userId', 'name email')
      .exec();
  }
}
