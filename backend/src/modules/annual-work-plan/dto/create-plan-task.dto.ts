import { IsString, IsOptional, IsNumber, IsDateString, IsEnum, Min, Max } from 'class-validator';

export class CreatePlanTaskDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  assignedTo!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;
}

export class UpdatePlanTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString({ each: true })
  comments?: string[];
}
