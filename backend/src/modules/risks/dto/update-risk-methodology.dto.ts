import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { RiskMethodologyStatus } from '../schemas/risk-methodology.schema';

/**
 * DTO para actualizar una metodología de identificación de peligros.
 * Todos los campos son opcionales (PATCH parcial).
 */
export class UpdateRiskMethodologyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(RiskMethodologyStatus)
  status?: RiskMethodologyStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  reviewDate?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  reviewFrequencyMonths?: number;

  @IsOptional()
  @IsString()
  responsible?: string;

  @IsOptional()
  @IsString()
  identificationCriteria?: string;

  @IsOptional()
  @IsString()
  evaluationCriteria?: string;

  @IsOptional()
  @IsString()
  valuationCriteria?: string;

  @IsOptional()
  @IsString()
  probabilityScale?: string;

  @IsOptional()
  @IsString()
  consequenceScale?: string;

  @IsOptional()
  @IsString()
  riskLevelRules?: string;
}
