import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RetentionRule, RetentionRuleDocument } from '../schemas/retention-rule.schema';
import { DocumentMaster, DocumentMasterDocument, DocumentStatus, DocumentType } from '../schemas/document-master.schema';

@Injectable()
export class DocumentRetentionService {
  constructor(
    @InjectModel(RetentionRule.name)
    private readonly retentionRuleModel: Model<RetentionRuleDocument>,
    @InjectModel(DocumentMaster.name)
    private readonly documentMasterModel: Model<DocumentMasterDocument>,
  ) {}

  // ==================== RETENTION RULES ====================

  async setRule(params: {
    companyId: Types.ObjectId;
    documentType: DocumentType;
    retentionYears: number;
    description?: string;
  }): Promise<RetentionRule> {
    return this.retentionRuleModel
      .findOneAndUpdate(
        { companyId: params.companyId, documentType: params.documentType },
        {
          $set: {
            retentionYears: params.retentionYears,
            description: params.description,
            isActive: true,
          },
        },
        { upsert: true, new: true },
      )
      .exec();
  }

  async getRules(companyId: Types.ObjectId): Promise<RetentionRule[]> {
    return this.retentionRuleModel
      .find({ companyId, isActive: true })
      .sort({ documentType: 1 })
      .exec();
  }

  async getRule(companyId: Types.ObjectId, documentType: DocumentType): Promise<RetentionRule | null> {
    return this.retentionRuleModel
      .findOne({ companyId, documentType, isActive: true })
      .exec();
  }

  async updateRule(
    companyId: Types.ObjectId,
    documentType: DocumentType,
    updates: { retentionYears?: number; description?: string; isActive?: boolean },
  ): Promise<RetentionRule> {
    const rule = await this.retentionRuleModel
      .findOneAndUpdate(
        { companyId, documentType },
        { $set: updates },
        { new: true },
      )
      .exec();

    if (!rule) {
      throw new NotFoundException(`Retention rule for ${documentType} not found`);
    }

    return rule;
  }

  async deleteRule(companyId: Types.ObjectId, documentType: DocumentType): Promise<void> {
    const result = await this.retentionRuleModel
      .deleteOne({ companyId, documentType })
      .exec();

    if (result.deletedCount === 0) {
      throw new NotFoundException(`Retention rule for ${documentType} not found`);
    }
  }

  // ==================== RETENTION CALCULATION ====================

  async getRetentionDate(
    companyId: Types.ObjectId,
    documentType: DocumentType,
    createdAt: Date,
  ): Promise<Date | null> {
    const rule = await this.getRule(companyId, documentType);
    if (!rule) return null;

    const retentionDate = new Date(createdAt);
    retentionDate.setFullYear(retentionDate.getFullYear() + rule.retentionYears);
    return retentionDate;
  }

  async checkExpiration(
    companyId: Types.ObjectId,
    documentId: Types.ObjectId,
  ): Promise<{ isExpired: boolean; retentionDate: Date | null; daysUntilExpiration: number | null }> {
    const document = await this.documentMasterModel.findById(documentId).exec();
    if (!document) throw new NotFoundException('Document not found');

    if (document.expirationDate) {
      const now = new Date();
      const daysUntilExpiration = Math.ceil(
        (document.expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      return {
        isExpired: daysUntilExpiration <= 0,
        retentionDate: document.expirationDate,
        daysUntilExpiration,
      };
    }

    const retentionDate = await this.getRetentionDate(
      companyId,
      document.documentType,
      document.createdAt,
    );

    if (!retentionDate) {
      return { isExpired: false, retentionDate: null, daysUntilExpiration: null };
    }

    const now = new Date();
    const daysUntilExpiration = Math.ceil(
      (retentionDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      isExpired: daysUntilExpiration <= 0,
      retentionDate,
      daysUntilExpiration,
    };
  }

  async getExpiringDocuments(
    companyId: Types.ObjectId,
    withinDays: number,
  ): Promise<DocumentMaster[]> {
    const now = new Date();
    const futureDate = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

    return this.documentMasterModel
      .find({
        companyId,
        status: DocumentStatus.ACTIVE,
        expirationDate: {
          $gte: now,
          $lte: futureDate,
        },
      })
      .sort({ expirationDate: 1 })
      .exec();
  }

  async getExpiredDocuments(companyId: Types.ObjectId): Promise<DocumentMaster[]> {
    const now = new Date();

    return this.documentMasterModel
      .find({
        companyId,
        status: { $in: [DocumentStatus.ACTIVE] },
        expirationDate: { $lte: now },
      })
      .sort({ expirationDate: 1 })
      .exec();
  }
}
