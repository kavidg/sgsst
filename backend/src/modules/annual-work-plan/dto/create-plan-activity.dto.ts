import { IsString, IsOptional, IsEnum, IsNumber, IsDateString, Min, Max } from 'class-validator';
import { ActivityPriority } from '../schemas/plan-activity.schema';
import { Types } from 'mongoose';

export class CreatePlanActivityDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  objectiveId?: string;

  @IsOptional()
  @IsString()
  sourceModule?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsString()
  responsibleUser!: string;

  @IsOptional()
  @IsEnum(ActivityPriority)
  priority?: ActivityPriority;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;
}

export class UpdatePlanActivityDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  responsibleUser?: string;

  @IsOptional()
  @IsEnum(ActivityPriority)
  priority?: ActivityPriority;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsString()
  status?: string;
}
