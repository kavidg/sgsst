import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  SurveillanceType,
  SurveillanceProgramStatus,
  SurveillanceActivityStatus,
} from '../schemas/epidemiological-surveillance.schema';

/**
 * DTO para crear una actividad de vigilancia epidemiológica.
 * NO almacena información clínica.
 */
export class CreateSurveillanceActivityDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  responsible?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsEnum(SurveillanceActivityStatus)
  status?: SurveillanceActivityStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidence?: string[];
}

/**
 * DTO para crear un programa de vigilancia epidemiológica (3.3.1).
 * NO almacena información clínica.
 */
export class CreateEpidemiologicalSurveillanceProgramDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsEnum(SurveillanceType)
  surveillanceType!: SurveillanceType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relatedHazards?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetAreas?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetPositions?: string[];

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsEnum(SurveillanceProgramStatus)
  status?: SurveillanceProgramStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  periodicityMonths?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  responsible?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSurveillanceActivityDto)
  activities?: CreateSurveillanceActivityDto[];
}

/**
 * DTO para actualizar un programa de vigilancia epidemiológica.
 * Todos los campos son opcionales.
 */
export class UpdateEpidemiologicalSurveillanceProgramDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsEnum(SurveillanceType)
  surveillanceType?: SurveillanceType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relatedHazards?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetAreas?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetPositions?: string[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(SurveillanceProgramStatus)
  status?: SurveillanceProgramStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  periodicityMonths?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  responsible?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSurveillanceActivityDto)
  activities?: CreateSurveillanceActivityDto[];
}
