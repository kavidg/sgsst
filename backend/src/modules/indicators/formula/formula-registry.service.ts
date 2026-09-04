import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { Types } from 'mongoose';
import { IndicatorMeasurementStatus } from '../enums/indicator-measurement-status.enum';
import {
  FormulaDefinition,
  FormulaResult,
  DataSourceDefinition,
  DataSourceResult,
  DataSourceModule,
  VALID_FORMULA_TYPES,
  VALID_DATA_SOURCE_MODULES,
  VALID_FIELDS_BY_MODULE,
} from './formula-types';
import { DataSourceResolverRegistry } from './data-source-resolver-registry';

/**
 * FormulaRegistryService — Motor declarativo de fórmulas para indicadores SG-SST.
 *
 * Permite definir fórmulas de forma declarativa y segura:
 * - No ejecuta código dinámico (eval, new Function)
 * - Solo opera sobre un catálogo cerrado de fuentes de datos
 * - Todas las operaciones son tipadas en tiempo de compilación
 * - companyId es siempre requerido para tenant isolation
 *
 * Utiliza DataSourceResolverRegistry para resolver datos reales de MongoDB.
 * Cuando el registry no está disponible (tests), opera con valores 0.
 */
@Injectable()
export class FormulaRegistryService {
  constructor(
    @Optional()
    private readonly resolverRegistry?: DataSourceResolverRegistry,
  ) {}

  /**
   * Valida que una definición de fórmula sea estructuralmente correcta.
   *
   * @throws BadRequestException si la fórmula es inválida
   */
  validateFormula(formula: FormulaDefinition): void {
    // 1. Validar tipo de fórmula
    if (!VALID_FORMULA_TYPES.includes(formula.type)) {
      throw new BadRequestException(
        `Invalid formula type: "${formula.type}". Valid types: ${VALID_FORMULA_TYPES.join(', ')}`,
      );
    }

    // 2. Validar según tipo
    switch (formula.type) {
      case 'PERCENTAGE':
        this.validateDataSource(formula.part, 'part');
        this.validateDataSource(formula.whole, 'whole');
        break;

      case 'RATIO':
        this.validateDataSource(formula.numerator, 'numerator');
        this.validateDataSource(formula.denominator, 'denominator');
        break;

      case 'COUNT':
        this.validateDataSource(formula.source, 'source');
        break;

      case 'AVERAGE':
        this.validateDataSource(formula.source, 'source');
        break;

      case 'MANUAL':
        // No validation needed — manual formulas have no data sources
        break;
    }
  }

  /**
   * Resuelve una fórmula declarativa y retorna el resultado calculado.
   *
   * @param companyId - Tenant obligatorio
   * @param formula - Definición declarativa de la fórmula
   * @param periodStart - Fecha inicio del período (opcional)
   * @param periodEnd - Fecha fin del período (opcional)
   * @returns Resultado normalizado con numerator, denominator, calculatedValue, status
   */
  async resolve(
    companyId: Types.ObjectId,
    formula: FormulaDefinition,
    periodStart?: Date,
    periodEnd?: Date,
  ): Promise<FormulaResult> {
    // Validate company ID
    if (!companyId || !Types.ObjectId.isValid(companyId)) {
      throw new BadRequestException('companyId is required and must be a valid ObjectId');
    }

    // Validate formula structure
    this.validateFormula(formula);

    // MANUAL formulas cannot be resolved automatically
    if (formula.type === 'MANUAL') {
      return {
        numerator: 0,
        denominator: 0,
        calculatedValue: 0,
        status: IndicatorMeasurementStatus.NO_DATA,
        source: 'AUTOMATIC',
      };
    }

    // Resolve based on formula type
    switch (formula.type) {
      case 'PERCENTAGE':
        return this.resolvePercentage(companyId, formula, periodStart, periodEnd);
      case 'RATIO':
        return this.resolveRatio(companyId, formula, periodStart, periodEnd);
      case 'COUNT':
        return this.resolveCount(companyId, formula, periodStart, periodEnd);
      case 'AVERAGE':
        return this.resolveAverage(companyId, formula, periodStart, periodEnd);
      case 'RATIO_SCALED':
        return this.resolveRatioScaled(companyId, formula, periodStart, periodEnd);
      default: {
        const _exhaustive: never = formula;
        throw new BadRequestException(`Unhandled formula type: "${(_exhaustive as any).type}"`);
      }
    }
  }

  /**
   * Verifica si una fórmula puede ser resuelta automáticamente.
   */
  isAutomatic(formula: FormulaDefinition): boolean {
    return formula.type !== 'MANUAL';
  }

  // ==================== PRIVATE RESOLVERS ====================

  private async resolvePercentage(
    companyId: Types.ObjectId,
    formula: { type: 'PERCENTAGE'; part: DataSourceDefinition; whole: DataSourceDefinition },
    periodStart?: Date,
    periodEnd?: Date,
  ): Promise<FormulaResult> {
    const part = await this.resolveSource(companyId, formula.part, periodStart, periodEnd);
    const whole = await this.resolveSource(companyId, formula.whole, periodStart, periodEnd);

    if (!part.available || !whole.available || whole.value === 0) {
      return {
        numerator: part.available ? part.value : 0,
        denominator: whole.available ? whole.value : 0,
        calculatedValue: 0,
        status: IndicatorMeasurementStatus.NO_DATA,
        source: 'AUTOMATIC',
      };
    }

    const calculatedValue = this.sanitize((part.value / whole.value) * 100);

    return {
      numerator: part.value,
      denominator: whole.value,
      calculatedValue,
      status: IndicatorMeasurementStatus.CALCULATED,
      source: 'AUTOMATIC',
    };
  }

