import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CompanyPeriodWorkData,
  CompanyPeriodWorkDataDocument,
} from './schemas/company-period-work-data.schema';

/**
 * Service para gestionar datos de horas trabajadas por empresa y período.
 *
 * Proporciona:
 * - CRUD básico para horas trabajadas
 * - Método para obtener horas trabajadas por companyId + period
 * - Soporte multi-tenant mediante companyId
 */
@Injectable()
export class CompanyPeriodWorkDataService {
  constructor(
    @InjectModel(CompanyPeriodWorkData.name)
    private readonly workDataModel: Model<CompanyPeriodWorkDataDocument>,
  ) {}

  /**
   * Create or update hours worked for a company/period.
   * Idempotent: if entry exists, updates hoursWorked.
   */
  async upsert(
    companyId: Types.ObjectId,
    period: string,
    hoursWorked: number,
  ): Promise<CompanyPeriodWorkData> {
    if (hoursWorked < 0) {
      throw new Error('hoursWorked must be >= 0');
    }

    const existing = await this.workDataModel
      .findOne({ companyId, period })
      .exec();

    if (existing) {
      existing.hoursWorked = hoursWorked;
      return existing.save();
    }

    const doc = new this.workDataModel({ companyId, period, hoursWorked });
    return doc.save();
  }

  /**
   * Get hours worked for a specific company and period.
   * Returns null if no data exists.
   */
  async findByPeriod(
    companyId: Types.ObjectId,
    period: string,
  ): Promise<CompanyPeriodWorkData | null> {
    return this.workDataModel.findOne({ companyId, period }).exec();
  }

  /**
   * Get all work data entries for a company.
   */
  async findAll(companyId: Types.ObjectId): Promise<CompanyPeriodWorkData[]> {
    return this.workDataModel.find({ companyId }).sort({ period: -1 }).exec();
  }

  /**
   * Delete work data entry for a company/period.
   */
  async remove(companyId: Types.ObjectId, period: string): Promise<void> {
    await this.workDataModel.deleteOne({ companyId, period }).exec();
  }
}
