import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DocumentMaster, DocumentMasterDocument, DocumentType, DocumentStatus } from '../schemas/document-master.schema';

export interface DocumentSearchParams {
  companyId: Types.ObjectId;
  query?: string;
  documentType?: DocumentType;
  status?: DocumentStatus;
  process?: string;
  ownerUser?: Types.ObjectId;
  approvalUser?: Types.ObjectId;
  version?: number;
  expirationBefore?: Date;
  expirationAfter?: Date;
  year?: number;
  code?: string;
  name?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface DocumentSearchResult {
  documents: DocumentMaster[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class DocumentSearchService {
  constructor(
    @InjectModel(DocumentMaster.name)
    private readonly documentMasterModel: Model<DocumentMasterDocument>,
  ) {}

  async search(params: DocumentSearchParams): Promise<DocumentSearchResult> {
    const {
      companyId,
      query,
      documentType,
      status,
      process,
      ownerUser,
      approvalUser,
      version,
      expirationBefore,
      expirationAfter,
      year,
      code,
      name,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 20,
    } = params;

    const filter: Record<string, unknown> = { companyId };

    if (query) {
      filter.$text = { $search: query };
    }

    if (code) {
      filter.code = { $regex: code, $options: 'i' };
    }

    if (name) {
      filter.name = { $regex: name, $options: 'i' };
    }

    if (documentType) {
      filter.documentType = documentType;
    }

    if (status) {
      filter.status = status;
    }

    if (process) {
      filter.process = { $regex: process, $options: 'i' };
    }

    if (ownerUser) {
      filter.ownerUser = ownerUser;
    }

    if (approvalUser) {
      filter.approvalUser = approvalUser;
    }

    if (version !== undefined) {
      filter.version = version;
    }

    if (expirationBefore || expirationAfter) {
      filter.expirationDate = {} as Record<string, Date>;
      if (expirationBefore) {
        (filter.expirationDate as Record<string, Date>).$lte = expirationBefore;
      }
      if (expirationAfter) {
        (filter.expirationDate as Record<string, Date>).$gte = expirationAfter;
      }
    }

    if (year) {
      const startOfYear = new Date(year, 0, 1);
      const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);
      filter.createdAt = { $gte: startOfYear, $lte: endOfYear };
    }

    const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      this.documentMasterModel
        .find(filter as any)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('ownerUser', 'name email')
        .populate('approvalUser', 'name email')
        .exec(),
      this.documentMasterModel.countDocuments(filter as any).exec(),
    ]);

    return {
      documents,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getDocumentStats(companyId: Types.ObjectId): Promise<{
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    active: number;
    expiringSoon: number;
    expired: number;
  }> {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [total, byType, byStatus, active, expiringSoon, expired] = await Promise.all([
      this.documentMasterModel.countDocuments({ companyId }).exec(),
      this.documentMasterModel.aggregate([
        { $match: { companyId } },
        { $group: { _id: '$documentType', count: { $sum: 1 } } },
      ]).exec(),
      this.documentMasterModel.aggregate([
        { $match: { companyId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).exec(),
      this.documentMasterModel.countDocuments({ companyId, status: DocumentStatus.ACTIVE }).exec(),
      this.documentMasterModel.countDocuments({
        companyId,
        status: DocumentStatus.ACTIVE,
        expirationDate: { $gte: now, $lte: futureDate },
      }).exec(),
      this.documentMasterModel.countDocuments({
        companyId,
        status: DocumentStatus.ACTIVE,
        expirationDate: { $lte: now },
      }).exec(),
    ]);

    const byTypeMap: Record<string, number> = {};
    if (Array.isArray(byType)) {
      byType.forEach((item: { _id: string; count: number }) => { byTypeMap[item._id] = item.count; });
    }

    const byStatusMap: Record<string, number> = {};
    if (Array.isArray(byStatus)) {
      byStatus.forEach((item: { _id: string; count: number }) => { byStatusMap[item._id] = item.count; });
    }

    return {
      total,
      byType: byTypeMap,
      byStatus: byStatusMap,
      active,
      expiringSoon,
      expired,
    };
  }
}
