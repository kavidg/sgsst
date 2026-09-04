import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ComplianceResult,
  MeasurementStatus,
  MeasurementType,
} from '../schemas/environmental-measurement.schema';

export class CreateEnvironmentalMeasurementDto {
  @IsEnum(MeasurementType)
  measurementType!: MeasurementType;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  area!: string;

  @IsDateString()
  measurementDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  responsible?: string;

  @IsOptional()
  @IsNumber()
  resultValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  resultUnit?: string;

  @IsOptional()
  @IsNumber()
  regulatoryLimit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  regulatoryLimitUnit?: string;

  @IsOptional()
  @IsEnum(ComplianceResult)
  complianceResult?: ComplianceResult;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  methodInstrument?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;

  @IsOptional()
  @IsMongoId()
  riskId?: string;

  @IsOptional()
  @IsEnum(MeasurementStatus)
  status?: MeasurementStatus;
}
