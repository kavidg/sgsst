import { Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import {
  CompanyPeriodWorkData,
  CompanyPeriodWorkDataDocument,
} from './schemas/company-period-work-data.schema';
import {
  IndicatorPeriod,
  IndicatorPeriodDocument,
} from '../indicators/schemas/indicator-period.schema';
import { IndicatorPeriodStatus } from '../indicators/enums/indicator-period-status.enum';

/**
 * Service para gestionar datos de horas trabajadas por empresa y período.
 *
 * Proporciona:
 * - CRUD básico para horas trabajadas
 * - Método para obtener horas trabajadas por companyId + period
 * - Soporte multi-tenant mediante companyId
 *
 * E3-B (6.1.1) — Denominador oficial de horas trabajadas:
 * - DECISIÓN DE DOMINIO (E3-A): `CompanyPeriodWorkData` es el denominador
 *   oficial por compañía y período mensual `YYYY-MM` para los indicadores
 *   que requieren horas (ind-01/02/03). Si no existe registro válido para
 *   el período, el indicador queda NO_DATA (responsible: resolver) — la
 *   ausencia de horas nunca se convierte en 0 evaluado.
 * - CIERRE DE PERÍODOS: antes de mutar se consulta `IndicatorPeriod`
 *   (companyId + period). Si existe y está CLOSED, la escritura se rechaza
 *   con BadRequestException (mismo patrón que `verifyPeriodOpen` en
 *   IndicatorsService). Si no existe IndicatorPeriod, se permite registrar
 *   las horas (NO se crea el período automáticamente).
 * - El `periodModel` es @Optional para no romper consumidores/tests que
 *   construyen el service sin él (el guard solo aplica cuando está presente).
 */
@Injectable()
export class CompanyPeriodWorkDataService {
  constructor(
    @InjectModel(CompanyPeriodWorkData.name)
    private readonly workDataModel: Model<CompanyPeriodWorkDataDocument>,
    @Optional()
    private readonly periodModel?: Model<IndicatorPeriodDocument>,
  ) {}

  /**
   * Verifica que el período (si existe un IndicatorPeriod) no esté CLOSED.
   * Sin IndicatorPeriod no hay nada que bloquear: se permite registrar horas
   * y la creación del período sigue siendo responsabilidad del flujo existente.
   */
  private async assertPeriodNotClosed(
    companyId: Types.ObjectId,
    period: string,
  ): Promise<void> {
    if (!this.periodModel) {
      return;
    }
    const periodDoc = await this.periodModel
      .findOne({ companyId, period })
      .lean()
      .exec();
    if (periodDoc && periodDoc.status === IndicatorPeriodStatus.CLOSED) {
      throw new BadRequestException(
        `Period "${period}" is closed. Cannot modify work data.`,
      );
    }
  }

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
   * E3-B — Upsert con validaciones del flujo oficial de 6.1.1:
   * valida formato de período y horas, verifica que el IndicatorPeriod
   * (si existe) no esté CLOSED, y luego delega en el upsert idempotente
   * sobre el índice único { companyId, period }.
   */
  async upsertForCompany(
    companyId: Types.ObjectId,
    period: string,
    hoursWorked: number,
  ): Promise<CompanyPeriodWorkData> {
    this.assertValidPeriod(period);
    this.assertValidHours(hoursWorked);
    await this.assertPeriodNotClosed(companyId, period);
    return this.upsert(companyId, period, hoursWorked);
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

  /** E3-B — Alias explícito del acceso tenant-scoped por período. */
  async findByCompanyAndPeriod(
    companyId: Types.ObjectId,
    period: string,
  ): Promise<CompanyPeriodWorkData | null> {
    return this.findByPeriod(companyId, period);
  }

  /**
   * Get all work data entries for a company.
   */
  async findAll(companyId: Types.ObjectId): Promise<CompanyPeriodWorkData[]> {
    return this.workDataModel.find({ companyId }).sort({ period: -1 }).exec();
  }

  /**
   * E3-B — Registros del tenant filtrados por rango de períodos 'YYYY-MM'
   * (inclusivo en ambos extremos). Cualquier límite omitido es abierto.
   */
  async findByCompanyAndRange(
    companyId: Types.ObjectId,
    from?: string,
    to?: string,
  ): Promise<CompanyPeriodWorkData[]> {
    if (from) this.assertValidPeriod(from, 'from');
    if (to) this.assertValidPeriod(to, 'to');

    const query: Record<string, unknown> = { companyId };
    if (from || to) {
      query.period = {} as Record<string, string>;
      if (from) (query.period as Record<string, string>).$gte = from;
      if (to) (query.period as Record<string, string>).$lte = to;
    }

    return this.workDataModel
      .find(query)
      .sort({ period: -1 })
      .exec();
  }

  /**
   * Delete work data entry for a company/period.
   */
  async remove(companyId: Types.ObjectId, period: string): Promise<void> {
    await this.workDataModel.deleteOne({ companyId, period }).exec();
  }

  // ─── Validaciones (E3-B) ────────────────────────────────────────────────

  /** Formato estricto YYYY-MM con mes 01–12. Rechaza '2026-1', '26-01', fechas. */
  private assertValidPeriod(period: string, field = 'period'): void {
    if (typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new BadRequestException(
        `${field} must be YYYY-MM with month between 01 and 12`,
      );
    }
  }

  /** Horas: número finito >= 0. Rechaza negativos, NaN, Infinity y strings. */
  private assertValidHours(hoursWorked: number): void {
    if (
      typeof hoursWorked !== 'number' ||
      !Number.isFinite(hoursWorked) ||
      hoursWorked < 0
    ) {
      throw new BadRequestException(
        'hoursWorked must be a finite number >= 0',
      );
    }
  }
}
