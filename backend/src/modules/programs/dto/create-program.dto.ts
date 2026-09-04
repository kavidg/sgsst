import { IsString, IsOptional, IsEnum, IsDateString, MaxLength } from 'class-validator';
import { ProgramStatus, ProgramActivityPriority } from '../schemas/program.schema';

export class CreateProgramDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  objective?: string;

  @IsOptional()
  @IsString()
  standardNumber?: string;

  @IsOptional()
  @IsString()
  responsibleUser?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}

export class UpdateProgramDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  objective?: string;

  @IsOptional()
  @IsString()
  standardNumber?: string;

  @IsOptional()
  @IsString()
  responsibleUser?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(ProgramStatus)
  status?: ProgramStatus;
}

export class CreateProgramActivityDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  standardNumber?: string;

  @IsOptional()
  @IsString()
  responsibleUser?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsEnum(ProgramActivityPriority)
  priority?: ProgramActivityPriority;
}

export class UpdateProgramActivityDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  standardNumber?: string;

  @IsOptional()
  @IsString()
  responsibleUser?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(ProgramActivityPriority)
  priority?: ProgramActivityPriority;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  progress?: number;

  @IsOptional()
  @IsString()
  observations?: string;
}