  private async resolveRatio(
    companyId: Types.ObjectId,
    formula: { type: 'RATIO'; numerator: DataSourceDefinition; denominator: DataSourceDefinition },
    periodStart?: Date,
    periodEnd?: Date,
  ): Promise<FormulaResult> {
    const num = await this.resolveSource(companyId, formula.numerator, periodStart, periodEnd);
    const den = await this.resolveSource(companyId, formula.denominator, periodStart, periodEnd);

    if (!num.available || !den.available || den.value === 0) {
      return {
        numerator: num.available ? num.value : 0,
        denominator: den.available ? den.value : 0,
        calculatedValue: 0,
        status: IndicatorMeasurementStatus.NO_DATA,
        source: 'AUTOMATIC',
      };
    }

    const calculatedValue = this.sanitize(num.value / den.value);

    return {
      numerator: num.value,
      denominator: den.value,
      calculatedValue,
      status: IndicatorMeasurementStatus.CALCULATED,
      source: 'AUTOMATIC',
    };
  }

  private async resolveCount(
    companyId: Types.ObjectId,
    formula: { type: 'COUNT'; source: DataSourceDefinition },
    periodStart?: Date,
    periodEnd?: Date,
  ): Promise<FormulaResult> {
    const source = await this.resolveSource(companyId, formula.source, periodStart, periodEnd);

    if (!source.available) {
      return {
        numerator: 0,
        denominator: 0,
        calculatedValue: 0,
        status: IndicatorMeasurementStatus.NO_DATA,
        source: 'AUTOMATIC',
      };
    }

    return {
      numerator: source.value,
      denominator: 0,
      calculatedValue: this.sanitize(source.value),
      status: IndicatorMeasurementStatus.CALCULATED,
      source: 'AUTOMATIC',
    };
  }

  private async resolveAverage(
    companyId: Types.ObjectId,
    formula: { type: 'AVERAGE'; source: DataSourceDefinition },
    periodStart?: Date,
    periodEnd?: Date,
  ): Promise<FormulaResult> {
    const source = await this.resolveSource(companyId, formula.source, periodStart, periodEnd);

    if (!source.available) {
      return {
        numerator: 0,
        denominator: 0,
        calculatedValue: 0,
        status: IndicatorMeasurementStatus.NO_DATA,
        source: 'AUTOMATIC',
      };
    }

    return {
      numerator: source.value,
      denominator: 0,
      calculatedValue: this.sanitize(source.value),
      status: IndicatorMeasurementStatus.CALCULATED,
      source: 'AUTOMATIC',
    };
  }

  private async resolveRatioScaled(
    companyId: Types.ObjectId,
    formula: { type: 'RATIO_SCALED'; numerator: DataSourceDefinition; denominator: DataSourceDefinition; scale: number },
    periodStart?: Date,
    periodEnd?: Date,
  ): Promise<FormulaResult> {
    const num = await this.resolveSource(companyId, formula.numerator, periodStart, periodEnd);
    const den = await this.resolveSource(companyId, formula.denominator, periodStart, periodEnd);

    if (!num.available || !den.available || den.value === 0) {
      return {
        numerator: num.available ? num.value : 0,
        denominator: den.available ? den.value : 0,
        calculatedValue: 0,
        status: IndicatorMeasurementStatus.NO_DATA,
        source: 'AUTOMATIC',
      };
    }

    const calculatedValue = this.sanitize((num.value / den.value) * formula.scale);

    return {
      numerator: num.value,
      denominator: den.value,
      calculatedValue,
      status: IndicatorMeasurementStatus.CALCULATED,
      source: 'AUTOMATIC',
    };
  }

  // ==================== SOURCE RESOLUTION ====================

  /**
   * Resuelve una fuente de datos individual.
   * Utiliza DataSourceResolverRegistry si está disponible,
   * de lo contrario retorna { value: 0, available: false }.
   */
  private async resolveSource(
    companyId: Types.ObjectId,
    source: DataSourceDefinition,
    periodStart?: Date,
    periodEnd?: Date,
  ): Promise<DataSourceResult> {
    // Use real resolver if available
    if (this.resolverRegistry) {
      return this.resolverRegistry.resolve(
        source.module,
        source.field as string,
        companyId,
        periodStart,
        periodEnd,
      );
    }

    // Fallback: return unavailable (tests without registry)
    return { value: 0, available: false };
  }

  // ==================== VALIDATION ====================

  private validateDataSource(source: DataSourceDefinition, fieldName: string): void {
    if (!source || typeof source !== 'object') {
      throw new BadRequestException(`"${fieldName}" must be a valid DataSourceDefinition`);
    }

    if (!VALID_DATA_SOURCE_MODULES.includes(source.module)) {
      throw new BadRequestException(
        `Invalid module "${source.module}" in "${fieldName}". Valid modules: ${VALID_DATA_SOURCE_MODULES.join(', ')}`,
      );
    }

    const validFields = VALID_FIELDS_BY_MODULE[source.module];
    if (!validFields.includes(source.field as string)) {
      throw new BadRequestException(
        `Invalid field "${source.field}" for module "${source.module}" in "${fieldName}". Valid fields: ${validFields.join(', ')}`,
      );
    }
  }

  // ==================== UTILITIES ====================

  /**
   * Sanitiza un número: reemplaza NaN, Infinity, -Infinity por 0.
   * Redondea a 2 decimales.
   */
  private sanitize(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.round(value * 100) / 100;
  }
}
