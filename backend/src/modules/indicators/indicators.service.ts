import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  IndicatorDefinition,
  IndicatorDefinitionDocument,
} from './schemas/indicator-definition.schema';
import {
  IndicatorMeasurement,
  IndicatorMeasurementDocument,
} from './schemas/indicator-measurement.schema';
import {
  IndicatorPeriod,
  IndicatorPeriodDocument,
} from './schemas/indicator-period.schema';
import { CreateIndicatorDto } from './dto/create-indicator.dto';
import { UpdateIndicatorDto } from './dto/update-indicator.dto';
import { CreateMeasurementDto } from './dto/create-measurement.dto';
import { CreatePeriodDto } from './dto/create-period.dto';
import { IndicatorMeasurementStatus } from './enums/indicator-measurement-status.enum';
import { IndicatorPeriodStatus } from './enums/indicator-period-status.enum';
import { IndicatorTargetOperator } from './enums/indicator-target-operator.enum';
import { IndicatorFormulaType } from './enums/indicator-formula-type.enum';
import { validatePeriodFormat, getPeriodDates } from './utils/period.validator';
import { FormulaRegistryService } from './formula/formula-registry.service';
import { FormulaDefinition } from './formula/formula-types';
import { MVP_INDICATOR_DEFINITIONS, SeedIndicatorDefinition } from './seeds/mvp-indicator-definitions';

@Injectable()
export class IndicatorsService {
  constructor(
    @InjectModel(IndicatorDefinition.name)
    private readonly definitionModel: Model<IndicatorDefinitionDocument>,
    @InjectModel(IndicatorMeasurement.name)
    private readonly measurementModel: Model<IndicatorMeasurementDocument>,
    @InjectModel(IndicatorPeriod.name)
    private readonly periodModel: Model<IndicatorPeriodDocument>,
    @Optional()
    private readonly formulaRegistry?: FormulaRegistryService,
  ) {}

  // ==================== DEFINITIONS ====================

  async createDefinition(
    companyId: Types.ObjectId,
    dto: CreateIndicatorDto,
  ): Promise<IndicatorDefinition> {
    // Validate target consistency
    this.validateTarget(dto);

    // Check unique code per company
    const existing = await this.definitionModel
      .findOne({ companyId, code: dto.code.toLowerCase().trim() })
      .exec();
    if (existing) {
      throw new ConflictException(`Indicator with code "${dto.code}" already exists`);
    }

    const definition = new this.definitionModel({
      ...dto,
      code: dto.code.toLowerCase().trim(),
      companyId,
      isActive: dto.isActive ?? true,
    });

    return definition.save();
  }

  async findAllDefinitions(
    companyId: Types.ObjectId,
    includeInactive = false,
  ): Promise<IndicatorDefinition[]> {
    const query: Record<string, unknown> = { companyId };
    if (!includeInactive) {
      query.isActive = true;
    }
    return this.definitionModel.find(query).sort({ code: 1 }).exec();
  }

  async findDefinitionById(
    companyId: Types.ObjectId,
    indicatorId: string,
  ): Promise<IndicatorDefinition> {
    const definition = await this.definitionModel
      .findOne({ _id: indicatorId, companyId })
      .exec();
    if (!definition) {
      throw new NotFoundException(`Indicator not found`);
    }
    return definition;
  }

  async updateDefinition(
    companyId: Types.ObjectId,
    indicatorId: string,
    dto: UpdateIndicatorDto,
  ): Promise<IndicatorDefinition> {
    // Validate target if provided
    if (dto.targetOperator !== undefined || dto.targetValue !== undefined) {
      this.validateTarget(dto as CreateIndicatorDto);
    }

    // Check code uniqueness if changing
    if (dto.code) {
      const existing = await this.definitionModel
        .findOne({
          companyId,
          code: dto.code.toLowerCase().trim(),
          _id: { $ne: indicatorId },
        })
        .exec();
      if (existing) {
        throw new ConflictException(`Indicator with code "${dto.code}" already exists`);
      }
    }

    const definition = await this.definitionModel
      .findOneAndUpdate(
        { _id: indicatorId, companyId },
        { ...dto, code: dto.code?.toLowerCase().trim() },
        { new: true, runValidators: true },
      )
      .exec();

    if (!definition) {
      throw new NotFoundException(`Indicator not found`);
    }

    return definition;
  }

