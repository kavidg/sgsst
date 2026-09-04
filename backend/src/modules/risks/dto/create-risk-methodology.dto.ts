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
 * DTO para crear una metodología de identificación de peligros.
 * NO acepta companyId — se resuelve desde el contexto autenticado.
 */
export class CreateRiskMethodologyDto {
  @IsString()
  name!: string;

  @IsString()
  version!: string;

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
