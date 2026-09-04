import { IsString, IsNotEmpty, IsEnum, IsOptional, IsDateString, IsMongoId } from 'class-validator';
import { InductionType, InductionStatus } from '../schemas/sst-induction.schema';

export class CreateSstInductionDto {
  @IsEnum(InductionType)
  @IsNotEmpty()
  type!: InductionType;

  @IsMongoId()
  @IsNotEmpty()
  employee!: string;

  @IsDateString()
  @IsNotEmpty()
  date!: string;

  @IsString()
  @IsNotEmpty()
  responsible!: string;

  @IsString()
  @IsNotEmpty()
  topics!: string;

  @IsString()
  @IsOptional()
  observations?: string;

  @IsEnum(InductionStatus)
  @IsOptional()
  status?: InductionStatus;

  @IsString()
  @IsOptional()
  evidenceUrl?: string;

  @IsString()
  @IsOptional()
  certificateUrl?: string;
}