  async softDeleteDefinition(
    companyId: Types.ObjectId,
    indicatorId: string,
  ): Promise<IndicatorDefinition> {
    const definition = await this.definitionModel
      .findOneAndUpdate(
        { _id: indicatorId, companyId, isActive: true },
        { isActive: false },
        { new: true },
      )
      .exec();

    if (!definition) {
      throw new NotFoundException(`Active indicator not found`);
    }

    return definition;
  }

  // ==================== MEASUREMENTS ====================

  async createMeasurement(
    companyId: Types.ObjectId,
    dto: CreateMeasurementDto,
  ): Promise<IndicatorMeasurement> {
    // Verify indicator exists and belongs to company
    const definition = await this.findDefinitionById(companyId, dto.indicatorId);

    // Verify period is open
    await this.verifyPeriodOpen(companyId, dto.period);

    // Check for duplicate measurement
    const existing = await this.measurementModel
      .findOne({ companyId, indicatorId: dto.indicatorId, period: dto.period })
      .exec();
    if (existing) {
      throw new ConflictException(
        `Measurement already exists for indicator "${definition.code}" in period "${dto.period}"`,
      );
    }

    // Calculate status based on target
    const calculatedValue = dto.calculatedValue ?? 0;
    const status = this.evaluateTarget(definition, calculatedValue);

    const measurement = new this.measurementModel({
      companyId,
      indicatorId: dto.indicatorId,
      period: dto.period,
      periodStart: dto.periodStart,
      periodEnd: dto.periodEnd,
      numerator: dto.numerator ?? 0,
      denominator: dto.denominator ?? 0,
      calculatedValue,
      status,
      source: 'MANUAL',
      evidence: dto.evidence ?? '',
      notes: dto.notes ?? '',
      measuredAt: new Date(),
    });

    return measurement.save();
  }

  async findMeasurements(
    companyId: Types.ObjectId,
    indicatorId: string,
  ): Promise<IndicatorMeasurement[]> {
    // Verify indicator belongs to company
    await this.findDefinitionById(companyId, indicatorId);

    return this.measurementModel
      .find({ companyId, indicatorId })
      .sort({ period: -1 })
      .exec();
  }

  async findMeasurement(
    companyId: Types.ObjectId,
    indicatorId: string,
    period: string,
  ): Promise<IndicatorMeasurement> {
    const measurement = await this.measurementModel
      .findOne({ companyId, indicatorId, period })
      .exec();

    if (!measurement) {
      throw new NotFoundException(`Measurement not found for period "${period}"`);
    }

    return measurement;
  }

  // ==================== PERIODS ====================

  async createPeriod(
    companyId: Types.ObjectId,
    dto: CreatePeriodDto,
  ): Promise<IndicatorPeriod> {
    const period = dto.period.trim();

    // Check if period already exists
    const existing = await this.periodModel
      .findOne({ companyId, period })
      .exec();
    if (existing) {
      throw new ConflictException(`Period "${period}" already exists`);
    }

    const periodDoc = new this.periodModel({
      companyId,
      period,
      status: IndicatorPeriodStatus.OPEN,
    });

    return periodDoc.save();
  }

  async findPeriods(companyId: Types.ObjectId): Promise<IndicatorPeriod[]> {
    return this.periodModel.find({ companyId }).sort({ period: -1 }).exec();
  }

  async closePeriod(
    companyId: Types.ObjectId,
    period: string,
  ): Promise<IndicatorPeriod> {
    const periodDoc = await this.periodModel
      .findOne({ companyId, period })
      .exec();

    if (!periodDoc) {
      throw new NotFoundException(`Period "${period}" not found`);
    }

    if (periodDoc.status === IndicatorPeriodStatus.CLOSED) {
      throw new BadRequestException(`Period "${period}" is already closed`);
    }

    periodDoc.status = IndicatorPeriodStatus.CLOSED;
    periodDoc.closedAt = new Date();

    return periodDoc.save();
  }

