import {
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EvaluationStatus } from '../schemas/evaluation.schema';

class ImprovementPlanDto {
  @IsOptional()
  @IsString()
  activity?: string;

  @IsOptional()
  @IsString()
  responsible?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  observations?: string;
}

export class CreateEvaluationDto {
  @IsMongoId()
  companyId!: string;

  @IsMongoId()
  userId!: string;

  @IsString()
  code!: string;

  @IsEnum(EvaluationStatus)
  status!: EvaluationStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidence?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ImprovementPlanDto)
  improvementPlan?: ImprovementPlanDto;
}
