import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IndicatorCategory } from '../enums/indicator-category.enum';
import { IndicatorSubcategory } from '../enums/indicator-subcategory.enum';
import { IndicatorFormulaType } from '../enums/indicator-formula-type.enum';
import { IndicatorFrequency } from '../enums/indicator-frequency.enum';
import { IndicatorTargetOperator } from '../enums/indicator-target-operator.enum';

/**
 * DTO para actualizar un indicador.
 * Todos los campos son opcionales — solo se actualizan los proporcionados.
 */
export class UpdateIndicatorDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsEnum(IndicatorCategory)
  category?: IndicatorCategory;

  @IsOptional()
  @IsEnum(IndicatorSubcategory)
  subcategory?: IndicatorSubcategory;

  @IsOptional()
  @IsString()
  sourceModule?: string;

  @IsOptional()
  @IsEnum(IndicatorFormulaType)
  formulaType?: IndicatorFormulaType;

  @IsOptional()
  formula?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  targetValue?: number;

  @IsOptional()
  @IsEnum(IndicatorTargetOperator)
  targetOperator?: IndicatorTargetOperator;

  @ValidateIf((o) => o.targetOperator === 'BETWEEN')
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  targetMin?: number;

  @ValidateIf((o) => o.targetOperator === 'BETWEEN')
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  targetMax?: number;

  @IsOptional()
  @IsEnum(IndicatorFrequency)
  frequency?: IndicatorFrequency;

  @IsOptional()
  @IsString()
  responsible?: string;

  @IsOptional()
  @IsString()
  responsibleArea?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableLevels?: string[];

  @IsOptional()
  @IsString()
  catalogCode?: string;
}
