import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CompanyPeriodScheduledWorkData,
  CompanyPeriodScheduledWorkDataDocument,
} from './schemas/company-period-scheduled-work-data.schema';

/**
 * Service del denominador mensual de 3.3.6 (FASE 35E-2, Parte A).
 *
 * Gestiona "días de trabajo programados" por empresa y período (YYYY-MM),
 * siguiendo el patrón seguro de CompanyPeriodWorkDataService:
 * - upsert idempotente sobre el índice único { companyId, period };
 * - validación de período (YYYY-MM) y valor (entero >= 0, finito);
 * - tenant isolation obligatorio: todas las consultas filtran companyId.
 *
 * Historicidad (35E-2A): el valor almacenado es el declarado/auditado del
 * período; NUNCA se recalcula retroactivamente desde el headcount actual.
 */
@Injectable()
export class CompanyPeriodScheduledWorkDataService {
  constructor(
    @InjectModel(CompanyPeriodScheduledWorkData.name)
    private readonly scheduledWorkDataModel: Model<CompanyPeriodScheduledWorkDataDocument>,
  ) {}

  /**
   * Create or update scheduled work days for a company/period.
   * Idempotente: si la entrada existe, actualiza scheduledWorkDays.
   */
  async upsert(
    companyId: Types.ObjectId,
    period: string,
    scheduledWorkDays: number,
    actorUserId?: Types.ObjectId,
  ): Promise<CompanyPeriodScheduledWorkData> {
    this.assertValidPeriod(period);
    this.assertValidValue(scheduledWorkDays);

    const existing = await this.scheduledWorkDataModel
      .findOne({ companyId, period })
      .exec();

    if (existing) {
      existing.scheduledWorkDays = scheduledWorkDays;
      if (actorUserId) {
        existing.updatedBy = actorUserId;
      }
      return existing.save();
    }

    const doc = new this.scheduledWorkDataModel({
      companyId,
      period,
      scheduledWorkDays,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    });
    return doc.save();
  }

  /**
   * Get scheduled work days for a specific company and period.
   * Returns null if no data exists (el provider de 3.3.6 lo trata como NO_DATA:
   * no inventa el denominador).
   */
  async findByPeriod(
    companyId: Types.ObjectId,
    period: string,
  ): Promise<CompanyPeriodScheduledWorkData | null> {
    this.assertValidPeriod(period);
    return this.scheduledWorkDataModel.findOne({ companyId, period }).exec();
  }

  /** Get all scheduled work data entries for a company (histórico, tenant-scoped). */
  async findAll(companyId: Types.ObjectId): Promise<CompanyPeriodScheduledWorkData[]> {
    return this.scheduledWorkDataModel
      .find({ companyId })
      .sort({ period: -1 })
      .exec();
  }

  /** Delete scheduled work data entry for a company/period. */
  async remove(companyId: Types.ObjectId, period: string): Promise<void> {
    this.assertValidPeriod(period);
    await this.scheduledWorkDataModel.deleteOne({ companyId, period }).exec();
  }

  private assertValidPeriod(period: string): void {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new BadRequestException('period must have format YYYY-MM (month 01-12)');
    }
  }

  private assertValidValue(scheduledWorkDays: number): void {
    if (!Number.isFinite(scheduledWorkDays)) {
      throw new BadRequestException('scheduledWorkDays must be a finite number');
    }
    if (!Number.isInteger(scheduledWorkDays)) {
      throw new BadRequestException('scheduledWorkDays must be an integer');
    }
    if (scheduledWorkDays < 0) {
      throw new BadRequestException('scheduledWorkDays must be >= 0');
    }
  }
}