  // ==================== DASHBOARD ====================

  async getDashboardSummary(companyId: Types.ObjectId): Promise<{
    totalActive: number;
    withMeasurements: number;
    withoutMeasurements: number;
    targetMet: number;
    targetNotMet: number;
    noData: number;
  }> {
    const definitions = await this.definitionModel
      .find({ companyId, isActive: true })
      .exec();

    const totalActive = definitions.length;

    if (totalActive === 0) {
      return {
        totalActive: 0,
        withMeasurements: 0,
        withoutMeasurements: 0,
        targetMet: 0,
        targetNotMet: 0,
        noData: 0,
      };
    }

    const definitionIds = definitions.map((d) => d._id);

    // Get latest measurement for each indicator
    const latestMeasurements = await this.measurementModel.aggregate([
      { $match: { companyId, indicatorId: { $in: definitionIds } } },
      { $sort: { period: -1 } },
      {
        $group: {
          _id: '$indicatorId',
          status: { $first: '$status' },
        },
      },
    ]);

    const measurementMap = new Map<string, string>();
    for (const m of latestMeasurements) {
      measurementMap.set(m._id.toString(), m.status);
    }

    let withMeasurements = 0;
    let withoutMeasurements = 0;
    let targetMet = 0;
    let targetNotMet = 0;
    let noData = 0;

    for (const def of definitions) {
      const status = measurementMap.get(def._id.toString());
      if (!status) {
        withoutMeasurements++;
        noData++;
        continue;
      }
      withMeasurements++;
      if (status === IndicatorMeasurementStatus.TARGET_MET) targetMet++;
      else if (status === IndicatorMeasurementStatus.TARGET_NOT_MET) targetNotMet++;
      else if (status === IndicatorMeasurementStatus.NO_DATA) noData++;
    }

    return {
      totalActive,
      withMeasurements,
      withoutMeasurements,
      targetMet,
      targetNotMet,
      noData,
    };
  }

  // ==================== DASHBOARD (PERIOD-BASED) ====================

  /**
   * Validate that a period string matches YYYY-MM format.
   */
  validatePeriodString(period: string): void {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period.trim())) {
      throw new BadRequestException(
        `Invalid period format: "${period}". Expected YYYY-MM.`,
      );
    }
  }

  /**
   * Get dashboard for a specific period.
   *
   * Returns a typed response with:
   * - period
   * - summary (total, eligible, targetMet, targetNotMet, noData, compliancePercentage)
   * - indicators[] sorted by code ascending
   *
   * NO_DATA does NOT penalize compliancePercentage.
   * eligible = status !== NO_DATA (and measurement exists).
   */
  async getDashboard(
    companyId: Types.ObjectId,
    period: string,
  ): Promise<import('./dto/indicator-dashboard.dto').IndicatorDashboardResponse> {
    this.validatePeriodString(period);

    // 1. Get all active definitions for this company
    const definitions = await this.definitionModel
      .find({ companyId, isActive: true })
      .sort({ code: 1 })
      .exec();

    // 2. Get all measurements for this period and company
    const definitionIds = definitions.map((d) => d._id);
    const measurements = await this.measurementModel
      .find({
        companyId,
        indicatorId: { $in: definitionIds },
        period,
      })
      .exec();

    // 3. Build measurement map: indicatorId → measurement
    const measurementMap = new Map<string, typeof measurements[0]>();
    for (const m of measurements) {
      measurementMap.set(m.indicatorId.toString(), m);
    }

    // 4. Build indicators list
    const indicators: import('./dto/indicator-dashboard.dto').IndicatorDashboardItem[] = [];
    let total = 0;
    let eligible = 0;
    let targetMet = 0;
    let targetNotMet = 0;
    let noData = 0;

    for (const def of definitions) {
      total++;
      const measurement = measurementMap.get(def._id.toString());

      if (!measurement || measurement.status === IndicatorMeasurementStatus.NO_DATA) {
        // NO_DATA: definition exists but no valid measurement for this period
        noData++;
        indicators.push({
          id: def._id.toString(),
          code: def.code,
          name: def.name,
          formulaType: def.formulaType,
          calculatedValue: null,
          target: {
            operator: def.targetOperator,
            value: def.targetValue,
            min: def.targetMin,
            max: def.targetMax,
          },
          status: IndicatorMeasurementStatus.NO_DATA,
          source: null,
          period,
          unit: def.unit,
        });
        continue;
      }

      // Has a valid measurement
      eligible++;

      if (measurement.status === IndicatorMeasurementStatus.TARGET_MET) {
        targetMet++;
      } else if (measurement.status === IndicatorMeasurementStatus.TARGET_NOT_MET) {
        targetNotMet++;
      }
      // CALCULATED status: counted as eligible but not in targetMet/targetNotMet

      indicators.push({
        id: def._id.toString(),
        code: def.code,
        name: def.name,
        formulaType: def.formulaType,
        calculatedValue: measurement.calculatedValue,
        target: {
          operator: def.targetOperator,
          value: def.targetValue,
          min: def.targetMin,
          max: def.targetMax,
        },
        status: measurement.status,
        source: measurement.source ?? null,
        period: measurement.period,
        unit: def.unit,
      });
    }

    // 5. Compute compliance percentage
    const compliancePercentage = eligible > 0
      ? Math.round((targetMet / eligible) * 100)
      : 0;

    return {
      period,
      summary: {
        total,
        eligible,
        targetMet,
        targetNotMet,
        noData,
        compliancePercentage,
      },
      indicators,
    };
  }

  /**
   * Get detail for a single indicator in a specific period.
   *
   * Returns the definition + measurement + status for one indicator code.
   * Throws NotFoundException if indicator code doesn't exist for this company.
   */
  async getIndicatorDetail(
    companyId: Types.ObjectId,
    period: string,
    indicatorCode: string,
  ): Promise<import('./dto/indicator-dashboard.dto').IndicatorDetailResponse> {
    this.validatePeriodString(period);

    const code = indicatorCode.toLowerCase().trim();

    // 1. Find definition by code and companyId (tenant-safe)
    const definition = await this.definitionModel
      .findOne({ companyId, code, isActive: true })
      .exec();

    if (!definition) {
      throw new NotFoundException(
        `Indicator "${indicatorCode}" not found for this company`,
      );
    }

    // 2. Find measurement for this period
    const measurement = await this.measurementModel
      .findOne({ companyId, indicatorId: definition._id, period })
      .exec();

    // 3. Determine status
    let status: string;
    let measurementResponse: import('./dto/indicator-dashboard.dto').IndicatorDetailResponse['measurement'] = null;

    if (!measurement || measurement.status === IndicatorMeasurementStatus.NO_DATA) {
      status = IndicatorMeasurementStatus.NO_DATA;
    } else {
      status = measurement.status;
      measurementResponse = {
        calculatedValue: measurement.calculatedValue,
        numerator: measurement.numerator,
        denominator: measurement.denominator,
        status: measurement.status,
        source: measurement.source ?? null,
        period: measurement.period,
        periodStart: measurement.periodStart,
        periodEnd: measurement.periodEnd,
        measuredAt: measurement.measuredAt ?? null,
      };
    }

    return {
      id: definition._id.toString(),
      code: definition.code,
      name: definition.name,
      description: definition.description,
      category: definition.category,
      subcategory: definition.subcategory,
      sourceModule: definition.sourceModule,
      formulaType: definition.formulaType,
      formula: definition.formula as Record<string, unknown>,
      unit: definition.unit,
      target: {
        operator: definition.targetOperator,
        value: definition.targetValue,
        min: definition.targetMin,
        max: definition.targetMax,
      },
      measurement: measurementResponse,
      status,
    };
  }

  // ==================== SEED ====================

  /**
   * Ensure MVP seed indicators exist for a company.
   * Idempotent: skips indicators that already exist (by code + companyId).
   * Only creates — never overwrites user customizations.
   */
  async ensureSeedIndicators(companyId: Types.ObjectId): Promise<{
    created: number;
    skipped: number;
    codes: string[];
  }> {
    let created = 0;
    let skipped = 0;
    const codes: string[] = [];

    for (const seed of MVP_INDICATOR_DEFINITIONS) {
      const existing = await this.definitionModel
        .findOne({ companyId, code: seed.code })
        .exec();

      if (existing) {
        skipped++;
        codes.push(seed.code);
        continue;
      }

      await this.definitionModel.create({
        companyId,
        code: seed.code,
        name: seed.name,
        description: seed.description,
        category: seed.category,
        subcategory: seed.subcategory,
        sourceModule: seed.sourceModule,
        formulaType: seed.formulaType,
        formula: seed.formula,
        unit: seed.unit,
        targetOperator: seed.targetOperator,
        targetValue: seed.targetValue,
        frequency: seed.frequency,
        catalogCode: seed.catalogCode,
        isActive: true,
      });

      created++;
      codes.push(seed.code);
    }

    return { created, skipped, codes };
  }

  // ==================== AUTOMATIC CALCULATION ====================

  /**
   * Calculate automatic measurement for a single indicator.
   *
   * Flow:
   * 1. Validate companyId
   * 2. Get IndicatorDefinition
   * 3. Verify AUTOMATIC formulaType
   * 4. Validate period format
   * 5. Compute period dates
   * 6. Resolve formula via FormulaRegistry
   * 7. Evaluate target
   * 8. Create or update IndicatorMeasurement (idempotent)
   * 9. Return measurement
   */
  async calculateAutomaticMeasurement(
    companyId: Types.ObjectId,
    indicatorId: string,
    period: string,
  ): Promise<IndicatorMeasurement> {
    // 1. Validate companyId
    if (!companyId || !Types.ObjectId.isValid(companyId)) {
      throw new BadRequestException('Invalid companyId');
    }

    // 2. Get definition
    const definition = await this.findDefinitionById(companyId, indicatorId);

    // 3. Verify AUTOMATIC
    if (definition.formulaType !== IndicatorFormulaType.AUTOMATIC) {
      throw new BadRequestException(
        `Indicator "${definition.code}" is not AUTOMATIC (type: ${definition.formulaType})`,
      );
    }

    // 4. Validate period format
    validatePeriodFormat(period, definition.frequency);

    // 5. Compute period dates
    const { start, end } = getPeriodDates(period, definition.frequency);

    // 6. Resolve formula
    if (!this.formulaRegistry) {
      throw new BadRequestException('FormulaRegistry not available');
    }

    const formula = definition.formula as FormulaDefinition;
    const result = await this.formulaRegistry.resolve(
      companyId,
      formula,
      start,
      end,
    );

    // 7. Evaluate target
    const calculatedValue = result.calculatedValue;
    let status: IndicatorMeasurementStatus;

    if (result.status === IndicatorMeasurementStatus.NO_DATA) {
      status = IndicatorMeasurementStatus.NO_DATA;
    } else {
      status = this.evaluateTarget(definition, calculatedValue);
    }

    // 8. Create or update (idempotent via unique index)
    const existing = await this.measurementModel
      .findOne({ companyId, indicatorId, period })
      .exec();

    if (existing) {
      // Update existing measurement
      existing.numerator = result.numerator;
      existing.denominator = result.denominator;
      existing.calculatedValue = calculatedValue;
      existing.status = status;
      existing.source = 'AUTOMATIC';
      existing.measuredAt = new Date();
      return existing.save();
    }

    // Create new measurement
    const measurement = new this.measurementModel({
      companyId,
      indicatorId,
      period,
      periodStart: start,
      periodEnd: end,
      numerator: result.numerator,
      denominator: result.denominator,
      calculatedValue,
      status,
      source: 'AUTOMATIC',
      measuredAt: new Date(),
    });

    return measurement.save();
  }

  /**
   * Calculate all AUTOMATIC indicators for a given period.
   * Returns a summary of the operation.
   */
  async calculateAllAutomatic(
    companyId: Types.ObjectId,
    period: string,
  ): Promise<{
    period: string;
    calculated: Array<{ code: string; value: number; status: string }>;
    noData: Array<{ code: string }>; 
    failed: Array<{ code: string; error: string }>;
    summary: { total: number; calculated: number; noData: number; failed: number };
  }> {
    // Ensure seed indicators exist
    await this.ensureSeedIndicators(companyId);

    // Get all AUTOMATIC active definitions
    const definitions = await this.definitionModel
      .find({
        companyId,
        isActive: true,
        formulaType: IndicatorFormulaType.AUTOMATIC,
      })
      .exec();

    const calculated: Array<{ code: string; value: number; status: string }> = [];
    const noData: Array<{ code: string }> = [];
    const failed: Array<{ code: string; error: string }> = [];

    for (const def of definitions) {
      try {
        const measurement = await this.calculateAutomaticMeasurement(
          companyId,
          def._id.toString(),
          period,
        );

        if (measurement.status === IndicatorMeasurementStatus.NO_DATA) {
          noData.push({ code: def.code });
        } else {
          calculated.push({
            code: def.code,
            value: measurement.calculatedValue,
            status: measurement.status,
          });
        }
      } catch (err: any) {
        failed.push({
          code: def.code,
          error: err?.message ?? 'Unknown error',
        });
      }
    }

    return {
      period,
      calculated,
      noData,
      failed,
      summary: {
        total: definitions.length,
        calculated: calculated.length,
        noData: noData.length,
        failed: failed.length,
      },
    };
  }

  // ==================== HELPERS ====================

  private validateTarget(dto: CreateIndicatorDto): void {
    const { targetOperator, targetValue, targetMin, targetMax } = dto;

    if (!targetOperator) return;

    switch (targetOperator) {
      case IndicatorTargetOperator.GTE:
      case IndicatorTargetOperator.LTE:
      case IndicatorTargetOperator.EQ:
        if (targetValue === undefined || targetValue === null) {
          throw new BadRequestException(
            `Target operator "${targetOperator}" requires targetValue`,
          );
        }
        break;

      case IndicatorTargetOperator.BETWEEN:
        if (targetMin === undefined || targetMax === undefined) {
          throw new BadRequestException(
            'Target operator "BETWEEN" requires both targetMin and targetMax',
          );
        }
        if (targetMin > targetMax) {
          throw new BadRequestException(
            'targetMin must be less than or equal to targetMax',
          );
        }
        break;
    }
  }

  private evaluateTarget(
    definition: IndicatorDefinition,
    value: number,
  ): IndicatorMeasurementStatus {
    if (!definition.targetOperator) {
      return IndicatorMeasurementStatus.CALCULATED;
    }

    if (!Number.isFinite(value)) {
      return IndicatorMeasurementStatus.NO_DATA;
    }

    switch (definition.targetOperator) {
      case IndicatorTargetOperator.GTE:
        return value >= (definition.targetValue ?? 0)
          ? IndicatorMeasurementStatus.TARGET_MET
          : IndicatorMeasurementStatus.TARGET_NOT_MET;

      case IndicatorTargetOperator.LTE:
        return value <= (definition.targetValue ?? 0)
          ? IndicatorMeasurementStatus.TARGET_MET
          : IndicatorMeasurementStatus.TARGET_NOT_MET;

      case IndicatorTargetOperator.EQ:
        return value === (definition.targetValue ?? 0)
          ? IndicatorMeasurementStatus.TARGET_MET
          : IndicatorMeasurementStatus.TARGET_NOT_MET;

      case IndicatorTargetOperator.BETWEEN:
        return value >= (definition.targetMin ?? 0) && value <= (definition.targetMax ?? 100)
          ? IndicatorMeasurementStatus.TARGET_MET
          : IndicatorMeasurementStatus.TARGET_NOT_MET;

      default:
        return IndicatorMeasurementStatus.CALCULATED;
    }
  }

  private async verifyPeriodOpen(companyId: Types.ObjectId, period: string): Promise<void> {
    const periodDoc = await this.periodModel
      .findOne({ companyId, period })
      .exec();

    if (periodDoc && periodDoc.status === IndicatorPeriodStatus.CLOSED) {
      throw new BadRequestException(`Period "${period}" is closed. Cannot create measurements.`);
    }
  }
}
